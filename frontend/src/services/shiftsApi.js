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

export async function getCurrentShift() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/shifts/current`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải ca hiện tại');
  return data.shift || null;
}

export async function openShift({ opening_cash = 0 } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/shifts/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ opening_cash }),
  });
  const data = await parseResponse(res, 'Không thể mở ca');
  return data.shift;
}

export async function closeShift(shiftId, { actual_cash = 0, actual_bank = 0, reconciliation_status = 'pending', reconciliation_note = '' } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/shifts/${shiftId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ actual_cash, actual_bank, reconciliation_status, reconciliation_note }),
  });
  const data = await parseResponse(res, 'Không thể đóng ca');
  return data.shift;
}

