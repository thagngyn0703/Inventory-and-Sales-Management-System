const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

/**
 * @param {{ page?: number, limit?: number, status?: string }} params
 */
export async function getAdjustments(params = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/stock-adjustments`);
  if (params.page != null) url.searchParams.set('page', String(params.page));
  if (params.limit != null) url.searchParams.set('limit', String(params.limit));
  if (params.status) url.searchParams.set('status', params.status);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể tải lịch sử điều chỉnh');
  return data;
}

export async function getAdjustment(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/stock-adjustments/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể tải chi tiết điều chỉnh');
  return data.adjustment;
}
