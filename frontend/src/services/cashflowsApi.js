const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function parseError(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || fallback);
  return data;
}

export async function getCashflows(params = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/cashflows`);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseError(res, 'Không thể tải sổ quỹ');
}

export async function getCashflowSummary(params = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/cashflows/summary`);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseError(res, 'Không thể tải tổng hợp sổ quỹ');
}

export async function createCashflow(payload) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/cashflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  return parseError(res, 'Không thể ghi nhận thu chi');
}
