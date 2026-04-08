import React, { useCallback, useEffect, useState } from 'react';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationsApi';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import './ManagerDashboard.css';
import './ManagerProducts.css';

export default function ManagerNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getNotifications();
      setNotifications(data.notifications || []);
    } catch (e) {
      setError(e.message || 'Không thể tải thông báo');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, is_read: true } : n)));
    } catch (e) {
      setError(e.message || 'Không thể cập nhật thông báo');
    }
  };

  const onMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) {
      setError(e.message || 'Không thể cập nhật thông báo');
    }
  };

  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Quản lý cửa hàng"
        eyebrowIcon={Bell}
        title="Thông báo"
        subtitle="Cảnh báo hạn sử dụng sản phẩm theo cửa hàng của bạn."
        headerActions={
          <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={onMarkAll}>
            Đánh dấu đã đọc tất cả
          </Button>
        }
      >
          {error && <div className="manager-products-error mb-4">{error}</div>}

          <Card className="overflow-hidden border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-14 text-slate-500">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="py-14 text-center text-slate-500">Hiện chưa có thông báo.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full min-w-[840px] text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Tiêu đề</th>
                      <th className="px-4 py-3">Nội dung</th>
                      <th className="px-4 py-3">Thời gian</th>
                      <th className="px-4 py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {notifications.map((n) => (
                      <tr key={n._id} className="transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-teal-50/40">
                        <td className="px-4 py-3.5">
                          <Badge className={`border font-medium ${n.is_read ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-sky-100 text-sky-800 border-sky-200'}`}>
                            {n.is_read ? 'Đã đọc' : 'Chưa đọc'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-900">{n.title}</td>
                        <td className="max-w-[420px] px-4 py-3.5 text-slate-600">{n.message}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{n.created_at ? new Date(n.created_at).toLocaleString('vi-VN') : '—'}</td>
                        <td className="px-4 py-3.5 text-right">
                          {!n.is_read && (
                            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs font-semibold" onClick={() => onMarkRead(n._id)}>
                              Đánh dấu đã đọc
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
          </Card>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}

