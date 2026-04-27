const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

async function parseJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || fallback);
  return data;
}

export async function getNotificationUnreadCount() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJson(res, 'Không thể tải số thông báo chưa đọc');
  return Number(data.unreadCount || 0);
}

export async function getManagerBadgeCounts() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/notifications/manager-badge-counts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể tải số lượng chờ duyệt');
}

export async function getNotifications() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể tải danh sách thông báo');
}

export async function markNotificationRead(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể cập nhật thông báo');
}

export async function markAllNotificationsRead() {
  const token = getToken();
  const res = await fetch(`${API_BASE}/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể cập nhật thông báo');
}

