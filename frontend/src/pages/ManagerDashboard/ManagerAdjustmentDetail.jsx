import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { History } from 'lucide-react';
import { getAdjustment, revertAdjustment } from '../../services/adjustmentsApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { InlineNotice } from '../../components/ui/inline-notice';
import './ManagerDashboard.css';
import '../WarehouseDashboard/WarehouseDashboard.css';

export default function ManagerAdjustmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [adjustment, setAdjustment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [revertLoading, setRevertLoading] = useState(false);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

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
    if (!error || !adjustment) return;
    showToast('error', error);
    setError('');
  }, [error, adjustment]);

  if (loading) {
    return (
      <ManagerPageFrame showNotificationBell={false}>
        <p style={{ padding: 24, color: '#6b7280' }}>Đang tải...</p>
      </ManagerPageFrame>
    );
  }

  if (error || !adjustment) {
    return (
      <ManagerPageFrame showNotificationBell={false}>
        <InlineNotice message={error || 'Không tìm thấy phiếu điều chỉnh.'} type="error" />
        <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => navigate('/manager/adjustments')}>
          Quay lại danh sách
        </button>
      </ManagerPageFrame>
    );
  }

  const items = adjustment.items || [];
  const stocktakeItems = adjustment.stocktake_id?.items || [];
  const canRevert = Boolean(adjustment.stocktake_id && !adjustment.is_reverted && ['approved', 'rejected'].includes(adjustment.status));
  const reasonByProductId = {};
  stocktakeItems.forEach((it) => {
    const pid = it.product_id?._id ?? it.product_id;
    if (pid) reasonByProductId[String(pid)] = it.reason || '';
  });

  const handleRevert = async () => {
    if (!id) return;
    setRevertLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const resp = await revertAdjustment(id, { reason: revertReason.trim() });
      setAdjustment(resp.adjustment);
      setSuccessMessage(resp.message || 'Hoàn tác thành công.');
      setRevertModalOpen(false);
      setRevertConfirmOpen(false);
      setRevertReason('');
    } catch (e) {
      setError(e.message || 'Không thể hoàn tác phiếu điều chỉnh.');
    } finally {
      setRevertLoading(false);
    }
  };

  return (
    <ManagerPageFrame showNotificationBell={false}>
        <div className="adjustment-detail-content bg-slate-50">
          {revertModalOpen && (
            <div
              className="manager-reason-modal-overlay"
              onClick={(e) => e.target === e.currentTarget && setRevertModalOpen(false)}
              role="dialog"
              aria-modal="true"
            >
              <div className="manager-reason-modal-box" style={{ border: '1px solid #fbbf24' }}>
                <h2 className="manager-reason-modal-title" style={{ color: '#b45309' }}>Xác nhận hoàn tác</h2>
                <p className="manager-reason-modal-hint">
                  Hệ thống sẽ hoàn tác phiếu này và đưa phiếu kiểm kê liên quan về trạng thái chờ duyệt.
                </p>
                <textarea
                  className="manager-reason-modal-input"
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                  rows={3}
                  placeholder="Lý do hoàn tác (tùy chọn)"
                  autoFocus
                />
                <div className="manager-reason-modal-actions">
                  <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => setRevertModalOpen(false)} disabled={revertLoading}>
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="warehouse-btn warehouse-btn-primary"
                    onClick={() => {
                      setRevertModalOpen(false);
                      setRevertConfirmOpen(true);
                    }}
                    disabled={revertLoading}
                  >
                    Tiếp tục
                  </button>
                </div>
              </div>
            </div>
          )}

          {revertConfirmOpen && (
            <div
              className="manager-reason-modal-overlay"
              onClick={(e) => e.target === e.currentTarget && setRevertConfirmOpen(false)}
              role="dialog"
              aria-modal="true"
            >
              <div className="manager-reason-modal-box" style={{ border: '1px solid #f59e0b' }}>
                <h2 className="manager-reason-modal-title" style={{ color: '#b45309' }}>Xác nhận lớp 2</h2>
                <p className="manager-reason-modal-hint">
                  Bạn có chắc chắn muốn hoàn tác phiếu này? Hành động sẽ đảo lại tồn kho và mở lại phiếu kiểm kê chờ duyệt.
                </p>
                <div className="manager-reason-modal-actions">
                  <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={() => setRevertConfirmOpen(false)} disabled={revertLoading}>
                    Quay lại
                  </button>
                  <button
                    type="button"
                    className="warehouse-btn"
                    style={{ background: '#b45309', color: '#fff' }}
                    onClick={handleRevert}
                    disabled={revertLoading}
                  >
                    {revertLoading ? 'Đang hoàn tác...' : 'Xác nhận hoàn tác'}
                  </button>
                </div>
              </div>
            </div>
          )}

      <StaffPageShell
        eyebrow="Điều chỉnh tồn"
        eyebrowIcon={History}
        title="Chi tiết điều chỉnh tồn"
        subtitle={`Theo dõi lý do và từng dòng điều chỉnh. ${Platform.select({ web: 'Có thể hoàn tác khi duyệt/từ chối nhầm.', default: 'Có thể hoàn tác khi nhầm.' })}`}
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            {adjustment.is_reverted ? (
              <Badge className="border border-violet-200 bg-violet-100 text-violet-800">Đã hoàn tác</Badge>
            ) : (
              <Badge
                className={
                  adjustment.status === 'approved'
                    ? 'border border-emerald-200 bg-emerald-100 text-emerald-800'
                    : adjustment.status === 'rejected'
                      ? 'border border-red-200 bg-red-100 text-red-800'
                      : 'border border-amber-200 bg-amber-100 text-amber-900'
                }
              >
                {adjustment.status === 'approved' ? 'Đã duyệt' : adjustment.status === 'rejected' ? 'Đã từ chối' : adjustment.status}
              </Badge>
            )}
            <Button type="button" variant="outline" onClick={() => navigate('/manager/adjustments')}>
              Quay lại
            </Button>
          </div>
        }
      >
          <Card className="mb-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <CardContent className="p-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Duyệt lúc</p>
                  <p className="text-sm font-semibold text-slate-800">{formatDate(adjustment.approved_at)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Người duyệt</p>
                  <p className="text-sm font-semibold text-slate-800">{adjustment.approved_by?.email ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Lý do điều chỉnh</p>
                  <p className="text-sm font-semibold text-slate-800">{adjustment.reason && adjustment.reason.trim() ? adjustment.reason : '— Không có —'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Trạng thái hoàn tác</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {adjustment.is_reverted ? `Đã hoàn tác (${formatDate(adjustment.reverted_at)})` : 'Chưa hoàn tác'}
                  </p>
                </div>
              </div>
              {adjustment.is_reverted && (
                <p className="mt-3 text-xs text-violet-700">
                  Lý do hoàn tác: {adjustment.revert_reason || '—'} — Người hoàn tác: {adjustment.reverted_by?.email ?? '—'}
                </p>
              )}
              {canRevert && (
                <div className="mt-4">
                  <Button type="button" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setRevertModalOpen(true)} disabled={revertLoading}>
                    Hoàn tác phiếu này
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Sản phẩm</th>
                      <th className="px-4 py-3 text-left font-semibold">SKU</th>
                      <th className="px-4 py-3 text-left font-semibold">Đơn vị</th>
                      <th className="px-4 py-3 text-right font-semibold">Số điều chỉnh (+/-)</th>
                      <th className="px-4 py-3 text-left font-semibold">Lý do (từ phiếu kiểm kê)</th>
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
                        <tr key={item.product_id?._id ?? idx} className="border-t border-slate-100">
                          <td className="px-4 py-3">{name}</td>
                          <td className="px-4 py-3">{sku}</td>
                          <td className="px-4 py-3">{unit}</td>
                          <td className={`px-4 py-3 text-right ${qty > 0 ? 'text-emerald-700 font-semibold' : qty < 0 ? 'text-red-600 font-semibold' : ''}`}>
                            {qty > 0 ? '+' : ''}{Number(qty).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-4 py-3">{lineReason && lineReason.trim() ? lineReason : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {items.length === 0 && (
                <p className="p-8 text-center text-slate-500">Không có dòng nào.</p>
              )}
            </CardContent>
          </Card>
      </StaffPageShell>
        </div>
      {toast && (
        <div className="fixed right-4 top-4 z-[2500]">
          <InlineNotice message={toast.message} type={toast.type === 'success' ? 'success' : 'error'} />
        </div>
      )}
    </ManagerPageFrame>
  );
}
