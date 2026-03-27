const API_BASE = 'http://localhost:8000/api';

function getToken() {
    return localStorage.getItem('token') || '';
}

export async function getGoodsReceipts(status = '') {
    const token = getToken();
    const url = new URL(`${API_BASE}/goods-receipts`);
    if (status) url.searchParams.set('status', status);
    
    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải danh sách phiếu nhập kho');
    }
    const data = await res.json();
    return data.goodsReceipts || [];
}

export async function getGoodsReceipt(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/goods-receipts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải phiếu nhập kho');
    }
    const data = await res.json();
    return data.goodsReceipt;
}

export async function createGoodsReceipt(body) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/goods-receipts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể tạo phiếu nhập kho');
    return data.goodsReceipt;
}

export async function updateGoodsReceipt(id, body) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/goods-receipts/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể cập nhật phiếu nhập kho');
    return data.goodsReceipt;
}

export async function setGoodsReceiptStatus(id, status) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/goods-receipts/${id}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể cập nhật trạng thái phiếu nhập kho');
    return data.goodsReceipt;
}
