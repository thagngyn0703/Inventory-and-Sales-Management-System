const API_BASE = 'http://localhost:8000/api';

function getToken() {
    return localStorage.getItem('token') || '';
}

export async function getSuppliers(page = 1, limit = 20, query = '') {
    const token = getToken();
    const url = new URL(`${API_BASE}/suppliers`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    if (query && query.trim()) url.searchParams.set('q', query.trim());
    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải danh sách nhà cung cấp');
    }
    return res.json();
}

export async function getSupplier(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/suppliers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải nhà cung cấp');
    }
    const data = await res.json();
    return data.supplier;
}

export async function createSupplier(body) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/suppliers`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể tạo nhà cung cấp');
    return data.supplier;
}

export async function updateSupplier(id, body) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/suppliers/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể cập nhật nhà cung cấp');
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể đổi trạng thái');
    return data.supplier;
}
