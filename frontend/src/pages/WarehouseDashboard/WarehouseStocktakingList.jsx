import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getStocktakes } from '../../services/stocktakesApi';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { InlineNotice } from '../../components/ui/inline-notice';
import { ClipboardCheck } from 'lucide-react';

const LIMIT = 10;

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export default function WarehouseStocktakingList() {
  const navigate = useNavigate();
  const location = useLocation();
  const warehouseBase = useWarehouseBase();
  const [stocktakes, setStocktakes] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: LIMIT };
      if (statusFilter) params.status = statusFilter;
      const data = await getStocktakes(params);
      setStocktakes(data.stocktakes || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setStocktakes([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const stateMessage = location.state?.success;
    if (stateMessage) {
      setSuccessMessage(stateMessage);
      setError('');
      window.history.replaceState({}, document.title, location.pathname + location.search);
    }
  }, [location.state]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  return (
    <StaffPageShell
      eyebrow="Kiểm kê kho"
      eyebrowIcon={ClipboardCheck}
      eyebrowTone="amber"
      title="Danh sách phiếu kiểm kê"
      subtitle="Xem và quản lý phiếu kiểm kê — đồng bộ luồng với màn kiểm kê phía quản lý."
      headerActions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge className="border border-violet-200 bg-violet-100 font-medium text-violet-800">Tổng: {total}</Badge>
          <Button type="button" className="shadow-sm shadow-amber-500/15" onClick={() => navigate(`${warehouseBase}/stocktakes/new`)}>
            Tạo phiếu kiểm kê
          </Button>
        </div>
      }
    >
      <InlineNotice message={successMessage} type="success" />
      <InlineNotice message={error} type="error" />

      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Trạng thái</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2"
            >
              <option value="">Tất cả</option>
              <option value="draft">Nháp</option>
              <option value="submitted">Đã gửi</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
          </div>

          {loading ? (
            <p className="py-8 text-center text-slate-500">Đang tải...</p>
          ) : stocktakes.length === 0 ? (
            <p className="py-8 text-center text-slate-500">Chưa có phiếu kiểm kê nào.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Thời gian tạo</th>
                    <th className="px-4 py-3">Người tạo</th>
                    <th className="px-4 py-3 text-right">Số dòng</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {stocktakes.map((st) => (
                    <tr key={st._id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">{formatDate(st.created_at)}</td>
                      <td className="px-4 py-3">{st.created_by?.email ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{Array.isArray(st.items) ? st.items.length : 0}</td>
                      <td className="px-4 py-3">
                        <Badge className={
                          st.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : st.status === 'cancelled'
                              ? 'bg-red-100 text-red-700 border border-red-200'
                              : st.status === 'submitted'
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }>
                          {STATUS_LABEL[st.status] ?? st.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button type="button" variant="outline" onClick={() => navigate(`${warehouseBase}/stocktakes/${st._id}`)}>
                          Xem
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/40 px-4 py-4 sm:flex-row">
        <p className="text-sm text-slate-600">
          Trang <strong className="text-slate-900">{page}</strong> / <strong className="text-slate-900">{totalPages}</strong>
          <span className="text-slate-500"> · 10 phiếu/trang</span>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Trước
          </Button>
          <Button type="button" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            Sau
          </Button>
        </div>
      </div>
    </StaffPageShell>
  );
}
