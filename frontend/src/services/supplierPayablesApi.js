const API_BASE = 'http://localhost:8000/api';

function getToken() {
    return localStorage.getItem('token') || '';
}

async function parse(res, fallback) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || fallback);
    return data;
}

/** Tổng hợp công nợ NCC (summary + by_supplier) */
export async function getSupplierPayableSummary() {
    const res = await fetch(`${API_BASE}/supplier-payables/summary`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    return parse(res, 'Không thể tải tổng hợp công nợ');
}

/**
 * Danh sách khoản phải trả
 * @param {{ supplier_id?, status?, page?, limit?, created_from?, created_to? }} params
 */
export async function getSupplierPayables(params = {}) {
    const url = new URL(`${API_BASE}/supplier-payables`);
    if (params.supplier_id) url.searchParams.set('supplier_id', params.supplier_id);
    if (params.status) url.searchParams.set('status', params.status);
    if (params.page) url.searchParams.set('page', String(params.page));
    if (params.limit) url.searchParams.set('limit', String(params.limit));
    if (params.created_from) url.searchParams.set('created_from', String(params.created_from));
    if (params.created_to) url.searchParams.set('created_to', String(params.created_to));

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    return parse(res, 'Không thể tải danh sách công nợ');
}

/** Chi tiết một khoản phải trả + lịch sử allocation */
export async function getSupplierPayable(id) {
    const res = await fetch(`${API_BASE}/supplier-payables/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    return parse(res, 'Không thể tải chi tiết khoản nợ');
}

/**
 * Ghi nhận thanh toán NCC (FIFO allocation tự động)
 * @param {{ supplier_id, total_amount, payment_date?, payment_method?, reference_code?, note? }} body
 */
export async function createSupplierPayment(body) {
    const res = await fetch(`${API_BASE}/supplier-payables/payments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
    });
    return parse(res, 'Không thể ghi nhận thanh toán');
}

/**
 * Lịch sử thanh toán NCC
 * @param {{ supplier_id?, page?, limit? }} params
 */
export async function getSupplierPaymentHistory(params = {}) {
    const url = new URL(`${API_BASE}/supplier-payables/payments/history`);
    if (params.supplier_id) url.searchParams.set('supplier_id', params.supplier_id);
    if (params.page) url.searchParams.set('page', String(params.page));
    if (params.limit) url.searchParams.set('limit', String(params.limit));

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    return parse(res, 'Không thể tải lịch sử thanh toán');
}
