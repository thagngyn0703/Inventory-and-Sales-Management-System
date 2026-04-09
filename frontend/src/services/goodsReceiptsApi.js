const API_BASE = 'http://localhost:8000/api';

function getToken() {
    return localStorage.getItem('token') || '';
}

/**
 * @param {string|{
 *   status?: string,
 *   supplier_id?: string,
 *   page?: number,
 *   limit?: number,
 *   q?: string
 * }} input
 * @returns {Promise<Array|{ goodsReceipts: Array, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function getGoodsReceipts(input = '') {
    const isObject = typeof input === 'object' && input !== null;
    const opts = isObject ? input : {};
    const status = isObject ? (opts.status ?? '') : String(input || '');
    const supplierId = isObject ? String(opts.supplier_id || '').trim() : '';
    const page = isObject ? Math.max(1, Number(opts.page) || 1) : 1;
    const limit = isObject ? Math.max(1, Number(opts.limit) || 10) : 100;
    const q = isObject ? String(opts.q || '').trim() : '';

    const token = getToken();
    const url = new URL(`${API_BASE}/goods-receipts`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    if (status) url.searchParams.set('status', status);
    if (supplierId) url.searchParams.set('supplier_id', supplierId);
    if (q) url.searchParams.set('q', q);
    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể tải danh sách phiếu nhập kho');
    }
    const data = await res.json();
    const goodsReceipts = data.goodsReceipts || [];
    if (isObject) {
        return {
            goodsReceipts,
            total: data.total ?? goodsReceipts.length,
            page: data.page ?? page,
            limit: data.limit ?? limit,
            totalPages: data.totalPages ?? 1,
        };
    }
    return goodsReceipts;
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

/**
 * @param {string} id
 * @param {'approved'|'rejected'} status
 * @param {string} [rejectionReason] - bắt buộc khi status === 'rejected'
 * @param {{ payment_type?, amount_paid_at_approval?, due_date_payable? }} [approvalExtra]
 */
export async function setGoodsReceiptStatus(id, status, rejectionReason, approvalExtra = {}) {
    const token = getToken();
    const body = { status, ...approvalExtra };
    if (status === 'rejected' && rejectionReason) {
        body.rejection_reason = rejectionReason;
    }
    const res = await fetch(`${API_BASE}/goods-receipts/${id}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể cập nhật trạng thái phiếu nhập kho');
    return data.goodsReceipt;
}

export async function updateGoodsReceiptItems(id, items) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/goods-receipts/${id}/items`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không thể cập nhật chi tiết phiếu nhập');
    return data.goodsReceipt;
}
