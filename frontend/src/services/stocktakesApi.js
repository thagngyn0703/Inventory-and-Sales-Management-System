const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

/**
 * Create a new stocktaking record (draft).
 * @param {{ product_ids: string[] }} body
 * @returns {Promise<{ stocktake: object }>}
 */
export async function createStocktake(body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/stocktakes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể tạo phiếu kiểm kê');
  return data;
}

/**
 * @param {{ page?: number, limit?: number, status?: string }} params
 */
export async function getStocktakes(params = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/stocktakes`);
  if (params.page != null) url.searchParams.set('page', String(params.page));
  if (params.limit != null) url.searchParams.set('limit', String(params.limit));
  if (params.status) url.searchParams.set('status', params.status);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể tải danh sách phiếu kiểm kê');
  return data;
}

export async function getStocktake(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/stocktakes/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể tải phiếu kiểm kê');
  return data.stocktake;
}

/**
 * Update stocktake items (actual_qty, reason) and/or submit. Only for draft.
 * @param {string} id
 * @param {{ items?: Array<{ product_id: string, actual_qty?: number | null, reason?: string }>, status?: 'submitted' }} body
 */
export async function updateStocktake(id, body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/stocktakes/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể cập nhật phiếu kiểm kê');
  return data.stocktake;
}

/**
 * Manager/Admin duyệt phiếu kiểm kê (submitted) → tạo điều chỉnh tồn, cập nhật Product.stock_qty
 * @param {string} id — stocktake id
 * @param {{ reason?: string }} [body] — lý do điều chỉnh (tùy chọn)
 */
export async function approveStocktake(id, body = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/stocktakes/${id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể duyệt phiếu');
  return data;
}

/**
 * Manager/Admin từ chối phiếu kiểm kê (submitted) → chuyển sang Đã hủy, không cập nhật tồn
 * @param {string} id — stocktake id
 * @param {{ reason?: string }} [body]
 */
export async function rejectStocktake(id, body = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/stocktakes/${id}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể từ chối phiếu');
  return data;
}
