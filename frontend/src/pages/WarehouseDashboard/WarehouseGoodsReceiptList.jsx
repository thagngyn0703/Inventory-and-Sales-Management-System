import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getGoodsReceipts } from '../../services/goodsReceiptsApi';

const STATUS_LABEL = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

export default function WarehouseGoodsReceiptList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [receipts, setReceipts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGoodsReceipts(statusFilter);
      setReceipts(data || []);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const stateMessage = location.state?.success;
    if (stateMessage) {
      setSuccessMessage(stateMessage);
      setError('');
      window.history.replaceState({}, document.title, location.pathname + location.search);
    }
  }, [location.state]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  return (
    <>
      <h1 className="warehouse-page-title">Danh sách phiếu nhập kho</h1>
      <p className="warehouse-page-subtitle">Xem và quản lý các phiếu nhập kho đã tạo.</p>

      {successMessage && (
        <div className="warehouse-alert warehouse-alert-success" role="status">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="warehouse-alert warehouse-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="warehouse-card">
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14, color: '#374151' }}>
            Trạng thái:
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                marginLeft: 8,
                padding: '6px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              <option value="">Tất cả</option>
              <option value="draft">Nháp</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Đang tải...</p>
        ) : receipts.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
            Chưa có phiếu nhập kho nào.{' '}
            <button
              type="button"
              className="warehouse-btn warehouse-btn-primary"
              style={{ marginLeft: 8 }}
              onClick={() => navigate('/warehouse/receipts/new')}
            >
              Tạo phiếu nhập kho
            </button>
          </p>
        ) : (
          <div className="warehouse-table-wrap">
            <table className="warehouse-table">
              <thead>
                <tr>
                  <th>Thời gian nhập</th>
                  <th>Nhà cung cấp</th>
                  <th>Người tạo</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r._id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td>{r.supplier_id?.name ?? '—'}</td>
                    <td>{r.received_by?.fullName ?? r.received_by?.email ?? '—'}</td>
                    <td>{r.total_amount?.toLocaleString() || 0} đ</td>
                    <td>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 9999,
                        fontSize: 12,
                        fontWeight: 500,
                        backgroundColor: 
                          r.status === 'pending' ? '#fef3c7' :
                          r.status === 'approved' ? '#d1fae5' : 
                          r.status === 'rejected' ? '#fee2e2' : '#f3f4f6',
                        color:
                          r.status === 'pending' ? '#92400e' :
                          r.status === 'approved' ? '#065f46' : 
                          r.status === 'rejected' ? '#991b1b' : '#374151',
                      }}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="warehouse-btn warehouse-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: 13 }}
                        onClick={() => navigate(`/warehouse/receipts/${r._id}`)}
                      >
                        Xem
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
