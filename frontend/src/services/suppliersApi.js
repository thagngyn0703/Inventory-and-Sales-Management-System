const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

/** Danh sách nhà cung cấp (active) cho dropdown */
export async function getSuppliers() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/suppliers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Không thể tải danh sách nhà cung cấp');
  }
  const data = await res.json();
  return data.suppliers || [];
}
