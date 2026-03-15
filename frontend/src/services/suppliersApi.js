const API_BASE = 'http://localhost:8000/api';

function getToken() { return localStorage.getItem('token') || ''; }

export async function getSuppliers() {
    const res = await fetch(`${API_BASE}/suppliers`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error('Không thể tải danh sách nhà cung cấp');
    const data = await res.json();
    return data.suppliers || [];
}
