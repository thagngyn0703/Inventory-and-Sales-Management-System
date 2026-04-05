import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { useToast } from '../../contexts/ToastContext';
import {
    getSupplierPayableSummary,
    getSupplierPayables,
    createSupplierPayment,
    getSupplierPaymentHistory,
} from '../../services/supplierPayablesApi';
import { getSuppliers } from '../../services/suppliersApi';
import { Banknote, Loader2, CreditCard, History } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_LABEL = { open: 'Chưa trả', partial: 'Trả một phần', paid: 'Đã trả', cancelled: 'Đã hủy' };
const METHOD_LABEL = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', e_wallet: 'Ví điện tử', other: 'Khác' };

const PAY_MODAL_INITIAL = {
    supplier_id: '',
    total_amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    reference_code: '',
    note: '',
};

function statusPill(status, isOverdue) {
    if (isOverdue) return 'border-red-300 bg-red-100 text-red-900 ring-1 ring-red-200';
    if (status === 'paid') return 'border-emerald-200 bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200';
    if (status === 'partial') return 'border-amber-200 bg-amber-100 text-amber-900 ring-1 ring-amber-200';
    if (status === 'open') return 'border-orange-200 bg-orange-100 text-orange-900 ring-1 ring-orange-200';
    return 'border-slate-200 bg-slate-100 text-slate-700';
}

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

export default function ManagerSupplierPayables() {
    const navigate = useNavigate();
    const { toast } = useToast();

    // Summary
    const [summary, setSummary] = useState(null);
    const [loadingSummary, setLoadingSummary] = useState(true);

    // List payables
    const [payables, setPayables] = useState([]);
    const [payTotal, setPayTotal] = useState(0);
    const [payTotalPages, setPayTotalPages] = useState(1);
    const [payPage, setPayPage] = useState(1);
    const [filterSupplierId, setFilterSupplierId] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [loadingPayables, setLoadingPayables] = useState(true);

    // Payment history
    const [payments, setPayments] = useState([]);
    const [payHTotal, setPayHTotal] = useState(0);
    const [payHPage, setPayHPage] = useState(1);
    const [payHTotalPages, setPayHTotalPages] = useState(1);
    const [loadingPayH, setLoadingPayH] = useState(false);

    // Suppliers
    const [suppliers, setSuppliers] = useState([]);

    // Tab
    const [tab, setTab] = useState('payables');

    // Payment modal
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [payForm, setPayForm] = useState(PAY_MODAL_INITIAL);
    const [paySubmitting, setPaySubmitting] = useState(false);
    const [loadingModalDebt, setLoadingModalDebt] = useState(false);

    const loadSummary = useCallback(async (opts = {}) => {
        const silent = Boolean(opts.silent);
        if (!silent) setLoadingSummary(true);
        try { const d = await getSupplierPayableSummary(); setSummary(d); }
        catch (e) { toast(e.message, 'error'); }
        finally { if (!silent) setLoadingSummary(false); }
    }, [toast]);

    const modalSupplierRemaining = useMemo(() => {
        if (!payForm.supplier_id || loadingModalDebt) return null;
        if (!summary?.by_supplier) return null;
        const row = summary.by_supplier.find((b) => String(b.supplier_id) === String(payForm.supplier_id));
        if (row) return Math.max(0, Number(row.total_remaining) || 0);
        return 0;
    }, [payForm.supplier_id, summary, loadingModalDebt]);

    const modalHasPayableDebt =
        Boolean(payForm.supplier_id)
        && !loadingModalDebt
        && modalSupplierRemaining != null
        && modalSupplierRemaining > 0;

    // Khi mở modal: làm mới tổng hợp nợ (không làm “đang tải” cả trang)
    useEffect(() => {
        if (!payModalOpen) {
            setLoadingModalDebt(false);
            return;
        }
        setPayForm({ ...PAY_MODAL_INITIAL, payment_date: new Date().toISOString().split('T')[0] });
        let cancelled = false;
        setLoadingModalDebt(true);
        (async () => {
            try {
                const d = await getSupplierPayableSummary();
                if (!cancelled) setSummary(d);
            } catch (e) {
                if (!cancelled) toast(e.message, 'error');
            } finally {
                if (!cancelled) setLoadingModalDebt(false);
            }
        })();
        return () => { cancelled = true; };
    }, [payModalOpen, toast]);

    const loadPayables = useCallback(async () => {
        setLoadingPayables(true);
        try {
            const d = await getSupplierPayables({ supplier_id: filterSupplierId || undefined, status: filterStatus || undefined, page: payPage, limit: 15 });
            setPayables(d.payables || []);
            setPayTotal(d.total ?? 0);
            setPayTotalPages(d.totalPages ?? 1);
        } catch (e) { toast(e.message, 'error'); }
        finally { setLoadingPayables(false); }
    }, [filterSupplierId, filterStatus, payPage, toast]);

    const loadPaymentHistory = useCallback(async () => {
        setLoadingPayH(true);
        try {
            const d = await getSupplierPaymentHistory({ supplier_id: filterSupplierId || undefined, page: payHPage, limit: 15 });
            setPayments(d.payments || []);
            setPayHTotal(d.total ?? 0);
            setPayHTotalPages(d.totalPages ?? 1);
        } catch (e) { toast(e.message, 'error'); }
        finally { setLoadingPayH(false); }
    }, [filterSupplierId, payHPage, toast]);

    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { loadPayables(); }, [loadPayables]);
    useEffect(() => { if (tab === 'history') loadPaymentHistory(); }, [tab, loadPaymentHistory]);
    useEffect(() => {
        getSuppliers(1, 200).then((d) => setSuppliers(d.suppliers || [])).catch(() => {});
    }, []);

    const handlePay = async (e) => {
        e.preventDefault();
        if (!payForm.supplier_id) { toast('Vui lòng chọn nhà cung cấp', 'error'); return; }
        if (!modalHasPayableDebt || modalSupplierRemaining == null) {
            toast('Không có khoản nợ để thanh toán với nhà cung cấp này.', 'error');
            return;
        }
        const amt = Number(payForm.total_amount);
        if (!amt || amt <= 0) { toast('Vui lòng nhập số tiền thanh toán', 'error'); return; }
        if (amt > modalSupplierRemaining + 0.0001) {
            toast(`Số tiền không được vượt quá số còn nợ (${fmt(modalSupplierRemaining)}).`, 'error');
            return;
        }
        setPaySubmitting(true);
        try {
            await createSupplierPayment({ ...payForm, total_amount: amt });
            toast('Đã ghi nhận thanh toán thành công', 'success');
            setPayModalOpen(false);
            setPayForm({ ...PAY_MODAL_INITIAL, payment_date: new Date().toISOString().split('T')[0] });
            loadSummary();
            loadPayables();
            if (tab === 'history') loadPaymentHistory();
        } catch (err) { toast(err.message || 'Lỗi ghi nhận thanh toán', 'error'); }
        finally { setPaySubmitting(false); }
    };

    const closePayModal = () => {
        setPayModalOpen(false);
        setPayForm({ ...PAY_MODAL_INITIAL, payment_date: new Date().toISOString().split('T')[0] });
    };

    return (
        <ManagerPageFrame showNotificationBell={false}>
            <StaffPageShell
                eyebrow="Mua hàng & NCC"
                eyebrowIcon={CreditCard}
                title="Công nợ nhà cung cấp"
                subtitle="Theo dõi các khoản phải trả và lịch sử thanh toán."
                headerActions={
                    <Button type="button" className="gap-2" onClick={() => setPayModalOpen(true)}>
                        <Banknote className="h-4 w-4" />
                        Ghi nhận thanh toán
                    </Button>
                }
            >
                {/* ── Cards tổng hợp ── */}
                {loadingSummary ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
                ) : summary && (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
                        {[
                            { label: 'Tổng còn nợ', value: fmt(summary.total_remaining), color: '#dc2626' },
                            { label: 'Quá hạn', value: fmt(summary.overdue_remaining), color: '#ea580c' },
                            { label: 'Số phiếu mở', value: summary.open_count, color: '#0369a1' },
                            { label: 'NCC đang nợ', value: summary.supplier_count, color: '#7c3aed' },
                        ].map((c) => (
                            <div key={c.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{c.label}</p>
                                <p className="text-xl font-bold" style={{ color: c.color }}>{c.value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Filter bar ── */}
                <Card className="mb-4 border-slate-200/80 shadow-sm">
                    <CardContent className="flex flex-wrap gap-3 p-4">
                        <select
                            value={filterSupplierId}
                            onChange={(e) => { setFilterSupplierId(e.target.value); setPayPage(1); setPayHPage(1); }}
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200 focus:ring-2"
                        >
                            <option value="">Tất cả nhà cung cấp</option>
                            {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select>
                        {tab === 'payables' && (
                            <select
                                value={filterStatus}
                                onChange={(e) => { setFilterStatus(e.target.value); setPayPage(1); }}
                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200 focus:ring-2"
                            >
                                <option value="">Tất cả trạng thái</option>
                                <option value="open">Chưa trả</option>
                                <option value="partial">Trả một phần</option>
                                <option value="paid">Đã trả</option>
                            </select>
                        )}
                        {/* Tabs */}
                        <div className="ml-auto flex items-center gap-2">
                            <button type="button" onClick={() => setTab('payables')} className={cn('rounded-lg px-4 py-2 text-sm font-medium transition', tab === 'payables' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
                                Khoản nợ
                            </button>
                            <button type="button" onClick={() => setTab('history')} className={cn('rounded-lg px-4 py-2 text-sm font-medium transition', tab === 'history' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}>
                                <History className="inline h-4 w-4 mr-1" />Lịch sử thanh toán
                            </button>
                        </div>
                    </CardContent>
                </Card>

                {/* ── Danh sách khoản nợ ── */}
                {tab === 'payables' && (
                    <Card className="border-slate-200/80 shadow-sm">
                        <CardContent className="p-0">
                            {loadingPayables ? (
                                <div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
                            ) : payables.length === 0 ? (
                                <p className="py-14 text-center text-slate-500">Không có khoản nợ nào.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[800px] text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase text-slate-500">
                                                <th className="px-4 py-3">Nhà cung cấp</th>
                                                <th className="px-4 py-3">Phiếu nhập</th>
                                                <th className="px-4 py-3 text-right">Tổng phiếu</th>
                                                <th className="px-4 py-3 text-right">Đã trả</th>
                                                <th className="px-4 py-3 text-right">Còn nợ</th>
                                                <th className="px-4 py-3">Hạn trả</th>
                                                <th className="px-4 py-3">Trạng thái</th>
                                                <th className="px-4 py-3" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {payables.map((p) => (
                                                <tr key={p._id} className="hover:bg-slate-50/60">
                                                    <td className="px-4 py-3 font-medium">{p.supplier_id?.name ?? '—'}</td>
                                                    <td className="px-4 py-3">
                                                        <button
                                                            type="button"
                                                            className="font-mono text-sky-700 hover:underline text-xs"
                                                            onClick={() => navigate(`/manager/receipts/${p.source_id?._id ?? p.source_id}`)}
                                                        >
                                                            {(p.source_id?._id ?? String(p.source_id))?.slice(-8).toUpperCase()}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{fmt(p.total_amount)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{fmt(p.paid_amount)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-600">{fmt(p.remaining_amount)}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {p.due_date ? (
                                                            <span className={cn(p.is_overdue ? 'font-semibold text-red-600' : 'text-slate-700')}>
                                                                {fmtDate(p.due_date)}{p.is_overdue && ' ⚠️'}
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusPill(p.status, p.is_overdue))}>
                                                            {p.is_overdue ? 'Quá hạn' : STATUS_LABEL[p.status] ?? p.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            className="text-xs text-sky-700 hover:underline"
                                                            onClick={() => navigate(`/manager/supplier-payables/${p._id}`)}
                                                        >
                                                            Chi tiết
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {payTotalPages > 1 && (
                                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                                    <span>Trang {payPage}/{payTotalPages} ({payTotal} phiếu)</span>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" disabled={payPage <= 1} onClick={() => setPayPage(p => p - 1)}>Trước</Button>
                                        <Button variant="outline" size="sm" disabled={payPage >= payTotalPages} onClick={() => setPayPage(p => p + 1)}>Sau</Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* ── Lịch sử thanh toán ── */}
                {tab === 'history' && (
                    <Card className="border-slate-200/80 shadow-sm">
                        <CardContent className="p-0">
                            {loadingPayH ? (
                                <div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
                            ) : payments.length === 0 ? (
                                <p className="py-14 text-center text-slate-500">Chưa có lần thanh toán nào.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[700px] text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase text-slate-500">
                                                <th className="px-4 py-3">Nhà cung cấp</th>
                                                <th className="px-4 py-3">Ngày thanh toán</th>
                                                <th className="px-4 py-3 text-right">Số tiền</th>
                                                <th className="px-4 py-3">Hình thức</th>
                                                <th className="px-4 py-3">Mã tham chiếu</th>
                                                <th className="px-4 py-3">Người ghi</th>
                                                <th className="px-4 py-3">Ghi chú</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {payments.map((pm) => (
                                                <tr key={pm._id} className="hover:bg-slate-50/60">
                                                    <td className="px-4 py-3 font-medium">{pm.supplier_id?.name ?? '—'}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(pm.payment_date)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{fmt(pm.total_amount)}</td>
                                                    <td className="px-4 py-3">{METHOD_LABEL[pm.payment_method] ?? pm.payment_method}</td>
                                                    <td className="px-4 py-3 font-mono text-xs">{pm.reference_code || '—'}</td>
                                                    <td className="px-4 py-3">{pm.created_by?.fullName || pm.created_by?.email || '—'}</td>
                                                    <td className="px-4 py-3 max-w-[180px] truncate text-slate-500">{pm.note || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {payHTotalPages > 1 && (
                                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                                    <span>Trang {payHPage}/{payHTotalPages} ({payHTotal} lần)</span>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" disabled={payHPage <= 1} onClick={() => setPayHPage(p => p - 1)}>Trước</Button>
                                        <Button variant="outline" size="sm" disabled={payHPage >= payHTotalPages} onClick={() => setPayHPage(p => p + 1)}>Sau</Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </StaffPageShell>

            {/* ── Modal ghi nhận thanh toán ── */}
            {payModalOpen && (
                <div
                    role="presentation"
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onClick={(e) => { if (e.target === e.currentTarget && !paySubmitting) closePayModal(); }}
                >
                    <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
                        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Ghi nhận thanh toán NCC</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Nhà cung cấp <span style={{ color: '#ef4444' }}>*</span></label>
                                <select
                                    value={payForm.supplier_id}
                                    onChange={(e) => setPayForm((f) => ({
                                        ...f,
                                        supplier_id: e.target.value,
                                        total_amount: '',
                                        payment_method: f.payment_method === 'bank_transfer' || f.payment_method === 'cash' ? f.payment_method : 'cash',
                                    }))}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                                >
                                    <option value="">— Chọn nhà cung cấp —</option>
                                    {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                                </select>
                            </div>

                            {payForm.supplier_id && loadingModalDebt && (
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                    Đang kiểm tra công nợ với nhà cung cấp…
                                </div>
                            )}

                            {payForm.supplier_id && !loadingModalDebt && modalSupplierRemaining === 0 && (
                                <div
                                    style={{
                                        borderRadius: 12,
                                        border: '1px solid #fde68a',
                                        background: '#fffbeb',
                                        padding: '14px 16px',
                                        fontSize: 14,
                                        color: '#92400e',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    Bạn <strong>không có khoản nợ</strong> nào với nhà cung cấp này (hoặc đã thanh toán đủ). Không cần ghi nhận thanh toán.
                                </div>
                            )}

                            {modalHasPayableDebt && (
                                <>
                                    <div
                                        style={{
                                            borderRadius: 12,
                                            border: '1px solid #bae6fd',
                                            background: '#f0f9ff',
                                            padding: '14px 16px',
                                            fontSize: 15,
                                            color: '#0c4a6e',
                                        }}
                                    >
                                        Bạn còn nợ nhà cung cấp này:{' '}
                                        <strong style={{ fontSize: 17, color: '#0369a1' }}>{fmt(modalSupplierRemaining)}</strong>
                                    </div>
                                    <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                        <div>
                                            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Số tiền thanh toán (đ) <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input
                                                type="number"
                                                min="1"
                                                max={modalSupplierRemaining}
                                                step="1"
                                                value={payForm.total_amount}
                                                onChange={(e) => setPayForm((f) => ({ ...f, total_amount: e.target.value }))}
                                                placeholder={`Tối đa ${fmt(modalSupplierRemaining)}`}
                                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div>
                                                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Ngày thanh toán</label>
                                                <input
                                                    type="date"
                                                    value={payForm.payment_date}
                                                    onChange={(e) => setPayForm((f) => ({ ...f, payment_date: e.target.value }))}
                                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Hình thức</label>
                                                <select
                                                    value={payForm.payment_method === 'bank_transfer' ? 'bank_transfer' : 'cash'}
                                                    onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                                                >
                                                    <option value="cash">Tiền mặt</option>
                                                    <option value="bank_transfer">Chuyển khoản</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Mã tham chiếu (nếu có)</label>
                                            <input
                                                type="text"
                                                value={payForm.reference_code}
                                                onChange={(e) => setPayForm((f) => ({ ...f, reference_code: e.target.value }))}
                                                placeholder="Mã giao dịch, số biên lai…"
                                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Ghi chú</label>
                                            <textarea
                                                rows={2}
                                                value={payForm.note}
                                                onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                                                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', resize: 'vertical' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                                            <Button type="button" variant="outline" onClick={closePayModal} disabled={paySubmitting}>Đóng</Button>
                                            <Button type="submit" disabled={paySubmitting}>
                                                {paySubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                                Ghi nhận
                                            </Button>
                                        </div>
                                    </form>
                                </>
                            )}

                            {!modalHasPayableDebt && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                                    <Button type="button" variant="outline" onClick={closePayModal} disabled={paySubmitting}>Đóng</Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </ManagerPageFrame>
    );
}
