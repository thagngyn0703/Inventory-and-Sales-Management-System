import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getCustomers,
    createCustomer,
    updateCustomer,
    payCustomerDebt,
    getStoreBankInfo,
    prepareCustomerDebtTransfer,
    confirmCustomerDebtTransfer,
    cancelCustomerDebtTransfer,
    getCustomerDebtPayments,
    getTopCustomersAnalytics,
} from '../../services/customersApi';
import { getInvoices } from '../../services/invoicesApi';
import { sendDebtReminder } from '../../services/customerNotifyApi';
import { useToast } from '../../contexts/ToastContext';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { Loader2, Search, Users, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { formatCurrencyInput, parseCurrencyInput, toCurrencyInputFromNumber } from '../../utils/currencyInput';

const PAGE_SIZE = 20;
const OVERDUE_DAYS = 30;

function getInvoiceDate(invoice) {
    return invoice?.invoice_at || invoice?.created_at || null;
}

function getInvoiceAgeDays(invoiceDate) {
    if (!invoiceDate) return 0;
    const issuedAt = new Date(invoiceDate);
    if (Number.isNaN(issuedAt.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - issuedAt.getTime()) / 86400000));
}

export default function SalesCustomerPage({ managerMode = false }) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchKey, setSearchKey] = useState('');
    const [hasDebtFilter, setHasDebtFilter] = useState(''); // '', 'true', 'false'
    const [error, setError] = useState('');
    // BUG-17: Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
    // BUG-16: Bank info from store settings
    const [storeBankInfo, setStoreBankInfo] = useState({ bank_id: '', bank_account: '', bank_account_name: '' });
    const [topCustomers, setTopCustomers] = useState([]);
    const [topCustomersSort, setTopCustomersSort] = useState('spent');

    // Modal state
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ full_name: '', phone: '' });
    const [creatingCustomer, setCreatingCustomer] = useState(false);
    const [customerModalError, setCustomerModalError] = useState('');
    // Debt Payment Modal state
    const [payDebtModal, setPayDebtModal] = useState({
        show: false,
        customer: null,
        amount: '',
        paymentMethod: 'cash',
        transferRef: '',
        transferPreparedAmount: 0,
        transferStatusText: '',
    });
    const [isPayingDebt, setIsPayingDebt] = useState(false);
    
    // Edit Customer Modal — BUG-11: thêm email, address
    const [editCustomerModal, setEditCustomerModal] = useState({ 
        show: false, 
        customer: { full_name: '', phone: '', email: '', address: '', debt_account: 0 }, 
        saving: false, 
        error: '' 
    });
    
    // History Modal — BUG-07: tabs cho lịch sử nợ vs toàn bộ hóa đơn
    const [historyModal, setHistoryModal] = useState({
        show: false,
        customer: null,
        tab: 'debt', // 'debt' | 'all'
        debtInvoices: [],
        allInvoices: [],
        debtPayments: [],
        loading: false,
    });
    const [historyDebtFilter, setHistoryDebtFilter] = useState('all');
    // Notify send state: { show, customerName, jobId, status, channel, error, messagePreview, sending }
    const [notifyResult, setNotifyResult] = useState({ show: false, customerName: '', jobId: '', status: '', channel: null, error: null, messagePreview: '', sending: false, alreadySent: false });

    // BUG-07: tải cả 2 loại lịch sử song song
    const fetchCustomerHistory = async (customer, tab = 'debt') => {
        setHistoryDebtFilter('all');
        setHistoryModal({ show: true, customer, tab, debtInvoices: [], allInvoices: [], debtPayments: [], loading: true });
        try {
            const [debtData, allData, paymentData] = await Promise.all([
                getInvoices({ customer_id: customer._id, payment_method: 'debt', limit: 100 }),
                getInvoices({ customer_id: customer._id, limit: 100 }),
                getCustomerDebtPayments(customer._id, 100),
            ]);
            setHistoryModal(prev => ({
                ...prev,
                debtInvoices: debtData.invoices || [],
                allInvoices: allData.invoices || [],
                debtPayments: paymentData.payments || [],
                loading: false,
            }));
        } catch (e) {
            console.error(e);
            setHistoryModal(prev => ({ ...prev, loading: false }));
        }
    };

    // BUG-16: Tải thông tin ngân hàng của cửa hàng khi component mount
    useEffect(() => {
        getStoreBankInfo().then(info => setStoreBankInfo(info)).catch(() => {});
    }, []);

    const fetchTopCustomers = useCallback(async (sort = 'spent') => {
        if (!managerMode) return;
        try {
            const data = await getTopCustomersAnalytics({ limit: 5, sort });
            setTopCustomers(data.data || []);
        } catch (e) {
            console.error('Top customers analytics error:', e);
        }
    }, [managerMode]);

    useEffect(() => {
        fetchTopCustomers(topCustomersSort);
    }, [fetchTopCustomers, topCustomersSort]);

    // Real-time phone check for New Customer
    useEffect(() => {
        const tel = newCustomer.phone.trim().replace(/\s/g, '');
        if (tel.length >= 10 && tel.length <= 11) {
            const timer = setTimeout(async () => {
                try {
                    const { customers: list } = await getCustomers({ searchKey: tel });
                    const exists = list.find(c => c.phone === tel);
                    if (exists) {
                        setCustomerModalError('Số điện thoại này đã tồn tại trong hệ thống.');
                    } else {
                        setCustomerModalError('');
                    }
                } catch (e) {
                    console.error('Phone check error:', e);
                }
            }, 500);
            return () => clearTimeout(timer);
        } else if (tel.length > 0) {
            setCustomerModalError('Số điện thoại phải có 10 hoặc 11 chữ số.');
        } else {
            setCustomerModalError('');
        }
    }, [newCustomer.phone]);

    // Real-time phone check for Edit Customer
    useEffect(() => {
        if (!editCustomerModal.show || !editCustomerModal.customer) return;
        const tel = editCustomerModal.customer.phone ? editCustomerModal.customer.phone.trim().replace(/\s/g, '') : '';
        if (tel.length >= 10 && tel.length <= 11) {
            const timer = setTimeout(async () => {
                try {
                    const { customers: list } = await getCustomers({ searchKey: tel });
                    const exists = list.find(c => c.phone === tel && c._id !== editCustomerModal.customer._id);
                    if (exists) {
                        setEditCustomerModal(prev => ({ ...prev, error: 'Số điện thoại này đã tồn tại trong hệ thống.' }));
                    } else {
                        setEditCustomerModal(prev => ({ ...prev, error: '' }));
                    }
                } catch (e) {
                    console.error('Phone check error:', e);
                }
            }, 500);
            return () => clearTimeout(timer);
        } else if (tel.length > 0) {
            setEditCustomerModal(prev => ({ ...prev, error: 'Số điện thoại phải có 10 hoặc 11 chữ số.' }));
        } else {
            setEditCustomerModal(prev => ({ ...prev, error: '' }));
        }
    }, [editCustomerModal.customer?.phone, editCustomerModal.show]);

    // BUG-17: fetchCustomers nhận page và filter
    const fetchCustomers = useCallback(async (search = '', page = 1, debtFilter = '') => {
        setLoading(true);
        setError('');
        try {
            const data = await getCustomers({
                searchKey: search,
                page,
                limit: PAGE_SIZE,
                has_debt: debtFilter,
            });
            setCustomers(data.customers || []);
            setPagination(data.pagination || { total: 0, totalPages: 1, page: 1 });
        } catch (err) {
            setError(err.message || 'Lỗi khi lấy danh sách khách hàng');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentPage(1);
            fetchCustomers(searchKey, 1, hasDebtFilter);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchKey, hasDebtFilter, fetchCustomers]);

    useEffect(() => {
        fetchCustomers(searchKey, currentPage, hasDebtFilter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage]);

    const handleCreateCustomer = async () => {
        if (!newCustomer.full_name || !newCustomer.phone) {
            setCustomerModalError('Vui lòng nhập đầy đủ Tên và Số điện thoại.');
            return;
        }
        const cleanPhone = newCustomer.phone.trim().replace(/\s/g, '');
        if (cleanPhone.length < 10 || cleanPhone.length > 11) {
            setCustomerModalError('Số điện thoại phải có 10 hoặc 11 chữ số.');
            return;
        }
        setCreatingCustomer(true);
        setCustomerModalError('');
        try {
            // BUG-15: is_regular: false mặc định, không phải true
            await createCustomer({ ...newCustomer, status: 'active', is_regular: false });
            setShowCreateCustomer(false);
            setNewCustomer({ full_name: '', phone: '' });
            toast('Thêm khách hàng thành công!', 'success');
            fetchCustomers(searchKey, currentPage, hasDebtFilter);
        } catch (e) {
            setCustomerModalError(e.message || 'Lỗi khi thêm khách hàng mới');
        } finally {
            setCreatingCustomer(false);
        }
    };

    const handlePayDebt = async () => {
        // BUG-14: validate amount <= 0
        const payAmount = parseCurrencyInput(payDebtModal.amount);
        if (!payDebtModal.amount || payAmount <= 0) {
            toast('Vui lòng nhập số tiền lớn hơn 0', 'error');
            return;
        }
        const maxDebt = Number(payDebtModal.customer?.debt_account || 0);
        if (payAmount > maxDebt) {
            toast(`Số tiền không được vượt quá dư nợ hiện tại (${maxDebt.toLocaleString('vi-VN')}₫)`, 'error');
            return;
        }
        setIsPayingDebt(true);
        try {
            if (payDebtModal.paymentMethod === 'bank_transfer') {
                if (!payDebtModal.transferRef || Number(payDebtModal.transferPreparedAmount) !== payAmount) {
                    const prepared = await prepareCustomerDebtTransfer(payDebtModal.customer._id, payAmount);
                    setPayDebtModal(prev => ({
                        ...prev,
                        transferRef: prepared.payment_ref || '',
                        transferPreparedAmount: payAmount,
                        transferStatusText: 'Đã tạo mã chuyển khoản. Vui lòng đợi tiền về rồi bấm Xác nhận lần nữa.',
                    }));
                    toast('Đã tạo mã QR. Sau khi tiền về, bấm XÁC NHẬN THU NỢ để kiểm tra giao dịch.', 'success');
                    return;
                }
                const result = await confirmCustomerDebtTransfer(
                    payDebtModal.customer._id,
                    payAmount,
                    payDebtModal.transferRef
                );
                toast(result.message || 'Xác nhận chuyển khoản thành công!', 'success');
            } else {
                const result = await payCustomerDebt(payDebtModal.customer._id, payAmount, 'cash');
                toast(result.message || 'Thanh toán nợ tiền mặt thành công!', 'success');
            }
            setPayDebtModal({
                show: false,
                customer: null,
                amount: '',
                paymentMethod: 'cash',
                transferRef: '',
                transferPreparedAmount: 0,
                transferStatusText: '',
            });
            fetchCustomers(searchKey, currentPage, hasDebtFilter);
            fetchTopCustomers(topCustomersSort);
        } catch (e) {
            toast(e.message || 'Lỗi khi thanh toán nợ', 'error');
        } finally {
            setIsPayingDebt(false);
        }
    };

    const handleClosePayDebtModal = async () => {
        const customerId = payDebtModal.customer?._id;
        const paymentRef = payDebtModal.transferRef;
        const shouldCancelTransfer =
            payDebtModal.paymentMethod === 'bank_transfer' &&
            Boolean(paymentRef) &&
            Boolean(customerId);
        if (shouldCancelTransfer) {
            try {
                await cancelCustomerDebtTransfer(customerId, paymentRef);
            } catch (e) {
                console.error('Cancel transfer request failed:', e);
            }
        }
        setPayDebtModal({
            show: false,
            customer: null,
            amount: '',
            paymentMethod: 'cash',
            transferRef: '',
            transferPreparedAmount: 0,
            transferStatusText: '',
        });
    };

    const handleSwitchPayDebtMethod = async (nextMethod) => {
        if (nextMethod === payDebtModal.paymentMethod) return;
        if (
            payDebtModal.paymentMethod === 'bank_transfer' &&
            payDebtModal.transferRef &&
            payDebtModal.customer?._id
        ) {
            try {
                await cancelCustomerDebtTransfer(payDebtModal.customer._id, payDebtModal.transferRef);
            } catch (e) {
                console.error('Cancel previous transfer request failed:', e);
            }
        }
        setPayDebtModal((prev) => ({
            ...prev,
            paymentMethod: nextMethod,
            transferRef: '',
            transferPreparedAmount: 0,
            transferStatusText: '',
        }));
    };

    const handleSendDebtReminder = useCallback(async ({ customer, amount, overdueDays = 0, forceResend = false }) => {
        if (!customer || !amount || Number(amount) <= 0) return;
        setNotifyResult({ show: true, customerName: customer.full_name || 'Khách hàng', jobId: '', status: '', channel: null, error: null, messagePreview: '', sending: true });
        try {
            const result = await sendDebtReminder({
                customer_id: String(customer._id),
                override_amount: Number(amount),
                overdue_days: overdueDays,
                force_resend: forceResend,
            });
            setNotifyResult(prev => ({
                ...prev,
                sending: false,
                jobId: result.job_id || '',
                status: result.success ? 'sent' : 'failed',
                channel: result.channel || null,
                error: result.error || null,
                messagePreview: result.message_preview || '',
                alreadySent: result.already_sent || false,
            }));
            if (result.success) {
                const ch = result.channel === 'ZALO' ? 'Zalo' : result.channel === 'SMS' ? 'SMS' : 'Zalo/SMS';
                toast(`Đã gửi nhắc nợ qua ${ch} cho ${customer.full_name || 'khách hàng'}.`, 'success');
            } else if (result.already_sent) {
                toast('Đã gửi nhắc nợ trong hôm nay rồi. Dùng "Gửi lại" nếu cần.', 'info');
            } else {
                toast(`Gửi thất bại: ${result.error || 'Lỗi không xác định'}`, 'error');
            }
        } catch (e) {
            const errMsg = e?.message || 'Lỗi kết nối';
            setNotifyResult(prev => ({ ...prev, sending: false, status: 'failed', error: errMsg }));
            toast(`Không thể gửi: ${errMsg}`, 'error');
        }
    }, [toast]);

    const overdueDebtInvoices = historyModal.debtInvoices.filter((inv) => {
        if (inv.status !== 'pending') return false;
        const ageDays = getInvoiceAgeDays(getInvoiceDate(inv));
        return ageDays > OVERDUE_DAYS;
    });
    const displayedDebtInvoices = historyDebtFilter === 'overdue' ? overdueDebtInvoices : historyModal.debtInvoices;
    const overdueTotalAmount = overdueDebtInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
    const oldestOverdueDays = overdueDebtInvoices.reduce((max, inv) => Math.max(max, getInvoiceAgeDays(getInvoiceDate(inv))), 0);

    return (
        <StaffPageShell
            eyebrow={managerMode ? 'Quản lý cửa hàng' : 'Bán hàng'}
            eyebrowIcon={Users}
            title="Quản lý khách hàng"
            subtitle="Theo dõi khách hàng, công nợ và lịch sử thanh toán."
            headerActions={
                <Button type="button" className="gap-2" onClick={() => setShowCreateCustomer(true)}>
                    <i className="fa-solid fa-plus" /> Thêm khách hàng
                </Button>
            }
        >
            <div className="flex min-h-0 flex-1 flex-col">
            <main className="flex-1">
                    <InlineNotice message={error} type="error" className="mb-4" />

                    <Card className="mb-4 border-slate-200/80 shadow-sm">
                        <CardContent className="p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="relative flex-1 min-w-[220px] max-w-[380px]">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Tìm khách hàng theo tên, SĐT..."
                                        value={searchKey}
                                        onChange={(e) => setSearchKey(e.target.value)}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                                </div>
                                {/* BUG-17: Lọc theo trạng thái nợ */}
                                <div className="flex items-center gap-2">
                                    {[
                                        { value: '', label: 'Tất cả' },
                                        { value: 'true', label: 'Có nợ' },
                                        { value: 'false', label: 'Không nợ' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setHasDebtFilter(opt.value)}
                                            className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                                                hasDebtFilter === opt.value
                                                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                {pagination.total > 0 && (
                                    <span className="ml-auto text-xs text-slate-500">
                                        {pagination.total} khách hàng
                                    </span>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                    {managerMode && (
                        <Card className="mb-4 border-slate-200/80 shadow-sm">
                            <CardContent className="p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">Top Customers (Analytics)</p>
                                        <p className="text-xs text-slate-500">Xếp hạng theo doanh thu, dư nợ hoặc tuổi nợ lâu nhất.</p>
                                    </div>
                                    <select
                                        value={topCustomersSort}
                                        onChange={(e) => setTopCustomersSort(e.target.value)}
                                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                                    >
                                        <option value="spent">Doanh thu cao nhất</option>
                                        <option value="debt">Nợ nhiều nhất</option>
                                        <option value="overdue">Nợ lâu nhất</option>
                                    </select>
                                </div>
                                {topCustomers.length === 0 ? (
                                    <p className="text-xs text-slate-500">Chưa có dữ liệu xếp hạng.</p>
                                ) : (
                                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                                        {topCustomers.map((item, idx) => (
                                            <div key={item._id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">#{idx + 1}</p>
                                                <p className="truncate text-sm font-semibold text-slate-800">{item.full_name}</p>
                                                <p className="mt-1 text-xs text-slate-600">Doanh thu: {Number(item.total_spent || 0).toLocaleString('vi-VN')}đ</p>
                                                <p className="text-xs text-rose-600">Nợ hiện tại: {Number(item.current_debt || 0).toLocaleString('vi-VN')}đ</p>
                                                <p className="text-xs text-amber-600">Nợ lâu nhất: {Number(item.oldest_debt_days || 0)} ngày</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
                        <CardContent className="p-0">
                        {loading ? (
                            <div className="flex justify-center py-14 text-slate-500">
                                <Loader2 className="h-7 w-7 animate-spin" />
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                            <table className="w-full min-w-[980px] text-sm text-slate-700">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                        <th className="px-4 py-3">STT</th>
                                        <th className="px-4 py-3">Tên khách hàng</th>
                                        <th className="px-4 py-3">Số điện thoại</th>
                                        <th className="px-4 py-3 text-center">Điểm loyalty</th>
                                        <th className="px-4 py-3 text-right">Dư nợ (VNĐ)</th>
                                        <th className="px-4 py-3 text-center">Ngày tạo</th>
                                        <th className="px-4 py-3 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {customers.length === 0 ? (
                                        <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-500">Chưa có khách hàng nào</td></tr>
                                    ) : (
                                        customers.map((c, idx) => (
                                            <tr key={c._id} className="transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-teal-50/40">
                                                <td className="px-4 py-3.5 text-slate-500">{idx + 1}</td>
                                                <td className="px-4 py-3.5 font-semibold text-slate-900">{c.full_name}</td>
                                                <td className="px-4 py-3.5 text-slate-700">{c.phone || '-'}</td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <div className="font-semibold text-indigo-700">
                                                        {Number(c.loyalty_points || 0).toLocaleString('vi-VN')} điểm
                                                    </div>
                                                    <div className="text-[11px] text-slate-500">
                                                        Tích lũy: {Number(c.lifetime_points_earned || 0).toLocaleString('vi-VN')}
                                                    </div>
                                                </td>
                                                <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${c.debt_account > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                                    {Number(c.debt_account || 0).toLocaleString('vi-VN')}
                                                </td>
                                                <td className="px-4 py-3.5 text-center text-slate-500">
                                                    {new Date(c.created_at).toLocaleDateString('vi-VN')}
                                                </td>
                                                <td className="px-4 py-3.5 whitespace-nowrap text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                    <Button
                                        onClick={() => fetchCustomerHistory(c, 'debt')}
                                        type="button"
                                        className="h-9 min-w-[88px] rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                                    >
                                        Lịch sử
                                    </Button>
                                                    <Button
                                                        type="button"
                                        onClick={() => setEditCustomerModal({
                                            show: true,
                                            customer: {
                                                _id: c._id,
                                                full_name: c.full_name || '',
                                                phone: c.phone || '',
                                                email: c.email || '',
                                                address: c.address || '',
                                                debt_account: c.debt_account || 0,
                                            },
                                            saving: false,
                                            error: '',
                                        })}
                                                        className="h-9 min-w-[70px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                                    >
                                                        Sửa
                                                    </Button>
                                                    {c.debt_account > 0 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => handleSendDebtReminder({
                                                                customer: c,
                                                                amount: toCurrencyInputFromNumber(c.debt_account || 0),
                                                            })}
                                                            className="h-9 min-w-[90px] rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 gap-1 inline-flex items-center"
                                                        >
                                                            <Send size={12} /> Nhắc nợ
                                                        </Button>
                                                    )}
                                                    {c.debt_account > 0 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => setPayDebtModal({
                                                                show: true,
                                                                customer: c,
                                                                amount: toCurrencyInputFromNumber(c.debt_account || 0),
                                                                paymentMethod: 'cash',
                                                                transferRef: '',
                                                                transferPreparedAmount: 0,
                                                                transferStatusText: '',
                                                            })}
                                                            className="h-9 min-w-[74px] rounded-lg border border-rose-200 bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                                                        >
                                                            Thu nợ
                                                        </Button>
                                                    )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                            </div>
                        )}
                    </CardContent>
                    </Card>

                    {/* BUG-17: Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="mt-4 flex items-center justify-center gap-2">
                            <button
                                type="button"
                                disabled={currentPage <= 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-sm text-slate-600">
                                Trang {currentPage} / {pagination.totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={currentPage >= pagination.totalPages}
                                onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </main>

            {/* Create Customer Modal */}
            {showCreateCustomer && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'white', padding: '24px', borderRadius: '8px',
                        width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', color: '#1e293b' }}>Thêm Khách hàng Mới</h3>
                        <InlineNotice message={customerModalError} type="error" className="mb-4" />
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Tên khách hàng <span style={{ color: '#ef4444' }}>*</span></label>
                            <input 
                                type="text" 
                                value={newCustomer.full_name}
                                onChange={e => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="Nhập tên khách hàng"
                            />
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Số điện thoại <span style={{ color: '#ef4444' }}>*</span></label>
                            <input 
                                type="text" 
                                value={newCustomer.phone}
                                onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="Nhập số điện thoại"
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button 
                                style={{ padding: '8px 16px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={() => { setShowCreateCustomer(false); setCustomerModalError(''); }}
                            >
                                Hủy
                            </button>
                            <button 
                                style={{ padding: '8px 16px', border: 'none', background: '#0081ff', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={handleCreateCustomer}
                                disabled={creatingCustomer || !!customerModalError}
                            >
                                {creatingCustomer ? 'Đang lưu...' : 'Lưu khách hàng'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pay Debt Modal */}
            {payDebtModal.show && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'white', padding: '24px', borderRadius: '8px',
                        width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', color: '#1e293b' }}>Thu nợ: {payDebtModal.customer?.full_name}</h3>
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fee2e2' }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#991b1b' }}>Số nợ hiện tại:</span>
                                <span style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>{Number(payDebtModal.customer?.debt_account).toLocaleString('vi-VN')} VNĐ</span>
                            </div>
                        </div>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Số tiền trả <span style={{ color: '#ef4444' }}>*</span></label>
                            <input 
                                type="text"
                                inputMode="numeric"
                                value={payDebtModal.amount}
                                onChange={e => setPayDebtModal({
                                    ...payDebtModal,
                                    amount: formatCurrencyInput(e.target.value),
                                    transferRef: '',
                                    transferPreparedAmount: 0,
                                    transferStatusText: '',
                                })}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontWeight: 700, fontSize: 16 }}
                                placeholder="Nhập số tiền trả nợ"
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Hình thức thanh toán</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button 
                                    style={{ 
                                        flex: 1, padding: '10px', borderRadius: 6, border: payDebtModal.paymentMethod === 'cash' ? '2px solid #10b981' : '1px solid #cbd5e1',
                                        background: payDebtModal.paymentMethod === 'cash' ? '#f0fdf4' : 'white', cursor: 'pointer', fontWeight: 600, color: payDebtModal.paymentMethod === 'cash' ? '#10b981' : '#64748b'
                                    }}
                                    onClick={() => handleSwitchPayDebtMethod('cash')}
                                >
                                    <i className="fa-solid fa-money-bill" style={{ marginRight: 6 }} /> Tiền mặt
                                </button>
                                <button 
                                    style={{ 
                                        flex: 1, padding: '10px', borderRadius: 6, border: payDebtModal.paymentMethod === 'bank_transfer' ? '2px solid #0081ff' : '1px solid #cbd5e1',
                                        background: payDebtModal.paymentMethod === 'bank_transfer' ? '#eff6ff' : 'white', cursor: 'pointer', fontWeight: 600, color: payDebtModal.paymentMethod === 'bank_transfer' ? '#0081ff' : '#64748b'
                                    }}
                                    onClick={() => handleSwitchPayDebtMethod('bank_transfer')}
                                >
                                    <i className="fa-solid fa-building-columns" style={{ marginRight: 6 }} /> Chuyển khoản
                                </button>
                            </div>
                        </div>

                        {/* BUG-16: VietQR dùng bank info từ store settings */}
                        {payDebtModal.paymentMethod === 'bank_transfer' && parseCurrencyInput(payDebtModal.amount) > 0 && (
                            <div style={{ marginBottom: 20, textAlign: 'center', background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                {storeBankInfo.bank_id && storeBankInfo.bank_account ? (
                                    <>
                                        <p style={{ margin: '0 0 4px', fontSize: 13, color: '#0081ff', fontWeight: 600 }}>Quét mã để thu nợ</p>
                                        <p style={{ margin: '0 0 10px', fontSize: 11, color: '#64748b' }}>
                                            {storeBankInfo.bank_account_name || ''} — {storeBankInfo.bank_id.toUpperCase()} {storeBankInfo.bank_account}
                                        </p>
                                        {payDebtModal.transferRef ? (
                                            <>
                                                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#334155' }}>
                                                    Nội dung chuyển khoản bắt buộc: <b>{payDebtModal.transferRef}</b>
                                                </p>
                                                <img
                                                    src={`https://img.vietqr.io/image/${storeBankInfo.bank_id}-${storeBankInfo.bank_account}-compact2.png?amount=${parseCurrencyInput(payDebtModal.amount)}&addInfo=${encodeURIComponent(payDebtModal.transferRef)}`}
                                                    alt="QR Code"
                                                    style={{ width: 160, height: 160, mixBlendMode: 'multiply' }}
                                                />
                                            </>
                                        ) : (
                                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                                                Bấm <b>XÁC NHẬN THU NỢ</b> lần 1 để tạo mã QR và mã đối soát.
                                            </p>
                                        )}
                                        {payDebtModal.transferStatusText && (
                                            <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12, color: '#0369a1', fontWeight: 600 }}>
                                                {payDebtModal.transferStatusText}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p style={{ margin: 0, fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
                                        ⚠️ Chưa cấu hình thông tin ngân hàng. Manager vào Cài đặt cửa hàng để thêm.
                                    </p>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button 
                                style={{ padding: '8px 16px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={handleClosePayDebtModal}
                            >
                                Hủy
                            </button>
                            <button 
                                style={{ padding: '10px 20px', border: 'none', background: '#10b981', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                                onClick={handlePayDebt}
                                disabled={isPayingDebt}
                            >
                                {isPayingDebt
                                    ? 'Đang kiểm tra...'
                                    : payDebtModal.paymentMethod === 'bank_transfer'
                                        ? (payDebtModal.transferRef ? 'XÁC NHẬN ĐÃ NHẬN TIỀN' : 'TẠO MÃ CHUYỂN KHOẢN')
                                        : 'XÁC NHẬN THU NỢ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Customer Modal — BUG-11: lưu đầy đủ email, address */}
            {editCustomerModal.show && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'white', padding: '24px', borderRadius: '12px',
                        width: '480px', maxWidth: '95%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', color: '#1e293b', fontWeight: 800 }}>
                            Cập nhật: {editCustomerModal.customer?.full_name}
                        </h3>

                        <InlineNotice message={editCustomerModal.error} type="error" className="mb-4" />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Tên khách hàng <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    type="text"
                                    value={editCustomerModal.customer?.full_name || ''}
                                    onChange={e => setEditCustomerModal(prev => ({ ...prev, customer: { ...prev.customer, full_name: e.target.value } }))}
                                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Số điện thoại</label>
                                <input
                                    type="text"
                                    value={editCustomerModal.customer?.phone || ''}
                                    onChange={e => setEditCustomerModal(prev => ({ ...prev, customer: { ...prev.customer, phone: e.target.value } }))}
                                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Email</label>
                            <input
                                type="email"
                                value={editCustomerModal.customer?.email || ''}
                                onChange={e => setEditCustomerModal(prev => ({ ...prev, customer: { ...prev.customer, email: e.target.value } }))}
                                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="Nhập email (tuỳ chọn)"
                            />
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Địa chỉ</label>
                            <input
                                type="text"
                                value={editCustomerModal.customer?.address || ''}
                                onChange={e => setEditCustomerModal(prev => ({ ...prev, customer: { ...prev.customer, address: e.target.value } }))}
                                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="Nhập địa chỉ (tuỳ chọn)"
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                style={{ padding: '10px 20px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={() => setEditCustomerModal({ show: false, customer: null, saving: false, error: '' })}
                            >
                                Hủy
                            </button>
                            <button
                                style={{ padding: '10px 20px', border: 'none', background: '#0081ff', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                                onClick={async () => {
                                    const cleanPhone = editCustomerModal.customer.phone
                                        ? editCustomerModal.customer.phone.trim().replace(/\s/g, '')
                                        : '';
                                    if (cleanPhone && (cleanPhone.length < 10 || cleanPhone.length > 11)) {
                                        setEditCustomerModal(prev => ({ ...prev, error: 'Số điện thoại phải có 10 hoặc 11 chữ số.' }));
                                        return;
                                    }
                                    if (!editCustomerModal.customer.full_name?.trim()) {
                                        setEditCustomerModal(prev => ({ ...prev, error: 'Tên khách hàng không được để trống.' }));
                                        return;
                                    }
                                    setEditCustomerModal(prev => ({ ...prev, saving: true, error: '' }));
                                    try {
                                        // BUG-11: gửi đầy đủ full_name, phone, email, address
                                        await updateCustomer(editCustomerModal.customer._id, {
                                            full_name: editCustomerModal.customer.full_name.trim(),
                                            phone: cleanPhone,
                                            email: editCustomerModal.customer.email?.trim() || '',
                                            address: editCustomerModal.customer.address?.trim() || '',
                                        });
                                        toast('Cập nhật khách hàng thành công!', 'success');
                                        setEditCustomerModal({ show: false, customer: null, saving: false, error: '' });
                                        fetchCustomers(searchKey, currentPage, hasDebtFilter);
                                    } catch (e) {
                                        setEditCustomerModal(prev => ({ ...prev, saving: false, error: e.message || 'Lỗi khi cập nhật khách hàng' }));
                                    }
                                }}
                                disabled={editCustomerModal.saving || !!editCustomerModal.error}
                            >
                                {editCustomerModal.saving ? 'Đang lưu...' : 'LƯU THAY ĐỔI'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal — BUG-07: tabs Lịch sử nợ vs Tất cả hóa đơn, BUG-13: navigate đúng role */}
            {historyModal.show && (() => {
                // BUG-13: navigate đúng route theo role
                const invoiceBasePath = managerMode ? '/manager/invoices' : '/staff/invoices';
                const activeInvoices = historyModal.tab === 'debt'
                    ? displayedDebtInvoices
                    : historyModal.allInvoices;

                const PAYMENT_LABELS = {
                    cash: 'Tiền mặt',
                    bank_transfer: 'Chuyển khoản',
                    debt: 'Ghi nợ',
                    credit: 'Công nợ',
                    card: 'Thẻ',
                };

                return (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                    }}>
                        <div style={{
                            background: 'white', padding: '24px', borderRadius: '12px',
                            width: '760px', maxWidth: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                <div>
                                    <h3 style={{ margin: '0 0 4px', fontSize: '18px', color: '#1e293b', fontWeight: 800 }}>
                                        {historyModal.customer?.full_name}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{historyModal.customer?.phone || ''}</p>
                                </div>
                                <button
                                    onClick={() => setHistoryModal(prev => ({ ...prev, show: false }))}
                                    style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}
                                >✕</button>
                            </div>

                            {/* Tabs — BUG-07 */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
                                {[
                                    { key: 'debt', label: `Lịch sử nợ (${historyModal.debtInvoices.length})` },
                                    { key: 'all', label: `Tất cả hóa đơn (${historyModal.allInvoices.length})` },
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setHistoryModal(prev => ({ ...prev, tab: tab.key }))}
                                        style={{
                                            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
                                            fontSize: 13, fontWeight: 700,
                                            color: historyModal.tab === tab.key ? '#0081ff' : '#64748b',
                                            borderBottom: historyModal.tab === tab.key ? '2px solid #0081ff' : '2px solid transparent',
                                            marginBottom: -1,
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            {historyModal.tab === 'debt' && (
                                <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            type="button"
                                            onClick={() => setHistoryDebtFilter('all')}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: 6,
                                                border: historyDebtFilter === 'all' ? '1px solid #14b8a6' : '1px solid #cbd5e1',
                                                background: historyDebtFilter === 'all' ? '#f0fdfa' : '#fff',
                                                color: historyDebtFilter === 'all' ? '#0f766e' : '#475569',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            FIFO toàn bộ
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHistoryDebtFilter('overdue')}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: 6,
                                                border: historyDebtFilter === 'overdue' ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                                                background: historyDebtFilter === 'overdue' ? '#fffbeb' : '#fff',
                                                color: historyDebtFilter === 'overdue' ? '#b45309' : '#475569',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Quá {OVERDUE_DAYS} ngày ({overdueDebtInvoices.length})
                                        </button>
                                    </div>
                                    {overdueDebtInvoices.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => handleSendDebtReminder({
                                                customer: historyModal.customer,
                                                amount: overdueTotalAmount,
                                                overdueDays: oldestOverdueDays,
                                            })}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: 6,
                                                border: '1px solid #fde68a',
                                                background: '#fef3c7',
                                                color: '#92400e',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 5,
                                            }}
                                        >
                                            <Send size={12} /> Gửi nhắc nợ quá hạn
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Table */}
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {historyModal.loading ? (
                                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Đang tải...</div>
                                ) : activeInvoices.length === 0 ? (
                                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                        {historyModal.tab === 'debt' ? 'Chưa có hóa đơn ghi nợ nào.' : 'Chưa có hóa đơn nào.'}
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                            <tr>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 700 }}>Mã đơn</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 700 }}>Ngày</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 700 }}>Ngày thanh toán</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#64748b', fontWeight: 700 }}>Hình thức</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#64748b', fontWeight: 700 }}>Tổng đơn</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#64748b', fontWeight: 700 }}>Trạng thái</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#64748b', fontWeight: 700 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeInvoices.map(inv => (
                                                <tr key={inv._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#334155' }}>
                                                        #{inv._id.slice(-8).toUpperCase()}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>
                                                        {new Date(inv.created_at).toLocaleDateString('vi-VN')}
                                                        {historyModal.tab === 'debt' && getInvoiceAgeDays(getInvoiceDate(inv)) > OVERDUE_DAYS && (
                                                            <span style={{ marginLeft: 6, color: '#b45309', fontWeight: 700 }}>
                                                                +{getInvoiceAgeDays(getInvoiceDate(inv))} ngày
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#475569' }}>
                                                        {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('vi-VN') : '—'}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                            background: inv.payment_method === 'debt' ? '#fef3c7' : '#eff6ff',
                                                            color: inv.payment_method === 'debt' ? '#92400e' : '#1d4ed8',
                                                        }}>
                                                            {PAYMENT_LABELS[inv.payment_method] || inv.payment_method}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                                        {Number(inv.total_amount || 0).toLocaleString('vi-VN')}₫
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        <span style={{
                                                            padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                                            background: inv.status === 'pending' ? '#fef3c7' : inv.status === 'cancelled' ? '#fee2e2' : '#d1fae5',
                                                            color: inv.status === 'pending' ? '#92400e' : inv.status === 'cancelled' ? '#991b1b' : '#065f46',
                                                        }}>
                                                            {inv.status === 'pending' ? 'Chưa trả' : inv.status === 'cancelled' ? 'Đã huỷ' : 'Hoàn thành'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        {/* BUG-13: navigate đúng route theo role */}
                                                        <button
                                                            onClick={() => navigate(`${invoiceBasePath}/${inv._id}`)}
                                                            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#475569' }}
                                                        >
                                                            Chi tiết
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{ padding: '8px 12px', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#334155' }}>
                                    Lịch sử thanh toán nợ ({historyModal.debtPayments.length})
                                </div>
                                {historyModal.debtPayments.length === 0 ? (
                                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>Chưa có giao dịch thanh toán nợ.</div>
                                ) : (
                                    <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                                        {historyModal.debtPayments.map((p) => (
                                            <div
                                                key={p._id}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr auto auto',
                                                    gap: 8,
                                                    padding: '8px 12px',
                                                    borderTop: '1px solid #f1f5f9',
                                                    fontSize: 12,
                                                }}
                                            >
                                                <span style={{ color: '#334155' }}>
                                                    {p.payment_method === 'bank_transfer' ? 'Chuyển khoản' : 'Tiền mặt'}
                                                    {p.payment_ref ? ` (${p.payment_ref})` : ''}
                                                </span>
                                                <span style={{ color: '#0f172a', fontWeight: 700 }}>{Number(p.amount || 0).toLocaleString('vi-VN')}₫</span>
                                                <span style={{ color: '#64748b' }}>{new Date(p.received_at).toLocaleString('vi-VN')}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div style={{ marginTop: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>Dư nợ hiện tại:</span>
                                <span style={{
                                    fontWeight: 800, fontSize: 18,
                                    color: (historyModal.customer?.debt_account || 0) > 0 ? '#ef4444' : '#10b981'
                                }}>
                                    {Number(historyModal.customer?.debt_account || 0).toLocaleString('vi-VN')}₫
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {/* ── Notify Send Result Modal ── */}
            {notifyResult.show && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15,23,42,0.45)', zIndex: 1200, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 16,
                }}>
                    <div style={{
                        width: 'min(560px, 96vw)', background: '#fff', borderRadius: 16, padding: '20px 24px',
                        boxShadow: '0 30px 60px rgba(15,23,42,0.25)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                                Gửi nhắc nợ — {notifyResult.customerName}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setNotifyResult(prev => ({ ...prev, show: false }))}
                                style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#64748b', lineHeight: 1 }}
                            >×</button>
                        </div>

                        {/* Status */}
                        {notifyResult.sending ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 0', color: '#475569' }}>
                                <Loader2 size={20} className="animate-spin" />
                                <span>Đang gửi tin nhắn đến khách hàng...</span>
                            </div>
                        ) : notifyResult.status === 'sent' ? (
                            <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 12 }}>
                                <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15, marginBottom: 4 }}>
                                    ✅ Đã gửi thành công qua {notifyResult.channel === 'ZALO' ? 'Zalo' : notifyResult.channel === 'SMS' ? 'SMS' : notifyResult.channel}
                                </div>
                                <div style={{ fontSize: 12, color: '#166534' }}>Khách hàng đã nhận được tin nhắn nhắc nợ.</div>
                            </div>
                        ) : notifyResult.alreadySent ? (
                            <div style={{ padding: '14px 16px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 12 }}>
                                <div style={{ fontWeight: 700, color: '#b45309', fontSize: 15, marginBottom: 4 }}>
                                    ⚠️ Đã gửi tin nhắn này trong hôm nay
                                </div>
                                <div style={{ fontSize: 12, color: '#92400e' }}>Để tránh spam, mỗi khách chỉ nhắc 1 lần/ngày. Dùng nút "Gửi lại" nếu thực sự cần.</div>
                            </div>
                        ) : notifyResult.status === 'failed' ? (
                            <div style={{ padding: '14px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 12 }}>
                                <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 15, marginBottom: 4 }}>
                                    ❌ Gửi thất bại
                                </div>
                                <div style={{ fontSize: 12, color: '#991b1b' }}>
                                    {notifyResult.error === 'not_followed'
                                        ? 'Khách chưa quan tâm Zalo OA và SMS cũng thất bại. Kiểm tra lại số điện thoại hoặc cấu hình provider.'
                                        : notifyResult.error || 'Lỗi không xác định'}
                                </div>
                            </div>
                        ) : null}

                        {/* Message preview */}
                        {notifyResult.messagePreview && (
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nội dung tin nhắn</div>
                                <pre style={{
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                                    padding: '10px 12px', fontSize: 12.5, color: '#334155', margin: 0, lineHeight: 1.55,
                                }}>{notifyResult.messagePreview}</pre>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                            {(notifyResult.status === 'failed' || notifyResult.alreadySent) && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={notifyResult.sending}
                                    onClick={() => {
                                        // Re-trigger với force_resend=true nếu alreadySent
                                        const current = notifyResult;
                                        // Tìm lại customer từ danh sách
                                        const cust = customers.find(c => c.full_name === current.customerName) || historyModal.customer;
                                        if (cust) {
                                            handleSendDebtReminder({
                                                customer: cust,
                                                amount: Number(cust.debt_account || 0),
                                                forceResend: true,
                                            });
                                        }
                                    }}
                                >
                                    <Send size={13} style={{ marginRight: 5 }} /> Gửi lại
                                </Button>
                            )}
                            <Button
                                type="button"
                                onClick={() => setNotifyResult(prev => ({ ...prev, show: false }))}
                            >
                                Đóng
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </StaffPageShell>
    );
}
