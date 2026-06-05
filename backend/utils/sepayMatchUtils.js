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

/** Webhook secret — mỗi merchant SePay (mỗi cửa hàng) có secret riêng. */
function getSepayWebhookSecrets() {
  const primary = String(process.env.SEPAY_SECRET || '').trim();
  const extras = String(process.env.SEPAY_SECRETS || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [];
  if (primary) all.push(primary);
  for (const s of extras) {
    if (!all.includes(s)) all.push(s);
  }
  return all;
}

function getPreferredAccountsForStore(storeBankAccount) {
  const storeAcc = normalizeAccountNumber(storeBankAccount || '');
  const envAcc = normalizeAccountNumber(process.env.SEPAY_ACCOUNT_NUMBER || '');
  const list = [];
  if (storeAcc) list.push(storeAcc);
  if (envAcc && !list.includes(envAcc)) list.push(envAcc);
  return list;
}

/** Mọi token SePay (mỗi cửa hàng / STK có thể có token riêng trên SePay). */
function getSepayApiTokens() {
  const primary = String(process.env.SEPAY_API_TOKEN || '').trim();
  const extras = String(process.env.SEPAY_API_TOKENS || '')
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const all = [];
  if (primary) all.push(primary);
  for (const t of extras) {
    if (!all.includes(t)) all.push(t);
  }
  return all;
}

async function fetchSepayTransactionsWithToken(amount, token) {
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

/**
 * Gọi SePay với mọi token đã cấu hình (SEPAY_API_TOKEN + SEPAY_API_TOKENS).
 * Gộp giao dịch để đối soát CK nhiều cửa hàng / nhiều STK.
 */
async function fetchSepayTransactionsByAmount(amount) {
  const tokens = getSepayApiTokens();
  if (!tokens.length) return [];

  const merged = [];
  const seen = new Set();
  let lastError = null;

  for (const token of tokens) {
    try {
      const txs = await fetchSepayTransactionsWithToken(amount, token);
      for (const tx of txs) {
        const key = String(tx?.id || tx?.reference_number || `${getTransactionContent(tx)}-${getTransactionAmountIn(tx)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(tx);
      }
    } catch (err) {
      lastError = err;
      console.warn('[SePay API] token poll failed:', err.message);
    }
  }

  if (!merged.length && lastError) throw lastError;
  return merged;
}

const SEPAY_QR_CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;
let sepayQrConfigCache = { value: null, expiresAt: 0 };

function getSepayQrConfigFromEnv() {
  return {
    bank_code: String(process.env.SEPAY_BANK_CODE || process.env.SEPAY_BANK_ID || '').trim().toLowerCase(),
    bank_account_number: String(process.env.SEPAY_ACCOUNT_NUMBER || '').trim(),
    account_name: String(process.env.SEPAY_ACCOUNT_NAME || '').trim(),
  };
}

function mergeSepayQrConfig(base = {}, override = {}) {
  return {
    bank_code: String(override.bank_code || base.bank_code || '').trim().toLowerCase(),
    bank_account_number: String(override.bank_account_number || base.bank_account_number || '').trim(),
    account_name: String(override.account_name || base.account_name || '').trim(),
  };
}

function isSepayQrConfigComplete(config = {}) {
  return Boolean(config.bank_code && config.bank_account_number);
}

function mapSepayBankAccountToQrConfig(account = {}) {
  return {
    bank_code: String(account.bank_code || '').trim().toLowerCase(),
    bank_account_number: String(account.account_number || '').trim(),
    account_name: String(account.account_holder_name || '').trim(),
  };
}

function normalizeSepayBankAccountsPayload(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.bankaccounts)) return data.bankaccounts;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

async function fetchSepayBankAccountsWithToken(token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-API-KEY': token,
    Accept: 'application/json',
  };

  const baseUrl = String(process.env.SEPAY_API_BASE_URL || 'https://my.sepay.vn').replace(/\/+$/, '');
  const endpoints = [
    `${baseUrl}/userapi/bankaccounts/list?limit=20`,
    'https://userapi.sepay.vn/v2/bank-accounts?limit=20',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) continue;
      const data = await res.json();
      const accounts = normalizeSepayBankAccountsPayload(data);
      if (accounts.length) return accounts;
    } catch (err) {
      console.warn('[SePay QR] bankaccounts fetch failed:', err.message);
    }
  }

  return [];
}

function pickSepayBankAccount(accounts = [], preferredAccountNumber = '') {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;

  const preferred = normalizeAccountNumber(preferredAccountNumber);
  const activeAccounts = accounts.filter((account) => {
    const active = account?.active;
    return active === 1 || active === '1' || active === true;
  });
  const pool = activeAccounts.length ? activeAccounts : accounts;

  if (preferred) {
    const matched = pool.find((account) => normalizeAccountNumber(account?.account_number) === preferred);
    if (matched) return matched;
  }

  return pool
    .slice()
    .sort((a, b) => String(b?.last_transaction || '').localeCompare(String(a?.last_transaction || '')))[0];
}

async function resolveSepayQrConfig() {
  const fromEnv = getSepayQrConfigFromEnv();
  if (isSepayQrConfigComplete(fromEnv)) return fromEnv;

  const now = Date.now();
  if (sepayQrConfigCache.value && sepayQrConfigCache.expiresAt > now) {
    const cached = mergeSepayQrConfig(fromEnv, sepayQrConfigCache.value);
    if (isSepayQrConfigComplete(cached)) return cached;
  }

  const tokens = getSepayApiTokens();
  if (!tokens.length) return fromEnv;

  for (const token of tokens) {
    const accounts = await fetchSepayBankAccountsWithToken(token);
    const picked = pickSepayBankAccount(accounts, fromEnv.bank_account_number);
    if (!picked) continue;

    const resolved = mergeSepayQrConfig(fromEnv, mapSepayBankAccountToQrConfig(picked));
    if (!isSepayQrConfigComplete(resolved)) continue;

    sepayQrConfigCache = {
      value: resolved,
      expiresAt: now + SEPAY_QR_CONFIG_CACHE_TTL_MS,
    };
    return resolved;
  }

  return fromEnv;
}

function buildVietQrUrl({ bank_code, bank_account_number, amount_vnd, payment_content, account_name }) {
  if (!bank_code || !bank_account_number || !amount_vnd || !payment_content) return '';
  return `https://img.vietqr.io/image/${bank_code}-${bank_account_number}-compact2.png?amount=${Math.round(
    Number(amount_vnd || 0)
  )}&addInfo=${encodeURIComponent(String(payment_content || ''))}&accountName=${encodeURIComponent(account_name || '')}`;
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
  getSepayApiTokens,
  getSepayWebhookSecrets,
  fetchSepayTransactionsByAmount,
  fetchSepayTransactionsWithToken,
  getSepayQrConfigFromEnv,
  resolveSepayQrConfig,
  buildVietQrUrl,
};
