const API_BASE = 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function authHeaders() {
  return { Authorization: `Bearer ${getToken()}` };
}

function parseResponse(res, defaultMessage) {
  return res
    .json()
    .catch(() => ({}))
    .then((data) => {
      if (!res.ok) throw new Error(data.message || defaultMessage);
      return data;
    });
}

/**
 * Tần suất nhập hàng theo nhà cung cấp trong 1 tháng.
 */
export async function getIncomingFrequencyBySupplier({ year, month } = {}) {
  const url = new URL(`${API_BASE}/analytics/incoming-frequency`);
  if (year != null) url.searchParams.set('year', String(year));
  if (month != null) url.searchParams.set('month', String(month));
  const res = await fetch(url.toString(), { headers: authHeaders() });
  return parseResponse(res, 'Không thể tải phân tích tần suất nhập hàng');
}

/**
 * Tổng quan kinh doanh trong kỳ.
 * @param {Object} params - { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * @returns {{ revenue, order_count, avg_order_value, return_count, return_rate,
 *             incoming_cost, gross_profit_estimate, today: {...} }}
 */
export async function getAnalyticsSummary({ from, to } = {}) {
  const url = new URL(`${API_BASE}/analytics/summary`);
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  return parseResponse(res, 'Không thể tải tổng quan kinh doanh');
}

/**
 * Snapshot tồn kho hiện tại.
 * @returns {{ total_sku, total_value, out_of_stock_count, low_stock_count,
 *             low_stock_products, expiring_soon }}
 */
export async function getInventorySnapshot() {
  const res = await fetch(`${API_BASE}/analytics/inventory-snapshot`, { headers: authHeaders() });
  return parseResponse(res, 'Không thể tải dữ liệu tồn kho');
}

/**
 * Doanh thu theo thời gian để vẽ chart.
 * @param {Object} params - { period: '7d' | '30d' | '3m' | '6m' }
 * @returns {{ period, data: [{ label, key, revenue, order_count }] }}
 */
export async function getRevenueChart({ period = '7d' } = {}) {
  const url = new URL(`${API_BASE}/analytics/revenue-chart`);
  url.searchParams.set('period', period);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  return parseResponse(res, 'Không thể tải dữ liệu biểu đồ doanh thu');
}

/**
 * Top sản phẩm bán chạy hoặc lãi nhất.
 * @param {Object} params - { from, to, limit, sort: 'qty'|'profit' }
 * @returns {{ period, sort, data: [{ product_name, sku, total_qty, total_revenue, total_profit, order_count, current_stock }] }}
 */
export async function getTopProducts({ from, to, limit = 10, sort } = {}) {
  const url = new URL(`${API_BASE}/analytics/top-products`);
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);
  url.searchParams.set('limit', String(limit));
  if (sort) url.searchParams.set('sort', sort);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  return parseResponse(res, 'Không thể tải top sản phẩm bán chạy');
}

/**
 * Báo cáo tác động theo từng lần đổi giá sản phẩm.
 * @param {Object} params - { from, to, productId, supplierId, costDirection }
 */
export async function getPriceChangeImpactReport({ from, to, productId, supplierId, costDirection } = {}) {
  const url = new URL(`${API_BASE}/analytics/price-change-impact`);
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);
  if (productId) url.searchParams.set('productId', productId);
  if (supplierId) url.searchParams.set('supplierId', supplierId);
  if (costDirection) url.searchParams.set('costDirection', costDirection);
  const res = await fetch(url.toString(), { headers: authHeaders() });
  return parseResponse(res, 'Không thể tải báo cáo thay đổi giá');
}
