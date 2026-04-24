/**
 * customerNotifyApi.js
 * Frontend service cho API "bấm là gửi luôn" — Zalo/SMS đến khách hàng.
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function parseResponse(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
    return data;
}

/**
 * Gửi nhắc nợ cho khách hàng qua Zalo/SMS.
 * @param {{ customer_id: string, override_amount?: number, overdue_days?: number, force_resend?: boolean }} opts
 */
export async function sendDebtReminder({ customer_id, override_amount, overdue_days = 0, force_resend = false }) {
    const res = await fetch(`${API_URL}/customer-notify/debt-reminder`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ customer_id, override_amount, overdue_days, force_resend }),
    });
    return parseResponse(res);
}

/**
 * Gửi thông báo tích điểm cho khách hàng sau mua hàng.
 * @param {{ customer_id: string, invoice_id?: string, earned_points: number, redeemed_points?: number }} opts
 */
export async function sendLoyaltyUpdate({ customer_id, invoice_id, earned_points, redeemed_points = 0 }) {
    const res = await fetch(`${API_URL}/customer-notify/loyalty-update`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ customer_id, invoice_id, earned_points, redeemed_points }),
    });
    return parseResponse(res);
}

/**
 * Lấy lịch sử gửi tin nhắn.
 * @param {{ customer_id?: string, type?: string, status?: string, limit?: number, page?: number }} opts
 */
export async function getNotifyHistory({ customer_id, type, status, limit = 20, page = 1 } = {}) {
    const url = new URL(`${API_URL}/customer-notify/history`);
    if (customer_id) url.searchParams.set('customer_id', customer_id);
    if (type) url.searchParams.set('type', type);
    if (status) url.searchParams.set('status', status);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), { headers: authHeaders() });
    return parseResponse(res);
}

/**
 * Gửi lại 1 job thất bại.
 * @param {string} jobId
 */
export async function retryNotifyJob(jobId) {
    const res = await fetch(`${API_URL}/customer-notify/${jobId}/retry`, {
        method: 'POST',
        headers: authHeaders(),
    });
    return parseResponse(res);
}
