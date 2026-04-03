import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getStocktake, updateStocktake } from '../../services/stocktakesApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

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
    return <p className="p-6 text-slate-500">Đang tải...</p>;
  }
  if (error && !stocktake) {
    return (
      <>
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        <Button type="button" variant="outline" onClick={() => navigate(`${warehouseBase}/stocktakes`)}>
          Quay lại danh sách
        </Button>
      </>
    );
  }

  const items = stocktake?.items || [];
  const showEdit = isDraft && editableItems.length > 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chi tiết phiếu kiểm kê</h1>
          <p className="text-sm text-slate-500">
            Tạo lúc: {formatDate(stocktake?.snapshot_at)} — Người tạo: {stocktake?.created_by?.email ?? '—'}
          </p>
          <p className="text-xs text-slate-400">
            {Platform.select({ web: 'Giao diện tối ưu để kiểm đếm nhanh và gửi duyệt chính xác.', default: 'Tối ưu thao tác kiểm đếm.' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={
            stocktake?.status === 'completed'
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : stocktake?.status === 'cancelled'
                ? 'bg-red-100 text-red-700 border border-red-200'
                : stocktake?.status === 'submitted'
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
          }>
            {STATUS_LABEL[stocktake?.status] ?? stocktake?.status}
          </Badge>
          <Button type="button" variant="outline" onClick={() => navigate(`${warehouseBase}/stocktakes`)}>
            Quay lại
          </Button>
        </div>
      </div>

      {stocktake?.status === 'cancelled' && stocktake?.reject_reason && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Lý do từ chối:</strong> {stocktake.reject_reason}
        </div>
      )}

      {isDraft && (
        <p className="mb-4 text-sm text-slate-500">
          Nhập <strong>số lượng thực tế</strong> đã kiểm đếm và <strong>lý do chênh lệch</strong> (nếu có), sau đó bấm Lưu hoặc Gửi duyệt.
        </p>
      )}

      {successMessage && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">
          {successMessage}
        </div>
      )}
      {error && stocktake && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Sản phẩm</th>
                  <th className="px-4 py-3 text-left font-semibold">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold">Đơn vị</th>
                  <th className="px-4 py-3 text-right font-semibold">Tồn hệ thống</th>
                  <th className="px-4 py-3 text-right font-semibold">Thực tế (kiểm đếm)</th>
                  <th className="px-4 py-3 text-right font-semibold">Chênh lệch</th>
                  <th className="px-4 py-3 text-left font-semibold">Lý do chênh lệch</th>
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
                      <tr key={item.product_id ?? idx} className="border-t border-slate-100">
                        <td className="px-4 py-3">{name}</td>
                        <td className="px-4 py-3">{sku}</td>
                        <td className="px-4 py-3">{unit}</td>
                        <td className="px-4 py-3 text-right">{Number(systemQty).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={actualVal === null || actualVal === undefined ? '' : actualVal}
                            onChange={(e) => updateItem(idx, 'actual_qty', e.target.value === '' ? '' : e.target.value)}
                            className="h-9 w-24 rounded-md border border-slate-300 px-2 text-right text-sm"
                            placeholder="Nhập số"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {variance !== null ? (
                            <span className={variance > 0 ? 'text-emerald-700 font-semibold' : variance < 0 ? 'text-red-600 font-semibold' : ''}>
                              {variance > 0 ? '+' : ''}{Number(variance).toLocaleString('vi-VN')}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.reason}
                            onChange={(e) => updateItem(idx, 'reason', e.target.value)}
                            placeholder="Lý do (nếu có)"
                            className="h-9 w-full min-w-[140px] rounded-md border border-slate-300 px-3 text-sm"
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
                      <tr key={item.product_id?._id ?? idx} className="border-t border-slate-100">
                        <td className="px-4 py-3">{name}</td>
                        <td className="px-4 py-3">{sku}</td>
                        <td className="px-4 py-3">{unit}</td>
                        <td className="px-4 py-3 text-right">{Number(systemQty).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 text-right">{actualQty != null ? Number(actualQty).toLocaleString('vi-VN') : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {variance != null ? (
                            <span className={variance > 0 ? 'text-emerald-700 font-semibold' : variance < 0 ? 'text-red-600 font-semibold' : ''}>
                              {variance > 0 ? '+' : ''}{Number(variance).toLocaleString('vi-VN')}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">{item.reason || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {items.length === 0 && (
            <p className="p-8 text-center text-slate-500">Không có dòng sản phẩm.</p>
          )}

          {showEdit && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
              <Button type="button" onClick={handleSave} disabled={saving || submitting}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </Button>
              <Button type="button" variant="outline" onClick={handleSubmit} disabled={saving || submitting}>
                {submitting ? 'Đang gửi...' : 'Gửi duyệt'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
