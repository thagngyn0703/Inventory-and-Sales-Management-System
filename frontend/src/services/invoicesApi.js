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

export async function getInvoices({ page = 1, limit = 20, status, dateFrom, dateTo, searchKey } = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/invoices`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  if (status) url.searchParams.set('status', status);
  if (dateFrom) url.searchParams.set('dateFrom', dateFrom);
  if (dateTo) url.searchParams.set('dateTo', dateTo);
  if (searchKey) url.searchParams.set('searchKey', searchKey);
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


export async function cancelInvoice(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/invoices/${id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể hủy hóa đơn');
  return data.invoice;
}

export async function getDailySalesStats() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/invoices/stats/daily-sales`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải thống kê doanh thu');
  return data.stats;
}
