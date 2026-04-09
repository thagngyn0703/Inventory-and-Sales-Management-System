import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import { getSupportTicket, replySupportTicket } from '../../services/supportTicketsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

function statusLabel(s) {
  if (s === 'answered') return 'Đã trả lời';
  if (s === 'closed') return 'Đã đóng';
  return 'Mở';
}

export default function ManagerSupportTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getSupportTicket(id);
      setTicket(data.ticket || null);
    } catch (e) {
      setError(e.message || 'Không thể tải phiếu');
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onSendReply = async (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text || !id) return;
    setSending(true);
    setError('');
    try {
      const data = await replySupportTicket(id, text);
      setTicket(data.ticket || null);
      setReply('');
    } catch (err) {
      setError(err.message || 'Không thể gửi');
    } finally {
      setSending(false);
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
              <button type="button" className="manager-btn-outline" onClick={() => navigate('/manager/support')}>
                ← Danh sách
              </button>
              <h1 className="manager-page-title" style={{ marginTop: 12 }}>
                Chi tiết phiếu hỗ trợ
              </h1>
            </div>
          </div>

          {error && <div className="manager-products-error">{error}</div>}

          {loading ? (
            <p className="manager-products-loading">Đang tải…</p>
          ) : !ticket ? (
            <p className="manager-products-empty">Không tìm thấy phiếu.</p>
          ) : (
            <>
              <div className="manager-panel-card manager-products-card" style={{ marginBottom: 16 }}>
                <div style={{ padding: '1rem' }}>
                  <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: 14 }}>
                    Trạng thái: <strong>{statusLabel(ticket.status)}</strong>
                  </p>
                  <h2 style={{ margin: '0 0 12px' }}>{ticket.subject}</h2>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5,
                      padding: 12,
                      background: '#f8fafc',
                      borderRadius: 8,
                    }}
                  >
                    {ticket.body}
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: '#64748b' }}>
                    Gửi lúc{' '}
                    {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('vi-VN') : '—'}
                  </p>
                </div>
              </div>

              <div className="manager-panel-card manager-products-card">
                <div className="manager-panel-header manager-panel-header--space">
                  <h2 className="manager-panel-title">Trao đổi</h2>
                </div>
                <div style={{ padding: '0 1rem 1rem' }}>
                  {(ticket.replies || []).length === 0 ? (
                    <p className="manager-products-empty" style={{ padding: 0 }}>
                      Chưa có phản hồi từ admin.
                    </p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {ticket.replies.map((r) => (
                        <li
                          key={r._id}
                          style={{
                            marginBottom: 16,
                            padding: 12,
                            borderRadius: 8,
                            background: r.role === 'admin' ? '#eff6ff' : '#f1f5f9',
                          }}
                        >
                          <strong>
                            {r.role === 'admin' ? 'Admin' : 'Bạn'}{' '}
                            <span style={{ fontWeight: 400, color: '#64748b', fontSize: 13 }}>
                              {r.createdAt
                                ? new Date(r.createdAt).toLocaleString('vi-VN')
                                : ''}
                            </span>
                          </strong>
                          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{r.body}</div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {ticket.status !== 'closed' ? (
                    <form onSubmit={onSendReply} style={{ marginTop: 20 }}>
                      <label className="manager-form-label" style={{ display: 'block' }}>
                        Bổ sung / trả lời
                        <textarea
                          className="manager-input"
                          style={{ width: '100%', marginTop: 6, minHeight: 88, resize: 'vertical' }}
                          value={reply}
                          onChange={(ev) => setReply(ev.target.value)}
                          placeholder="Nhập nội dung…"
                          required
                        />
                      </label>
                      <button type="submit" className="manager-btn-primary" disabled={sending}>
                        {sending ? 'Đang gửi…' : 'Gửi'}
                      </button>
                    </form>
                  ) : (
                    <p style={{ marginTop: 16, color: '#64748b' }}>Phiếu đã đóng.</p>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <Link to="/manager/support" className="manager-btn-outline" style={{ textDecoration: 'none' }}>
                  Về danh sách
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
