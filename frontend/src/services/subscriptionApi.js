const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function apiPath(segment) {
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${segment.startsWith('/') ? segment : `/${segment}`}`;
}

async function parseJson(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || fallback);
  return data;
}

export async function getSubscriptionPlans() {
  const res = await fetch(apiPath('/subscriptions/plans'));
  return parseJson(res, 'Không thể tải danh sách gói dịch vụ');
}

export async function getMyStoreSubscription() {
  const token = getToken();
  const res = await fetch(apiPath('/subscriptions/my-store'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể tải trạng thái gói dịch vụ');
}

export async function createSubscriptionCheckout(plan_code) {
  const token = getToken();
  const res = await fetch(apiPath('/subscriptions/checkout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan_code }),
  });
  return parseJson(res, 'Không thể tạo đơn thanh toán gói dịch vụ');
}

export async function getMyStoreSubscriptionOrders() {
  const token = getToken();
  const res = await fetch(apiPath('/subscriptions/orders/my-store'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể tải lịch sử mua gói dịch vụ');
}

export async function reconcileSubscriptionOrder(orderId) {
  const token = getToken();
  const res = await fetch(apiPath(`/subscriptions/orders/${orderId}/reconcile`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res, 'Không thể kiểm tra trạng thái thanh toán');
}
