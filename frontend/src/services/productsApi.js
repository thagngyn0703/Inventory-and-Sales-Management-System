const API_BASE = 'http://localhost:8000/api';

function getToken() {
    return localStorage.getItem('token') || '';
}

/**
 * @param {number} [page=1]
 * @param {number} [limit=20]
 * @param {string} [query='']
 * @returns {Promise<{ products: Array, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function getProducts(page = 1, limit = 20, query = '') {
    const token = getToken();
    const url = new URL(`${API_BASE}/products`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    if (query && query.trim()) url.searchParams.set('q', query.trim());
    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải danh sách sản phẩm');
    }
    return res.json();
}

export async function getProduct(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/products/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải sản phẩm');
    }
    const data = await res.json();
    return data.product;
}

export async function createProduct(body) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể tạo sản phẩm');
    return data.product;
}

export async function updateProduct(id, body) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể cập nhật sản phẩm');
    return data.product;
}

/**
 * @param {string} id
 * @param {'active'|'inactive'} status
 */
export async function setProductStatus(id, status) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/products/${id}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể đổi trạng thái');
    return data.product;
}

// Product Requests API

export async function createProductRequest(body) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/product-requests`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể gửi yêu cầu tạo sản phẩm');
    return data.productRequest;
}

export async function getProductRequests(page = 1, limit = 20, query = '', status = '') {
    const token = getToken();
    const url = new URL(`${API_BASE}/product-requests`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    if (query && query.trim()) url.searchParams.set('q', query.trim());
    if (status) url.searchParams.set('status', status);
    
    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải danh sách yêu cầu');
    }
    return res.json();
}

export async function approveProductRequest(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/product-requests/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể duyệt yêu cầu');
    return data;
}

export async function rejectProductRequest(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/product-requests/${id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể từ chối yêu cầu');
    return data;
}
