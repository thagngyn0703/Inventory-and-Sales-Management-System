const express = require('express');
const crypto = require('crypto');
const Store = require('../models/Store');
const User = require('../models/User');
const StoreSubscriptionOrder = require('../models/StoreSubscriptionOrder');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getResolvedSubscriptionPlans,
  addDays,
  addMonths,
  getPlanByCode,
  evaluateStoreSubscription,
} = require('../utils/subscriptionAccess');

const router = express.Router();

function verifySepaySignature(rawBody, receivedChecksum) {
  const secret = process.env.SEPAY_SECRET;
  const allowInsecureWebhook = String(process.env.SEPAY_ALLOW_INSECURE_WEBHOOK || '').toLowerCase() === 'true';
  const strictByEnv = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const strictMode = strictByEnv && !allowInsecureWebhook;
  if (!secret) {
    return !strictMode;
  }
  if (!receivedChecksum) {
    return !strictMode;
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === String(receivedChecksum).toLowerCase();
}

function normalizeRef(raw = '') {
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractSubscriptionRef(content = '') {
  const m = String(content).toUpperCase().match(/SUB[-\s]?([A-Z0-9]{8,16})/i);
  return m ? `SUB-${m[1].toUpperCase()}` : null;
}

function normalizeAccountNumber(value = '') {
  return String(value).replace(/\D/g, '');
}

function parseAmount(value) {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

async function fetchSepayTransactionsByAmount(amount) {
  const token = String(process.env.SEPAY_API_TOKEN || '').trim();
  if (!token) return [];
  const baseUrl = String(process.env.SEPAY_API_BASE_URL || 'https://my.sepay.vn').replace(/\/+$/, '');
  const url = new URL(`${baseUrl}/userapi/transactions/list`);
  url.searchParams.set('limit', '50');
  url.searchParams.set('amount_in', String(Math.round(parseAmount(amount))));

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-API-KEY': token,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`SePay API error ${resp.status}: ${text || 'request failed'}`);
  }
  const data = await resp.json();
  return Array.isArray(data?.transactions) ? data.transactions : [];
}

function buildPaymentRef() {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SUB-${Date.now().toString(36).toUpperCase()}${rand}`;
}

function getSepayQrConfig() {
  return {
    bank_code: String(process.env.SEPAY_BANK_CODE || process.env.SEPAY_BANK_ID || '').trim().toLowerCase(),
    bank_account_number: String(process.env.SEPAY_ACCOUNT_NUMBER || '').trim(),
    account_name: String(process.env.SEPAY_ACCOUNT_NAME || '').trim(),
  };
}

function buildVietQrUrl({ bank_code, bank_account_number, amount_vnd, payment_content, account_name }) {
  if (!bank_code || !bank_account_number || !amount_vnd || !payment_content) return '';
  return `https://img.vietqr.io/image/${bank_code}-${bank_account_number}-compact2.png?amount=${Math.round(
    Number(amount_vnd || 0)
  )}&addInfo=${encodeURIComponent(String(payment_content || ''))}&accountName=${encodeURIComponent(account_name || '')}`;
}

function buildCheckoutPayload(orderDoc) {
  const paymentContent = `ISMS ${orderDoc.payment_ref}`;
  const qrConfig = getSepayQrConfig();
  return {
    order: orderDoc,
    bank_code: qrConfig.bank_code,
    bank_account_number: qrConfig.bank_account_number,
    bank_account_name: qrConfig.account_name,
    payment_content: paymentContent,
    qr_url: buildVietQrUrl({
      bank_code: qrConfig.bank_code,
      bank_account_number: qrConfig.bank_account_number,
      amount_vnd: orderDoc.amount_vnd,
      payment_content: paymentContent,
      account_name: qrConfig.account_name,
    }),
  };
}

async function applyPaidSubscription(order, payload) {
  if (!order || order.status === 'paid') return order;

  const store = await Store.findById(order.store_id);
  if (!store) throw new Error('Store not found');

  const now = new Date();
  const currentEnd = store.subscription_ends_at ? new Date(store.subscription_ends_at) : null;
  const baseDate = currentEnd && currentEnd > now ? currentEnd : now;
  const nextEnd = addMonths(baseDate, Number(order.duration_months || 0));

  store.subscription_status = 'active';
  store.current_plan_code = order.plan_code;
  store.subscription_started_at = now;
  store.subscription_ends_at = nextEnd;
  if (!store.trial_started_at) store.trial_started_at = store.createdAt || now;
  if (!store.trial_ends_at) store.trial_ends_at = addDays(store.trial_started_at, 7);
  await store.save();

  order.status = 'paid';
  order.provider_txn_id = String(
    payload?.id || payload?.transactionId || payload?.transId || payload?.referenceCode || payload?.reference_number || ''
  );
  order.payment_content = String(payload?.content || payload?.description || '');
  order.paid_at = new Date();
  order.raw_payload = payload;
  await order.save();
  return order;
}

router.get('/plans', async (req, res) => {
  try {
    const plans = await getResolvedSubscriptionPlans();
    return res.json({ plans });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.get('/my-store', requireAuth, requireRole(['manager', 'staff', 'admin']), async (req, res) => {
  try {
    let storeId = req.user?.storeId || null;
    if (!storeId && String(req.user?.role || '').toLowerCase() === 'admin' && req.query.store_id) {
      storeId = String(req.query.store_id);
    }
    if (!storeId) {
      return res.status(400).json({ message: 'Tài khoản chưa gắn cửa hàng.', code: 'STORE_REQUIRED' });
    }
    const store = await Store.findById(storeId).lean();
    if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });

    const subscription = evaluateStoreSubscription(store);
    const latestOrder = await StoreSubscriptionOrder.findOne({ store_id: storeId })
      .sort({ createdAt: -1 })
      .select('plan_code plan_name amount_vnd status payment_ref createdAt paid_at expires_at')
      .lean();

    return res.json({
      subscription,
      latest_order: latestOrder || null,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Server error' });
  }
});

router.post(
  '/checkout',
  requireAuth,
  requireRole(['manager'], {
    allowLockedStoreForManager: true,
    allowApprovalBlockedWriteForManager: true,
    allowExpiredSubscriptionForManager: true,
  }),
  async (req, res) => {
    try {
      const manager = await User.findById(req.user.id).select('_id storeId').lean();
      if (!manager || !manager.storeId) {
        return res.status(403).json({ message: 'Manager chưa có cửa hàng.', code: 'STORE_REQUIRED' });
      }

      const store = await Store.findById(manager.storeId);
      if (!store) return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });

      const plan = await getPlanByCode(req.body?.plan_code);
      if (!plan) {
        return res.status(400).json({ message: 'Gói dịch vụ không hợp lệ' });
      }

      const pending = await StoreSubscriptionOrder.findOne({
        store_id: store._id,
        status: 'pending',
        expires_at: { $gt: new Date() },
      })
        .sort({ createdAt: -1 })
        .lean();

      if (pending) {
        return res.json(buildCheckoutPayload(pending));
      }

      const paymentRef = buildPaymentRef();
      const order = await StoreSubscriptionOrder.create({
        store_id: store._id,
        manager_id: manager._id,
        plan_code: plan.code,
        plan_name: plan.name,
        duration_months: plan.duration_months,
        amount_vnd: plan.price_vnd,
        payment_ref: paymentRef,
        status: 'pending',
        expires_at: addDays(new Date(), 1),
      });

      return res.status(201).json(
        buildCheckoutPayload({
          _id: order._id,
          plan_code: order.plan_code,
          plan_name: order.plan_name,
          duration_months: order.duration_months,
          amount_vnd: order.amount_vnd,
          payment_ref: order.payment_ref,
          status: order.status,
          expires_at: order.expires_at,
          createdAt: order.createdAt,
        })
      );
    } catch (err) {
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

router.get(
  '/orders/my-store',
  requireAuth,
  requireRole(['manager'], {
    allowLockedStoreForManager: true,
    allowApprovalBlockedWriteForManager: true,
    allowExpiredSubscriptionForManager: true,
  }),
  async (req, res) => {
    try {
      if (!req.user?.storeId) return res.status(403).json({ message: 'Manager chưa có cửa hàng.' });
      const orders = await StoreSubscriptionOrder.find({ store_id: req.user.storeId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      return res.json({ orders });
    } catch (err) {
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

router.post(
  '/orders/:orderId/reconcile',
  requireAuth,
  requireRole(['manager'], {
    allowLockedStoreForManager: true,
    allowApprovalBlockedWriteForManager: true,
    allowExpiredSubscriptionForManager: true,
  }),
  async (req, res) => {
    try {
      const order = await StoreSubscriptionOrder.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn mua gói' });
      if (String(order.store_id) !== String(req.user.storeId)) {
        return res.status(403).json({ message: 'Không có quyền truy cập đơn này' });
      }
      if (String(order.status) === 'paid') return res.json({ order, matched: true });
      if (order.expires_at && new Date(order.expires_at) < new Date()) {
        order.status = 'expired';
        await order.save();
        return res.json({ order, matched: false, message: 'Đơn đã hết hạn' });
      }

      const txs = await fetchSepayTransactionsByAmount(order.amount_vnd);
      const normalizedRef = normalizeRef(order.payment_ref);
      const accountFilter = normalizeAccountNumber(process.env.SEPAY_ACCOUNT_NUMBER || '');
      const matchedTx = txs.find((tx) => {
        const contentRaw = String(tx?.transaction_content || tx?.content || tx?.description || '').toUpperCase();
        const normalizedContent = normalizeRef(contentRaw);
        const amountIn = parseAmount(tx?.amount_in ?? tx?.amount ?? tx?.transferAmount);
        const accountNo = normalizeAccountNumber(
          tx?.account_number || tx?.accountNumber || tx?.account_no || tx?.account || ''
        );
        const accountOk = !accountFilter || !accountNo || accountNo === accountFilter;
        return accountOk && Math.abs(amountIn - Number(order.amount_vnd || 0)) <= 1 && normalizedContent.includes(normalizedRef);
      });

      if (!matchedTx) return res.json({ order, matched: false, message: 'Chưa tìm thấy giao dịch khớp' });

      await applyPaidSubscription(order, matchedTx);
      return res.json({ order, matched: true, message: 'Đã xác nhận thanh toán thành công' });
    } catch (err) {
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

router.get(
  '/orders/:orderId/status',
  requireAuth,
  requireRole(['manager'], {
    allowLockedStoreForManager: true,
    allowApprovalBlockedWriteForManager: true,
    allowExpiredSubscriptionForManager: true,
  }),
  async (req, res) => {
    try {
      const order = await StoreSubscriptionOrder.findById(req.params.orderId).lean();
      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn mua gói' });
      if (String(order.store_id) !== String(req.user.storeId)) {
        return res.status(403).json({ message: 'Không có quyền truy cập đơn này' });
      }
      return res.json({ order });
    } catch (err) {
      return res.status(500).json({ message: err.message || 'Server error' });
    }
  }
);

router.post('/sepay/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body || {});
    const checksum =
      req.headers['x-checksum'] ||
      req.headers['checksum'] ||
      req.headers['x-signature'] ||
      req.headers['sepay-signature'] ||
      '';

    if (!verifySepaySignature(rawBody, checksum)) {
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    let payload;
    try {
      payload = typeof req.body === 'object' && !(req.body instanceof Buffer) ? req.body : JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const providerTxnId = String(
      payload?.id || payload?.transactionId || payload?.transId || payload?.referenceCode || payload?.reference_number || ''
    ).trim();
    if (!providerTxnId) return res.status(400).json({ success: false, message: 'Missing transaction id' });

    const content = String(payload?.content || payload?.description || payload?.transferContent || '').trim();
    const parsedRef = extractSubscriptionRef(content);
    if (!parsedRef) return res.status(200).json({ success: true, message: 'No subscription ref' });

    const normalizedRef = normalizeRef(parsedRef);
    const accountFilter = normalizeAccountNumber(process.env.SEPAY_ACCOUNT_NUMBER || '');
    const accountNumber = normalizeAccountNumber(
      payload?.accountNumber || payload?.account_number || payload?.account || payload?.account_no || ''
    );
    if (accountFilter && accountNumber && accountFilter !== accountNumber) {
      return res.status(200).json({ success: true, message: 'Account mismatch' });
    }

    const order = await StoreSubscriptionOrder.findOne({
      payment_ref: new RegExp(`^${parsedRef.replace('-', '[- ]?')}$`, 'i'),
    });
    if (!order) return res.status(200).json({ success: true, message: 'Order not found' });
    if (order.status === 'paid') return res.status(200).json({ success: true, message: 'Already processed' });
    if (order.expires_at && new Date(order.expires_at) < new Date()) {
      order.status = 'expired';
      await order.save();
      return res.status(200).json({ success: true, message: 'Order expired' });
    }
    if (String(order.provider_txn_id || '').trim() === providerTxnId) {
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    const amount = parseAmount(payload?.transferAmount ?? payload?.amount ?? payload?.money ?? 0);
    if (Math.abs(Number(order.amount_vnd || 0) - amount) > 1) {
      return res.status(200).json({ success: true, message: 'Amount mismatch' });
    }

    if (normalizedRef !== normalizeRef(order.payment_ref)) {
      return res.status(200).json({ success: true, message: 'Ref mismatch' });
    }

    await applyPaidSubscription(order, payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

module.exports = router;
