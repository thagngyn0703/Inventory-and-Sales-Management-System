const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function parseError(res, fallback) {
  const data = await res.json().catch(() => ({}));
  return new Error(data.message || fallback);
}

/**
 * getSuppliers()
 * - Không truyền tham số: trả về mảng suppliers (phục vụ dropdown)
 * - Có truyền (page, limit, q, status): trả về object { suppliers, total, page, limit, totalPages }
 */
export async function getSuppliers(page, limit, q, status = 'active') {
  const token = getToken();

  // Backward-compatible: dropdown calls with no args
  const isDropdownMode = page === undefined && limit === undefined && q === undefined;
  const pageNum = isDropdownMode ? 1 : Number(page) || 1;
  const limitNum = isDropdownMode ? 1000 : Number(limit) || 20;
  const qStr = isDropdownMode ? '' : (q || '');

  const params = new URLSearchParams();
  if (qStr && String(qStr).trim()) params.set('q', String(qStr).trim());
  if (status) params.set('status', status);
  if (pageNum) params.set('page', String(pageNum));
  if (limitNum) params.set('limit', String(limitNum));
  const res = await fetch(`${API_BASE}/suppliers?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw await parseError(res, 'Không thể tải danh sách nhà cung cấp');
  const data = await res.json();
  return isDropdownMode ? (data.suppliers || []) : data;
}

export async function createSupplier(payload) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/suppliers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw await parseError(res, 'Không thể tạo nhà cung cấp');
  const data = await res.json();
  return data.supplier;
}

export async function uploadSupplierQrImage(file) {
  const token = getToken();
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${API_BASE}/suppliers/upload-qr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw await parseError(res, 'Không thể upload ảnh QR nhà cung cấp');
  const data = await res.json();
  return data.bank_qr_image_url || data?.image?.url || '';
}

export async function getSupplier(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/suppliers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseError(res, 'Không thể tải nhà cung cấp');
  const data = await res.json();
  return data.supplier;
}

export async function updateSupplier(id, payload) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/suppliers/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw await parseError(res, 'Không thể cập nhật nhà cung cấp');
  const data = await res.json();
  return data.supplier;
}

export async function setSupplierStatus(id, status) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/suppliers/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw await parseError(res, 'Không thể đổi trạng thái nhà cung cấp');
  const data = await res.json();
  return data.supplier;
}

export async function getSupplierDebtHistory(id, params = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/suppliers/${id}/debt-history`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseError(res, 'Không thể tải sổ nợ nhà cung cấp');
  return res.json();
}

export async function createSupplierDebtPayment(id, payload) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/suppliers/${id}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw await parseError(res, 'Không thể ghi nhận thanh toán nợ');
  return res.json();
}

export async function createSupplierReturn(id, payload) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/suppliers/${id}/returns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) throw await parseError(res, 'Không thể ghi nhận trả hàng nhà cung cấp');
  return res.json();
}

export async function exportSupplierDebtHistoryExcel(id, params = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/suppliers/${id}/debt-history/export.xlsx`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseError(res, 'Không thể xuất Excel sổ nợ');
  return res.blob();
}

export async function getSupplierReturn(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/supplier-returns/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseError(res, 'Không thể tải chi tiết phiếu trả NCC');
  const data = await res.json();
  return data.supplier_return;
}

export async function getSupplierReturnDetail(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/supplier-returns/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseError(res, 'Không thể tải chi tiết phiếu trả NCC');
  return res.json();
}

export async function getSupplierReturns(params = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/supplier-returns`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseError(res, 'Không thể tải danh sách phiếu trả NCC');
  return res.json();
}

export async function exportSupplierReturnsExcel(params = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/supplier-returns/export.xlsx`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseError(res, 'Không thể xuất Excel phiếu trả NCC');
  return res.blob();
}
