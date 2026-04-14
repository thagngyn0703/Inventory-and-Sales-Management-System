import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import { createSupportTicket, listSupportTickets } from '../../services/supportTicketsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const PAGE_SIZE = 15;

function statusLabel(s) {
  if (s === 'answered') return 'Đã trả lời';
  if (s === 'closed') return 'Đã đóng';
  return 'Mở';
}

function statusClassName(s) {
  if (s === 'answered') return 'manager-ticket-status manager-ticket-status--answered';
  if (s === 'closed') return 'manager-ticket-status manager-ticket-status--closed';
  return 'manager-ticket-status manager-ticket-status--open';
}

export default function ManagerSupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await createSupportTicket({ subject: subject.trim(), body: body.trim() });
      setSubject('');
      setBody('');
      setPage(1);
      const data = await listSupportTickets({ page: 1, limit: PAGE_SIZE, status: statusFilter });
      setTickets(data.tickets || []);
      setTotal(Number(data.total) || 0);
    } catch (err) {
      setError(err.message || 'Không thể gửi phiếu');
    } finally {
      setSubmitting(false);
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
              <h1 className="manager-page-title">Hỗ trợ từ admin</h1>
              <p className="manager-page-subtitle">
                Gửi phiếu hỗ trợ cho quản trị hệ thống; bạn sẽ xem được phản hồi tại đây.
              </p>
            </div>
          </div>

          {error && <div className="manager-products-error">{error}</div>}

          <div className="manager-panel-card manager-products-card manager-ticket-form-card">
            <div className="manager-panel-header manager-panel-header--space">
              <h2 className="manager-panel-title">Gửi phiếu mới</h2>
            </div>
            <form onSubmit={onSubmit} className="manager-ticket-form">
              <label className="manager-form-label manager-ticket-form-label">
                Tiêu đề
                <input
                  type="text"
                  className="manager-input"
                  value={subject}
                  onChange={(ev) => setSubject(ev.target.value)}
                  placeholder="Ví dụ: Cần mở khóa cửa hàng"
                  maxLength={200}
                  required
                />
              </label>
              <label className="manager-form-label manager-ticket-form-label">
                Nội dung
                <textarea
                  className="manager-input manager-ticket-textarea"
                  value={body}
                  onChange={(ev) => setBody(ev.target.value)}
                  placeholder="Mô tả chi tiết vấn đề cần hỗ trợ…"
                  required
                />
              </label>
              <button type="submit" className="manager-btn-primary manager-ticket-submit-btn" disabled={submitting}>
                {submitting ? 'Đang gửi…' : 'Gửi phiếu'}
              </button>
            </form>
          </div>

          <div className="manager-products-header manager-ticket-list-header">
            <h2 className="manager-page-title manager-ticket-list-title">
              Phiếu đã gửi
            </h2>
            <select
              className="manager-input manager-ticket-filter-select"
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

          <div className="manager-panel-card manager-products-card">
            {loading ? (
              <p className="manager-products-loading manager-ticket-table-state">
                Đang tải…
              </p>
            ) : tickets.length === 0 ? (
              <p className="manager-products-empty manager-ticket-table-state">
                Chưa có phiếu hỗ trợ nào.
              </p>
            ) : (
              <div className="manager-products-table-wrap">
                <table className="manager-products-table">
                  <thead>
                    <tr>
                      <th>Tiêu đề</th>
                      <th>Trạng thái</th>
                      <th>Cập nhật</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t._id}>
                        <td>{t.subject}</td>
                        <td>
                          <span className={statusClassName(t.status)}>{statusLabel(t.status)}</span>
                        </td>
                        <td>
                          {t.updatedAt
                            ? new Date(t.updatedAt).toLocaleString('vi-VN')
                            : '—'}
                        </td>
                        <td>
                          <Link to={`/manager/support/${t._id}`} className="manager-btn-outline manager-ticket-detail-link">
                            Chi tiết
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="manager-ticket-pagination">
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
