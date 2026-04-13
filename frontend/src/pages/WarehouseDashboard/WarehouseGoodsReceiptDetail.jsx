import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getGoodsReceipt, updateGoodsReceipt } from '../../services/goodsReceiptsApi';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { ArrowLeft, ClipboardList, Loader2, Send } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_LABEL = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

function statusPillClass(status) {
  if (status === 'pending') {
    return 'border-amber-200/90 bg-amber-100 text-amber-950 ring-1 ring-amber-200/60';
  }
  if (status === 'approved') {
    return 'border-emerald-200/90 bg-emerald-100 text-emerald-950 ring-1 ring-emerald-200/60';
  }
  if (status === 'rejected') {
    return 'border-red-200/90 bg-red-100 text-red-950 ring-1 ring-red-200/60';
  }
  return 'border-slate-200 bg-slate-100 text-slate-800 ring-1 ring-slate-200/80';
}

export default function WarehouseGoodsReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const warehouseBase = useWarehouseBase();
  const { toast } = useToast();

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const fetchReceipt = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGoodsReceipt(id);
      setReceipt(data);
    } catch (e) {
      const msg = e.message || 'Không thể tải phiếu nhập kho';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchReceipt();
  }, [fetchReceipt]);

  const handleSubmitForApproval = async () => {
    setSubmitting(true);
    setError('');
    try {
      await updateGoodsReceipt(id, { status: 'pending' });
      setConfirmSendOpen(false);
      navigate(`${warehouseBase}/receipts`, {
        state: { success: 'Đã gửi phiếu nhập để chờ duyệt' },
      });
    } catch (e) {
      const msg = e.message || 'Lỗi khi gửi duyệt';
      setError(msg);
      toast(msg, 'error');
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

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
        <p>Đang tải chi tiết phiếu nhập...</p>
      </div>
    );
  }
  if (error && !receipt) {
    return (
      <InlineNotice message={error} type="error" className="mx-auto max-w-lg" />
    );
  }
  if (!receipt) return null;

  const shortId = receipt._id.substring(receipt._id.length - 6).toUpperCase();

  return (
    <>
      <StaffPageShell
        className="max-w-5xl"
        eyebrow="Kho & nhập hàng"
        eyebrowIcon={ClipboardList}
        eyebrowTone="violet"
        title="Chi tiết phiếu nhập kho"
        subtitle={`Mã phiếu: ${shortId}`}
        headerActions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(`${warehouseBase}/receipts`)}>
              <ArrowLeft className="h-4 w-4" />
              Quay lại
            </Button>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold',
                statusPillClass(receipt.status)
              )}
            >
              {STATUS_LABEL[receipt.status] ?? receipt.status}
            </span>
          </div>
        }
      >
        <InlineNotice message={error} type="error" />

        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Người tạo</p>
              <p className="mt-1 font-medium text-slate-900">
                {receipt.received_by?.fullName || receipt.received_by?.email || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Ngày tạo</p>
              <p className="mt-1 font-medium text-slate-900">{formatDate(receipt.created_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Nhà cung cấp</p>
              <p className="mt-1 font-medium text-slate-900">{receipt.supplier_id?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Lý do nhập</p>
              <p className="mt-1 text-slate-800">{receipt.reason || '—'}</p>
            </div>
            {receipt.status === 'approved' && (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium uppercase text-slate-500">Người duyệt</p>
                <p className="mt-1 font-medium text-slate-900">
                  {receipt.approved_by?.fullName || receipt.approved_by?.email || '—'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">Danh sách sản phẩm</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Sản phẩm</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Đơn vị</th>
                    <th className="px-3 py-2 text-right">SL</th>
                    <th className="px-3 py-2 text-right">Đơn giá</th>
                    <th className="px-3 py-2 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receipt.items?.map((item, idx) => (
                    <tr key={idx} className="bg-white">
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {item.product_id?.name || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{item.product_id?.sku || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {item.unit_name || item.product_id?.base_unit || 'Cái'}
                        {item.ratio > 1 ? ` (×${item.ratio})` : ''}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(item.quantity).toLocaleString('vi-VN')}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(item.unit_cost).toLocaleString('vi-VN')}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                        {(item.quantity * item.unit_cost).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-right text-lg font-bold text-slate-900">
              Tổng cộng:{' '}
              <span className="text-emerald-700">{Number(receipt.total_amount).toLocaleString('vi-VN')} đ</span>
            </p>

            {receipt.status === 'draft' && (
              <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
                <Button type="button" className="gap-2" onClick={() => setConfirmSendOpen(true)}>
                  <Send className="h-4 w-4" />
                  Gửi yêu cầu duyệt
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </StaffPageShell>

      <ConfirmDialog
        open={confirmSendOpen}
        onOpenChange={setConfirmSendOpen}
        title="Gửi phiếu nhập để duyệt?"
        description="Phiếu sẽ chuyển sang trạng thái chờ duyệt. Quản lý sẽ xem xét và phê duyệt trước khi nhập kho."
        confirmLabel="Gửi duyệt"
        cancelLabel="Hủy"
        loading={submitting}
        onConfirm={handleSubmitForApproval}
      />
    </>
  );
}
