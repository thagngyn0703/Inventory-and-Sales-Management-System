import React, { useCallback, useEffect, useState } from 'react';
import ManagerSidebar from './ManagerSidebar';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationsApi';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
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
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-search-wrap" />
          <div className="manager-topbar-actions">
            <ManagerNotificationBell />
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Quản lý</span>
            </div>
          </div>
        </header>

        <div className="manager-content">
          <div className="manager-products-header">
            <div>
              <h1 className="manager-page-title">Thông báo</h1>
              <p className="manager-page-subtitle">Cảnh báo hạn sử dụng sản phẩm theo cửa hàng của bạn.</p>
            </div>
            <button type="button" className="manager-btn-outline" onClick={onMarkAll}>
              Đánh dấu đã đọc tất cả
            </button>
          </div>

          {error && <div className="manager-products-error">{error}</div>}

          <div className="manager-panel-card manager-products-card">
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : notifications.length === 0 ? (
              <p className="manager-products-empty">Hiện chưa có thông báo.</p>
            ) : (
              <div className="manager-products-table-wrap">
                <table className="manager-products-table">
                  <thead>
                    <tr>
                      <th>Trạng thái</th>
                      <th>Tiêu đề</th>
                      <th>Nội dung</th>
                      <th>Thời gian</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.map((n) => (
                      <tr key={n._id}>
                        <td>{n.is_read ? 'Đã đọc' : 'Chưa đọc'}</td>
                        <td>{n.title}</td>
                        <td>{n.message}</td>
                        <td>{n.created_at ? new Date(n.created_at).toLocaleString('vi-VN') : '—'}</td>
                        <td>
                          {!n.is_read && (
                            <button type="button" className="manager-btn-outline manager-btn-small" onClick={() => onMarkRead(n._id)}>
                              Đánh dấu đã đọc
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

