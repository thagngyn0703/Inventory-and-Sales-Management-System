import React, { useEffect, useState, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import { getAdminStores, setAdminStoreStatus } from '../../services/adminApi';
import '../ManagerDashboard/ManagerDashboard.css';
import '../ManagerDashboard/ManagerProducts.css';
import './AdminUserList.css';

const PAGE_SIZE = 10;

export default function AdminStoresManage() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const storeData = await getAdminStores({
        page,
        limit: PAGE_SIZE,
        status: 'all',
      });
      setStores(storeData.stores || []);
      setTotal(Number(storeData.total) || 0);
      setTotalPages(Math.max(1, Number(storeData.totalPages) || 1));
    } catch (e) {
      setError(e.message || 'Không thể tải dữ liệu');
      setStores([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (totalPages >= 1 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const onToggleStatus = async (s) => {
    try {
      const status = s.status === 'active' ? 'inactive' : 'active';
      const confirmed = window.confirm(
        status === 'inactive'
          ? `Bạn có chắc muốn ngừng hoạt động cửa hàng "${s.name}"?`
          : `Bạn có chắc muốn cho hoạt động lại cửa hàng "${s.name}"?`
      );
      if (!confirmed) return;
      await setAdminStoreStatus(s._id, status);
      await load();
    } catch (err) {
      setError(err.message || 'Không thể cập nhật trạng thái');
    }
  };

  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="manager-page-with-sidebar">
      <Sidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-search-wrap" />
          <div className="manager-topbar-actions">
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Admin</span>
            </div>
          </div>
        </header>
        <div className="manager-content">
          <div className="manager-products-header">
            <div>
              <h1 className="manager-page-title">Quản lý cửa hàng</h1>
              <p className="manager-page-subtitle">
                Danh sách cửa hàng theo trang; ngừng hoạt động hoặc cho hoạt động lại khi cần.
              </p>
            </div>
          </div>
          {error && <div className="manager-products-error">{error}</div>}

          <p className="admin-users-count-hint" style={{ marginBottom: 12 }}>
            {loading
              ? 'Đang tải…'
              : total === 0
                ? 'Không có cửa hàng'
                : `Hiển thị ${startItem}-${endItem} / ${total} cửa hàng`}
          </p>

          <div className="manager-panel-card manager-products-card">
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : (
              <>
                <div className="manager-products-table-wrap">
                  <table className="manager-products-table">
                    <thead>
                      <tr>
                        <th>Tên cửa hàng</th>
                        <th>Chủ cửa hàng</th>
                        <th>SĐT</th>
                        <th>Địa chỉ</th>
                        <th>Ngày tạo</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                            Chưa có cửa hàng nào trong hệ thống.
                          </td>
                        </tr>
                      ) : (
                        stores.map((s) => (
                          <tr key={s._id}>
                            <td>{s.name}</td>
                            <td>{s.managerId?.fullName || s.managerId?.email || '—'}</td>
                            <td>{s.phone || '—'}</td>
                            <td>{s.address || '—'}</td>
                            <td>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
                            <td>{s.status === 'inactive' ? 'Ngừng hoạt động' : 'Hoạt động'}</td>
                            <td>
                              <button
                                type="button"
                                className="manager-btn-icon"
                                onClick={() => onToggleStatus(s)}
                                title={s.status === 'active' ? 'Ngừng hoạt động' : 'Cho hoạt động lại'}
                              >
                                <i className={`fa-solid ${s.status === 'active' ? 'fa-pause' : 'fa-play'}`} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {total > 0 && (
                  <div className="admin-users-pagination">
                    <div className="admin-users-pagination-text">
                      Trang <strong>{page}</strong> / <strong>{totalPages}</strong>
                    </div>
                    <div className="admin-users-pagination-controls">
                      <button
                        type="button"
                        className="au-page-btn"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="Trang trước"
                      >
                        <i className="fas fa-chevron-left" />
                      </button>
                      <button
                        type="button"
                        className="au-page-btn"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        aria-label="Trang sau"
                      >
                        <i className="fas fa-chevron-right" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
