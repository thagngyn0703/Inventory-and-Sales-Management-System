import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/currencyInput';

const STATUS_LABEL = { open: 'Chưa trả', partial: 'Trả một phần', paid: 'Đã trả', cancelled: 'Đã hủy' };
const METHOD_LABEL = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', e_wallet: 'Ví điện tử', other: 'Khác' };
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');
const PAGE_SIZE = 8;

const PAY_MODAL_INITIAL = {
    supplier_id: '',
    total_amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
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
const pagingBtnClass =
    'h-8 rounded-full border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none';
const normalizeSearchText = (v) =>
    String(v || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
const normalizeDigits = (v) => String(v || '').replace(/\D/g, '');
const toQrSrc = (url) => {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`;
};

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
    const [payablesSummary, setPayablesSummary] = useState(null);

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
    const [modalSupplierQuery, setModalSupplierQuery] = useState('');
    const [modalSupplierOptions, setModalSupplierOptions] = useState([]);
    const [loadingModalSupplierOptions, setLoadingModalSupplierOptions] = useState(false);
    const [modalSupplierDropdownOpen, setModalSupplierDropdownOpen] = useState(false);
    const [modalOpenPayables, setModalOpenPayables] = useState([]);
    const [loadingModalPayables, setLoadingModalPayables] = useState(false);
    const [selectedPayableIds, setSelectedPayableIds] = useState([]);
    const modalSupplierPickerRef = useRef(null);

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
    const modalSupplier = useMemo(
        () => suppliers.find((s) => String(s._id) === String(payForm.supplier_id)) || null,
        [suppliers, payForm.supplier_id]
    );

    const modalHasPayableDebt =
        Boolean(payForm.supplier_id)
        && !loadingModalDebt
        && modalSupplierRemaining != null
        && modalSupplierRemaining > 0;

    const selectedModalPayables = useMemo(
        () => modalOpenPayables.filter((p) => selectedPayableIds.includes(String(p._id))),
        [modalOpenPayables, selectedPayableIds]
    );
    const selectedRemainingTotal = useMemo(
        () => selectedModalPayables.reduce((sum, p) => sum + (Number(p.remaining_amount) || 0), 0),
        [selectedModalPayables]
    );
    const allModalPayablesSelected = useMemo(
        () => modalOpenPayables.length > 0 && selectedPayableIds.length === modalOpenPayables.length,
        [modalOpenPayables, selectedPayableIds]
    );

    // Khi mở modal: làm mới tổng hợp nợ (không làm “đang tải” cả trang)
    useEffect(() => {
        if (!payModalOpen) {
            setLoadingModalDebt(false);
            setLoadingModalSupplierOptions(false);
            setModalSupplierDropdownOpen(false);
            setLoadingModalPayables(false);
            setModalOpenPayables([]);
            setSelectedPayableIds([]);
            return;
        }
        setPayForm({ ...PAY_MODAL_INITIAL, payment_date: new Date().toISOString().split('T')[0] });
        setModalSupplierQuery('');
        let cancelled = false;
        setLoadingModalDebt(true);
        setLoadingModalSupplierOptions(false);
        setModalSupplierOptions(suppliers);
        (async () => {
            try {
                const d = await getSupplierPayableSummary();
                if (!cancelled) {
                    setSummary(d);
                }
            } catch (e) {
                if (!cancelled) toast(e.message, 'error');
            } finally {
                if (!cancelled) {
                    setLoadingModalDebt(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [payModalOpen, suppliers, toast]);

    useEffect(() => {
        if (!payModalOpen) return undefined;
        const onDocMouseDown = (e) => {
            if (!modalSupplierPickerRef.current) return;
            if (!modalSupplierPickerRef.current.contains(e.target)) {
                setModalSupplierDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [payModalOpen]);

    // Search nhà cung cấp realtime trong modal (không cần Enter)
    useEffect(() => {
        if (!payModalOpen) return undefined;
        const q = String(modalSupplierQuery || '').trim();
        const timer = setTimeout(() => {
            if (!q) {
                setModalSupplierOptions(suppliers);
                return;
            }
            const queryText = normalizeSearchText(q);
            const queryDigits = normalizeDigits(q);
            setModalSupplierOptions(
                suppliers.filter((s) => {
                    const haystack = normalizeSearchText(
                        `${s.name || ''} ${s.phone || ''} ${s.email || ''} ${s.code || ''} ${s.tax_code || ''}`
                    );
                    if (haystack.includes(queryText)) return true;
                    if (!queryDigits) return false;
                    return normalizeDigits(s.phone || '').includes(queryDigits);
                })
            );
        }, 250);
        return () => clearTimeout(timer);
    }, [modalSupplierQuery, payModalOpen, suppliers]);

    useEffect(() => {
        if (!payModalOpen || !payForm.supplier_id) {
            setLoadingModalPayables(false);
            setModalOpenPayables([]);
            setSelectedPayableIds([]);
            return;
        }
        let cancelled = false;
        setLoadingModalPayables(true);
        (async () => {
            try {
                const d = await getSupplierPayables({
                    supplier_id: payForm.supplier_id,
                    page: 1,
                    limit: 100,
                });
                if (cancelled) return;
                const list = (d?.payables || []).filter((p) =>
                    ['open', 'partial'].includes(String(p.status)) && Number(p.remaining_amount || 0) > 0
                );
                setModalOpenPayables(list);
                setSelectedPayableIds(list.map((p) => String(p._id)));
            } catch (e) {
                if (!cancelled) {
                    toast(e.message || 'Không thể tải danh sách khoản nợ của nhà cung cấp', 'error');
                    setModalOpenPayables([]);
                    setSelectedPayableIds([]);
                }
            } finally {
                if (!cancelled) setLoadingModalPayables(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [payModalOpen, payForm.supplier_id, toast]);

    const loadPayables = useCallback(async () => {
        setLoadingPayables(true);
        try {
            const d = await getSupplierPayables({ supplier_id: filterSupplierId || undefined, status: filterStatus || undefined, page: payPage, limit: PAGE_SIZE });
            setPayables(d.payables || []);
            setPayTotal(d.total ?? 0);
            setPayTotalPages(d.totalPages ?? 1);
            setPayablesSummary(d.summary || null);
        } catch (e) { toast(e.message, 'error'); }
        finally { setLoadingPayables(false); }
    }, [filterSupplierId, filterStatus, payPage, toast]);

    const loadPaymentHistory = useCallback(async () => {
        setLoadingPayH(true);
        try {
            const d = await getSupplierPaymentHistory({ supplier_id: filterSupplierId || undefined, page: payHPage, limit: PAGE_SIZE });
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
        getSuppliers(1, 1000, '', 'all')
            .then((d) => {
                const list = d.suppliers || [];
                setSuppliers(list);
                setModalSupplierOptions(list);
            })
            .catch(() => {});
    }, []);

    const handlePay = async (e) => {
        e.preventDefault();
        if (!payForm.supplier_id) { toast('Vui lòng chọn nhà cung cấp', 'error'); return; }
        if (!modalHasPayableDebt || modalSupplierRemaining == null) {
            toast('Không có khoản nợ để thanh toán với nhà cung cấp này.', 'error');
            return;
        }
        if (selectedPayableIds.length === 0) {
            toast('Vui lòng chọn ít nhất một đơn nợ cần thanh toán.', 'error');
            return;
        }
        const amt = parseCurrencyInput(payForm.total_amount);
        if (!amt || amt <= 0) { toast('Vui lòng nhập số tiền thanh toán', 'error'); return; }
        if (amt - selectedRemainingTotal > 0.0001) {
            toast(`Số tiền không được vượt tổng nợ các đơn đã chọn (${fmt(selectedRemainingTotal)}).`, 'error');
            return;
        }
        setPaySubmitting(true);
        try {
            await createSupplierPayment({ ...payForm, total_amount: amt, payable_ids: selectedPayableIds });
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
        setModalOpenPayables([]);
        setSelectedPayableIds([]);
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
                            onChange={(e) => {
                                setFilterSupplierId(e.target.value);
                                setPayPage(1);
                                setPayHPage(1);
                            }}
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
                    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
                        <CardContent className="p-0">
                            {loadingPayables ? (
                                <div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
                            ) : payables.length === 0 ? (
                                <p className="py-14 text-center text-slate-500">Không có khoản nợ nào.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                                    <table className="w-full min-w-[800px] text-sm text-slate-700">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                <th className="px-4 py-3">Nhà cung cấp</th>
                                                <th className="px-4 py-3">Phiếu nhập</th>
                                                <th className="px-4 py-3">Ngày tạo</th>
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
                                                <tr key={p._id} className="transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-teal-50/40">
                                                    <td className="px-4 py-3.5 font-medium text-slate-900">{p.supplier_id?.name ?? '—'}</td>
                                                    <td className="px-4 py-3.5">
                                                        <button
                                                            type="button"
                                                            className="font-mono text-xs font-semibold text-sky-700 hover:text-sky-800 hover:underline"
                                                            onClick={() => navigate(`/manager/receipts/${p.source_id?._id ?? p.source_id}`)}
                                                        >
                                                            {(p.source_id?._id ?? String(p.source_id))?.slice(-8).toUpperCase()}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{fmtDate(p.created_at)}</td>
                                                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-800">{fmt(p.total_amount)}</td>
                                                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-emerald-700">{fmt(p.paid_amount)}</td>
                                                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-red-600">{fmt(p.remaining_amount)}</td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        {p.due_date ? (
                                                            <span className={cn(p.is_overdue ? 'font-semibold text-red-600' : 'text-slate-700')}>
                                                                {fmtDate(p.due_date)}{p.is_overdue && ' ⚠️'}
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusPill(p.status, p.is_overdue))}>
                                                            {p.is_overdue ? 'Quá hạn' : STATUS_LABEL[p.status] ?? p.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <button
                                                            type="button"
                                                            className="text-xs font-semibold text-sky-700 hover:text-sky-800 hover:underline"
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
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={pagingBtnClass}
                                            disabled={payPage <= 1}
                                            onClick={() => setPayPage(p => p - 1)}
                                        >
                                            Trước
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={pagingBtnClass}
                                            disabled={payPage >= payTotalPages}
                                            onClick={() => setPayPage(p => p + 1)}
                                        >
                                            Sau
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* ── Lịch sử thanh toán ── */}
                {tab === 'history' && (
                    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
                        <CardContent className="p-0">
                            {loadingPayH ? (
                                <div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
                            ) : payments.length === 0 ? (
                                <p className="py-14 text-center text-slate-500">Chưa có lần thanh toán nào.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                                    <table className="w-full min-w-[700px] text-sm text-slate-700">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                <th className="px-4 py-3">Nhà cung cấp</th>
                                                <th className="px-4 py-3">Ngày thanh toán</th>
                                                <th className="px-4 py-3 text-right">Số tiền</th>
                                                <th className="px-4 py-3">Hình thức</th>
                                                <th className="px-4 py-3">Người ghi</th>
                                                <th className="px-4 py-3">Ghi chú</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {payments.map((pm) => (
                                                <tr key={pm._id} className="transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-teal-50/40">
                                                    <td className="px-4 py-3.5 font-medium text-slate-900">{pm.supplier_id?.name ?? '—'}</td>
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{fmtDate(pm.payment_date)}</td>
                                                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-emerald-700">{fmt(pm.total_amount)}</td>
                                                    <td className="px-4 py-3.5 text-slate-700">{METHOD_LABEL[pm.payment_method] ?? pm.payment_method}</td>
                                                    <td className="px-4 py-3.5 text-slate-700">{pm.created_by?.fullName || pm.created_by?.email || '—'}</td>
                                                    <td className="px-4 py-3.5 max-w-[180px] truncate text-slate-500">{pm.note || '—'}</td>
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
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={pagingBtnClass}
                                            disabled={payHPage <= 1}
                                            onClick={() => setPayHPage(p => p - 1)}
                                        >
                                            Trước
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={pagingBtnClass}
                                            disabled={payHPage >= payHTotalPages}
                                            onClick={() => setPayHPage(p => p + 1)}
                                        >
                                            Sau
                                        </Button>
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
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
                    onClick={(e) => { if (e.target === e.currentTarget && !paySubmitting) closePayModal(); }}
                >
                    <div className="relative flex h-[66vh] w-full max-w-[760px] flex-col overflow-visible rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_60px_-10px_rgba(15,23,42,0.35)]">
                        <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,#f0fdfa_0%,#ecfeff_45%,#f8fafc_100%)] px-4 py-3">
                            <h2 className="m-0 text-[22px] font-bold tracking-tight text-slate-900">Ghi nhận thanh toán NCC</h2>
                            <p className="mt-0.5 text-xs text-slate-600">Thanh toán công nợ nhanh, rõ ràng và đồng bộ sổ quỹ.</p>
                        </div>
                        <div className="flex-1 overflow-y-auto overflow-x-visible p-5">
                            <div className="flex flex-col gap-3">
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5">
                                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tìm nhà cung cấp</label>
                                <input
                                    type="search"
                                    value={modalSupplierQuery}
                                    onFocus={() => setModalSupplierDropdownOpen(true)}
                                    onChange={(e) => {
                                        setModalSupplierQuery(e.target.value);
                                        setModalSupplierDropdownOpen(true);
                                        if (payForm.supplier_id) {
                                            setPayForm((f) => ({ ...f, supplier_id: '', total_amount: '' }));
                                            setModalOpenPayables([]);
                                            setSelectedPayableIds([]);
                                        }
                                    }}
                                    placeholder="Gõ tên, điện thoại, email..."
                                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                                />
                            </div>
                            <div ref={modalSupplierPickerRef} className="relative">
                                <label className="mb-1 block text-[12px] font-semibold text-slate-700">Nhà cung cấp <span className="text-red-500">*</span></label>
                                <button
                                    type="button"
                                    className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-[13px] outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                                    onClick={() => setModalSupplierDropdownOpen((v) => !v)}
                                >
                                    <span className={payForm.supplier_id ? 'text-slate-900' : 'text-slate-500'}>
                                        {modalSupplier?.name
                                            ? `${modalSupplier.name}${modalSupplier.phone ? ` · ${modalSupplier.phone}` : ''}`
                                            : '— Chọn nhà cung cấp —'}
                                    </span>
                                    <span className="text-slate-400">▾</span>
                                </button>
                                {modalSupplierDropdownOpen && (
                                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                                        {modalSupplierOptions.length === 0 ? (
                                            <p className="px-2 py-2 text-[12px] text-slate-500">Không có nhà cung cấp phù hợp.</p>
                                        ) : (
                                            modalSupplierOptions.map((s) => (
                                                <button
                                                    key={s._id}
                                                    type="button"
                                                    onClick={() => {
                                                        setPayForm((f) => ({
                                                            ...f,
                                                            supplier_id: s._id,
                                                            payment_method:
                                                                f.payment_method === 'bank_transfer' || f.payment_method === 'cash'
                                                                    ? f.payment_method
                                                                    : 'cash',
                                                        }));
                                                        setModalSupplierQuery(`${s.name || ''}${s.phone ? ` ${s.phone}` : ''}`.trim());
                                                        setModalSupplierDropdownOpen(false);
                                                    }}
                                                    className={cn(
                                                        'flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[13px] hover:bg-slate-100',
                                                        String(payForm.supplier_id) === String(s._id) ? 'bg-teal-50 text-teal-800' : 'text-slate-700'
                                                    )}
                                                >
                                                    <span className="truncate">{s.name || '—'}</span>
                                                    <span className="ml-2 shrink-0 text-[11px] text-slate-500">{s.phone || ''}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                                {loadingModalSupplierOptions && (
                                    <p className="mt-1 text-[11px] text-slate-500">Đang lọc nhà cung cấp…</p>
                                )}
                            </div>

                            {payForm.supplier_id && loadingModalDebt && (
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                    Đang kiểm tra công nợ với nhà cung cấp…
                                </div>
                            )}

                            {payForm.supplier_id && !loadingModalDebt && modalSupplierRemaining === 0 && (
                                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
                                    Bạn <strong>không có khoản nợ</strong> nào với nhà cung cấp này (hoặc đã thanh toán đủ). Không cần ghi nhận thanh toán.
                                </div>
                            )}

                            {modalHasPayableDebt && (
                                <>
                                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[14px] text-sky-900">
                                        Bạn còn nợ nhà cung cấp này:{' '}
                                        <strong className="text-[17px] font-bold text-sky-700">{fmt(modalSupplierRemaining)}</strong>
                                    </div>
                                    <form onSubmit={handlePay} className="flex flex-col gap-3">
                                        <div className="rounded-xl border border-slate-200 bg-white">
                                            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                                                <p className="text-[12px] font-semibold text-slate-700">Chọn đơn cần thanh toán</p>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-2 text-[11px]"
                                                        disabled={loadingModalPayables || modalOpenPayables.length === 0}
                                                        onClick={() => setSelectedPayableIds(modalOpenPayables.map((p) => String(p._id)))}
                                                    >
                                                        Chọn tất cả
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-2 text-[11px]"
                                                        disabled={loadingModalPayables || selectedPayableIds.length === 0}
                                                        onClick={() => setSelectedPayableIds([])}
                                                    >
                                                        Bỏ chọn
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="max-h-48 overflow-y-auto px-3 py-2">
                                                {loadingModalPayables ? (
                                                    <div className="flex items-center gap-2 py-2 text-[12px] text-slate-500">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Đang tải danh sách đơn nợ...
                                                    </div>
                                                ) : modalOpenPayables.length === 0 ? (
                                                    <p className="py-2 text-[12px] text-slate-500">Không có đơn nợ nào khả dụng.</p>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {modalOpenPayables.map((p) => {
                                                            const id = String(p._id);
                                                            const checked = selectedPayableIds.includes(id);
                                                            return (
                                                                <label key={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-100 px-2.5 py-2 hover:bg-slate-50">
                                                                    <div className="flex min-w-0 items-center gap-2">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={(e) => {
                                                                                setSelectedPayableIds((prev) => {
                                                                                    if (e.target.checked) return [...prev, id];
                                                                                    return prev.filter((pid) => pid !== id);
                                                                                });
                                                                            }}
                                                                        />
                                                                        <div className="min-w-0">
                                                                            <p className="truncate text-[12px] font-semibold text-slate-700">
                                                                                Phiếu nhập {(p.source_id?._id ?? String(p.source_id || '')).slice(-8).toUpperCase()}
                                                                            </p>
                                                                            <p className="text-[11px] text-slate-500">
                                                                                Ngày tạo: {fmtDate(p.created_at)}{p.due_date ? ` • Hạn: ${fmtDate(p.due_date)}` : ''}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <p className="shrink-0 text-[12px] font-semibold text-red-600">{fmt(p.remaining_amount)}</p>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="border-t border-slate-100 px-3 py-2 text-[12px] text-slate-700">
                                                Đã chọn <strong>{selectedPayableIds.length}</strong> / {modalOpenPayables.length} đơn
                                                {' • '}Tổng cần trả: <strong className="text-sky-700">{fmt(selectedRemainingTotal)}</strong>
                                                {allModalPayablesSelected ? ' (đang chọn tất cả)' : ''}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-[12px] font-semibold text-slate-700">Số tiền thanh toán (đ) <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={payForm.total_amount}
                                                onChange={(e) => setPayForm((f) => ({ ...f, total_amount: formatCurrencyInput(e.target.value) }))}
                                                placeholder="Nhập số tiền muốn thanh toán"
                                                className="h-9 w-full rounded-xl border border-slate-200 px-3 text-[13px] outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                                            />
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                Có thể nhập số tiền bất kỳ, tối đa bằng tổng nợ các đơn đã chọn.
                                            </p>
                                            <div className="mt-1">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-2 text-[11px]"
                                                    onClick={() => setPayForm((f) => ({ ...f, total_amount: formatCurrencyInput(String(selectedRemainingTotal || 0)) }))}
                                                >
                                                    Trả hết các đơn đã chọn
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="mb-1 block text-[12px] font-semibold text-slate-700">Ngày thanh toán</label>
                                                <input
                                                    type="date"
                                                    value={payForm.payment_date}
                                                    onChange={(e) => setPayForm((f) => ({ ...f, payment_date: e.target.value }))}
                                                    className="h-9 w-full rounded-xl border border-slate-200 px-3 text-[13px] outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[12px] font-semibold text-slate-700">Hình thức</label>
                                                <select
                                                    value={payForm.payment_method === 'bank_transfer' ? 'bank_transfer' : 'cash'}
                                                    onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                                                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                                                >
                                                    <option value="cash">Tiền mặt</option>
                                                    <option value="bank_transfer">Chuyển khoản</option>
                                                </select>
                                            </div>
                                        </div>
                                        {payForm.payment_method === 'bank_transfer' && (
                                            <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-2.5">
                                                <p className="mb-2 text-[12px] font-semibold text-blue-800">
                                                    Mã QR chuyển khoản nhà cung cấp
                                                </p>
                                                {modalSupplier?.bank_qr_image_url ? (
                                                    <div className="flex items-start gap-2.5">
                                                        <img
                                                            src={toQrSrc(modalSupplier.bank_qr_image_url)}
                                                            alt={`QR ${modalSupplier.name || ''}`}
                                                            className="h-24 w-24 rounded-lg border border-blue-100 bg-white object-contain"
                                                        />
                                                        <div className="flex-1 text-[11px] leading-relaxed text-blue-800">
                                                            <p className="m-0">
                                                                Dùng app ngân hàng quét mã QR để chuyển khoản.
                                                            </p>
                                                            <p className="mt-1.5 mb-0">
                                                                Sau khi chuyển khoản xong, bấm “Ghi nhận” để cập nhật công nợ.
                                                            </p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="m-0 text-[12px] text-blue-800">
                                                        Nhà cung cấp này chưa có mã QR. Vào trang chỉnh sửa nhà cung cấp để thêm ảnh QR.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        <div>
                                            <label className="mb-1 block text-[12px] font-semibold text-slate-700">Ghi chú</label>
                                            <textarea
                                                rows={1}
                                                value={payForm.note}
                                                onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                                                className="min-h-9 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none ring-teal-200 transition focus:border-teal-300 focus:ring-2"
                                            />
                                        </div>
                                        <div className="mt-1 flex justify-end gap-2 border-t border-slate-100 pt-2">
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
                                <div className="flex justify-end gap-2 border-t border-slate-100 pt-2">
                                    <Button type="button" variant="outline" onClick={closePayModal} disabled={paySubmitting}>Đóng</Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                </div>
            )}
        </ManagerPageFrame>
    );
}
