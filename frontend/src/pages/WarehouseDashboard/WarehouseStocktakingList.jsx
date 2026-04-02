import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import { getStocktakes } from '../../services/stocktakesApi';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

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
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Danh sách phiếu kiểm kê</h1>
          <p className="text-sm text-slate-500">Xem và quản lý các phiếu kiểm kê đã tạo.</p>
          <p className="text-xs text-slate-400">
            {Platform.select({ web: 'Giao diện đồng bộ với màn Kiểm kê chờ duyệt phía manager.', default: 'Giao diện đồng bộ manager.' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-indigo-100 text-indigo-700 border border-indigo-200">Tổng: {total}</Badge>
          <Button type="button" onClick={() => navigate(`${warehouseBase}/stocktakes/new`)}>
            Tạo phiếu kiểm kê
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-slate-600">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
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
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Thời gian tạo</th>
                    <th className="px-4 py-3 text-left font-semibold">Người tạo</th>
                    <th className="px-4 py-3 text-right font-semibold">Số dòng</th>
                    <th className="px-4 py-3 text-left font-semibold">Trạng thái</th>
                    <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {stocktakes.map((st) => (
                    <tr key={st._id} className="border-t border-slate-100">
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

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Trang {page} / {totalPages} (10 phiếu/trang)</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Trước
          </Button>
          <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau
          </Button>
        </div>
      </div>
    </>
  );
}
