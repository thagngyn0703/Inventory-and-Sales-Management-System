/**
 * Backfill SalesReturn legacy records using source SalesInvoice.
 *
 * Fixes:
 * 1) SalesReturn.total_amount/subtotal_amount/tax_amount/tax_rate_snapshot
 * 2) SalesReturn.reason_code (fallback -> "other")
 * 3) SalesInvoice.returned_total_amount/returned_subtotal_amount/returned_tax_amount
 * 4) SalesInvoice.status sync (cancelled when returned_total_amount >= total_amount)
 *
 * Usage:
 *   node scripts/backfill-returns-from-invoice.js --dry-run
 *   node scripts/backfill-returns-from-invoice.js
 */

const mongoose = require('mongoose');
const SalesReturn = require('../models/SalesReturn');
const SalesInvoice = require('../models/SalesInvoice');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/IMS';
const VALID_REASON_CODES = new Set([
  'customer_changed_mind',
  'defective',
  'expired',
  'wrong_item',
  'other',
]);

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computeItemsGross(items = []) {
  return items.reduce((sum, it) => sum + toNum(it?.quantity) * toNum(it?.unit_price), 0);
}

function computeTaxBreakdownByInvoice(gross, invoice) {
  const invoiceTotal = toNum(invoice?.total_amount);
  const invoiceSubtotal = toNum(invoice?.subtotal_amount);
  const hasSnapshot = invoiceTotal > 0 && invoiceSubtotal >= 0;
  if (!hasSnapshot) return { subtotal: gross, tax: 0 };
  const ratio = invoiceSubtotal / invoiceTotal;
  const subtotal = Math.max(0, Math.min(gross, Math.round(gross * ratio)));
  return { subtotal, tax: gross - subtotal };
}

function buildInvoiceItemMap(invoiceItems = []) {
  const map = new Map();
  for (const item of invoiceItems) {
    const pid = String(item?.product_id || '');
    if (!pid) continue;
    if (!map.has(pid)) {
      map.set(pid, {
        unit_price: toNum(item?.unit_price),
      });
    }
  }
  return map;
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log(`[backfill-returns] Connected MongoDB (${dryRun ? 'DRY-RUN' : 'WRITE'})`);

  const returns = await SalesReturn.find({}).lean();
  console.log(`[backfill-returns] Found ${returns.length} return documents`);

  const invoiceIds = [
    ...new Set(returns.map((r) => (r.invoice_id ? String(r.invoice_id) : '')).filter(Boolean)),
  ];
  const invoices = await SalesInvoice.find({ _id: { $in: invoiceIds } })
    .select('_id status total_amount subtotal_amount tax_amount tax_rate_snapshot items')
    .lean();
  const invoiceMap = new Map(invoices.map((inv) => [String(inv._id), inv]));

  const returnBulk = [];
  let changedReturnCount = 0;
  let changedItemsUnitPriceCount = 0;
  const approvedSumsByInvoice = new Map();

  for (const ret of returns) {
    const invoice = invoiceMap.get(String(ret.invoice_id || ''));
    const nextItems = Array.isArray(ret.items) ? ret.items.map((it) => ({ ...it })) : [];
    let itemsMutated = false;

    // Repair legacy unit_price = 0 in returns by reading invoice item unit_price
    if (invoice && nextItems.length > 0) {
      const invoiceItemMap = buildInvoiceItemMap(invoice.items || []);
      for (const it of nextItems) {
        const pid = String(it?.product_id || '');
        if (!pid) continue;
        const up = toNum(it.unit_price);
        if (up > 0) continue;
        const invItem = invoiceItemMap.get(pid);
        if (invItem && invItem.unit_price > 0) {
          it.unit_price = invItem.unit_price;
          itemsMutated = true;
          changedItemsUnitPriceCount += 1;
        }
      }
    }

    const snapshotGross = toNum(ret.total_amount);
    const itemsGross = computeItemsGross(nextItems);
    const gross = snapshotGross > 0 ? snapshotGross : itemsGross;

    const breakdown = computeTaxBreakdownByInvoice(gross, invoice);
    const nextTaxRateSnapshot = invoice ? toNum(invoice.tax_rate_snapshot) : toNum(ret.tax_rate_snapshot);
    const nextReasonCode = VALID_REASON_CODES.has(ret.reason_code) ? ret.reason_code : 'other';

    const changed =
      itemsMutated ||
      snapshotGross !== gross ||
      toNum(ret.subtotal_amount) !== breakdown.subtotal ||
      toNum(ret.tax_amount) !== breakdown.tax ||
      toNum(ret.tax_rate_snapshot) !== nextTaxRateSnapshot ||
      ret.reason_code !== nextReasonCode;

    if (changed) {
      changedReturnCount += 1;
      returnBulk.push({
        updateOne: {
          filter: { _id: ret._id },
          update: {
            $set: {
              ...(itemsMutated ? { items: nextItems } : {}),
              total_amount: gross,
              subtotal_amount: breakdown.subtotal,
              tax_amount: breakdown.tax,
              tax_rate_snapshot: nextTaxRateSnapshot,
              reason_code: nextReasonCode,
            },
          },
        },
      });
    }

    // For invoice rollup totals: use "effective" values after backfill calculation
    if (ret.status === 'approved' && ret.invoice_id) {
      const key = String(ret.invoice_id);
      const curr = approvedSumsByInvoice.get(key) || { gross: 0, subtotal: 0, tax: 0 };
      approvedSumsByInvoice.set(key, {
        gross: curr.gross + gross,
        subtotal: curr.subtotal + breakdown.subtotal,
        tax: curr.tax + breakdown.tax,
      });
    }
  }

  // Sync invoice returned_* fields
  const invoiceBulk = [];
  let changedInvoiceCount = 0;
  for (const [invoiceId, sums] of approvedSumsByInvoice.entries()) {
    const invoice = invoiceMap.get(invoiceId);
    if (!invoice) continue;
    const nextReturnedGross = Math.round(sums.gross);
    const nextReturnedSubtotal = Math.round(sums.subtotal);
    const nextReturnedTax = Math.round(sums.tax);
    const shouldCancel = nextReturnedGross >= toNum(invoice.total_amount);
    const nextStatus = shouldCancel ? 'cancelled' : 'confirmed';
    const changed =
      toNum(invoice.returned_total_amount) !== nextReturnedGross ||
      toNum(invoice.returned_subtotal_amount) !== nextReturnedSubtotal ||
      toNum(invoice.returned_tax_amount) !== nextReturnedTax ||
      String(invoice.status) !== nextStatus;
    if (!changed) continue;
    changedInvoiceCount += 1;
    invoiceBulk.push({
      updateOne: {
        filter: { _id: invoiceId },
        update: {
          $set: {
            returned_total_amount: nextReturnedGross,
            returned_subtotal_amount: nextReturnedSubtotal,
            returned_tax_amount: nextReturnedTax,
            status: nextStatus,
          },
        },
      },
    });
  }

  console.log(`[backfill-returns] return docs changed: ${changedReturnCount}`);
  console.log(`[backfill-returns] item.unit_price repaired: ${changedItemsUnitPriceCount}`);
  console.log(`[backfill-returns] invoice docs changed: ${changedInvoiceCount}`);

  if (!dryRun) {
    if (returnBulk.length > 0) {
      await SalesReturn.bulkWrite(returnBulk, { ordered: false });
    }
    if (invoiceBulk.length > 0) {
      await SalesInvoice.bulkWrite(invoiceBulk, { ordered: false });
    }
    console.log('[backfill-returns] Write completed.');
  } else {
    console.log('[backfill-returns] DRY-RUN: no changes were written.');
  }

  await mongoose.disconnect();
  console.log('[backfill-returns] Done.');
}

run().catch((err) => {
  console.error('[backfill-returns] Failed:', err);
  process.exit(1);
});

