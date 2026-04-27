import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Handshake, Loader2, Plus, Search } from 'lucide-react';
import { getSuppliers, setSupplierStatus } from '../../services/suppliersApi';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const LIMIT = 20;

export default function ManagerSupplierList() {
    const navigate = useNavigate();
    const location = useLocation();
    const [suppliers, setSuppliers] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [togglingId, setTogglingId] = useState(null);
    const { toast } = useToast();

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Luôn hiển thị cả nhà cung cấp đã "ngừng" để có thể bật hoạt động lại
            const data = await getSuppliers(page, LIMIT, search, 'all');
            setSuppliers(data.suppliers || []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách');
            setSuppliers([]);
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    useEffect(() => {
        const stateMessage = location.state?.success;
        if (stateMessage) {
            toast(stateMessage, 'success');
            setError('');
            window.history.replaceState({}, document.title, location.pathname + location.search);
        }
    }, [location.state, location.pathname, location.search, toast]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
        }, 250);
        return () => clearTimeout(timer);
    }, [search]);

    const handleToggleStatus = async (s) => {
        if (togglingId) return;
        const nextStatus = s.status === 'active' ? 'inactive' : 'active';
        setTogglingId(s._id);
        try {
            await setSupplierStatus(s._id, nextStatus);
            toast(nextStatus === 'active' ? 'Đã kích hoạt nhà cung cấp.' : 'Đã ngừng nhà cung cấp.', 'success');
            fetchList();
        } catch (err) {
            setError(err.message || 'Không thể đổi trạng thái');
            toast(err.message || 'Không thể đổi trạng thái', 'error');
        } finally {
            setTogglingId(null);
        }
    };

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

    const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const end = Math.min(page * LIMIT, total);

    return (
        <ManagerPageFrame showNotificationBell>
            <StaffPageShell
                eyebrow="Mua hàng & NCC"
                eyebrowIcon={Handshake}
                title="Nhà cung cấp"
                subtitle="Quản lý danh sách nhà cung cấp, công nợ và trạng thái hợp tác."
                headerActions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            className="h-11 gap-2 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
                            onClick={() => navigate('/manager/suppliers/new')}
                        >
                            <Plus className="h-4 w-4" />
                            Thêm nhà cung cấp
                        </Button>
                    </div>
                }
            >
                    {error && <div className="manager-products-error mb-4">{error}</div>}

                    <Card className="mb-4 border-slate-200/80 shadow-sm">
                        <CardContent className="p-4">
                            <div className="relative max-w-[420px]">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    placeholder="Tìm theo tên nhà cung cấp..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
                        <CardContent className="p-0">
                        {loading ? (
                            <div className="flex justify-center py-16 text-slate-500">
                                <Loader2 className="h-8 w-8 animate-spin" />
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                                    <table className="w-full min-w-[980px] text-sm text-slate-700">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                <th className="px-4 py-3">Tên nhà cung cấp</th>
                                                <th className="px-4 py-3">Điện thoại</th>
                                                <th className="px-4 py-3">Email</th>
                                                <th className="px-4 py-3">Địa chỉ</th>
                                                <th className="px-4 py-3 text-right">Công nợ</th>
                                                <th className="px-4 py-3">Trạng thái</th>
                                                <th className="px-4 py-3 text-right">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {suppliers.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                                                        {search ? 'Không có nhà cung cấp nào phù hợp.' : 'Chưa có nhà cung cấp.'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                suppliers.map((s) => (
                                                    <tr key={s._id} className="transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-teal-50/40">
                                                        <td className="px-4 py-3.5 font-medium text-slate-900">{s.name || '—'}</td>
                                                        <td className="px-4 py-3.5 text-slate-700">{s.phone || '—'}</td>
                                                        <td className="px-4 py-3.5 text-slate-700">{s.email || '—'}</td>
                                                        <td className="max-w-[260px] truncate px-4 py-3.5 text-slate-600">{s.address || '—'}</td>
                                                        <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-800">{formatMoney(s.payable_account)}</td>
                                                        <td className="px-4 py-3.5">
                                                            <Badge className={`border font-medium ${s.status === 'inactive' ? 'bg-rose-100 text-rose-900 border-rose-200/80' : 'bg-emerald-100 text-emerald-900 border-emerald-200/80'}`}>
                                                                {s.status === 'inactive' ? 'Ngừng' : 'Hoạt động'}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Button
                                                                    type="button"
                                                                    className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                                                    onClick={() => navigate(`/manager/suppliers/${s._id}/edit`)}
                                                                >
                                                                    Cập nhật
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    className={
                                                                        s.status === 'active'
                                                                            ? 'h-9 rounded-lg border border-amber-200 bg-amber-500 px-4 text-xs font-semibold text-white hover:bg-amber-600'
                                                                            : 'h-9 rounded-lg border border-emerald-200 bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700'
                                                                    }
                                                                    onClick={() => handleToggleStatus(s)}
                                                                    disabled={togglingId === s._id}
                                                                >
                                                                    {s.status === 'active' ? 'Ngừng' : 'Kích hoạt'}
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                                        <span>
                                            Hiển thị {start}–{end} / {total}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={page <= 1}
                                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            >
                                                Trước
                                            </Button>
                                            <span>
                                                Trang {page} / {totalPages}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={page >= totalPages}
                                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            >
                                                Sau
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                    </Card>
            </StaffPageShell>
        </ManagerPageFrame>
    );
}
