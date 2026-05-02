import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { InlineNotice } from '../../components/ui/inline-notice';
import { getReturnById, getReturns } from '../../services/returnsApi';
import { getInvoice } from '../../services/invoicesApi';

function fmtMoney(n) {
  return `${Number(n || 0).toLocaleString('vi-VN')}₫`;
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('vi-VN');
  } catch {
    return '—';
  }
}

export default function SalesReturnDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const rt = await getReturnById(id);
        setData(rt);
      } catch (e) {
        try {
          const list = await getReturns({ page: 1, limit: 1000 });
          const fallback = (list.returns || []).find((it) => String(it._id) === String(id));
          if (!fallback) throw new Error('Không thể tải chi tiết phiếu trả hàng');
          const invoiceId = fallback?.invoice_id?._id || fallback?.invoice_id;
          let invoice = null;
          if (invoiceId) {
            invoice = await getInvoice(invoiceId);
          }
          setData({
            ...fallback,
            invoice_id: invoice || fallback.invoice_id,
          });
        } catch {
          setError(e.message || 'Không thể tải phiếu trả hàng');
        }
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id]);

  const invoice = data?.invoice_id;
  const invoiceGross = (invoice?.items || []).reduce((s, it) => s + (Number(it.line_total) || 0), 0);
  const invoiceDiscount = Number(invoice?.invoice_level_discount || 0);
  const invoiceNet = Number(invoice?.total_amount || 0);
  const returnAmount = Number(data?.total_amount || 0);
  const finalAfterReturn = Math.max(0, invoiceNet - returnAmount);

  return (
    <StaffPageShell
      eyebrow="Kho & bán hàng"
      eyebrowIcon={RotateCcw}
      eyebrowTone="amber"
      title={loading ? 'Đang tải…' : `Chi tiết phiếu trả #${String(data?._id || '').slice(-8).toUpperCase()}`}
      subtitle="Đối chiếu chi tiết giữa hóa đơn gốc và khoản hoàn trả."
      headerActions={(
        <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/staff/returns')}>
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
      )}
    >
      {error && <InlineNotice message={error} type="error" />}
      {loading && <p className="py-8 text-center text-slate-500">Đang tải dữ liệu…</p>}
      {!loading && !error && data && (
        <div className="grid gap-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-bold text-slate-800">Hóa đơn mua gốc</h3>
            <div className="grid gap-2 text-sm text-slate-700">
              <p>Mã hóa đơn: <strong>{invoice?._id || '—'}</strong></p>
              <p>Ngày tạo: <strong>{fmtDate(invoice?.invoice_at || invoice?.created_at)}</strong></p>
              <p>Khách hàng: <strong>{invoice?.recipient_name || 'Khách lẻ'}</strong></p>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-bold text-rose-900">Danh sách hàng trả</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-2">Sản phẩm</th>
                    <th className="w-20 py-2 text-center">SL trả</th>
                    <th className="w-28 py-2 text-right">Đơn giá hoàn</th>
                    <th className="w-28 py-2 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((it, idx) => {
                    const line = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
                    return (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-2 text-slate-800">
                          {it.product_id?.name || 'Sản phẩm'}
                          <div className="text-xs text-slate-400">{it.product_id?.sku || ''}</div>
                        </td>
                        <td className="py-2 text-center font-semibold text-rose-700">{it.quantity}</td>
                        <td className="py-2 text-right">{fmtMoney(it.unit_price)}</td>
                        <td className="py-2 text-right font-semibold text-rose-700">-{fmtMoney(line)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-base font-bold text-slate-800">Đối chiếu tiền</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Tổng tiền hàng ban đầu</span><strong>{fmtMoney(invoiceGross)}</strong></div>
              {invoiceDiscount > 0 && (
                <div className="flex justify-between text-amber-700"><span>Giảm trừ ban đầu</span><strong>-{fmtMoney(invoiceDiscount)}</strong></div>
              )}
              <div className="flex justify-between"><span>Giá trị hóa đơn sau giảm trừ</span><strong>{fmtMoney(invoiceNet)}</strong></div>
              <div className="flex justify-between text-rose-700"><span>Trừ tiền hàng trả lại</span><strong>-{fmtMoney(returnAmount)}</strong></div>
              <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-base">
                <span className="font-semibold">Còn lại sau trả hàng</span>
                <strong className="text-teal-700">{fmtMoney(finalAfterReturn)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </StaffPageShell>
  );
}
