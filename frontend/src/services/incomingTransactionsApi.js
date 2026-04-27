const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

function getToken() {
  return localStorage.getItem('token') || '';
}

function parseResponse(res, defaultMessage) {
  return res
    .json()
    .catch(() => ({}))
    .then((data) => {
      if (!res.ok) {
        throw new Error(data.message || defaultMessage);
      }
      return data;
    });
}

/** Danh sách đơn mua hàng (có thể lọc theo nhà cung cấp) */
export async function getPurchaseOrders({ page = 1, limit = 20, status, supplierId } = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/purchase-orders`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  if (status) url.searchParams.set('status', status);
  if (supplierId) url.searchParams.set('supplier_id', supplierId);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const data = await parseResponse(res, 'Không thể tải đơn mua hàng');
  return data;
}

/** Chi tiết đơn mua hàng */
export async function getPurchaseOrder(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/purchase-orders/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải đơn mua hàng');
  return data.purchaseOrder;
}

/** Danh sách phiếu nhập kho (có thể lọc theo nhà cung cấp) */
export async function getGoodsReceipts({ page = 1, limit = 20, status, supplierId } = {}) {
  const token = getToken();
  const url = new URL(`${API_BASE}/goods-receipts`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  if (status) url.searchParams.set('status', status);
  if (supplierId) url.searchParams.set('supplier_id', supplierId);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const data = await parseResponse(res, 'Không thể tải phiếu nhập kho');
  return data;
}

/** Chi tiết phiếu nhập kho */
export async function getGoodsReceipt(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/goods-receipts/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseResponse(res, 'Không thể tải phiếu nhập kho');
  return data.goodsReceipt;
}
