import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getStocktakes, approveStocktake, rejectStocktake } from '../../services/stocktakesApi';
import './ManagerDashboard.css';
import '../WarehouseDashboard/WarehouseDashboard.css';

const LIMIT = 10;

export default function ManagerStocktakePending() {
  const navigate = useNavigate();
  const [stocktakes, setStocktakes] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [modal, setModal] = useState({ open: false, type: null, stocktake: null });
  const [reasonInput, setReasonInput] = useState('');

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

  const handleApprove = (st) => {
    if (approvingId || rejectingId) return;
    setModal({ open: true, type: 'approve', stocktake: st });
    setReasonInput('');
  };

  const handleReject = (st) => {
    if (approvingId || rejectingId) return;
    setModal({ open: true, type: 'reject', stocktake: st });
    setReasonInput('');
  };

  const closeModal = () => {
    setModal({ open: false, type: null, stocktake: null });
    setReasonInput('');
  };

  const confirmApprove = async () => {
    const st = modal.stocktake;
    if (!st) return;
    setApprovingId(st._id);
    setError('');
    try {
      await approveStocktake(st._id, { reason: reasonInput.trim() });
      setSuccessMessage('Đã duyệt phiếu và cập nhật tồn kho.');
      closeModal();
      fetchList();
    } catch (err) {
      setError(err.message || 'Không thể duyệt');
    } finally {
      setApprovingId(null);
    }
  };

  const confirmReject = async () => {
    const st = modal.stocktake;
    if (!st) return;
    setRejectingId(st._id);
    setError('');
    try {
      await rejectStocktake(st._id, { reason: reasonInput.trim() });
      setSuccessMessage('Đã từ chối phiếu kiểm kê.');
      closeModal();
      fetchList();
    } catch (err) {
      setError(err.message || 'Không thể từ chối');
    } finally {
      setRejectingId(null);
    }
  };

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
      {modal.open && (
        <div
          className="manager-reason-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reason-modal-title"
        >
          <div className="manager-reason-modal-box">
            <h2 id="reason-modal-title" className="manager-reason-modal-title">
              {modal.type === 'reject' ? 'Lý do từ chối' : 'Lý do điều chỉnh'}
            </h2>
            <p className="manager-reason-modal-hint">
              {modal.type === 'reject'
                ? 'Nhập lý do từ chối phiếu kiểm kê (có thể để trống).'
                : 'Ghi chú lý do áp dụng điều chỉnh tồn (tùy chọn).'}
            </p>
            <textarea
              className="manager-reason-modal-input"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder={modal.type === 'reject' ? 'Ví dụ: Số liệu chưa kiểm tra kỹ...' : 'Ví dụ: Đã kiểm đếm lại cuối tháng...'}
              rows={4}
              autoFocus
            />
            <div className="manager-reason-modal-actions">
              <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={closeModal}>
                Hủy
              </button>
              {modal.type === 'reject' ? (
                <button
                  type="button"
                  className="warehouse-btn"
                  style={{ background: '#b91c1c', color: '#fff' }}
                  onClick={confirmReject}
                  disabled={rejectingId === modal.stocktake?._id}
                >
                  {rejectingId === modal.stocktake?._id ? 'Đang xử lý...' : 'Từ chối'}
                </button>
              ) : (
                <button
                  type="button"
                  className="warehouse-btn warehouse-btn-primary"
                  onClick={confirmApprove}
                  disabled={approvingId === modal.stocktake?._id}
                >
                  {approvingId === modal.stocktake?._id ? 'Đang duyệt...' : 'Duyệt & điều chỉnh tồn'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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
        <div className="manager-content">
          <h1 className="manager-page-title">Kiểm kê chờ duyệt</h1>
          <p className="manager-page-subtitle">
            Duyệt phiếu kiểm kê đã gửi để áp dụng điều chỉnh tồn (tăng/giảm theo số thực tế).
          </p>

          {successMessage && (
            <div className="warehouse-alert warehouse-alert-success" style={{ marginBottom: 16 }}>
              {successMessage}
            </div>
          )}
          {error && (
            <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div className="manager-panel-card">
            {loading ? (
              <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Đang tải...</p>
            ) : stocktakes.length === 0 ? (
              <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                Không có phiếu kiểm kê nào chờ duyệt.
              </p>
            ) : (
              <>
                <div className="warehouse-table-wrap" style={{ overflowX: 'auto' }}>
                  <table className="warehouse-table manager-table">
                    <thead>
                      <tr>
                        <th>Thời gian tạo</th>
                        <th>Người tạo</th>
                        <th>Số dòng</th>
                        <th></th>
                        <th></th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stocktakes.map((st) => (
                        <tr key={st._id}>
                          <td>{formatDate(st.created_at)}</td>
                          <td>{st.created_by?.email ?? '—'}</td>
                          <td>{Array.isArray(st.items) ? st.items.length : 0}</td>
                          <td>
                            <button
                              type="button"
                              className="warehouse-btn warehouse-btn-secondary"
                              style={{ padding: '6px 12px', fontSize: 13 }}
                              onClick={() => navigate(`/manager/stocktakes/${st._id}`)}
                            >
                              Xem chi tiết
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="warehouse-btn warehouse-btn-primary"
                              style={{ padding: '6px 14px', fontSize: 13 }}
                              onClick={() => handleApprove(st)}
                              disabled={approvingId === st._id || rejectingId === st._id}
                            >
                              {approvingId === st._id ? 'Đang duyệt...' : 'Duyệt & điều chỉnh tồn'}
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="warehouse-btn warehouse-btn-secondary"
                              style={{ padding: '6px 14px', fontSize: 13, color: '#b91c1c', borderColor: '#fecaca' }}
                              onClick={() => handleReject(st)}
                              disabled={approvingId === st._id || rejectingId === st._id}
                            >
                              {rejectingId === st._id ? 'Đang xử lý...' : 'Từ chối'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                    Trang {page} / {totalPages} — Tổng {total} phiếu
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="warehouse-btn warehouse-btn-secondary"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      className="warehouse-btn warehouse-btn-secondary"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Sau
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
