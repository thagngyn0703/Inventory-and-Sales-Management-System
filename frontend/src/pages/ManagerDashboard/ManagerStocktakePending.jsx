import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import ManagerSidebar from './ManagerSidebar';
import { getStocktakes } from '../../services/stocktakesApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import './ManagerDashboard.css';

const LIMIT = 10;

export default function ManagerStocktakePending() {
  const navigate = useNavigate();
  const [stocktakes, setStocktakes] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getStocktakes({ page, limit: LIMIT, status: 'submitted' });
      setStocktakes(data.stocktakes || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setStocktakes([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

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
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Kiểm kê chờ duyệt</h1>
              <p className="text-sm text-slate-500">Chỉ xem chi tiết trước khi thực hiện duyệt hoặc từ chối.</p>
              <p className="text-xs text-slate-400">
                {Platform.select({ web: 'Nghiệp vụ an toàn: thao tác duyệt/từ chối chỉ thực hiện trong màn chi tiết.', default: 'Thao tác chỉ thực hiện trong màn chi tiết.' })}
              </p>
            </div>
            <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Tổng: {total} phiếu</Badge>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <p className="p-8 text-center text-slate-500">Đang tải...</p>
              ) : stocktakes.length === 0 ? (
                <p className="p-8 text-center text-slate-500">Không có phiếu kiểm kê nào chờ duyệt.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Thời gian tạo</th>
                        <th className="px-4 py-3 text-left font-semibold">Người tạo</th>
                        <th className="px-4 py-3 text-right font-semibold">Số dòng</th>
                        <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stocktakes.map((st) => (
                        <tr key={st._id} className="border-t border-slate-100">
                          <td className="px-4 py-3">{formatDate(st.created_at)}</td>
                          <td className="px-4 py-3">{st.created_by?.email ?? '—'}</td>
                          <td className="px-4 py-3 text-right">{Array.isArray(st.items) ? st.items.length : 0}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => navigate(`/manager/stocktakes/${st._id}`)}
                            >
                              Xem chi tiết
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
