import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { useToast } from '../../contexts/ToastContext';
import { getSupplierPayable } from '../../services/supplierPayablesApi';
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_LABEL = { open: 'Chưa trả', partial: 'Trả một phần', paid: 'Đã trả', cancelled: 'Đã hủy' };
const METHOD_LABEL = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', e_wallet: 'Ví điện tử', other: 'Khác' };

function statusPill(status, isOverdue) {
    if (isOverdue) return 'border-red-300 bg-red-100 text-red-900';
    if (status === 'paid') return 'border-emerald-200 bg-emerald-100 text-emerald-900';
    if (status === 'partial') return 'border-amber-200 bg-amber-100 text-amber-900';
    if (status === 'open') return 'border-orange-200 bg-orange-100 text-orange-900';
    return 'border-slate-200 bg-slate-100 text-slate-700';
}

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
const fmtDT = (d) => d ? new Date(d).toLocaleString('vi-VN') : '—';

export default function ManagerSupplierPayableDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const d = await getSupplierPayable(id);
            setData(d);
        } catch (e) {
            toast(e.message || 'Không thể tải chi tiết', 'error');
        } finally {
            setLoading(false);
        }
    }, [id, toast]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <ManagerPageFrame showNotificationBell={false}>
                <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
            </ManagerPageFrame>
        );
    }
    if (!data) return null;

    const { payable, allocations } = data;
    const progressPct = payable.total_amount > 0 ? Math.min(100, (payable.paid_amount / payable.total_amount) * 100) : 0;

    return (
        <ManagerPageFrame showNotificationBell={false}>
            <StaffPageShell
                eyebrow="Mua hàng & NCC"
                eyebrowIcon={CreditCard}
                title="Chi tiết khoản phải trả"
                subtitle={`NCC: ${payable.supplier_id?.name ?? '—'}`}
                headerActions={
                    <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4" /> Quay lại
                    </Button>
                }
            >
                {/* ── Tổng quan ── */}
                <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold text-slate-700">Thông tin khoản nợ</h2>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div>
                            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Nhà cung cấp</p>
                            <p className="font-semibold text-sm">{payable.supplier_id?.name ?? '—'}</p>
                            {payable.supplier_id?.phone && <p className="text-xs text-slate-500">{payable.supplier_id.phone}</p>}
                        </div>
                        <div>
                            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Phiếu nhập</p>
                            <button
                                type="button"
                                className="font-mono text-sky-700 hover:underline text-xs font-semibold"
                                onClick={() => navigate(`/manager/receipts/${payable.source_id?._id ?? payable.source_id}`)}
                            >
                                {String(payable.source_id?._id ?? payable.source_id).slice(-8).toUpperCase()}
                            </button>
                        </div>
                        <div>
                            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Trạng thái</p>
                            <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusPill(payable.status, payable.is_overdue))}>
                                {payable.is_overdue ? 'Quá hạn' : STATUS_LABEL[payable.status] ?? payable.status}
                            </span>
                        </div>
                        <div>
                            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Hạn thanh toán</p>
                            <p className={cn('text-sm font-medium', payable.is_overdue ? 'text-red-600' : '')}>
                                {fmtDate(payable.due_date)}{payable.is_overdue && ' ⚠️'}
                            </p>
                        </div>
                    </div>

                    {/* Progress thanh toán */}
                    <div className="mt-5 border-t border-slate-100 pt-4">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-slate-600">Đã thanh toán</span>
                            <span className="font-semibold">{fmt(payable.paid_amount)} / {fmt(payable.total_amount)}</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100">
                            <div className="h-2.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                            <span>{progressPct.toFixed(1)}% đã trả</span>
                            <span className="font-semibold text-red-600">Còn nợ: {fmt(payable.remaining_amount)}</span>
                        </div>
                    </div>
                </div>

                {/* ── Lịch sử thanh toán ── */}
                <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                        <h2 className="text-base font-semibold text-slate-700">Lịch sử thanh toán ({allocations.length})</h2>
                    </div>
                    {allocations.length === 0 ? (
                        <p className="py-10 text-center text-slate-500 text-sm">Chưa có lần thanh toán nào.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase text-slate-500">
                                        <th className="px-4 py-3 text-left">Ngày</th>
                                        <th className="px-4 py-3 text-right">Số tiền phân bổ</th>
                                        <th className="px-4 py-3 text-left">Hình thức</th>
                                        <th className="px-4 py-3 text-left">Mã tham chiếu</th>
                                        <th className="px-4 py-3 text-left">Người ghi</th>
                                        <th className="px-4 py-3 text-left">Ghi chú</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {allocations.map((a) => (
                                        <tr key={a._id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 whitespace-nowrap">{fmtDT(a.payment_id?.payment_date)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{fmt(a.amount)}</td>
                                            <td className="px-4 py-3">{METHOD_LABEL[a.payment_id?.payment_method] ?? a.payment_id?.payment_method ?? '—'}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{a.payment_id?.reference_code || '—'}</td>
                                            <td className="px-4 py-3">{a.payment_id?.created_by?.fullName || a.payment_id?.created_by?.email || '—'}</td>
                                            <td className="px-4 py-3 max-w-[180px] truncate text-slate-500">{a.payment_id?.note || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </StaffPageShell>
        </ManagerPageFrame>
    );
}
