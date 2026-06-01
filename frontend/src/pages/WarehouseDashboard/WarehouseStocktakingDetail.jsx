import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getStocktake, updateStocktake, completeStocktake } from '../../services/stocktakesApi';
import { getCurrentUser, normalizeRole } from '../../utils/auth';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { InlineNotice } from '../../components/ui/inline-notice';
import { ClipboardCheck, Loader2 } from 'lucide-react';

const STATUS_LABEL = {
  draft: 'Nháp',
  submitted: 'Đã gửi',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  expired: 'Hết hiệu lực',
};

export default function WarehouseStocktakingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const warehouseBase = useWarehouseBase();
  const [stocktake, setStocktake] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);
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
  const currentUser = getCurrentUser();
  const creatorId = String(stocktake?.created_by?._id || stocktake?.created_by || '');
  const localManagerOwnDraft =
    isDraft &&
    ['manager', 'admin'].includes(normalizeRole(currentUser?.role)) &&
    creatorId &&
    String(currentUser?.id || currentUser?._id) === creatorId;
  const isManagerOwnDraft =
    stocktake?.can_self_complete === true ||
    (stocktake?.can_self_complete === undefined && localManagerOwnDraft);

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

  const handleSubmit = async () => {
    if (!id) return;
    setSubmitting(true);
    setError('');
    setSuccessMessage('');
    try {
      await updateStocktake(id, { items: getPayloadItems(), status: 'submitted' });
      navigate(`${warehouseBase}/stocktakes`, {
        state: { success: 'Đã gửi phiếu kiểm kê chờ duyệt.' },
      });
    } catch (e) {
      setError(e.message || 'Không thể gửi');
      setSubmitting(false);
    }
  };

  const handleManagerComplete = async () => {
    if (!id) return;
    setCompleting(true);
    setError('');
    setSuccessMessage('');
    try {
      await completeStocktake(id, {
        items: getPayloadItems(),
        reason: 'Quản lý tự kiểm kê và hoàn tất phiếu',
      });
      setSuccessMessage('Đã hoàn tất kiểm kê và cập nhật tồn kho.');
      navigate(`${warehouseBase}/stocktakes`, { state: { success: 'Đã hoàn tất phiếu kiểm kê.' } });
    } catch (e) {
      setError(e.message || 'Không thể hoàn tất phiếu kiểm kê');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
        <p>Đang tải phiếu kiểm kê...</p>
      </div>
    );
  }
  if (error && !stocktake) {
    return (
      <>
        <InlineNotice message={error} type="error" className="mb-4" />
        <Button type="button" variant="outline" onClick={() => navigate(`${warehouseBase}/stocktakes`)}>
          Quay lại danh sách
        </Button>
      </>
    );
  }

  const items = stocktake?.items || [];
  const showEdit = isDraft && editableItems.length > 0;

  return (
    <StaffPageShell
      eyebrow="Kiểm kê kho"
      eyebrowIcon={ClipboardCheck}
      eyebrowTone="amber"
      title="Chi tiết phiếu kiểm kê"
      subtitle={`Tạo lúc: ${formatDate(stocktake?.snapshot_at)} — Người tạo: ${stocktake?.created_by?.email ?? '—'}`}
      headerActions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge
            className={
              stocktake?.status === 'completed'
                ? 'border border-emerald-200 bg-emerald-100 font-medium text-emerald-800'
                : stocktake?.status === 'cancelled'
                  ? 'border border-red-200 bg-red-100 font-medium text-red-800'
                  : stocktake?.status === 'expired'
                    ? 'border border-slate-300 bg-slate-200 font-medium text-slate-700'
                    : stocktake?.status === 'submitted'
                      ? 'border border-amber-200 bg-amber-100 font-medium text-amber-900'
                      : 'border border-slate-200 bg-slate-100 font-medium text-slate-800'
            }
          >
            {STATUS_LABEL[stocktake?.status] ?? stocktake?.status}
          </Badge>
          <Button type="button" variant="outline" onClick={() => navigate(`${warehouseBase}/stocktakes`)}>
            Quay lại
          </Button>
        </div>
      }
    >
      {stocktake?.status === 'cancelled' && stocktake?.reject_reason && (
        <InlineNotice message={`Lý do từ chối: ${stocktake.reject_reason}`} type="error" />
      )}
      {stocktake?.status === 'expired' && (
        <InlineNotice message="Tồn hệ thống đã thay đổi" type="error" />
      )}

      {isDraft && (
        <p className="text-sm text-slate-600">
          {isManagerOwnDraft ? (
            <>
              <strong className="text-slate-800">Quản lý tự kiểm kê:</strong> nhập số thực tế và lý do chênh lệch (nếu có),
              sau đó bấm <strong className="text-slate-800">Hoàn tất &amp; điều chỉnh tồn</strong> — hệ thống cộng/trừ tồn ngay,
              không cần gửi duyệt.
            </>
          ) : (
            <>
              Nhập <strong className="text-slate-800">số lượng thực tế</strong> và <strong className="text-slate-800">lý do chênh lệch</strong> (nếu có),
              sau đó bấm <strong className="text-slate-800">Gửi duyệt</strong> để quản lý xem và duyệt phiếu.
            </>
          )}
        </p>
      )}

      <InlineNotice message={successMessage} type="success" />
      <InlineNotice message={stocktake ? error : ''} type="error" />

      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Đơn vị</th>
                  <th className="px-4 py-3 text-right">Tồn hệ thống</th>
                  <th className="px-4 py-3 text-right">Thực tế</th>
                  <th className="px-4 py-3 text-right">Chênh lệch</th>
                  <th className="px-4 py-3">Lý do chênh lệch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
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
                      <tr key={item.product_id ?? idx} className="hover:bg-slate-50/80">
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
                      <tr key={item.product_id?._id ?? idx} className="hover:bg-slate-50/80">
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
            <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/30 p-4">
              {isManagerOwnDraft ? (
                <Button type="button" onClick={handleManagerComplete} disabled={submitting || completing}>
                  {completing ? 'Đang hoàn tất...' : 'Hoàn tất & điều chỉnh tồn'}
                </Button>
              ) : (
                <Button type="button" onClick={handleSubmit} disabled={submitting || completing}>
                  {submitting ? 'Đang gửi...' : 'Gửi duyệt'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </StaffPageShell>
  );
}
