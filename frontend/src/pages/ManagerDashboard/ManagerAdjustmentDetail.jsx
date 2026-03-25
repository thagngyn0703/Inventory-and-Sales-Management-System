import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getAdjustment } from '../../services/adjustmentsApi';
import './ManagerDashboard.css';
import '../WarehouseDashboard/WarehouseDashboard.css';

export default function ManagerAdjustmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [adjustment, setAdjustment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const data = await getAdjustment(id);
        if (!cancelled) setAdjustment(data);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Không tải được chi tiết');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

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

  if (error || !adjustment) {
    return (
      <div className="manager-page-with-sidebar">
        <ManagerSidebar />
        <div className="manager-main">
          <div className="manager-content">
            <div className="warehouse-alert warehouse-alert-error">{error || 'Không tìm thấy phiếu điều chỉnh.'}</div>
            <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => navigate('/manager/adjustments')}>
              Quay lại danh sách
            </button>
          </div>
        </div>
      </div>
    );
  }

  const items = adjustment.items || [];
  const stocktakeItems = adjustment.stocktake_id?.items || [];
  const reasonByProductId = {};
  stocktakeItems.forEach((it) => {
    const pid = it.product_id?._id ?? it.product_id;
    if (pid) reasonByProductId[String(pid)] = it.reason || '';
  });

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
        <div className="manager-content adjustment-detail-content">
          <h1 className="manager-page-title adjustment-detail-title">Chi tiết điều chỉnh tồn</h1>

          <div className="adjustment-detail-box adjustment-detail-info">
            <h3 className="adjustment-detail-box-title">Thông tin phiếu</h3>
            <div className="adjustment-detail-info-grid">
              <div className="adjustment-detail-info-item">
                <span className="adjustment-detail-info-label">Duyệt lúc</span>
                <span className="adjustment-detail-info-value">{formatDate(adjustment.approved_at)}</span>
              </div>
              <div className="adjustment-detail-info-item">
                <span className="adjustment-detail-info-label">Người duyệt</span>
                <span className="adjustment-detail-info-value">{adjustment.approved_by?.email ?? '—'}</span>
              </div>
              <div className="adjustment-detail-info-item">
                <span className="adjustment-detail-info-label">Trạng thái</span>
                <span className={`adjustment-detail-status adjustment-detail-status--${adjustment.status === 'approved' ? 'approved' : adjustment.status === 'rejected' ? 'rejected' : 'pending'}`}>
                  {adjustment.status === 'approved' ? 'Đã duyệt' : adjustment.status === 'rejected' ? 'Đã từ chối' : adjustment.status}
                </span>
              </div>
            </div>
            <div className="adjustment-detail-reason-inline">
              <span className="adjustment-detail-info-label">Lý do điều chỉnh</span>
              <p className="adjustment-detail-reason-text">
                {adjustment.reason && adjustment.reason.trim() ? adjustment.reason : '— Không có —'}
              </p>
              {adjustment.status === 'approved' && (!adjustment.reason || adjustment.reason.trim() === 'Duyệt từ phiếu kiểm kê') && (
                <p className="adjustment-detail-reason-hint">Lý do từng dòng xem ở bảng bên dưới.</p>
              )}
            </div>
          </div>

          <div className="adjustment-detail-box adjustment-detail-table-box">
            <h3 className="adjustment-detail-box-title">Chi tiết dòng điều chỉnh</h3>
            <div className="warehouse-table-wrap">
              <table className="warehouse-table manager-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SKU</th>
                    <th>Đơn vị</th>
                    <th style={{ textAlign: 'right' }}>Số điều chỉnh (+/-)</th>
                    <th>Lý do (từ phiếu kiểm kê)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const product = item.product_id;
                    const pid = product?._id ?? item.product_id;
                    const name = product?.name ?? '—';
                    const sku = product?.sku ?? '—';
                    const unit = product?.base_unit ?? 'Cái';
                    const qty = item.adjusted_qty ?? 0;
                    const lineReason = pid ? reasonByProductId[String(pid)] : '';
                    return (
                      <tr key={item.product_id?._id ?? idx}>
                        <td>{name}</td>
                        <td>{sku}</td>
                        <td>{unit}</td>
                        <td style={{ textAlign: 'right', color: qty !== 0 ? (qty > 0 ? '#166534' : '#b91c1c') : undefined }}>
                          {qty > 0 ? '+' : ''}{Number(qty).toLocaleString('vi-VN')}
                        </td>
                        <td className="adjustment-detail-cell-reason">{lineReason && lineReason.trim() ? lineReason : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {items.length === 0 && (
              <p className="adjustment-detail-empty">Không có dòng nào.</p>
            )}
          </div>

          <div className="adjustment-detail-footer">
            <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => navigate('/manager/adjustments')}>
              ← Quay lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
