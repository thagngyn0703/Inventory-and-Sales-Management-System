import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import { listSupportTickets } from '../../services/supportTicketsApi';
import '../ManagerDashboard/ManagerDashboard.css';
import '../ManagerDashboard/ManagerProducts.css';

const PAGE_SIZE = 15;

function statusLabel(s) {
  if (s === 'answered') return 'Đã trả lời';
  if (s === 'closed') return 'Đã đóng';
  return 'Mở';
}

export default function AdminSupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listSupportTickets({ page, limit: PAGE_SIZE, status: statusFilter });
      setTickets(data.tickets || []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      setError(e.message || 'Không thể tải phiếu hỗ trợ');
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          <div className="manager-products-header" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 className="manager-page-title">Phiếu hỗ trợ từ cửa hàng</h1>
              <p className="manager-page-subtitle">
                Đọc yêu cầu từ quản lý cửa hàng và trả lời trong trang chi tiết.
              </p>
            </div>
            <select
              className="manager-input"
              style={{ maxWidth: 220 }}
              value={statusFilter}
              onChange={(ev) => {
                setPage(1);
                setStatusFilter(ev.target.value);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="open">Mở</option>
              <option value="answered">Đã trả lời</option>
              <option value="closed">Đã đóng</option>
            </select>
          </div>

          {error && <div className="manager-products-error">{error}</div>}

          <div className="manager-panel-card manager-products-card">
            {loading ? (
              <p className="manager-products-loading" style={{ padding: '1rem' }}>
                Đang tải…
              </p>
            ) : tickets.length === 0 ? (
              <p className="manager-products-empty" style={{ padding: '1rem' }}>
                Chưa có phiếu hỗ trợ nào.
              </p>
            ) : (
              <div className="manager-products-table-wrap">
                <table className="manager-products-table">
                  <thead>
                    <tr>
                      <th>Cửa hàng</th>
                      <th>Người gửi</th>
                      <th>Tiêu đề</th>
                      <th>Trạng thái</th>
                      <th>Cập nhật</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => {
                      const storeName = t.storeId?.name || '—';
                      const sender = t.createdBy?.fullName || t.createdBy?.email || '—';
                      return (
                        <tr key={t._id}>
                          <td>{storeName}</td>
                          <td>{sender}</td>
                          <td>{t.subject}</td>
                          <td>{statusLabel(t.status)}</td>
                          <td>
                            {t.updatedAt
                              ? new Date(t.updatedAt).toLocaleString('vi-VN')
                              : '—'}
                          </td>
                          <td>
                            <Link
                              to={`/admin/support/${t._id}`}
                              className="manager-btn-outline"
                              style={{ textDecoration: 'none', display: 'inline-block', padding: '6px 12px' }}
                            >
                              Mở
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div style={{ padding: '1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="manager-btn-outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </button>
                <span>
                  Trang {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="manager-btn-outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
