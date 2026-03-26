const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function parseJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || fallback);
  return data;
}

export async function getAdminStores({ page = 1, limit = 20, q = '', status = 'all' } = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/admin/stores`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  if (q) url.searchParams.set('q', q);
  if (status) url.searchParams.set('status', status);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải danh sách cửa hàng');
}

export async function createAdminStore(body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return parseJson(res, 'Không thể tạo cửa hàng');
}

export async function updateAdminStore(id, body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/stores/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return parseJson(res, 'Không thể cập nhật cửa hàng');
}

export async function setAdminStoreStatus(id, status) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/stores/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  return parseJson(res, 'Không thể cập nhật trạng thái cửa hàng');
}

export async function getRbacPermissions() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/rbac/permissions`, { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải permissions');
}

export async function getRbacRoles() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/rbac/roles`, { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải roles');
}

export async function updateRbacRole(id, body) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/rbac/roles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return parseJson(res, 'Không thể cập nhật role');
}

export async function getRbacUsers() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/rbac/users`, { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải users');
}

export async function assignUserRole(userId, role) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/admin/rbac/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  });
  return parseJson(res, 'Không thể gán role cho user');
}

