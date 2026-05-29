/**
 * Hóa đơn hiển thị trên "Lịch sử bán lẻ": chỉ đơn đã bán (confirmed) và đơn ghi nợ chưa thu.
 * Đơn hủy / chờ thanh toán / phiếu trả hàng xem ở màn khác.
 */
export function shouldShowOnRetailHistory(inv) {
  if (!inv) return false;
  const status = String(inv.status || '').toLowerCase();
  if (status === 'cancelled') return false;
  if (inv.payment_method === 'debt' && inv.payment_status !== 'paid') return true;
  return status === 'confirmed';
}
