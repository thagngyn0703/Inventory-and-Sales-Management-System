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

/** Download Excel template for product import */
export async function downloadProductImportTemplate() {
    const token = getToken();
    const res = await fetch(`${API_BASE}/products/import/template`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải file mẫu');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau-import-san-pham.xlsx';
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * @param {File} file
 * @returns {Promise<{ rows: Array, totalRows: number, validCount: number, invalidCount: number }>}
 */
export async function previewProductImport(file) {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/products/import/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể đọc file Excel');
    return data;
}

/**
 * @param {Array<{ row: number, name: string, cost_price: number, sale_price: number, sku?: string, stock_qty: number, base_unit: string }>} rows
 */
export async function commitProductImport(rows) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/products/import/commit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Import thất bại');
    return data;
}

// --- Product requests (warehouse -> manager) ---
export async function createProductRequest(body) {
    const token = getToken();
    console.log('createProductRequest body:', body);
    const res = await fetch(`${API_BASE}/product-requests`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => '');
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { _raw: text }; }
    console.log('createProductRequest response status:', res.status, 'body:', data);
    if (!res.ok) throw new Error(data.message || 'Không thể gửi yêu cầu tạo sản phẩm');
    return data.productRequest;
}

export async function getProductRequests(page = 1, limit = 20, query = '', status) {
    const token = getToken();
    const url = new URL(`${API_BASE}/product-requests`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    if (query && String(query).trim()) url.searchParams.set('q', String(query).trim());
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

/**
 * @param {string} id
 * @returns {Promise<{ batches: Array }>}
 */
export async function getProductBatches(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/products/${id}/batches`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || 'Không thể tải danh sách lô hàng');
    }
    return data;
}
