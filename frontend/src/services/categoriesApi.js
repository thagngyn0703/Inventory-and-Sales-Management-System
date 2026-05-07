const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

export async function getCategories(options = {}) {
  const token = getToken();
  const includeInactive = Boolean(options.all);
  const url = new URL(`${API_BASE}/categories`);
  if (includeInactive) url.searchParams.set('all', 'true');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Không thể tải danh mục');
  return Array.isArray(data) ? data : [];
}

