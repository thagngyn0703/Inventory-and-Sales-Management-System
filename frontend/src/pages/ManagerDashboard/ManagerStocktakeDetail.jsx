import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getStocktake, approveStocktake, rejectStocktake } from '../../services/stocktakesApi';
import './ManagerDashboard.css';
import '../WarehouseDashboard/WarehouseDashboard.css';

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export default function ManagerStocktakeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stocktake, setStocktake] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modal, setModal] = useState({ open: false, type: null });
  const [reasonInput, setReasonInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getStocktake(id);
      setStocktake(data);
    } catch (e) {
      setError(e.message || 'Không tải được phiếu kiểm kê');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = (type) => {
    setModal({ open: true, type });
    setReasonInput('');
    setError('');
  };

  const closeModal = () => {
    setModal({ open: false, type: null });
    setReasonInput('');
  };

  const confirmApprove = async () => {
    setActionLoading(true);
    setError('');
    try {
      await approveStocktake(id, { reason: reasonInput.trim() });
      setSuccessMessage('Đã duyệt phiếu và cập nhật tồn kho.');
      closeModal();
      load();
    } catch (err) {
      setError(err.message || 'Không thể duyệt phiếu');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmReject = async () => {
    setActionLoading(true);
    setError('');
    try {
      await rejectStocktake(id, { reason: reasonInput.trim() });
      setSuccessMessage('Đã từ chối phiếu kiểm kê.');
      closeModal();
      load();
    } catch (err) {
      setError(err.message || 'Không thể từ chối phiếu');
    } finally {
      setActionLoading(false);
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

  if (loading) {
    return (
      <div className="manager-page-with-sidebar">
        <ManagerSidebar />
        <div className="manager-main">
          <div className="manager-content">
            <p style={{ padding: 24, color: '#6b7280' }}>Đang tải...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !stocktake) {
    return (
      <div className="manager-page-with-sidebar">
        <ManagerSidebar />
        <div className="manager-main">
          <div className="manager-content">
            <div className="warehouse-alert warehouse-alert-error">{error}</div>
            <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => navigate('/manager/stocktakes/pending')}>
              Quay lại kiểm kê chờ duyệt
            </button>
          </div>
        </div>
      </div>
    );
  }

  const items = stocktake?.items || [];
  const isPending = stocktake?.status === 'submitted';

  return (
    <div className="manager-page-with-sidebar">
      {/* Modal duyệt / từ chối */}
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
              <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={closeModal} disabled={actionLoading}>
                Hủy
              </button>
              {modal.type === 'reject' ? (
                <button
                  type="button"
                  className="warehouse-btn"
                  style={{ background: '#b91c1c', color: '#fff' }}
                  onClick={confirmReject}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Đang xử lý...' : 'Từ chối'}
                </button>
              ) : (
                <button
                  type="button"
                  className="warehouse-btn warehouse-btn-primary"
                  onClick={confirmApprove}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Đang duyệt...' : 'Duyệt & điều chỉnh tồn'}
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
          {/* Thanh hành động trên cùng */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="warehouse-btn warehouse-btn-secondary"
              onClick={() => navigate('/manager/stocktakes/pending')}
            >
              ← Quay lại
            </button>
            {isPending && (
              <>
                <button
                  type="button"
                  className="warehouse-btn warehouse-btn-primary"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => openModal('approve')}
                  disabled={actionLoading}
                >
                  Duyệt & điều chỉnh tồn
                </button>
                <button
                  type="button"
                  className="warehouse-btn warehouse-btn-secondary"
                  style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                  onClick={() => openModal('reject')}
                  disabled={actionLoading}
                >
                  Từ chối
                </button>
              </>
            )}
          </div>

          <h1 className="manager-page-title">Chi tiết phiếu kiểm kê</h1>
          <p className="manager-page-subtitle">
            Tạo lúc: {formatDate(stocktake?.snapshot_at)} — Người tạo: {stocktake?.created_by?.email ?? '—'} — Trạng thái:{' '}
            <span className={`warehouse-status-badge warehouse-status-${stocktake?.status}`}>
              {STATUS_LABEL[stocktake?.status] ?? stocktake?.status}
            </span>
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

          {stocktake?.status === 'cancelled' && stocktake?.reject_reason && (
            <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: 16 }}>
              <strong>Lý do từ chối:</strong> {stocktake.reject_reason}
            </div>
          )}

          <div className="manager-panel-card">
            <div className="warehouse-table-wrap">
              <table className="warehouse-table manager-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SKU</th>
                    <th>Đơn vị</th>
                    <th style={{ textAlign: 'right' }}>Tồn hệ thống</th>
                    <th style={{ textAlign: 'right' }}>Thực tế</th>
                    <th style={{ textAlign: 'right' }}>Chênh lệch</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const product = item.product_id;
                    const name = product?.name ?? item.product_id ?? '—';
                    const sku = product?.sku ?? '—';
                    const unit = product?.base_unit ?? 'Cái';
                    const systemQty = item.system_qty ?? 0;
                    const actualQty = item.actual_qty;
                    const variance = item.variance != null ? item.variance : (actualQty != null ? actualQty - systemQty : null);
                    return (
                      <tr key={item.product_id?._id ?? idx}>
                        <td>{name}</td>
                        <td>{sku}</td>
                        <td>{unit}</td>
                        <td style={{ textAlign: 'right' }}>{Number(systemQty).toLocaleString('vi-VN')}</td>
                        <td style={{ textAlign: 'right' }}>{actualQty != null ? Number(actualQty).toLocaleString('vi-VN') : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {variance != null ? (
                            <span style={{ color: variance !== 0 ? (variance > 0 ? '#166534' : '#b91c1c') : undefined }}>
                              {variance > 0 ? '+' : ''}{Number(variance).toLocaleString('vi-VN')}
                            </span>
                          ) : '—'}
                        </td>
                        <td>{item.reason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {items.length === 0 && (
              <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Không có dòng sản phẩm.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

