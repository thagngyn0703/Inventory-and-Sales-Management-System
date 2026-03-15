const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function parseResponse(res, defaultMessage) {
  return res
    .json()
    .catch(() => ({}))
    .then((data) => {
      if (!res.ok) {
        throw new Error(data.message || defaultMessage);
      }
      return data;
    });
}

export async function getInvoices({ page = 1, limit = 20, status } = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/invoices`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  if (status) url.searchParams.set('status', status);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const data = await parseResponse(res, 'Không thể tải danh sách hóa đơn');
  return data;
}

export async function getInvoice(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/invoices/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải hóa đơn');
  return data.invoice;
}

export async function createInvoice(body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res, 'Không thể tạo hóa đơn');
  return data.invoice;
}

export async function updateInvoice(id, body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/invoices/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res, 'Không thể cập nhật hóa đơn');
  return data.invoice;
}

export async function submitInvoice(id) {
  return updateInvoice(id, { status: 'submitted' });
}

export async function approveInvoice(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/invoices/${id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể phê duyệt hóa đơn');
  return data.invoice;
}

export async function rejectInvoice(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/invoices/${id}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể từ chối hóa đơn');
  return data.invoice;
}

export async function cancelInvoice(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/invoices/${id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể hủy hóa đơn');
  return data.invoice;
}
