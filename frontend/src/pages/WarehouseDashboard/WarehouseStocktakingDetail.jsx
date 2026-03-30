import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getStocktake, updateStocktake } from '../../services/stocktakesApi';

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export default function WarehouseStocktakingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const warehouseBase = useWarehouseBase();
  const [stocktake, setStocktake] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Local edit state: array of { product_id, system_qty, actual_qty, reason }
  const [editableItems, setEditableItems] = useState([]);

  const loadStocktake = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getStocktake(id);
      setStocktake(data);
      const items = data?.items || [];
      setEditableItems(
        items.map((it) => ({
          product_id: it.product_id?._id ?? it.product_id,
          system_qty: it.system_qty ?? 0,
          actual_qty: it.actual_qty ?? '',
          reason: it.reason ?? '',
        }))
      );
    } catch (e) {
      setError(e.message || 'Không tải được phiếu kiểm kê');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadStocktake();
  }, [loadStocktake]);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN');
    } catch {
      return '—';
    }
  };

  const isDraft = stocktake?.status === 'draft';

  const updateItem = (index, field, value) => {
    setEditableItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const getPayloadItems = () =>
    editableItems.map((it) => ({
      product_id: typeof it.product_id === 'object' ? it.product_id?._id ?? it.product_id : it.product_id,
      actual_qty: it.actual_qty === '' || it.actual_qty === null ? null : Number(it.actual_qty),
      reason: it.reason || '',
    }));

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const updated = await updateStocktake(id, { items: getPayloadItems() });
      setStocktake(updated);
      setSuccessMessage('Đã lưu số lượng thực tế và lý do.');
    } catch (e) {
      setError(e.message || 'Không thể lưu');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!id) return;
    setSubmitting(true);
    setError('');
    setSuccessMessage('');
    try {
      await updateStocktake(id, { items: getPayloadItems(), status: 'submitted' });
      setSuccessMessage('Đã gửi phiếu kiểm kê chờ duyệt.');
      loadStocktake();
    } catch (e) {
      setError(e.message || 'Không thể gửi');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p style={{ padding: 24, color: '#6b7280' }}>Đang tải...</p>;
  }
  if (error && !stocktake) {
    return (
      <>
        <div className="warehouse-alert warehouse-alert-error">{error}</div>
        <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => navigate(`${warehouseBase}/stocktakes`)}>
          Quay lại danh sách
        </button>
      </>
    );
  }

  const items = stocktake?.items || [];
  const showEdit = isDraft && editableItems.length > 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className="warehouse-btn warehouse-btn-secondary"
          onClick={() => navigate(`${warehouseBase}/stocktakes`)}
        >
          ← Quay lại
        </button>
      </div>
      <h1 className="warehouse-page-title">Chi tiết phiếu kiểm kê</h1>
      <p className="warehouse-page-subtitle">
        Tạo lúc: {formatDate(stocktake?.snapshot_at)} — Người tạo: {stocktake?.created_by?.email ?? '—'} — Trạng thái:{' '}
        <span className={`warehouse-status-badge warehouse-status-${stocktake?.status}`}>
          {STATUS_LABEL[stocktake?.status] ?? stocktake?.status}
        </span>
      </p>

      {stocktake?.status === 'cancelled' && stocktake?.reject_reason && (
        <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: 16 }}>
          <strong>Lý do từ chối:</strong> {stocktake.reject_reason}
        </div>
      )}

      {isDraft && (
        <p style={{ marginBottom: 16, fontSize: 14, color: '#6b7280' }}>
          Nhập <strong>số lượng thực tế</strong> đã kiểm đếm và <strong>lý do chênh lệch</strong> (nếu có), sau đó bấm Lưu hoặc Gửi duyệt.
        </p>
      )}

      {successMessage && (
        <div className="warehouse-alert warehouse-alert-success" role="status">
          {successMessage}
        </div>
      )}
      {error && stocktake && (
        <div className="warehouse-alert warehouse-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="warehouse-card">
        <div className="warehouse-table-wrap">
          <table className="warehouse-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th>Đơn vị</th>
                <th style={{ textAlign: 'right' }}>Tồn hệ thống</th>
                <th style={{ textAlign: 'right' }}>Thực tế (kiểm đếm)</th>
                <th style={{ textAlign: 'right' }}>Chênh lệch</th>
                <th>Lý do chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              {showEdit
                ? editableItems.map((item, idx) => {
                    const product = items[idx]?.product_id;
                    const name = product?.name ?? '—';
                    const sku = product?.sku ?? '—';
                    const unit = product?.base_unit ?? 'Cái';
                    const systemQty = item.system_qty ?? 0;
                    const actualVal = item.actual_qty;
                    const numActual = actualVal === '' || actualVal === null ? null : Number(actualVal);
                    const variance = numActual !== null ? numActual - systemQty : null;
                    return (
                      <tr key={item.product_id ?? idx}>
                        <td>{name}</td>
                        <td>{sku}</td>
                        <td>{unit}</td>
                        <td style={{ textAlign: 'right' }}>{Number(systemQty).toLocaleString('vi-VN')}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={actualVal === null || actualVal === undefined ? '' : actualVal}
                            onChange={(e) => updateItem(idx, 'actual_qty', e.target.value === '' ? '' : e.target.value)}
                            style={{ width: 90, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, textAlign: 'right' }}
                            placeholder="Nhập số"
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {variance !== null ? (
                            <span style={{ color: variance !== 0 ? (variance > 0 ? '#166534' : '#b91c1c') : undefined }}>
                              {variance > 0 ? '+' : ''}{Number(variance).toLocaleString('vi-VN')}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <input
                            type="text"
                            value={item.reason}
                            onChange={(e) => updateItem(idx, 'reason', e.target.value)}
                            placeholder="Lý do (nếu có)"
                            style={{ width: '100%', minWidth: 120, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }}
                          />
                        </td>
                      </tr>
                    );
                  })
                : items.map((item, idx) => {
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

        {showEdit && (
          <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="warehouse-btn warehouse-btn-primary"
              onClick={handleSave}
              disabled={saving || submitting}
            >
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button
              type="button"
              className="warehouse-btn warehouse-btn-secondary"
              onClick={handleSubmit}
              disabled={saving || submitting}
            >
              {submitting ? 'Đang gửi...' : 'Gửi duyệt'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
