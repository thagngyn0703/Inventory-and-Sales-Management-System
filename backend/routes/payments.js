const express = require('express');
const crypto = require('crypto');
const SalesInvoice = require('../models/SalesInvoice');
const PaymentTransaction = require('../models/PaymentTransaction');
const { settlePreviousDebtIfNeeded } = require('../utils/invoiceDebtSettlement');
const { upsertSystemCashFlow } = require('../utils/cashflowUtils');
const { sumPayment, normalizeNonNegativeInt } = require('../utils/invoicePaymentUtils');
const { appendLoyaltyTxn, getNextNudge, normalizeLoyaltySettings } = require('../utils/loyalty');
const {
  extractPaymentRef,
  amountsMatch,
  findMatchingSepayTransaction,
  getPreferredAccountsForStore,
  getTransactionAmountIn,
  getTransactionContent,
  parseAmount,
  fetchSepayTransactionsByAmount,
} = require('../utils/sepayMatchUtils');
const Customer = require('../models/Customer');
const Store = require('../models/Store');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyStoreBankTransferPaid } = require('../services/bankTransferNotificationService');

const router = express.Router();

function assertStoreScope(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return true;
  if (!req.user?.storeId) {
    res.status(403).json({ message: 'Tài khoản chưa được gán cửa hàng.', code: 'STORE_REQUIRED' });
    return false;
  }
  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Xác thực chữ ký HMAC-SHA256 từ SePay.
 * SePay gửi header: X-Checksum = HMAC_SHA256(rawBody, SEPAY_SECRET)
 */
function verifySepaySignature(rawBody, receivedChecksum) {
  const secret = process.env.SEPAY_SECRET;
  const allowInsecureWebhook = String(process.env.SEPAY_ALLOW_INSECURE_WEBHOOK || '').toLowerCase() === 'true';
  const strictByEnv = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const strictMode = strictByEnv && !allowInsecureWebhook;
  if (!secret) {
    if (strictMode) {
      console.error('[SePay Webhook] Missing SEPAY_SECRET in strict mode');
      return false;
    }
    return true; // dev mode
  }
  if (!receivedChecksum) {
    if (strictMode) {
      console.warn('[SePay Webhook] Missing checksum header in strict mode');
      return false;
    }
    console.warn('[SePay Webhook] Missing checksum header, skip signature verify');
    return true; // dev mode
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expected === String(receivedChecksum).toLowerCase();
}

function getInvoiceBankTransferTarget(invoice) {
  const paymentSplit = invoice.payment ? sumPayment(invoice.payment) : null;
  return paymentSplit
    ? parseAmount(paymentSplit.bank_transfer)
    : parseAmount(invoice.total_amount) + parseAmount(invoice.previous_debt_paid);
}

async function notifyIfBankTransferPaid(invoice, source = 'sepay') {
  if (!invoice?.store_id || !invoice?.payment_ref) return;
  if (String(invoice.payment_status) !== 'paid') return;
  const amount = getInvoiceBankTransferTarget(invoice);
  if (amount <= 0) return;
  try {
    await notifyStoreBankTransferPaid({
      storeId: invoice.store_id,
      paymentRef: invoice.payment_ref,
      invoiceId: invoice._id,
      amount,
      source,
    });
  } catch (err) {
    console.warn('[payments] bank transfer notification failed:', err.message);
  }
}

async function reconcileInvoiceFromSepay(invoice) {
  if (!invoice || String(invoice.payment_status) === 'paid' || !invoice.payment_ref) {
    return { matched: false };
  }

  const ref = String(invoice.payment_ref).trim().toUpperCase();
  const targetAmount = getInvoiceBankTransferTarget(invoice);
  const storeBank = invoice?.store_id
    ? await Store.findById(invoice.store_id).select('bank_account').lean()
    : null;
  const preferredAccounts = getPreferredAccountsForStore(storeBank?.bank_account);

  let transactions = [];
  try {
    transactions = await fetchSepayTransactionsByAmount(targetAmount);
  } catch (err) {
    console.warn('[SePay Poll] Không truy vấn được API SePay:', err.message);
    return { matched: false, reason: 'sepay_api_unavailable' };
  }

  const matchedTx = findMatchingSepayTransaction(transactions, {
    paymentRef: ref,
    expectedAmount: targetAmount,
    preferredAccountNumbers: preferredAccounts,
  });

  if (!matchedTx) return { matched: false, reason: 'not_found' };

  const paymentSplit = invoice.payment ? sumPayment(invoice.payment) : null;

  // Chuyển trạng thái hóa đơn sang paid
  invoice.payment_status = 'paid';
  invoice.paid_at = new Date();
  await invoice.save();
  await upsertSystemCashFlow({
    storeId: invoice.store_id,
    type: 'INCOME',
    category: 'SALES',
    amount: paymentSplit ? parseAmount(paymentSplit.bank_transfer) : targetAmount,
    paymentMethod: 'bank_transfer',
    referenceModel: 'sales_invoice_bank',
    referenceId: invoice._id,
    note: `Thu tien hoa don #${String(invoice._id).slice(-6).toUpperCase()} (SePay poll)`,
    transactedAt: invoice.paid_at || new Date(),
  });

  await settlePreviousDebtIfNeeded(invoice._id);
  await settleInvoiceLoyaltyIfNeeded(invoice);
  await notifyIfBankTransferPaid(invoice, 'sepay_poll');

  // Lưu transaction nếu chưa có (idempotent)
  const providerTxnId = String(matchedTx.id || matchedTx.reference_number || `${ref}-${targetAmount}`);
  const exists = await PaymentTransaction.findOne({ provider_txn_id: providerTxnId });
  if (!exists) {
    await PaymentTransaction.create({
      provider: 'sepay',
      provider_txn_id: providerTxnId,
      invoice_id: invoice._id,
      storeId: invoice.store_id || null,
      amount: getTransactionAmountIn(matchedTx),
      content: getTransactionContent(matchedTx),
      payment_ref_matched: ref,
      status: 'matched',
      raw_payload: matchedTx,
      received_at: matchedTx?.transaction_date ? new Date(matchedTx.transaction_date) : new Date(),
    });
  }

  console.log(`[SePay Poll] Matched invoice ${invoice._id} with ref ${ref} via transaction API`);
  return { matched: true };
}

async function settleInvoiceLoyaltyIfNeeded(invoice) {
  if (!invoice || !invoice.customer_id) return null;
  if (String(invoice.payment_status) !== 'paid') return null;
  if (invoice.loyalty_earned_settled || Number(invoice.loyalty_earned_points || 0) <= 0) return null;

  await appendLoyaltyTxn({
    customerId: invoice.customer_id,
    storeId: invoice.store_id,
    actorId: null,
    type: 'EARN',
    points: Number(invoice.loyalty_earned_points || 0),
    valueVnd: Number(invoice.loyalty_earned_points || 0) * Number(invoice?.loyalty_settings_snapshot?.redeem?.point_value_vnd || 500),
    referenceModel: 'SalesInvoice',
    referenceId: invoice._id,
    note: `Tích điểm sau xác nhận thanh toán hóa đơn #${String(invoice._id).slice(-6).toUpperCase()}`,
    idempotencyKey: `earn:${invoice._id}`,
  });
  invoice.loyalty_earned_settled = true;
  await invoice.save();
  return true;
}

// ─── Webhook từ SePay ────────────────────────────────────────────────────────
// POST /api/payments/sepay/webhook
// SePay gọi endpoint này mỗi khi có giao dịch ngân hàng mới.
// Không cần JWT — xác thực bằng HMAC checksum.
router.post('/sepay/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Lấy raw body để verify chữ ký
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
    const checksum =
      req.headers['x-checksum'] ||
      req.headers['checksum'] ||
      req.headers['x-signature'] ||
      req.headers['sepay-signature'] ||
      '';

    if (!verifySepaySignature(rawBody, checksum)) {
      console.warn('[SePay Webhook] Chữ ký không hợp lệ');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    let payload;
    try {
      payload = typeof req.body === 'object' && !(req.body instanceof Buffer)
        ? req.body
        : JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON' });
    }

    // SePay payload fields (tham khảo tài liệu SePay):
    // id, gateway, transactionDate, accountNumber, subAccount, code,
    // content, transferType, transferAmount, accumulated, referenceCode,
    // description, language
    const providerTxnId =
      payload.id ||
      payload.transactionId ||
      payload.transId ||
      payload.referenceCode ||
      payload.reference_number;

    const transferAmount =
      payload.transferAmount ??
      payload.amount ??
      payload.creditAmount ??
      payload.money ??
      0;

    const content =
      payload.content ||
      payload.description ||
      payload.transferContent ||
      payload.remark ||
      '';

    const referenceCode = payload.referenceCode || payload.code || payload.ref || null;
    const transactionDate = payload.transactionDate || payload.createdAt || payload.time || null;

    if (!providerTxnId) {
      return res.status(400).json({ success: false, message: 'Missing transaction id' });
    }

    // Chống xử lý lặp (idempotent)
    const existing = await PaymentTransaction.findOne({ provider_txn_id: String(providerTxnId) });
    if (existing) {
      console.log(`[SePay Webhook] Duplicate txn: ${providerTxnId}`);
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    const amount = Number(transferAmount) || 0;
    const paymentRef = (extractPaymentRef(String(content)) || String(referenceCode || '').toUpperCase() || null);

    // Tạo bản ghi giao dịch
    const txn = new PaymentTransaction({
      provider: 'sepay',
      provider_txn_id: String(providerTxnId),
      amount,
      content,
      payment_ref_matched: paymentRef,
      status: 'received',
      raw_payload: payload,
      received_at: transactionDate ? new Date(transactionDate) : new Date(),
    });

    // Tìm hóa đơn khớp với payment_ref
    let matchedInvoice = null;
    if (paymentRef) {
      matchedInvoice = await SalesInvoice.findOne({
        payment_ref: String(paymentRef).trim().toUpperCase(),
        payment_status: { $ne: 'paid' },
      });
    }

    const incomingAccountNumber = normalizeAccountNumber(
      payload.accountNumber || payload.account_number || payload.accountNo || payload.account || ''
    );

    if (matchedInvoice) {
      const storeBank = matchedInvoice.store_id
        ? await Store.findById(matchedInvoice.store_id).select('bank_account').lean()
        : null;
      const preferredAccounts = getPreferredAccountsForStore(storeBank?.bank_account);
      const expectedBankAmount = getInvoiceBankTransferTarget(matchedInvoice);

      if (!paymentRef || !amountsMatch(amount, expectedBankAmount)) {
        txn.status = 'unmatched';
        txn.storeId = matchedInvoice.store_id || null;
        await txn.save();
        console.warn(
          `[SePay Webhook] Amount/ref mismatch for invoice ${matchedInvoice._id}: ref=${paymentRef}, amount=${amount}, expected=${expectedBankAmount}`
        );
        return res.status(200).json({ success: true });
      }

      if (
        incomingAccountNumber &&
        preferredAccounts.length > 0 &&
        !preferredAccounts.includes(incomingAccountNumber)
      ) {
        console.warn(
          `[SePay Webhook] Account ${incomingAccountNumber} not in preferred [${preferredAccounts.join(', ')}] but matched ref ${paymentRef} — accepting (multi-store SePay)`
        );
      }

      txn.invoice_id = matchedInvoice._id;
      txn.storeId = matchedInvoice.store_id;
      txn.status = 'matched';

      // Cập nhật trạng thái hóa đơn
      matchedInvoice.payment_status = 'paid';
      matchedInvoice.paid_at = new Date();
      await matchedInvoice.save();
      const paymentSplit2 = matchedInvoice.payment ? sumPayment(matchedInvoice.payment) : null;
      await upsertSystemCashFlow({
        storeId: matchedInvoice.store_id,
        type: 'INCOME',
        category: 'SALES',
        amount: paymentSplit2 ? parseAmount(paymentSplit2.bank_transfer) : matchedInvoice.total_amount,
        paymentMethod: 'bank_transfer',
        referenceModel: 'sales_invoice_bank',
        referenceId: matchedInvoice._id,
        note: `Thu tien hoa don #${String(matchedInvoice._id).slice(-6).toUpperCase()} (SePay webhook)`,
        transactedAt: matchedInvoice.paid_at || new Date(),
      });

      await settlePreviousDebtIfNeeded(matchedInvoice._id);
      await settleInvoiceLoyaltyIfNeeded(matchedInvoice);
      await notifyIfBankTransferPaid(matchedInvoice, 'sepay_webhook');

      console.log(`[SePay Webhook] Matched invoice ${matchedInvoice._id} with ref ${paymentRef}, amount ${amount}`);
    } else {
      txn.status = 'unmatched';
      console.log(`[SePay Webhook] No invoice matched for ref: ${paymentRef}, amount: ${amount}`);
    }

    await txn.save();

    // SePay yêu cầu trả về { success: true }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[SePay Webhook] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ─── API kiểm tra trạng thái thanh toán (frontend polling) ──────────────────
// GET /api/payments/status/:paymentRef
// Staff dùng để poll xem hóa đơn đã được thanh toán chưa
router.get('/status/:paymentRef', requireAuth, requireRole(['staff', 'manager', 'admin']), async (req, res) => {
  try {
    if (!assertStoreScope(req, res)) return;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    const { paymentRef } = req.params;
    if (!paymentRef) return res.status(400).json({ message: 'paymentRef is required' });

    const invoice = await SalesInvoice.findOne({ payment_ref: paymentRef.toUpperCase() })
      .select('payment_status paid_at total_amount previous_debt_paid payment_ref store_id payment_method payment customer_id loyalty_earned_points');

    if (!invoice) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }

    // Kiểm tra storeId (trừ admin)
    const userRole = String(req.user?.role || '').toLowerCase();
    if (userRole !== 'admin' && req.user.storeId) {
      if (String(invoice.store_id) !== String(req.user.storeId)) {
        return res.status(403).json({ message: 'Không có quyền truy cập' });
      }
    }

    // Fallback: nếu webhook chưa tới, thử đối soát trực tiếp qua SePay API.
    // Dựa vào phần tiền chuyển khoản > 0 để cover cả đơn "split".
    if (invoice.payment_status !== 'paid' && Number(invoice.payment?.bank_transfer || 0) > 0) {
      await reconcileInvoiceFromSepay(invoice);
    }
    const customer = invoice.customer_id ? await Customer.findById(invoice.customer_id).select('loyalty_points').lean() : null;
    const store = await Store.findById(invoice.store_id).select('loyalty_settings').lean();
    const nudge = getNextNudge(Number(customer?.loyalty_points || 0), normalizeLoyaltySettings(store?.loyalty_settings || {}).milestones || []);

    return res.json({
      payment_ref: invoice.payment_ref,
      payment_status: invoice.payment_status,
      paid_at: invoice.paid_at,
      total_amount: invoice.total_amount,
      loyalty: {
        earned_points: Number(invoice?.loyalty_earned_points || 0),
        current_points: Number(customer?.loyalty_points || 0),
        next_nudge: nudge,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
});

// ─── Danh sách giao dịch chưa khớp (manager xem) ────────────────────────────
// GET /api/payments/unmatched
router.get('/unmatched', requireAuth, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    if (!assertStoreScope(req, res)) return;
    const filter = { status: 'unmatched' };
    if (String(req.user?.role || '').toLowerCase() !== 'admin' && req.user.storeId) {
      filter.storeId = req.user.storeId;
    }
    const txns = await PaymentTransaction.find(filter)
      .sort({ received_at: -1 })
      .limit(50)
      .lean();
    return res.json({ transactions: txns });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
