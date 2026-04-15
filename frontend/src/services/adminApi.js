const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function parseJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || fallback);
  return data;
}

function apiPath(segment) {
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${segment.startsWith('/') ? segment : `/${segment}`}`;
}

export async function getAdminDashboard({ months = 12 } = {}) {
  const token = getToken();
  const params = new URLSearchParams();
  if (months) params.set('months', String(months));
  const q = params.toString();
  const res = await fetch(`${apiPath('/admin/dashboard')}${q ? `?${q}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể tải tổng quan admin');
}

export async function getAdminUsers({ page = 1, limit = 20, q = '', status = '', all = false } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (all) params.set('all', 'true');
  const res = await fetch(`${apiPath('/users')}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải danh sách người dùng');
}

export async function patchAdminUserStatus(userId, status) {
  const token = getToken();
  const res = await fetch(`${apiPath(`/users/${userId}/status`)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  return parseJson(res, 'Không thể cập nhật trạng thái tài khoản');
}

export async function assignUserToStore(userId, storeId) {
  const token = getToken();
  const res = await fetch(`${apiPath(`/users/${userId}/store`)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ storeId }),
  });
  return parseJson(res, 'Không thể gán cửa hàng cho tài khoản');
}

export async function getAdminStores({ page = 1, limit = 20, q = '', status = 'all', all = false } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (all) params.set('all', 'true');
  const res = await fetch(`${apiPath('/admin/stores')}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải danh sách cửa hàng');
}

export async function setAdminStoreStatus(id, status) {
  const token = getToken();
  const res = await fetch(`${apiPath(`/admin/stores/${id}/status`)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  return parseJson(res, 'Không thể cập nhật trạng thái cửa hàng');
}

export async function getRbacPermissions() {
  const token = getToken();
  const res = await fetch(`${apiPath('/admin/rbac/permissions')}`, { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải permissions');
}

export async function getRbacRoles() {
  const token = getToken();
  const res = await fetch(`${apiPath('/admin/rbac/roles')}`, { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải roles');
}

export async function updateRbacRole(id, body) {
  const token = getToken();
  const res = await fetch(`${apiPath(`/admin/rbac/roles/${id}`)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return parseJson(res, 'Không thể cập nhật role');
}

export async function getRbacUsers() {
  const token = getToken();
  const res = await fetch(`${apiPath('/admin/rbac/users')}`, { headers: { Authorization: `Bearer ${token}` } });
  return parseJson(res, 'Không thể tải users');
}

export async function assignUserRole(userId, role) {
  const token = getToken();
  const res = await fetch(`${apiPath(`/admin/rbac/users/${userId}/role`)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  });
  return parseJson(res, 'Không thể gán role cho user');
}

export async function getStoreTaxSettings() {
  const token = getToken();
  const res = await fetch(`${apiPath('/store-settings/tax')}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể tải cấu hình thuế');
}

export async function updateStoreTaxSettings({ tax_rate, price_includes_tax }) {
  const token = getToken();
  const res = await fetch(`${apiPath('/store-settings/tax')}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tax_rate, price_includes_tax }),
  });
  return parseJson(res, 'Không thể cập nhật cấu hình thuế');
}

