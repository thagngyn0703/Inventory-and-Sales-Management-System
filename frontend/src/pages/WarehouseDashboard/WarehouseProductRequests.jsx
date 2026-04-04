import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getProductRequests } from '../../services/productsApi';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { FileStack, Loader2, Search } from 'lucide-react';
import { cn } from '../../lib/utils';

const LIMIT = 10;

function statusBadgeClass(status) {
  if (status === 'pending') return 'bg-amber-100 text-amber-900 border-amber-200/80';
  if (status === 'approved') return 'bg-emerald-100 text-emerald-900 border-emerald-200/80';
  return 'bg-red-100 text-red-900 border-red-200/80';
}

export default function WarehouseProductRequests() {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [order, setOrder] = useState('desc');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getProductRequests(page, LIMIT, search, statusFilter, { sortBy, order });
      setRequests(data.productRequests || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách yêu cầu');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, sortBy, order]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleSortChange = (e) => {
    const val = e.target.value;
    if (val === 'newest') {
      setSortBy('created_at');
      setOrder('desc');
    } else if (val === 'oldest') {
      setSortBy('created_at');
      setOrder('asc');
    } else if (val === 'price_desc') {
      setSortBy('cost_price');
      setOrder('desc');
    } else if (val === 'price_asc') {
      setSortBy('cost_price');
      setOrder('asc');
    }
    setPage(1);
  };

  const formatMoney = (n) => {
    if (n == null || Number.isNaN(Number(n))) return '0₫';
    return Number(n).toLocaleString('vi-VN') + '₫';
  };

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, total);

  const sortSelectValue = useMemo(() => {
    if (sortBy === 'created_at' && order === 'desc') return 'newest';
    if (sortBy === 'created_at' && order === 'asc') return 'oldest';
    if (sortBy === 'cost_price' && order === 'desc') return 'price_desc';
    if (sortBy === 'cost_price' && order === 'asc') return 'price_asc';
    return 'newest';
  }, [sortBy, order]);

  return (
    <StaffPageShell
      eyebrow="Đăng ký sản phẩm"
      eyebrowIcon={FileStack}
      eyebrowTone="rose"
      title="Yêu cầu tạo sản phẩm mới"
      subtitle="Theo dõi các phiếu đề xuất SKU mới đã gửi tới quản lý — 10 yêu cầu mỗi trang."
    >
      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <form onSubmit={handleSearchSubmit} className="flex min-w-0 flex-1 gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Tìm theo tên, SKU, barcode..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-sky-200 focus:ring-2"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <Button type="submit" variant="outline" className="h-11 shrink-0">
                Tìm
              </Button>
            </form>
            <select
              value={statusFilter}
              onChange={handleFilterChange}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 lg:min-w-[180px]"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Đã từ chối</option>
            </select>
            <select
              value={sortSelectValue}
              onChange={handleSortChange}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 lg:min-w-[200px]"
            >
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="price_desc">Giá vốn (cao → thấp)</option>
              <option value="price_asc">Giá vốn (thấp → cao)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <span>
              Tổng <strong className="text-slate-900">{total}</strong> yêu cầu
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

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          {loading && requests.length === 0 ? (
            <div className="flex justify-center py-16 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3">Tên</th>
                    <th className="px-3 py-3">Giá vốn</th>
                    <th className="px-3 py-3">Giá bán</th>
                    <th className="px-3 py-3">Người gửi</th>
                    <th className="px-3 py-3">Ngày gửi</th>
                    <th className="px-3 py-3">Ghi chú</th>
                    <th className="px-3 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                        {search ? 'Không có yêu cầu nào phù hợp.' : 'Chưa có yêu cầu tạo sản phẩm nào.'}
                      </td>
                    </tr>
                  ) : (
                    requests.map((r) => (
                      <tr key={r._id} className="transition hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700">{r.sku || '—'}</td>
                        <td className="max-w-[200px] px-3 py-3 font-medium text-slate-900">
                          <span className="line-clamp-2">{r.name || '—'}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800">{formatMoney(r.cost_price)}</td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800">{formatMoney(r.sale_price)}</td>
                        <td className="max-w-[140px] truncate px-3 py-3 text-slate-700">
                          {r.requested_by?.fullName || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {new Date(r.created_at).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="max-w-[160px] px-3 py-3 text-xs text-slate-600">
                          <span className="line-clamp-3 break-words">{r.note || '—'}</span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={cn('border font-medium', statusBadgeClass(r.status))}>
                            {r.status === 'pending' ? 'Chờ duyệt' : r.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
            <p className="text-sm text-slate-600">
              Trang <strong className="text-slate-900">{page}</strong> /{' '}
              <strong className="text-slate-900">{totalPages}</strong>
            </p>
            <div className="flex gap-2">
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
        </CardContent>
      </Card>
    </StaffPageShell>
  );
}
