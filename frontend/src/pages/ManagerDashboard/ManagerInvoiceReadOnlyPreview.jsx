import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { buildInvoiceDisplayCode } from '../../utils/invoiceDisplayCode';
import '../SaleDashboard/SalesPOS.css';

function formatMoney(n) {
  if (n == null || isNaN(n)) return '0';
  return `${Number(n).toLocaleString('vi-VN')}₫`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

const PAYMENT_LABEL = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  credit: 'Công nợ',
  card: 'Thẻ',
  debt: 'Ghi nợ',
  split: 'Chia thanh toán',
};

function getInvoiceStatusView(invoice) {
  const isDebtUnpaid = invoice?.payment_method === 'debt' && invoice?.payment_status !== 'paid';
  if (isDebtUnpaid) return 'debt_unpaid';
  if (invoice?.status === 'confirmed') return 'sold';
  return invoice?.status;
}

/** Nội dung xem hóa đơn chỉ đọc — dùng trong ManagerInvoiceView hoặc modal. */
export default function ManagerInvoiceReadOnlyPreview({ invoice }) {
  if (!invoice) return null;

  const statusView = getInvoiceStatusView(invoice);
  const soldGrossAmount = (invoice?.items || []).reduce((sum, it) => sum + (Number(it.line_total) || 0), 0);
  const invoiceLevelDiscount = Number(invoice?.invoice_level_discount || 0);
  const debtSettlementNote =
    invoice?.debt_settlement_by_invoice_id
      ? `Trả nợ thông qua đơn hàng ${buildInvoiceDisplayCode(invoice.debt_settlement_by_invoice_id)}`
      : invoice?.debt_settlement_note;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-4 text-base font-bold text-slate-800">Danh sách hàng hóa</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-100 text-left text-slate-500">
                <th className="py-3 pr-2 font-semibold">Tên hàng</th>
                <th className="w-16 py-3 text-center font-semibold">SL</th>
                <th className="w-28 py-3 text-right font-semibold">Đơn giá</th>
                <th className="w-28 py-3 text-right font-semibold">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, idx) => (
                <tr key={idx} className="border-b border-slate-50">
                  <td className="py-3.5 font-medium text-slate-900">
                    {item.product_id?.name || 'Sản phẩm không xác định'}
                    <div className="mt-1 text-xs text-slate-400">{item.product_id?.sku || ''}</div>
                  </td>
                  <td className="py-3.5 text-center text-slate-600">{item.quantity}</td>
                  <td className="py-3.5 text-right text-slate-600">{formatMoney(item.unit_price)}</td>
                  <td className="py-3.5 text-right font-semibold text-teal-700">{formatMoney(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="mb-3 text-base font-bold text-slate-800">Thông tin đơn hàng</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Mã hóa đơn</dt>
              <dd className="font-mono text-xs font-semibold text-slate-900">{invoice.display_code || invoice._id || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Ngày tạo</dt>
              <dd className="font-medium text-slate-900">{formatDate(invoice.created_at || invoice.invoice_at)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Khách hàng</dt>
              <dd className="font-medium text-slate-900">{invoice.recipient_name || 'Khách lẻ'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Thanh toán</dt>
              <dd className="font-medium text-slate-900">
                {PAYMENT_LABEL[invoice.payment_method] || invoice.payment_method || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Trạng thái</dt>
              <dd>
                <span
                  className={
                    statusView === 'confirmed'
                      ? 'inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-900'
                      : statusView === 'sold'
                        ? 'inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-900'
                        : statusView === 'pending'
                          ? 'inline-block rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900'
                          : statusView === 'debt_unpaid'
                            ? 'inline-block rounded-md border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-900'
                            : statusView === 'cancelled'
                              ? 'inline-block rounded-md border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700'
                              : 'inline-block rounded-md border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-900'
                  }
                >
                  {statusView === 'confirmed' || statusView === 'sold'
                    ? 'Đã bán'
                    : statusView === 'pending'
                      ? 'Chờ / nợ'
                      : statusView === 'debt_unpaid'
                        ? 'Nợ'
                        : statusView === 'cancelled'
                          ? 'Đã hủy'
                          : 'Trả hàng'}
                </span>
              </dd>
            </div>
            {debtSettlementNote ? (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Ghi chú</dt>
                <dd className="max-w-[65%] text-right font-medium text-slate-900">{debtSettlementNote}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="mb-3 text-base font-bold text-slate-800">Thanh toán</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Tổng tiền hàng ({invoice.items?.length || 0} món)</span>
              <span className="font-medium text-slate-900">{formatMoney(soldGrossAmount)}</span>
            </div>
            {invoiceLevelDiscount > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Giảm trừ hóa đơn (khuyến mãi/đổi điểm)</span>
                <span className="font-medium">-{formatMoney(invoiceLevelDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Giá trị hóa đơn sau giảm trừ</span>
              <span className="font-medium text-slate-900">{formatMoney(invoice.total_amount)}</span>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  {statusView === 'debt_unpaid' || statusView === 'pending' ? 'Số tiền ghi nợ còn lại' : 'Khách đã trả'}
                </span>
                <span
                  className={`text-xl font-bold ${statusView === 'debt_unpaid' || statusView === 'pending' ? 'text-red-700' : 'text-teal-700'}`}
                >
                  {formatMoney(invoice.total_amount)}
                </span>
              </div>
            </div>
            {(statusView === 'debt_unpaid' || statusView === 'pending') && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Đơn đang <strong>chờ thu nợ</strong>. Sẽ chuyển &quot;Đã thanh toán&quot; sau khi thu.
                </span>
              </div>
            )}
          </div>
        </div>

        {invoice.previous_debt_paid > 0 && (
          <div className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm sm:p-6">
            <h3 className="mb-3 text-base font-bold text-teal-800 flex items-center gap-2">
              <i className="fa-solid fa-wallet"></i> Chi tiết thu nợ
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Thu nợ cũ</span>
                <span className="font-semibold text-teal-700">{formatMoney(invoice.previous_debt_paid)}</span>
              </div>
              {invoice.settled_invoices && invoice.settled_invoices.length > 0 && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-700 space-y-1">
                  <div className="font-semibold text-slate-500 mb-1">Thanh toán cho các đơn:</div>
                  {invoice.settled_invoices.map((settled, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="font-mono">{settled.display_code || settled._id}</span>
                      <span className="font-medium text-slate-900">{formatMoney(settled.total_amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Đơn mới này</span>
                <span className="font-medium text-slate-900">{formatMoney(invoice.total_amount)}</span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Tổng khách đã trả</span>
                  <span className="text-lg font-bold text-teal-700">
                    {formatMoney(invoice.total_amount + invoice.previous_debt_paid)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
