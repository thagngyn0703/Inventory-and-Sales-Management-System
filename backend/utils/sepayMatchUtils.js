/**
 * Đối soát giao dịch SePay cho nhiều cửa hàng qua một tài khoản SePay (env).
 * Mỗi cửa hàng có QR VietQR riêng (bank_account trên Store); SePay webhook/API
 * nhận mọi giao dịch — khớp chủ yếu theo payment_ref + số tiền, không bắt buộc
 * trùng SEPAY_ACCOUNT_NUMBER trong .env.
 */

function normalizePaymentRef(ref = '') {
  return String(ref).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeAccountNumber(value = '') {
  return String(value).replace(/\D/g, '');
}

function parseAmount(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;

  let raw = String(value).trim();
  if (!raw) return 0;
  raw = raw.replace(/\s+/g, '');

  if (raw.includes(',') && raw.includes('.')) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else {
      raw = raw.replace(/,/g, '');
    }
  } else if (raw.includes(',')) {
    const parts = raw.split(',');
    raw = parts[parts.length - 1].length === 3 ? parts.join('') : raw.replace(',', '.');
  } else if (raw.includes('.')) {
    const parts = raw.split('.');
    if (parts[parts.length - 1].length === 3) raw = parts.join('');
  }

  raw = raw.replace(/[^\d.-]/g, '');
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function extractPaymentRef(content = '') {
  const match = String(content).toUpperCase().match(/IMS[-\s]?([A-Z0-9]{6,10})/i);
  return match ? `IMS-${match[1].toUpperCase()}` : null;
}

function getTransactionContent(tx = {}) {
  return String(tx?.transaction_content || tx?.content || tx?.description || '');
}

function getTransactionAmountIn(tx = {}) {
  return parseAmount(tx?.amount_in ?? tx?.amount ?? tx?.transferAmount);
}

function getTransactionAccountNumber(tx = {}) {
  return normalizeAccountNumber(
    tx?.account_number || tx?.accountNumber || tx?.account_no || tx?.account || ''
  );
}

function amountsMatch(a, b, tolerance = 1) {
  return Math.abs(parseAmount(a) - parseAmount(b)) <= tolerance;
}

/**
 * Ưu tiên khớp ref + amount. Số tài khoản chỉ dùng để xếp hạng khi có nhiều kết quả.
 */
function findMatchingSepayTransaction(transactions, { paymentRef, expectedAmount, preferredAccountNumbers = [] }) {
  if (!paymentRef || !Array.isArray(transactions) || transactions.length === 0) return null;

  const normalizedRef = normalizePaymentRef(paymentRef);
  const preferred = (preferredAccountNumbers || [])
    .map((n) => normalizeAccountNumber(n))
    .filter(Boolean);

  const candidates = transactions.filter((tx) => {
    const contentRaw = getTransactionContent(tx).toUpperCase();
    const normalizedContent = normalizePaymentRef(contentRaw);
    if (!normalizedContent.includes(normalizedRef)) return false;
    if (expectedAmount != null && expectedAmount > 0) {
      return amountsMatch(getTransactionAmountIn(tx), expectedAmount);
    }
    return true;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (preferred.length > 0) {
    const withAccount = candidates.find((tx) => {
      const acc = getTransactionAccountNumber(tx);
      return acc && preferred.includes(acc);
    });
    if (withAccount) return withAccount;
  }

  return candidates[0];
}

function getPreferredAccountsForStore(storeBankAccount) {
  const storeAcc = normalizeAccountNumber(storeBankAccount || '');
  const envAcc = normalizeAccountNumber(process.env.SEPAY_ACCOUNT_NUMBER || '');
  const list = [];
  if (storeAcc) list.push(storeAcc);
  if (envAcc && !list.includes(envAcc)) list.push(envAcc);
  return list;
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

module.exports = {
  normalizePaymentRef,
  normalizeAccountNumber,
  parseAmount,
  extractPaymentRef,
  amountsMatch,
  findMatchingSepayTransaction,
  getPreferredAccountsForStore,
  getTransactionAmountIn,
  getTransactionContent,
  getTransactionAccountNumber,
  fetchSepayTransactionsByAmount,
};
