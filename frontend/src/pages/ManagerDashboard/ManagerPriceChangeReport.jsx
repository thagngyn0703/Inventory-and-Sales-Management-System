import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { cn } from '../../lib/utils';
import { getPriceChangeImpactReport } from '../../services/analyticsApi';

function toDateInput(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString('vi-VN')}₫`;
}

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('vi-VN');
}

function fmtDateDdMm(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function toCsvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function formatDeltaPercent(oldValue, newValue) {
  const oldN = Number(oldValue || 0);
  const newN = Number(newValue || 0);
  if (oldN === 0) return newN === 0 ? 0 : 100;
  return ((newN - oldN) / oldN) * 100;
}

function subtractOneMonthKeepDay(date) {
  const original = new Date(date);
  const originalDay = original.getDate();
  const d = new Date(original);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return d;
}

function getDeltaVisual(event) {
  const delta = formatDeltaPercent(event.old_value, event.new_value);
  const absDelta = Math.abs(delta);
  // Neutralize tiny movement to avoid visual noise (e.g. +/-0.0%).
  if (absDelta < 0.5) {
    return {
      icon: '—',
      className: 'text-slate-500',
      text: '0.0%',
    };
  }

  const isUp = delta > 0;
  const isSale = event.price_type === 'sale';
  // Business color rule:
  // - Sale price: up = good (green), down = warning (red)
  // - Cost price: up = warning (red), down = good (green)
  const className = isSale
    ? (isUp ? 'text-emerald-700' : 'text-rose-600')
    : (isUp ? 'text-rose-600' : 'text-emerald-700');

  return {
    icon: isUp ? '▲' : '▼',
    className,
    text: `${isUp ? '+' : ''}${delta.toFixed(1)}%`,
  };
}

export default function ManagerPriceChangeReport() {
  const PAGE_SIZE = 10;
  const now = new Date();
  const defaultFrom = subtractOneMonthKeepDay(now);
  const todayStr = toDateInput(now);

  const [from, setFrom] = useState(toDateInput(defaultFrom));
  const [to, setTo] = useState(todayStr);
  const [productId, setProductId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [costDirection, setCostDirection] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ products: [], suppliers: [], events: [], summary: null });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await getPriceChangeImpactReport({
        from: from || undefined,
        to: to || undefined,
        productId: productId || undefined,
        supplierId: supplierId || undefined,
        costDirection: costDirection || undefined,
      });
      setData(resp);
    } catch (e) {
      setError(e.message || 'Không thể tải báo cáo');
      setData({ products: [], suppliers: [], events: [], summary: null });
    } finally {
      setLoading(false);
    }
  }, [from, to, productId, supplierId, costDirection]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);
  useEffect(() => {
    setPage(1);
  }, [from, to, productId, supplierId, costDirection]);

  useEffect(() => {
    setProductId('');
  }, [supplierId]);

  const productOptions = useMemo(() => {
    const list = data.products || [];
    if (!supplierId) return list;
    return list.filter((p) => String(p.supplier_id || '') === String(supplierId));
  }, [data.products, supplierId]);

  const selectedProductName = useMemo(() => {
    if (!productId) return 'Tất cả sản phẩm';
    const p = (data.products || []).find((x) => String(x._id) === String(productId));
    return p ? `${p.name} (${p.sku || '—'})` : 'Sản phẩm đã chọn';
  }, [data.products, productId]);
  const totalEvents = data.events?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pagedEvents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return (data.events || []).slice(start, start + PAGE_SIZE);
  }, [data.events, page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = data.events || [];
      const header = ['Thời gian', 'Sản phẩm', 'SKU', 'Loại giá', 'Cũ', 'Mới', 'Biến động', 'Người thực hiện', 'Nguồn'];
      const lines = [
        header.map(toCsvCell).join(','),
        ...rows.map((e) => {
          const delta = formatDeltaPercent(e.old_value, e.new_value);
          const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
          return [
            fmtDate(e.changed_at),
            e.product_name,
            e.sku || '—',
            e.price_type === 'cost' ? 'Giá nhập' : 'Giá bán',
            Number(e.old_value || 0),
            Number(e.new_value || 0),
            deltaText,
            e.changed_by || '—',
            e.source_note || (e.source === 'import_excel' ? 'Import Excel' : e.source === 'goods_receipt' ? 'Phiếu nhập' : 'Sửa tay'),
          ].map(toCsvCell).join(',');
        }),
      ];
      const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bao-cao-thay-doi-gia-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Báo cáo"
        eyebrowIcon={BarChart3}
        title="Báo cáo thay đổi giá sản phẩm"
        subtitle="Bảng tra cứu nhanh lịch sử đổi giá: đơn giản, rõ ràng, dễ lướt."
      >
          <Card className="mb-4 border-slate-200/80 shadow-sm">
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <label className="text-sm font-medium text-slate-700">
                Từ ngày
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  max={todayStr}
                  className="ml-2 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none ring-teal-200/80 focus:ring-2"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Đến ngày
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  max={todayStr}
                  className="ml-2 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none ring-teal-200/80 focus:ring-2"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Nhà cung cấp
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="ml-2 h-10 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none ring-teal-200/80 focus:ring-2"
                >
                  <option value="">Tất cả nhà cung cấp</option>
                  {(data.suppliers || []).map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Sản phẩm
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="ml-2 h-10 min-w-[280px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none ring-teal-200/80 focus:ring-2"
                >
                  <option value="">Tất cả sản phẩm</option>
                  {productOptions.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.sku || '—'})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Lọc nhanh
                <select
                  value={costDirection}
                  onChange={(e) => setCostDirection(e.target.value)}
                  className="ml-2 h-10 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none ring-teal-200/80 focus:ring-2"
                >
                  <option value="">Tất cả thay đổi</option>
                  <option value="up">Chỉ giá nhập tăng</option>
                </select>
              </label>
              <Button type="button" className="h-10 rounded-xl px-4" onClick={fetchReport}>
                Xem báo cáo
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-xl px-4 gap-2" onClick={exportCsv} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Xuất file CSV
              </Button>
              <p className="w-full text-xs text-slate-500">
                Bộ lọc hiện tại: <strong>{selectedProductName}</strong>
              </p>
            </CardContent>
          </Card>

          <InlineNotice message={error} type="error" className="mb-3" />

          <Card className="overflow-hidden border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-14 text-slate-500">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
            ) : data.events?.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full min-w-[980px] text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Thời gian</th>
                      <th className="px-4 py-3">Sản phẩm</th>
                      <th className="px-4 py-3">Loại giá</th>
                      <th className="px-4 py-3 text-right">Cũ</th>
                      <th className="px-4 py-3 text-right">Mới</th>
                      <th className="px-4 py-3 text-right">Biến động</th>
                      <th className="px-4 py-3">Người đổi</th>
                      <th className="px-4 py-3">Nguồn</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {pagedEvents.map((e, index) => {
                      const currentGroup = String(e._id || '').split(':')[0];
                      const prevGroup = index > 0 ? String(pagedEvents[index - 1]?._id || '').split(':')[0] : null;
                      const isNewGroup = index === 0 || currentGroup !== prevGroup;
                      return (
                      <tr
                        key={e._id}
                        className={cn(
                          'transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-teal-50/40',
                          isNewGroup ? 'border-t border-slate-200' : 'border-t border-slate-100'
                        )}
                      >
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{fmtDateDdMm(e.changed_at)}</td>
                        <td className="px-4 py-3.5">
                          <strong className="text-slate-900">{e.product_name}</strong>
                          <div className="text-xs text-slate-500">{e.sku || '—'}</div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">{e.price_type === 'cost' ? 'Giá nhập' : 'Giá bán'}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-slate-700">{fmtMoney(e.old_value)}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-900">{fmtMoney(e.new_value)}</td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {(() => {
                            const visual = getDeltaVisual(e);
                            return (
                              <span className={cn('font-semibold', visual.className)}>
                                {visual.icon} {visual.text}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">{e.changed_by}</td>
                        <td className="px-4 py-3.5 text-slate-600">
                          {e.source_note || (e.source === 'import_excel' ? 'Import Excel' : e.source === 'goods_receipt' ? 'Phiếu nhập' : 'Sửa tay')}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-14 text-center text-slate-500">Không có dữ liệu đổi giá trong khoảng thời gian đã chọn.</p>
            )}
            {totalEvents > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    Trang {page}/{totalPages}
                  </span>
                  <span className="text-xs text-slate-500">
                    {totalEvents} mục - {PAGE_SIZE} mục/trang
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg px-3"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Trước
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg px-3"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            )}
            </CardContent>
          </Card>

          <p className="mt-3 text-xs text-slate-500">
            Ghi chú: Danh sách được sắp xếp theo <strong>thời gian thay đổi mới nhất</strong>. Mũi tên đỏ là tăng giá, mũi tên xanh là giảm giá.
          </p>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}

