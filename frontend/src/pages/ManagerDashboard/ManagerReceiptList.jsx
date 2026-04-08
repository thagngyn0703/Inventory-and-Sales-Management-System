import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { ClipboardList } from 'lucide-react';
import { getGoodsReceipts, setGoodsReceiptStatus } from '../../services/goodsReceiptsApi';
import { getSuppliers } from '../../services/suppliersApi';
import { useToast } from '../../contexts/ToastContext';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';
import './ManagerDashboard.css';

function statusBadgeClass(status) {
  if (status === 'pending') return 'bg-amber-100 text-amber-900 border-amber-200/80';
  if (status === 'approved') return 'bg-emerald-100 text-emerald-900 border-emerald-200/80';
  return 'bg-red-100 text-red-900 border-red-200/80';
}

export default function ManagerReceiptList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortByPrice, setSortByPrice] = useState(null);
  const [suppliers, setSuppliers] = useState([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGoodsReceipts({
        status: filterStatus || undefined,
        supplier_id: filterSupplierId || undefined,
        page: 1,
        limit: 200,
      });
      const filtered = (data.goodsReceipts || []).filter((r) => r.status !== 'draft');
      setReceipts(filtered);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách phiếu nhập kho');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSupplierId]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const data = await getSuppliers(1, 1000, '', 'all');
      setSuppliers(data.suppliers || []);
    } catch (err) {
      toast(err.message || 'Không thể tải danh sách nhà cung cấp', 'error');
    }
  }, [toast]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleSortPrice = () => {
    if (sortByPrice === null) setSortByPrice('asc');
    else if (sortByPrice === 'asc') setSortByPrice('desc');
    else setSortByPrice(null);
  };

  const filteredAndSortedReceipts = useMemo(() => {
    let result = receipts.filter((r) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const code = r._id.substring(r._id.length - 6).toLowerCase();
      const supplier = (r.supplier_id?.name || '').toLowerCase();
      const creator = (r.received_by?.fullName || '').toLowerCase();
      return code.includes(term) || supplier.includes(term) || creator.includes(term);
    });
    result.sort((a, b) => {
      if (sortByPrice === 'asc') return Number(a.total_amount) - Number(b.total_amount);
      if (sortByPrice === 'desc') return Number(b.total_amount) - Number(a.total_amount);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return result;
  }, [receipts, searchTerm, sortByPrice]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('vi-VN');
  };

  const openConfirm = (type, id) => {
    setRejectionReason('');
    setPendingAction({ type, id });
    setConfirmOpen(true);
  };

  const runConfirmedAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'reject' && !rejectionReason.trim()) {
      toast('Vui lòng nhập lý do từ chối', 'error');
      return;
    }
    setConfirmLoading(true);
    try {
      const next = pendingAction.type === 'approve' ? 'approved' : 'rejected';
      await setGoodsReceiptStatus(pendingAction.id, next, rejectionReason.trim() || undefined);
      toast(
        next === 'approved' ? 'Đã duyệt phiếu nhập kho.' : 'Đã từ chối phiếu nhập kho.',
        'success'
      );
      setConfirmOpen(false);
      setPendingAction(null);
      setRejectionReason('');
      fetchReceipts();
    } catch (err) {
      toast(err.message || 'Thao tác thất bại', 'error');
    } finally {
      setConfirmLoading(false);
    }
  };

  const sortLabel =
    sortByPrice === 'asc'
      ? 'Giá trị: thấp → cao'
      : sortByPrice === 'desc'
        ? 'Giá trị: cao → thấp'
        : 'Mặc định (mới nhất)';

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Kho & nhập hàng"
        eyebrowIcon={ClipboardList}
        title="Duyệt phiếu nhập kho"
        subtitle="Phê duyệt hoặc từ chối phiếu từ nhân viên kho."
      >
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
            )}

            <Card className="border-slate-200/80 shadow-sm">
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Mã phiếu, NCC, người tạo..."
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={filterSupplierId}
                      onChange={(e) => setFilterSupplierId(e.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                    >
                      <option value="">Tất cả nhà cung cấp</option>
                      {suppliers.map((s) => (
                        <option key={s._id} value={s._id}>{s.name}</option>
                      ))}
                    </select>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                    >
                      <option value="">Tất cả trạng thái</option>
                      <option value="pending">Chờ duyệt</option>
                      <option value="approved">Đã duyệt</option>
                      <option value="rejected">Từ chối</option>
                    </select>
                    <Button type="button" variant="outline" className="h-11 gap-2" onClick={handleSortPrice}>
                      <SlidersHorizontal className="h-4 w-4" />
                      {sortLabel}
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center py-16 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : filteredAndSortedReceipts.length === 0 ? (
                  <p className="py-12 text-center text-slate-500">Không có phiếu nhập kho nào phù hợp.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full min-w-[800px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase text-slate-500">
                          <th className="px-4 py-3">Mã phiếu</th>
                          <th className="px-4 py-3">Ngày tạo</th>
                          <th className="px-4 py-3">Nhà cung cấp</th>
                          <th className="px-4 py-3">Người tạo</th>
                          <th className="px-4 py-3 text-right">Tổng tiền</th>
                          <th className="px-4 py-3">Trạng thái</th>
                          <th className="px-4 py-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredAndSortedReceipts.map((receipt) => (
                          <tr key={receipt._id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                className="font-mono font-semibold text-sky-700 hover:underline"
                                onClick={() => navigate(`/manager/receipts/${receipt._id}`)}
                              >
                                {receipt._id.substring(receipt._id.length - 6).toUpperCase()}
                              </button>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(receipt.created_at)}</td>
                            <td className="max-w-[160px] truncate px-4 py-3 font-medium">{receipt.supplier_id?.name || '—'}</td>
                            <td className="max-w-[120px] truncate px-4 py-3 text-slate-600">
                              {receipt.received_by?.fullName || '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {Number(receipt.total_amount).toLocaleString('vi-VN')} đ
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={cn('border font-medium', statusBadgeClass(receipt.status))}>
                                {receipt.status === 'pending'
                                  ? 'Chờ duyệt'
                                  : receipt.status === 'approved'
                                    ? 'Đã duyệt'
                                    : 'Từ chối'}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="default"
                                className="mr-2 h-9"
                                onClick={() => navigate(`/manager/receipts/${receipt._id}`)}
                              >
                                Chi tiết
                              </Button>
                              {receipt.status === 'pending' && (
                                <>
                                  <Button
                                    type="button"
                                    size="default"
                                    className="mr-2 h-9 bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => openConfirm('approve', receipt._id)}
                                  >
                                    Duyệt
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="warning"
                                    className="h-9"
                                    onClick={() => openConfirm('reject', receipt._id)}
                                  >
                                    Từ chối
                                  </Button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
      </StaffPageShell>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) { setPendingAction(null); setRejectionReason(''); }
        }}
        title={pendingAction?.type === 'approve' ? 'Duyệt phiếu nhập kho?' : 'Từ chối phiếu nhập?'}
        description={
          pendingAction?.type === 'approve'
            ? 'Kho hàng sẽ được cập nhật theo số lượng và giá trên phiếu.'
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span>Vui lòng nhập lý do từ chối để nhân viên biết cần điều chỉnh gì.</span>
                <textarea
                  autoFocus
                  rows={3}
                  placeholder="VD: Sai số lượng, thiếu chứng từ, sản phẩm không hợp lệ..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 14,
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              </div>
            )
        }
        confirmLabel={pendingAction?.type === 'approve' ? 'Duyệt nhập kho' : 'Xác nhận từ chối'}
        confirmVariant={pendingAction?.type === 'reject' ? 'destructive' : 'default'}
        loading={confirmLoading}
        onConfirm={runConfirmedAction}
      />
    </ManagerPageFrame>
  );
}
