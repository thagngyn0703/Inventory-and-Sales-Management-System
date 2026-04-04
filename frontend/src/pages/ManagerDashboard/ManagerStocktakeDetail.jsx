import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { ClipboardCheck } from 'lucide-react';
import { getStocktake, approveStocktake, rejectStocktake } from '../../services/stocktakesApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import './ManagerDashboard.css';

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
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

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

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = (type, message) => {
    if (!message) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    if (!successMessage) return;
    showToast('success', successMessage);
    setSuccessMessage('');
  }, [successMessage]);

  useEffect(() => {
    if (!error || !stocktake) return;
    showToast('error', error);
    setError('');
  }, [error, stocktake]);

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
      <ManagerPageFrame showNotificationBell={false}>
        <p style={{ padding: 24, color: '#6b7280' }}>Đang tải...</p>
      </ManagerPageFrame>
    );
  }

  if (error && !stocktake) {
    return (
      <ManagerPageFrame showNotificationBell={false}>
        <div className="warehouse-alert warehouse-alert-error">{error}</div>
        <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => navigate('/manager/stocktakes/pending')}>
          Quay lại kiểm kê chờ duyệt
        </button>
      </ManagerPageFrame>
    );
  }

  const items = stocktake?.items || [];
  const isPending = stocktake?.status === 'submitted';

  return (
    <ManagerPageFrame showNotificationBell={false}>
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
              <button
                type="button"
                className={modal.type === 'reject' ? 'warehouse-btn' : 'warehouse-btn warehouse-btn-primary'}
                style={modal.type === 'reject' ? { background: '#b91c1c', color: '#fff' } : undefined}
                onClick={modal.type === 'approve' ? confirmApprove : confirmReject}
                disabled={actionLoading}
              >
                {actionLoading
                  ? 'Đang xử lý...'
                  : (modal.type === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối')}
              </button>
            </div>
          </div>
        </div>
      )}

      <StaffPageShell
        eyebrow="Kho & kiểm kê"
        eyebrowIcon={ClipboardCheck}
        title="Chi tiết phiếu kiểm kê"
        subtitle={`Tạo lúc: ${formatDate(stocktake?.snapshot_at)} — Người tạo: ${stocktake?.created_by?.email ?? '—'}. ${Platform.select({ web: 'Duyệt/Từ chối: nhập lý do và xác nhận một lần.', default: 'Duyệt/Từ chối một lần.' })}`}
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                stocktake?.status === 'submitted'
                  ? 'border border-amber-200 bg-amber-100 text-amber-800'
                  : 'border border-slate-200 bg-slate-100 text-slate-800'
              }
            >
              {STATUS_LABEL[stocktake?.status] ?? stocktake?.status}
            </Badge>
            <Button type="button" variant="outline" onClick={() => navigate('/manager/stocktakes/pending')}>
              Quay lại
            </Button>
          </div>
        }
      >
          <div className="mb-4 flex flex-wrap gap-2">
            {isPending && (
              <>
                <Button type="button" onClick={() => openModal('approve')} disabled={actionLoading}>
                  Duyệt & điều chỉnh tồn
                </Button>
                <Button type="button" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => openModal('reject')} disabled={actionLoading}>
                  Từ chối
                </Button>
              </>
            )}
          </div>

          {stocktake?.status === 'cancelled' && stocktake?.reject_reason && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Lý do từ chối:</strong> {stocktake.reject_reason}
            </div>
          )}

          <Card className="rounded-2xl border border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Sản phẩm</th>
                      <th className="px-4 py-3 text-left font-semibold">SKU</th>
                      <th className="px-4 py-3 text-left font-semibold">Đơn vị</th>
                      <th className="px-4 py-3 text-right font-semibold">Tồn hệ thống</th>
                      <th className="px-4 py-3 text-right font-semibold">Thực tế</th>
                      <th className="px-4 py-3 text-right font-semibold">Chênh lệch</th>
                      <th className="px-4 py-3 text-left font-semibold">Lý do</th>
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
            </CardContent>
          </Card>
      </StaffPageShell>
      {toast && (
        <div className="fixed right-4 top-4 z-[2500]">
          <div className={`rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </ManagerPageFrame>
  );
}

