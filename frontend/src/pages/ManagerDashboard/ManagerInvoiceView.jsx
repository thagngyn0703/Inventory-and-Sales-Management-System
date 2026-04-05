import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvoice } from '../../services/invoicesApi';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Receipt, ArrowLeft } from 'lucide-react';
import './ManagerDashboard.css';
import '../SaleDashboard/SalesPOS.css';

function formatMoney(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

const PAYMENT_LABEL = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  credit: 'Công nợ',
  card: 'Thẻ',
  debt: 'Ghi nợ',
};

/** Màn xem hóa đơn chỉ đọc (có thể gắn route riêng nếu cần). */
export default function ManagerInvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const data = await getInvoice(id);
        setInvoice(data);
      } catch (err) {
        setError(err.message || 'Không thể tải chi tiết hóa đơn.');
      } finally {
        setLoading(false);
      }
    };
    if (id && id !== 'new') fetchInvoice();
  }, [id]);

  const shortId = invoice?._id ? String(invoice._id).slice(-8).toUpperCase() : '';

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Hóa đơn"
        eyebrowIcon={Receipt}
        title={
          loading
            ? 'Đang tải…'
            : error
              ? 'Không tải được'
              : invoice
                ? `Phiếu ${shortId}`
                : 'Xem hóa đơn'
        }
        subtitle={
          invoice
            ? `${formatDate(invoice.created_at || invoice.invoice_at)} · ${invoice.recipient_name || 'Khách lẻ'}`
            : 'Xem nhanh nội dung đơn (chỉ đọc).'
        }
        headerActions={
          <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/manager/invoices')}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Quay lại
          </Button>
        }
      >
        {loading && (
          <p className="rounded-2xl border border-slate-200/80 bg-white py-12 text-center text-sm text-slate-500 shadow-sm">
            Đang tải dữ liệu…
          </p>
        )}
        {!loading && error && (
          <div
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        )}
        {!loading && !error && invoice && (
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
                    {invoice.items?.map((item, idx) => (
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
                          invoice.status === 'confirmed'
                            ? 'inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-900'
                            : invoice.status === 'pending'
                              ? 'inline-block rounded-md border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900'
                              : 'inline-block rounded-md border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-900'
                        }
                      >
                        {invoice.status === 'confirmed'
                          ? 'Đã thanh toán'
                          : invoice.status === 'pending'
                            ? 'Chờ / nợ'
                            : 'Trả hàng'}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="mb-3 text-base font-bold text-slate-800">Thanh toán</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Tổng tiền hàng ({invoice.items?.length || 0} món)</span>
                    <span className="font-medium text-slate-900">{formatMoney(invoice.total_amount)}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {invoice.status === 'pending' ? 'Số tiền ghi nợ' : 'Khách đã trả'}
                      </span>
                      <span
                        className={`text-xl font-bold ${invoice.status === 'pending' ? 'text-amber-700' : 'text-teal-700'}`}
                      >
                        {formatMoney(invoice.total_amount)}
                      </span>
                    </div>
                  </div>
                  {invoice.status === 'pending' && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                      <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" aria-hidden />
                      <span>
                        Đơn đang <strong>chờ thu nợ</strong>. Sẽ chuyển &quot;Đã thanh toán&quot; sau khi thu.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
