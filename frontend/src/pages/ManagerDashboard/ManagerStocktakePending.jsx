import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { ClipboardCheck } from 'lucide-react';
import { getStocktakes } from '../../services/stocktakesApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { InlineNotice } from '../../components/ui/inline-notice';
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
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Kho & kiểm kê"
        eyebrowIcon={ClipboardCheck}
        title="Kiểm kê chờ duyệt"
        subtitle={`Xem chi tiết trước khi duyệt hoặc từ chối. ${Platform.select({ web: 'Duyệt/từ chối chỉ trong màn chi tiết.', default: 'Thao tác trong màn chi tiết.' })}`}
        headerActions={<Badge className="border border-amber-200 bg-amber-100 text-amber-900">Tổng: {total} phiếu</Badge>}
      >
          <InlineNotice message={error} type="error" className="mb-4" />

          <Card className="rounded-2xl border border-slate-200/80 shadow-sm">
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
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
