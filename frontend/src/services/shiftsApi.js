const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function parseResponse(res, defaultMessage) {
  return res
    .json()
    .catch(() => ({}))
    .then((data) => {
      if (!res.ok) {
        const err = new Error(data.message || defaultMessage);
        err.code = data.code || data.error_code || null;
        err.payload = data;
        throw err;
      }
      return data;
    });
}

export async function getCurrentShift({ registerId = '' } = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/shifts/current`);
  if (registerId) url.searchParams.set('register_id', String(registerId));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải ca hiện tại');
  return data.shift || null;
}

export async function openShift({ opening_cash = 0, register_id = '' } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/shifts/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ opening_cash, register_id }),
  });
  const data = await parseResponse(res, 'Không thể mở ca');
  return data.shift;
}

export async function closeShift(
  shiftId,
  { actual_cash = 0, actual_bank = 0, reconciliation_status = 'pending', reconciliation_note = '', override_close = false } = {}
) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/shifts/${shiftId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ actual_cash, actual_bank, reconciliation_status, reconciliation_note, override_close }),
  });
  const data = await parseResponse(res, 'Không thể đóng ca');
  return data.shift;
}

export async function getShiftSessions({
  page = 1,
  limit = 20,
  status = '',
  from = '',
  to = '',
  user_id = '',
  keyword = '',
} = {}) {
  const token = getToken();
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (user_id) params.set('user_id', user_id);
  if (keyword) params.set('keyword', keyword);
  const res = await fetch(`${API_BASE}/shifts?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseResponse(res, 'Không thể tải danh sách ca');
}

export async function getShiftInvoices(shiftId, { page = 1, limit = 20 } = {}) {
  const token = getToken();
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  const res = await fetch(`${API_BASE}/shifts/${shiftId}/invoices?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseResponse(res, 'Không thể tải hóa đơn theo ca');
}

