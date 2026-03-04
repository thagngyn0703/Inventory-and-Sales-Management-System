const API_BASE = 'http://localhost:8000/api';

function getToken() {
    return localStorage.getItem('token') || '';
}

export async function getProducts(query = '') {
    const token = getToken();
    const url = new URL(`${API_BASE}/products`);
    if (query && query.trim()) url.searchParams.set('q', query.trim());
    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải danh sách sản phẩm');
    }
    const data = await res.json();
    return data.products || [];
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
