import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStocktake } from '../../services/stocktakesApi';

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export default function WarehouseStocktakingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stocktake, setStocktake] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const data = await getStocktake(id);
        if (!cancelled) setStocktake(data);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Không tải được phiếu kiểm kê');
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
    return <p style={{ padding: 24, color: '#6b7280' }}>Đang tải...</p>;
  }
  if (error || !stocktake) {
    return (
      <>
        <div className="warehouse-alert warehouse-alert-error">{error || 'Không tìm thấy phiếu kiểm kê.'}</div>
        <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => navigate('/warehouse/stocktakes')}>
          Quay lại danh sách
        </button>
      </>
    );
  }

  const items = stocktake.items || [];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className="warehouse-btn warehouse-btn-secondary"
          onClick={() => navigate('/warehouse/stocktakes')}
        >
          ← Quay lại
        </button>
      </div>
      <h1 className="warehouse-page-title">Chi tiết phiếu kiểm kê</h1>
      <p className="warehouse-page-subtitle">
        Tạo lúc: {formatDate(stocktake.snapshot_at)} — Người tạo: {stocktake.created_by?.email ?? '—'} — Trạng thái:{' '}
        <span className={`warehouse-status-badge warehouse-status-${stocktake.status}`}>
          {STATUS_LABEL[stocktake.status] ?? stocktake.status}
        </span>
      </p>

      <div className="warehouse-card">
        <div className="warehouse-table-wrap">
          <table className="warehouse-table">
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
    </>
  );
}
