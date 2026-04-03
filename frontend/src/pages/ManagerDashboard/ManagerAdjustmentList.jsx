import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import ManagerSidebar from './ManagerSidebar';
import { getAdjustments } from '../../services/adjustmentsApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import './ManagerDashboard.css';

const LIMIT = 5;

const STATUS_LABEL = { pending: 'Chờ xử lý', approved: 'Đã duyệt', rejected: 'Đã từ chối' };

export default function ManagerAdjustmentList() {
  const navigate = useNavigate();
  const [adjustments, setAdjustments] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: LIMIT };
      if (statusFilter) params.status = statusFilter;
      const data = await getAdjustments(params);
      setAdjustments(data.adjustments || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setAdjustments([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-actions" style={{ marginLeft: 'auto' }}>
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Quản lý</span>
            </div>
          </div>
        </header>
        <div className="manager-content bg-slate-50">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Lịch sử điều chỉnh tồn</h1>
              <p className="text-sm text-slate-500">Theo dõi các phiếu duyệt/từ chối kiểm kê và trạng thái hoàn tác.</p>
              <p className="text-xs text-slate-400">
                {Platform.select({ web: 'Phân trang cố định 5 phiếu mỗi trang theo yêu cầu nghiệp vụ.', default: '5 phiếu mỗi trang.' })}
              </p>
            </div>
            <Badge className="bg-indigo-100 text-indigo-700 border border-indigo-200">Tổng: {total} phiếu</Badge>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm text-slate-600">Trạng thái:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">Tất cả</option>
                  <option value="pending">Chờ xử lý</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="rejected">Đã từ chối</option>
                </select>
              </div>

              {loading ? (
                <p className="py-8 text-center text-slate-500">Đang tải...</p>
              ) : adjustments.length === 0 ? (
                <p className="py-8 text-center text-slate-500">Chưa có phiếu điều chỉnh nào.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Thời gian duyệt</th>
                        <th className="px-4 py-3 text-left font-semibold">Người duyệt</th>
                        <th className="px-4 py-3 text-left font-semibold">Phiếu kiểm kê</th>
                        <th className="px-4 py-3 text-right font-semibold">Số dòng</th>
                        <th className="px-4 py-3 text-left font-semibold">Trạng thái</th>
                        <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustments.map((adj) => (
                        <tr key={adj._id} className="border-t border-slate-100">
                          <td className="px-4 py-3">{formatDate(adj.approved_at || adj.created_at)}</td>
                          <td className="px-4 py-3">{adj.approved_by?.email ?? '—'}</td>
                          <td className="px-4 py-3">{adj.stocktake_id ? formatDate(adj.stocktake_id.snapshot_at || adj.stocktake_id.created_at) : '—'}</td>
                          <td className="px-4 py-3 text-right">{Array.isArray(adj.items) ? adj.items.length : 0}</td>
                          <td className="px-4 py-3">
                            {adj.is_reverted ? (
                              <Badge className="bg-violet-100 text-violet-700 border border-violet-200">Đã hoàn tác</Badge>
                            ) : (
                              <Badge className={adj.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : adj.status === 'rejected' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}>
                                {STATUS_LABEL[adj.status] ?? adj.status}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button type="button" variant="outline" onClick={() => navigate(`/manager/adjustments/${adj._id}`)}>
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
            <p className="text-sm text-slate-500">Trang {page} / {totalPages}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Trước
              </Button>
              <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Sau
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
