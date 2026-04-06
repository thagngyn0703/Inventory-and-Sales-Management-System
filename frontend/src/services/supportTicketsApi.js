const API_BASE = process.env.REACT_APP_API_URL || '/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function parseJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || fallback);
  return data;
}

function apiPath(segment) {
  const base = (API_BASE || '/api').replace(/\/$/, '');
  return `${base}${segment.startsWith('/') ? segment : `/${segment}`}`;
}

export async function listSupportTickets({ page = 1, limit = 20, status = '' } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set('status', status);
  const res = await fetch(`${apiPath('/support-tickets')}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể tải danh sách phiếu hỗ trợ');
}

export async function getSupportTicket(id) {
  const token = getToken();
  const res = await fetch(apiPath(`/support-tickets/${id}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể tải phiếu hỗ trợ');
}

export async function createSupportTicket({ subject, body }) {
  const token = getToken();
  const res = await fetch(apiPath('/support-tickets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subject, body }),
  });
  return parseJson(res, 'Không thể tạo phiếu hỗ trợ');
}

export async function replySupportTicket(id, body) {
  const token = getToken();
  const res = await fetch(apiPath(`/support-tickets/${id}/replies`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body }),
  });
  return parseJson(res, 'Không thể gửi trả lời');
}

export async function patchSupportTicketStatus(id, status) {
  const token = getToken();
  const res = await fetch(apiPath(`/support-tickets/${id}/status`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  return parseJson(res, 'Không thể cập nhật trạng thái');
}
