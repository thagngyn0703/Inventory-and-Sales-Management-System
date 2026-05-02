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
        throw new Error(data.message || defaultMessage);
      }
      return data;
    });
}

export async function getReturns(params = {}) {
  const token = getToken();
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.status) query.set('status', params.status);
  const res = await fetch(`${API_BASE}/returns?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseResponse(res, 'Không thể tải danh sách trả hàng');
}

export async function createReturn(body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/returns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await parseResponse(res, 'Không thể thực hiện trả hàng');
  return { salesReturn: data.salesReturn, message: data.message };
}

export async function getReturnReasons() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/returns/reasons`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseResponse(res, 'Không thể tải danh mục lý do trả hàng');
}

export async function getReturnById(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/returns/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải chi tiết phiếu trả hàng');
  return data.salesReturn;
}
