import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGoodsReceipt, updateGoodsReceipt } from '../../services/goodsReceiptsApi';

const STATUS_LABEL = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

export default function WarehouseGoodsReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchReceipt = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGoodsReceipt(id);
      setReceipt(data);
    } catch (e) {
      setError(e.message || 'Không thể tải phiếu nhập kho');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReceipt();
  }, [fetchReceipt]);

  const handleSubmitForApproval = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn gửi phiếu này để duyệt?')) return;
    setSubmitting(true);
    setError('');
    try {
      await updateGoodsReceipt(id, { status: 'pending' });
      navigate('/warehouse/receipts', { state: { success: 'Đã gửi phiếu nhập để chờ duyệt' } });
    } catch (e) {
      setError(e.message || 'Lỗi khi gửi duyệt');
      setSubmitting(false);
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

  if (loading) return <div style={{ padding: 24 }}>Đang tải chi tiết...</div>;
  if (error) return <div className="warehouse-alert warehouse-alert-error" style={{ margin: 24 }}>{error}</div>;
  if (!receipt) return null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className="warehouse-btn warehouse-btn-secondary"
          onClick={() => navigate('/warehouse/receipts')}
        >
          <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
          Quay lại
        </button>
        <h1 className="warehouse-page-title" style={{ margin: 0 }}>Chi tiết phiếu nhập kho</h1>
      </div>

      <div className="warehouse-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>Người tạo</p>
            <p style={{ margin: 0, fontWeight: 500 }}>
              {receipt.received_by?.fullName || receipt.received_by?.email || '—'}
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>Ngày tạo</p>
            <p style={{ margin: 0, fontWeight: 500 }}>{formatDate(receipt.created_at)}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>Nhà cung cấp</p>
            <p style={{ margin: 0, fontWeight: 500 }}>{receipt.supplier_id?.name || '—'}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>Lý do nhập</p>
            <p style={{ margin: 0, fontWeight: 500 }}>{receipt.reason || '—'}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>Trạng thái</p>
            <span className={`warehouse-status-badge warehouse-status-${receipt.status}`}>
              {STATUS_LABEL[receipt.status] ?? receipt.status}
            </span>
          </div>
          {receipt.status === 'approved' && (
             <div>
               <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>Người duyệt</p>
               <p style={{ margin: 0, fontWeight: 500 }}>{receipt.approved_by?.fullName || receipt.approved_by?.email || '—'}</p>
             </div>
          )}
        </div>
      </div>

      <div className="warehouse-card">
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Danh sách sản phẩm</h2>
        <div className="warehouse-table-wrap">
          <table className="warehouse-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th>Đơn vị tính</th>
                <th style={{ textAlign: 'right' }}>Số lượng</th>
                <th style={{ textAlign: 'right' }}>Đơn giá (đ)</th>
                <th style={{ textAlign: 'right' }}>Thành tiền (đ)</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items?.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.product_id?.name || 'Sản phẩm không xác định'}</td>
                  <td>{item.product_id?.sku || '—'}</td>
                  <td>{item.unit_name || item.product_id?.base_unit || 'Cái'} {item.ratio > 1 ? `(x${item.ratio})` : ''}</td>
                  <td style={{ textAlign: 'right' }}>{Number(item.quantity).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(item.unit_cost).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{(item.quantity * item.unit_cost).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', marginTop: 16, fontSize: 18, fontWeight: 'bold' }}>
            Tổng cộng: {Number(receipt.total_amount).toLocaleString()} đ
          </div>
        </div>

        {receipt.status === 'draft' && (
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="warehouse-btn warehouse-btn-primary"
              onClick={handleSubmitForApproval}
              disabled={submitting}
            >
              {submitting ? 'Đang gửi...' : 'Gửi yêu cầu duyệt'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
