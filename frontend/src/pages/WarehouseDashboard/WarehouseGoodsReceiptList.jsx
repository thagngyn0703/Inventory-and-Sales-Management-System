import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getGoodsReceipts } from '../../services/goodsReceiptsApi';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { useToast } from '../../contexts/ToastContext';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import {
  ArrowRight,
  ClipboardList,
  Loader2,
  PackagePlus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_LABEL = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

const PAGE_SIZE = 10;

function statusBadgeClass(status) {
  if (status === 'pending') return 'bg-amber-100 text-amber-900 border-amber-200/80';
  if (status === 'approved') return 'bg-emerald-100 text-emerald-900 border-emerald-200/80';
  if (status === 'rejected') return 'bg-red-100 text-red-900 border-red-200/80';
  return 'bg-slate-100 text-slate-700 border-slate-200/80';
}

export default function WarehouseGoodsReceiptList() {
  const navigate = useNavigate();
  const location = useLocation();
  const warehouseBase = useWarehouseBase();
  const { toast } = useToast();

  const [receipts, setReceipts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sortByPrice, setSortByPrice] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sortBy = sortByPrice ? 'total_amount' : 'received_at';
  const order = sortByPrice === 'asc' ? 'asc' : 'desc';

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedQ, sortByPrice]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGoodsReceipts({
        status: statusFilter || undefined,
        page,
        limit: PAGE_SIZE,
        q: debouncedQ || undefined,
        sortBy,
        order,
      });
      setReceipts(data.goodsReceipts || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, debouncedQ, sortBy, order]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const stateMessage = location.state?.success;
    if (stateMessage) {
      toast(stateMessage, 'success');
      window.history.replaceState({}, document.title, location.pathname + location.search);
    }
  }, [location.state, location.pathname, location.search, toast]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  const handleSortPrice = () => {
    if (sortByPrice === null) setSortByPrice('asc');
    else if (sortByPrice === 'asc') setSortByPrice('desc');
    else setSortByPrice(null);
  };

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const sortLabel = useMemo(() => {
    if (sortByPrice === 'asc') return 'Giá trị: thấp → cao';
    if (sortByPrice === 'desc') return 'Giá trị: cao → thấp';
    return 'Thời gian nhận (mới nhất)';
  }, [sortByPrice]);

  return (
    <StaffPageShell
      eyebrow="Kho & nhập hàng"
      eyebrowIcon={ClipboardList}
      eyebrowTone="violet"
      title="Danh sách phiếu nhập kho"
      subtitle="Theo dõi phiếu nhập, trạng thái duyệt và giá trị lô hàng."
      headerActions={
        <Button
          type="button"
          className="gap-2 shadow-md shadow-sky-500/20"
          onClick={() => navigate(`${warehouseBase}/receipts/new`)}
        >
          <PackagePlus className="h-4 w-4" />
          Tạo phiếu nhập mới
        </Button>
      }
    >
      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}

      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Mã phiếu, nhà cung cấp, người tạo..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="hidden h-4 w-4 text-slate-400 sm:block" />
                <span className="text-xs font-medium text-slate-500">Trạng thái</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                >
                  <option value="">Tất cả</option>
                  <option value="draft">Nháp</option>
                  <option value="pending">Chờ duyệt</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="rejected">Từ chối</option>
                </select>
              </div>
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={handleSortPrice}>
                {sortLabel}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <span>
              Tổng <strong className="text-slate-900">{total}</strong> phiếu
              {total > 0 && (
                <>
                  {' '}
                  · Hiển thị <strong className="text-slate-900">{start}</strong>–
                  <strong className="text-slate-900">{end}</strong>
                </>
              )}
            </span>
            {loading && (
              <span className="inline-flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải...
              </span>
            )}
          </div>

          {loading && receipts.length === 0 ? (
            <div className="flex justify-center py-16 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : receipts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
              <p className="text-slate-600">Chưa có phiếu nhập kho nào phù hợp.</p>
              <Button type="button" className="mt-4" onClick={() => navigate(`${warehouseBase}/receipts/new`)}>
                Tạo phiếu nhập kho
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Mã phiếu</th>
                    <th className="px-4 py-3">Thời gian</th>
                    <th className="px-4 py-3">Nhà cung cấp</th>
                    <th className="px-4 py-3">Người tạo</th>
                    <th className="px-4 py-3 text-right">Tổng tiền</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {receipts.map((r) => (
                    <tr key={r._id} className="transition hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="font-mono text-sm font-semibold text-emerald-700 hover:underline"
                          onClick={() => navigate(`${warehouseBase}/receipts/${r._id}`)}
                        >
                          {r._id.substring(r._id.length - 6).toUpperCase()}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(r.created_at)}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 font-medium text-slate-800">
                        {r.supplier_id?.name ?? '—'}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-slate-600">
                        {r.received_by?.fullName ?? r.received_by?.email ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                        {r.total_amount?.toLocaleString('vi-VN') ?? 0} đ
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn('border font-medium', statusBadgeClass(r.status))}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="default"
                          className="gap-1 text-sky-700 hover:text-sky-800"
                          onClick={() => navigate(`${warehouseBase}/receipts/${r._id}`)}
                        >
                          Chi tiết
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages >= 1 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
              <p className="text-sm text-slate-600">
                Trang <strong className="text-slate-900">{page}</strong> /{' '}
                <strong className="text-slate-900">{totalPages}</strong>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sau
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </StaffPageShell>
  );
}
