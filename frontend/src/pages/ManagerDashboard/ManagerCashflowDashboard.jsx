import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { InlineNotice } from '../../components/ui/inline-notice';
import { createCashflow, getCashflowSummary, getCashflows } from '../../services/cashflowsApi';

const LIMIT = 20;

function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString('vi-VN')}₫`;
}

function paymentMethodLabel(value) {
  const key = String(value || '').toUpperCase();
  if (key === 'CASH') return 'Tiền mặt';
  if (key === 'BANK_TRANSFER') return 'Chuyển khoản';
  if (key === 'E_WALLET') return 'Ví điện tử';
  return 'Khác';
}

function resolveSource(row) {
  const model = String(row?.reference_model || '').toLowerCase();
  const refId = row?.reference_id;
  switch (model) {
    case 'sales_invoice':
      return { label: 'Hóa đơn bán hàng', path: refId ? `/manager/invoices/${refId}/view` : null };
    case 'supplier_payment':
      return { label: 'Thanh toán NCC', path: '/manager/supplier-payables/report' };
    case 'supplier_return':
      return { label: 'Phiếu trả NCC', path: refId ? `/manager/supplier-returns/${refId}` : null };
    case 'sales_return':
      return { label: 'Trả hàng bán', path: '/manager/returns' };
    default:
      return { label: row?.is_system ? 'Hệ thống' : 'Thủ công', path: null };
  }
}

function getDefaultFromDate() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function getDefaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function ManagerCashflowDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    opening_balance: 0,
    period_income: 0,
    period_expense: 0,
    closing_balance: 0,
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fromDate, setFromDate] = useState(getDefaultFromDate());
  const [toDate, setToDate] = useState(getDefaultToDate());
  const [typeFilter, setTypeFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  const [manualType, setManualType] = useState('EXPENSE');
  const [manualAmount, setManualAmount] = useState('');
  const [manualPaymentMethod, setManualPaymentMethod] = useState('CASH');
  const [manualDate, setManualDate] = useState(getDefaultToDate());
  const [manualNote, setManualNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryResp, listResp] = await Promise.all([
        getCashflowSummary({
          from_date: fromDate,
          to_date: toDate,
        }),
        getCashflows({
          from_date: fromDate,
          to_date: toDate,
          page,
          limit: LIMIT,
          type: typeFilter || undefined,
          payment_method: paymentFilter || undefined,
        }),
      ]);
      setSummary(summaryResp.summary || {
        opening_balance: 0,
        period_income: 0,
        period_expense: 0,
        closing_balance: 0,
      });
      setRows(listResp.cashflows || []);
      setTotalPages(listResp.totalPages || 1);
    } catch (e) {
      setError(e.message || 'Không tải được dữ liệu sổ quỹ');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, page, typeFilter, paymentFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const cards = useMemo(() => ([
    {
      key: 'opening',
      title: 'Số dư đầu kỳ',
      value: summary.opening_balance,
      className: 'border-slate-200 bg-slate-50 text-slate-800',
      icon: null,
    },
    {
      key: 'income',
      title: 'Tổng thu trong kỳ',
      value: summary.period_income,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      icon: ArrowUpRight,
    },
    {
      key: 'expense',
      title: 'Tổng chi trong kỳ',
      value: summary.period_expense,
      className: 'border-rose-200 bg-rose-50 text-rose-800',
      icon: ArrowDownRight,
    },
    {
      key: 'closing',
      title: 'Số dư cuối kỳ',
      value: summary.closing_balance,
      className: 'border-sky-200 bg-sky-50 text-sky-900',
      icon: null,
    },
  ]), [summary]);

  async function handleCreateManual(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const amount = Number(manualAmount);
    if (!amount || amount <= 0) {
      setError('Số tiền phải lớn hơn 0.');
      return;
    }
    try {
      setSubmitting(true);
      await createCashflow({
        type: manualType,
        amount,
        payment_method: manualPaymentMethod,
        transacted_at: manualDate ? `${manualDate}T00:00:00.000Z` : undefined,
        note: manualNote || undefined,
      });
      setManualAmount('');
      setManualNote('');
      setSuccess('Đã ghi nhận bút toán thu/chi thủ công.');
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message || 'Không thể tạo bút toán');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Tài chính"
        eyebrowIcon={FileText}
        title="Sổ quỹ & Dòng tiền"
        subtitle="Theo dõi thu chi và số dư quỹ theo thời gian thực"
      >
        <InlineNotice message={error} type="error" className="mb-3" />
        <InlineNotice message={success} type="success" className="mb-3" />

        <div className="grid gap-3 md:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.key} className={`${card.className} shadow-sm`}>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.title}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-lg font-semibold">{fmtMoney(card.value)}</p>
                    {Icon ? <Icon className="h-5 w-5 opacity-80" /> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-4 border-slate-200/80 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Ghi bút toán thủ công</h3>
              <form className="space-y-3" onSubmit={handleCreateManual}>
                <select value={manualType} onChange={(e) => setManualType(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm">
                  <option value="EXPENSE">Chi</option>
                  <option value="INCOME">Thu</option>
                </select>
                <input type="number" min="0" step="1000" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="Số tiền" />
                <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
                <select value={manualPaymentMethod} onChange={(e) => setManualPaymentMethod(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm">
                  <option value="CASH">Tiền mặt</option>
                  <option value="BANK_TRANSFER">Chuyển khoản</option>
                  <option value="E_WALLET">Ví điện tử</option>
                  <option value="OTHER">Khác</option>
                </select>
                <textarea rows={3} value={manualNote} onChange={(e) => setManualNote(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Ghi chú (tùy chọn)" />
                <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Đang lưu...' : 'Lưu bút toán'}</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="xl:col-span-8 border-slate-200/80 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap gap-2">
                <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" />
                <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" />
                <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <option value="">Tất cả loại</option>
                  <option value="INCOME">Thu</option>
                  <option value="EXPENSE">Chi</option>
                </select>
                <select value={paymentFilter} onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
                  <option value="">Tất cả phương thức</option>
                  <option value="CASH">Tiền mặt</option>
                  <option value="BANK_TRANSFER">Chuyển khoản</option>
                  <option value="E_WALLET">Ví điện tử</option>
                  <option value="OTHER">Khác</option>
                </select>
              </div>
              {loading ? (
                <p className="py-10 text-center text-slate-500">Đang tải sổ quỹ...</p>
              ) : rows.length === 0 ? (
                <p className="py-10 text-center text-slate-500">Chưa có giao dịch trong kỳ lọc.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Ngày</th>
                        <th className="px-4 py-3 text-left font-semibold">Loại</th>
                        <th className="px-4 py-3 text-left font-semibold">Phương thức</th>
                        <th className="px-4 py-3 text-right font-semibold">Số tiền</th>
                        <th className="px-4 py-3 text-left font-semibold">Nguồn giao dịch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const isIncome = row.type === 'INCOME';
                        const source = resolveSource(row);
                        return (
                          <tr key={row._id} className="border-t border-slate-100">
                            <td className="px-4 py-3">{new Date(row.transacted_at || row.created_at).toLocaleString('vi-VN')}</td>
                            <td className={`px-4 py-3 font-semibold ${isIncome ? 'text-emerald-700' : 'text-rose-700'}`}>{isIncome ? 'Thu' : 'Chi'}</td>
                            <td className="px-4 py-3">{paymentMethodLabel(row.payment_method)}</td>
                            <td className={`px-4 py-3 text-right font-semibold ${isIncome ? 'text-emerald-700' : 'text-rose-700'}`}>{isIncome ? '+' : '-'}{fmtMoney(row.amount).replace('₫', '')}</td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              <div className="flex flex-col gap-1">
                                <span>{source.label}</span>
                                {source.path ? (
                                  <Link to={source.path} className="text-teal-700 underline hover:text-teal-500">
                                    {row.reference_id ? String(row.reference_id).slice(-6).toUpperCase() : 'Mở chứng từ'}
                                  </Link>
                                ) : null}
                              </div>
                            </td>
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
