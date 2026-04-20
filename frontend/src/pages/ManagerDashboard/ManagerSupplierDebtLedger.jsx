import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Handshake } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { createSupplierDebtPayment, createSupplierReturn, getSupplierDebtHistory } from '../../services/suppliersApi';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/currencyInput';

const LIMIT = 20;

function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString('vi-VN')}₫`;
}

function resolveRefPath(row) {
  const refId = row?.reference_id;
  if (!refId) return null;
  switch (String(row?.reference_type || '').toLowerCase()) {
    case 'goods_receipt':
      return `/manager/receipts/${refId}`;
    case 'supplier_payment':
      return '/manager/supplier-payables/report';
    case 'supplier_return':
      return `/manager/supplier-returns/${refId}`;
    default:
      return null;
  }
}

export default function ManagerSupplierDebtLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [supplier, setSupplier] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [returnAmount, setReturnAmount] = useState('');
  const [returnReason, setReturnReason] = useState('Trả hàng nhà cung cấp');
  const [returnNote, setReturnNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getSupplierDebtHistory(id, {
        page,
        limit: LIMIT,
        type: typeFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setRows(data.histories || []);
      setSupplier(data.supplier || null);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e.message || 'Không tải được sổ nợ nhà cung cấp');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [id, page, typeFilter, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');
    const amountNum = parseCurrencyInput(paymentAmount);
    if (!amountNum || amountNum <= 0) {
      setError('Số tiền thanh toán phải lớn hơn 0.');
      return;
    }
    setSubmitting(true);
    try {
      await createSupplierDebtPayment(id, {
        total_amount: amountNum,
        payment_method: paymentMethod,
        note: paymentNote || undefined,
      });
      setSuccess('Đã ghi nhận thanh toán công nợ.');
      setPaymentAmount('');
      setPaymentNote('');
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message || 'Không thể ghi nhận thanh toán nợ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');
    const amountNum = parseCurrencyInput(returnAmount);
    if (!amountNum || amountNum <= 0) {
      setError('Giá trị trả NCC phải lớn hơn 0.');
      return;
    }
    setSubmitting(true);
    try {
      await createSupplierReturn(id, {
        total_amount: amountNum,
        reason: returnReason || undefined,
        note: returnNote || undefined,
      });
      setSuccess('Đã ghi nhận phiếu trả NCC và giảm công nợ.');
      setReturnAmount('');
      setReturnNote('');
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message || 'Không thể ghi nhận trả NCC');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Mua hàng & NCC"
        eyebrowIcon={Handshake}
        title="Sổ nợ nhà cung cấp"
        subtitle={supplier?.name || 'Nhà cung cấp'}
        headerActions={(
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(`/manager/supplier-returns?supplier_id=${id}`)}>Phiếu trả NCC</Button>
            <Button type="button" variant="outline" onClick={() => navigate('/manager/suppliers')}>Danh sách NCC</Button>
          </div>
        )}
      >
        <InlineNotice message={error} type="error" className="mb-3" />
        <InlineNotice message={success} type="success" className="mb-3" />

        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-4 border-slate-200/80 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Ghi nhận thanh toán nợ</h3>
              <form className="space-y-3" onSubmit={handleSubmitPayment}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Số tiền thanh toán"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(formatCurrencyInput(e.target.value))}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                />
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm">
                  <option value="cash">Tiền mặt</option>
                  <option value="bank_transfer">Chuyển khoản</option>
                  <option value="e_wallet">Ví điện tử</option>
                  <option value="other">Khác</option>
                </select>
                <textarea
                  rows={3}
                  placeholder="Ghi chú (tùy chọn)"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? 'Đang lưu...' : 'Thanh toán nợ'}
                </Button>
              </form>
              <div className="h-px bg-slate-200" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Ghi nhận trả hàng NCC</h3>
              <form className="space-y-3" onSubmit={handleSubmitReturn}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Giá trị trả NCC"
                  value={returnAmount}
                  onChange={(e) => setReturnAmount(formatCurrencyInput(e.target.value))}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                />
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Lý do"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                />
                <textarea
                  rows={3}
                  placeholder="Ghi chú (tùy chọn)"
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={submitting} variant="secondary" className="w-full">
                  {submitting ? 'Đang lưu...' : 'Ghi nhận trả NCC'}
                </Button>
              </form>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-slate-500">Dư nợ hiện tại</p>
                <p className="font-semibold text-rose-700">{fmtMoney(supplier?.current_debt || 0)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={exporting}
                onClick={async () => {
                  try {
                    setExporting(true);
                    const { exportSupplierDebtHistoryExcel } = await import('../../services/suppliersApi');
                    const blob = await exportSupplierDebtHistoryExcel(id, {
                      type: typeFilter || undefined,
                      from_date: fromDate || undefined,
                      to_date: toDate || undefined,
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `so-no-ncc-${String(supplier?._id || id).slice(-6).toUpperCase()}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {exporting ? 'Đang xuất...' : 'Xuất Excel sổ nợ'}
              </Button>
            </CardContent>
          </Card>

          <Card className="xl:col-span-8 border-slate-200/80 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <option value="">Tất cả biến động</option>
                  <option value="DEBT_INCREASE_GR">Tăng nợ do nhập hàng</option>
                  <option value="DEBT_DECREASE_PAYMENT">Giảm nợ do thanh toán</option>
                  <option value="DEBT_DECREASE_RETURN">Giảm nợ do trả hàng NCC</option>
                </select>
                <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" />
                <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" />
              </div>

              {loading ? (
                <p className="py-10 text-center text-slate-500">Đang tải sổ nợ...</p>
              ) : rows.length === 0 ? (
                <p className="py-10 text-center text-slate-500">Chưa có biến động công nợ.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Ngày</th>
                        <th className="px-4 py-3 text-left font-semibold">Loại</th>
                        <th className="px-4 py-3 text-left font-semibold">Chứng từ</th>
                        <th className="px-4 py-3 text-right font-semibold">Biến động</th>
                        <th className="px-4 py-3 text-right font-semibold">Dư nợ</th>
                        <th className="px-4 py-3 text-left font-semibold">Nội dung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const path = resolveRefPath(row);
                        const change = Number(row.change_amount) || 0;
                        return (
                          <tr key={row._id} className="border-t border-slate-100">
                            <td className="px-4 py-3">{new Date(row.created_at).toLocaleString('vi-VN')}</td>
                            <td className="px-4 py-3"><Badge variant="outline">{row.type}</Badge></td>
                            <td className="px-4 py-3 font-mono text-xs text-teal-700">
                              {row.reference_id ? (
                                path ? <Link to={path} className="underline hover:text-teal-500">{String(row.reference_id).slice(-6).toUpperCase()}</Link>
                                  : String(row.reference_id).slice(-6).toUpperCase()
                              ) : '—'}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold ${change < 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {change > 0 ? '+' : ''}{change.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmtMoney(row.after_debt)}</td>
                            <td className="px-4 py-3 text-slate-600">{row.note || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Trang {page}/{totalPages}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Trước</Button>
                  <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
