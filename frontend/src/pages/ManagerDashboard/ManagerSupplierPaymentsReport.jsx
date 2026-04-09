import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { CreditCard, Download, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getSupplierPayables } from '../../services/supplierPayablesApi';
import { getSuppliers } from '../../services/suppliersApi';
import { useToast } from '../../contexts/ToastContext';

const STATUS_LABEL = { open: 'Chưa trả', partial: 'Trả một phần', paid: 'Đã trả', cancelled: 'Đã hủy' };
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
const toCsvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const todayStr = new Date().toISOString().slice(0, 10);

function statusPill(status, isOverdue) {
  if (isOverdue) return 'border-red-300 bg-red-100 text-red-900 ring-1 ring-red-200';
  if (status === 'paid') return 'border-emerald-200 bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200';
  if (status === 'partial') return 'border-amber-200 bg-amber-100 text-amber-900 ring-1 ring-amber-200';
  if (status === 'open') return 'border-orange-200 bg-orange-100 text-orange-900 ring-1 ring-orange-200';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export default function ManagerSupplierPaymentsReport() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const hasSelectedRange = Boolean(dateFrom && dateTo);

  const loadSuppliers = useCallback(async () => {
    try {
      const d = await getSuppliers(1, 1000, '', 'all');
      setSuppliers(d.suppliers || []);
    } catch (e) {
      toast(e.message || 'Không thể tải danh sách nhà cung cấp', 'error');
    }
  }, [toast]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getSupplierPayables({
        supplier_id: filterSupplierId || undefined,
        page,
        limit: 10,
        created_from: dateFrom || undefined,
        created_to: dateTo || undefined,
      });
      setRows(d.payables || []);
      setSummary(d.summary || null);
      setTotal(d.total ?? 0);
      setTotalPages(d.totalPages ?? 1);
    } catch (e) {
      toast(e.message || 'Không thể tải báo cáo', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterSupplierId, page, dateFrom, dateTo, toast]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  useEffect(() => { loadReport(); }, [loadReport]);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const firstPage = await getSupplierPayables({
        supplier_id: filterSupplierId || undefined,
        page: 1,
        limit: 200,
        created_from: dateFrom || undefined,
        created_to: dateTo || undefined,
      });

      const allRows = [...(firstPage.payables || [])];
      const pages = Number(firstPage.totalPages || 1);
      for (let p = 2; p <= pages; p += 1) {
        const next = await getSupplierPayables({
          supplier_id: filterSupplierId || undefined,
          page: p,
          limit: 200,
          created_from: dateFrom || undefined,
          created_to: dateTo || undefined,
        });
        allRows.push(...(next.payables || []));
      }

      const header = [
        'Ma phieu nhap',
        'Nha cung cap',
        'Ngay tao phieu',
        'Tong don',
        'Da tra',
        'Con no',
        'Tra gan nhat',
        'Trang thai',
      ];

      const lines = [
        header.map(toCsvCell).join(','),
        ...allRows.map((p) => ([
          (p.source_id?._id ?? String(p.source_id ?? '')).slice(-8).toUpperCase(),
          p.supplier_id?.name ?? '',
          fmtDate(p.created_at),
          Number(p.total_amount || 0),
          Number(p.paid_amount || 0),
          Number(p.remaining_amount || 0),
          fmtDate(p.last_payment_at),
          p.is_overdue ? 'Quá hạn' : (STATUS_LABEL[p.status] ?? p.status ?? ''),
        ]).map(toCsvCell).join(',')),
      ];

      const periodText = `Tu ngay: ${dateFrom || 'Tat ca'} | Den ngay: ${dateTo || 'Tat ca'}`;
      const paidText = `Tong tien da tra trong ky: ${Number(firstPage.summary?.total_paid || 0)}`;
      const content = `\uFEFF${toCsvCell(periodText)}\n${toCsvCell(paidText)}\n\n${lines.join('\n')}`;
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `bao-cao-chi-tien-ncc-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast(`Đã xuất file CSV (${allRows.length} dòng)`, 'success');
    } catch (e) {
      toast(e.message || 'Không thể xuất file', 'error');
    } finally {
      setExporting(false);
    }
  }, [filterSupplierId, dateFrom, dateTo, toast]);

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Mua hàng & NCC"
        eyebrowIcon={CreditCard}
        title="Báo cáo chi tiền nhà cung cấp"
        subtitle="Theo dõi dòng tiền đã trả theo từng đơn nhập để đối soát chính xác."
      >
        <Card className="mb-4 border-slate-200/80 shadow-sm">
          <CardContent className="flex flex-wrap gap-3 p-4">
            <select
              value={filterSupplierId}
              onChange={(e) => { setFilterSupplierId(e.target.value); setPage(1); }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200 focus:ring-2"
            >
              <option value="">Tất cả nhà cung cấp</option>
              {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              max={todayStr}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200 focus:ring-2"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              min={dateFrom || undefined}
              max={todayStr}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200 focus:ring-2"
            />
            <Button type="button" variant="outline" className="gap-2" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Xuất file CSV
            </Button>
          </CardContent>
        </Card>

        {hasSelectedRange && summary && (
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Số đơn</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{summary.order_count || 0}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tổng giá trị đơn</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{fmt(summary.total_amount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tổng đã trả trong kỳ</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{fmt(summary.total_paid)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tổng còn nợ</p>
              <p className="mt-1 text-xl font-bold text-red-600">{fmt(summary.total_remaining)}</p>
            </div>
            </div>
          </div>
        )}

        <Card className="overflow-hidden border-slate-200/80 shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
            ) : rows.length === 0 ? (
              <p className="py-14 text-center text-slate-500">Không có dữ liệu theo điều kiện lọc.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full min-w-[980px] text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Mã phiếu nhập</th>
                      <th className="px-4 py-3">Nhà cung cấp</th>
                      <th className="px-4 py-3">Ngày tạo phiếu</th>
                      <th className="px-4 py-3 text-right">Tổng đơn</th>
                      <th className="px-4 py-3 text-right">Đã trả</th>
                      <th className="px-4 py-3 text-right">Còn nợ</th>
                      <th className="px-4 py-3">Trả gần nhất</th>
                      <th className="px-4 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rows.map((p) => (
                      <tr key={p._id} className="transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-teal-50/40">
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            className="font-mono text-xs font-semibold text-sky-700 hover:text-sky-800 hover:underline"
                            onClick={() => navigate(`/manager/receipts/${p.source_id?._id ?? p.source_id}`)}
                          >
                            {(p.source_id?._id ?? String(p.source_id))?.slice(-8).toUpperCase()}
                          </button>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-900">{p.supplier_id?.name ?? '—'}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{fmtDate(p.created_at)}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-slate-800">{fmt(p.total_amount)}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-emerald-700">{fmt(p.paid_amount)}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-red-600">{fmt(p.remaining_amount)}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{fmtDate(p.last_payment_at)}</td>
                        <td className="px-4 py-3.5">
                          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusPill(p.status, p.is_overdue))}>
                            {p.is_overdue ? 'Quá hạn' : STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                <span>Trang {page}/{totalPages} ({total} đơn)</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trước</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
