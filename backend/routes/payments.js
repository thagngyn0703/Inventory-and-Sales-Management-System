const express = require('express');
const crypto = require('crypto');
const SalesInvoice = require('../models/SalesInvoice');
const PaymentTransaction = require('../models/PaymentTransaction');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Xác thực chữ ký HMAC-SHA256 từ SePay.
 * SePay gửi header: X-Checksum = HMAC_SHA256(rawBody, SEPAY_SECRET)
 */
function verifySepaySignature(rawBody, receivedChecksum) {
  const secret = process.env.SEPAY_SECRET;
  if (!secret) return true; // Nếu chưa cấu hình secret thì bỏ qua (dev mode)
  if (!receivedChecksum) {
    // Một số cấu hình SePay/IPN không gửi checksum header.
    // Cho phép đi tiếp để tránh mất webhook (log cảnh báo để theo dõi).
    console.warn('[SePay Webhook] Missing checksum header, skip signature verify');
    return true;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expected === String(receivedChecksum).toLowerCase();
}

/**
 * Trích xuất payment_ref từ nội dung chuyển khoản.
 * Ví dụ: "Thanh toan IMS-A1B2C3 cua hang ABC" → "IMS-A1B2C3"
 */
function extractPaymentRef(content = '') {
  // Hỗ trợ cả 2 kiểu nội dung ngân hàng:
  // - IMS-ABC123
  // - IMSABC123 (một số bank tự bỏ dấu '-')
  const match = String(content).toUpperCase().match(/IMS[-\s]?([A-Z0-9]{6,10})/i);
  return match ? `IMS-${match[1].toUpperCase()}` : null;
}

function normalizePaymentRef(ref = '') {
  return String(ref).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchSepayTransactionsByAmount(amount) {
  const token = String(process.env.SEPAY_API_TOKEN || '').trim();
  if (!token) return [];

  const baseUrl = String(process.env.SEPAY_API_BASE_URL || 'https://my.sepay.vn').replace(/\/+$/, '');
  const url = new URL(`${baseUrl}/userapi/transactions/list`);
  url.searchParams.set('limit', '50');
  url.searchParams.set('amount_in', String(Math.round(parseAmount(amount))));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-API-KEY': token,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SePay API error ${res.status}: ${text || 'request failed'}`);
  }

  const data = await res.json();
  return Array.isArray(data?.transactions) ? data.transactions : [];
}

async function reconcileInvoiceFromSepay(invoice) {
  if (!invoice || String(invoice.payment_status) === 'paid' || !invoice.payment_ref) {
    return { matched: false };
  }

  const ref = String(invoice.payment_ref).trim().toUpperCase();
  const normalizedRef = normalizePaymentRef(ref);
  const targetAmount = parseAmount(invoice.total_amount);
  const accountFilter = String(process.env.SEPAY_ACCOUNT_NUMBER || '').trim();

  let transactions = [];
  try {
    transactions = await fetchSepayTransactionsByAmount(targetAmount);
  } catch (err) {
    console.warn('[SePay Poll] Không truy vấn được API SePay:', err.message);
    return { matched: false, reason: 'sepay_api_unavailable' };
  }

  const matchedTx = transactions.find((tx) => {
    const contentRaw = String(tx?.transaction_content || tx?.content || tx?.description || '').toUpperCase();
    const normalizedContent = normalizePaymentRef(contentRaw);
    const amountIn = parseAmount(tx?.amount_in ?? tx?.amount ?? tx?.transferAmount);
    const accountNumber = String(tx?.account_number || '');
    const accountOk = !accountFilter || accountNumber === accountFilter;
    return accountOk && amountIn === targetAmount && normalizedContent.includes(normalizedRef);
  });

  if (!matchedTx) return { matched: false, reason: 'not_found' };

  // Chuyển trạng thái hóa đơn sang paid
  invoice.payment_status = 'paid';
  invoice.paid_at = new Date();
  await invoice.save();

  // Lưu transaction nếu chưa có (idempotent)
  const providerTxnId = String(matchedTx.id || matchedTx.reference_number || `${ref}-${targetAmount}`);
  const exists = await PaymentTransaction.findOne({ provider_txn_id: providerTxnId });
  if (!exists) {
    await PaymentTransaction.create({
      provider: 'sepay',
      provider_txn_id: providerTxnId,
      invoice_id: invoice._id,
      storeId: invoice.store_id || null,
      amount: parseAmount(matchedTx?.amount_in ?? matchedTx?.amount ?? matchedTx?.transferAmount),
      content: String(matchedTx?.transaction_content || matchedTx?.content || ''),
      payment_ref_matched: ref,
      status: 'matched',
      raw_payload: matchedTx,
      received_at: matchedTx?.transaction_date ? new Date(matchedTx.transaction_date) : new Date(),
    });
  }

  console.log(`[SePay Poll] Matched invoice ${invoice._id} with ref ${ref} via transaction API`);
  return { matched: true };
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

    if (matchedInvoice) {
      txn.invoice_id = matchedInvoice._id;
      txn.storeId = matchedInvoice.store_id;
      txn.status = 'matched';

      // Cập nhật trạng thái hóa đơn
      matchedInvoice.payment_status = 'paid';
      matchedInvoice.paid_at = new Date();
      await matchedInvoice.save();

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
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    const { paymentRef } = req.params;
    if (!paymentRef) return res.status(400).json({ message: 'paymentRef is required' });

    const invoice = await SalesInvoice.findOne({ payment_ref: paymentRef.toUpperCase() })
      .select('payment_status paid_at total_amount payment_ref store_id payment_method');

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

    // Fallback: nếu webhook chưa tới, thử đối soát trực tiếp qua SePay API
    if (invoice.payment_status !== 'paid' && invoice.payment_method === 'bank_transfer') {
      await reconcileInvoiceFromSepay(invoice);
    }

    return res.json({
      payment_ref: invoice.payment_ref,
      payment_status: invoice.payment_status,
      paid_at: invoice.paid_at,
      total_amount: invoice.total_amount,
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
