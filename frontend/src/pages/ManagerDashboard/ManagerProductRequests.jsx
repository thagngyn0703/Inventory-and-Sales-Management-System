import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { FileStack, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { getProductRequests, approveProductRequest, rejectProductRequest } from '../../services/productsApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const LIMIT = 10;

export default function ManagerProductRequests() {
    const navigate = useNavigate();
    const [requests, setRequests] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [order, setOrder] = useState('desc');
    const [successMessage, setSuccessMessage] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ show: false, action: null, id: null, title: '', message: '' });
    const [detailModal, setDetailModal] = useState({ show: false, request: null });

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getProductRequests(page, LIMIT, search, statusFilter, { sortBy, order });
            setRequests(data.productRequests || []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách yêu cầu');
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter, sortBy, order]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearch(searchInput.trim());
        setPage(1);
    };

    const handleFilterChange = (e) => {
        setStatusFilter(e.target.value);
        setPage(1);
    };

    const toggleSort = (field) => {
        if (sortBy === field) {
            setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setOrder('desc');
        }
        setPage(1);
    };

    const renderSortIcon = (field) => {
        if (sortBy !== field) return <i className="fa-solid fa-sort" style={{ marginLeft: 8, opacity: 0.3 }} />;
        return order === 'asc' 
            ? <i className="fa-solid fa-sort-up" style={{ marginLeft: 8, color: '#0d9488' }} />
            : <i className="fa-solid fa-sort-down" style={{ marginLeft: 8, color: '#0d9488' }} />;
    };

    const openConfirm = (action, id, title, message) => {
        setConfirmModal({ show: true, action, id, title, message });
    };

    const handleConfirmClose = () => {
        setConfirmModal({ show: false, action: null, id: null, title: '', message: '' });
    };

    const openDetailModal = (request) => {
        setDetailModal({ show: true, request });
    };

    const closeDetailModal = () => {
        setDetailModal({ show: false, request: null });
    };

    const handleConfirmSubmit = async () => {
        const { action, id } = confirmModal;
        handleConfirmClose();

        if (action === 'approve') {
            setProcessingId(id);
            setError('');
            setSuccessMessage('');
            try {
                await approveProductRequest(id);
                setSuccessMessage('Đã duyệt yêu cầu tạo sản phẩm thành công.');
                fetchList();
            } catch (err) {
                setError(err.message || 'Lỗi khi duyệt yêu cầu');
            } finally {
                setProcessingId(null);
            }
        } else if (action === 'reject') {
            setProcessingId(id);
            setError('');
            setSuccessMessage('');
            try {
                await rejectProductRequest(id);
                setSuccessMessage('Đã từ chối yêu cầu tạo sản phẩm.');
                fetchList();
            } catch (err) {
                setError(err.message || 'Lỗi khi từ chối yêu cầu');
            } finally {
                setProcessingId(null);
            }
        }
    };

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

    const statusBadgeClass = (status) => {
        if (status === 'pending') return 'bg-amber-100 text-amber-900 border-amber-200/80';
        if (status === 'approved') return 'bg-emerald-100 text-emerald-900 border-emerald-200/80';
        return 'bg-rose-100 text-rose-900 border-rose-200/80';
    };

    const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const end = Math.min(page * LIMIT, total);

    return (
        <ManagerPageFrame showNotificationBell={false}>
            <StaffPageShell
                eyebrow="Kho & sản phẩm"
                eyebrowIcon={FileStack}
                title="Yêu cầu tạo sản phẩm mới"
                subtitle="Duyệt hoặc từ chối sản phẩm do nhân viên kho đề xuất."
            >
                    <Card className="border-slate-200/80 shadow-sm">
                        <CardContent className="space-y-4 p-4 sm:p-6">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
                                <form onSubmit={handleSearchSubmit} className="relative min-w-0 flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="search"
                                        placeholder="Tìm theo tên, SKU..."
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                    />
                                </form>
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                        value={statusFilter}
                                        onChange={handleFilterChange}
                                    >
                                        <option value="">Tất cả trạng thái</option>
                                        <option value="pending">Chờ duyệt</option>
                                        <option value="approved">Đã duyệt</option>
                                        <option value="rejected">Đã từ chối</option>
                                    </select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11 gap-2"
                                        onClick={() => {
                                            if (sortBy === 'created_at') {
                                                setSortBy('cost_price');
                                                setOrder('desc');
                                            } else if (sortBy === 'cost_price' && order === 'desc') {
                                                setSortBy('cost_price');
                                                setOrder('asc');
                                            } else {
                                                setSortBy('created_at');
                                                setOrder('desc');
                                            }
                                            setPage(1);
                                        }}
                                    >
                                        <SlidersHorizontal className="h-4 w-4" />
                                        {sortBy === 'created_at' ? 'Mặc định (Mới nhất)' : (order === 'desc' ? 'Giá vốn (Cao nhất)' : 'Giá vốn (Thấp nhất)')}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {successMessage && (
                        <div className="manager-products-success">{successMessage}</div>
                    )}
                    {error && <div className="manager-products-error">{error}</div>}

                    <Card className="border-slate-200/80 shadow-sm">
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
                                                <th className="px-4 py-3">SKU</th>
                                                <th className="px-4 py-3">Tên sản phẩm</th>
                                                <th className="px-4 py-3">Giá vốn</th>
                                                <th className="px-4 py-3">Giá bán</th>
                                                <th className="px-4 py-3">Người gửi</th>
                                                <th className="px-4 py-3">Ngày gửi</th>
                                                <th className="px-4 py-3">Ghi chú</th>
                                                <th className="px-4 py-3">Trạng thái</th>
                                                <th className="px-4 py-3 text-right">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {requests.length === 0 ? (
                                                <tr>
                                                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                                                        {search ? 'Không có yêu cầu nào phù hợp.' : 'Chưa có yêu cầu tạo sản phẩm nào.'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                requests.map((r) => (
                                                    <tr key={r._id} className="hover:bg-slate-50/60">
                                                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.sku || '—'}</td>
                                                        <td className="px-4 py-3 font-medium text-slate-900">{r.name || '—'}</td>
                                                        <td className="px-4 py-3 tabular-nums text-slate-700">{formatMoney(r.cost_price)}</td>
                                                        <td className="px-4 py-3 tabular-nums text-slate-700">{formatMoney(r.sale_price)}</td>
                                                        <td className="px-4 py-3 font-medium text-slate-800">
                                                            {r.requested_by?.fullName || '—'}
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                                                            {new Date(r.created_at).toLocaleDateString('vi-VN')}
                                                        </td>
                                                        <td className="max-w-[180px] px-4 py-3">
                                                            <div className="truncate text-xs text-slate-500">
                                                                {r.note || '—'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <Badge className={`border font-medium ${statusBadgeClass(r.status || 'pending')}`}>
                                                                {r.status === 'pending' ? 'Chờ duyệt' : r.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                                                            </Badge>
                                                        </td>
                                                        <td className="whitespace-nowrap px-4 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    className="h-8 px-3 text-xs"
                                                                    onClick={() => openDetailModal(r)}
                                                                >
                                                                    Chi tiết
                                                                </Button>
                                                                {r.status === 'pending' && (
                                                                    <>
                                                                        <Button
                                                                            type="button"
                                                                            className="h-8 bg-emerald-600 px-3 text-xs hover:bg-emerald-700"
                                                                            onClick={() => openConfirm('approve', r._id, 'Xác nhận duyệt', 'Bạn có chắc chắn muốn duyệt yêu cầu này? Sản phẩm sẽ được tạo trong hệ thống.')}
                                                                            disabled={processingId === r._id}
                                                                        >
                                                                            Duyệt
                                                                        </Button>
                                                                        <Button
                                                                            type="button"
                                                                            variant="warning"
                                                                            className="h-8 px-3 text-xs"
                                                                            onClick={() => openConfirm('reject', r._id, 'Từ chối yêu cầu', 'Bạn có chắc chắn muốn từ chối yêu cầu tạo sản phẩm này?')}
                                                                            disabled={processingId === r._id}
                                                                        >
                                                                            Từ chối
                                                                        </Button>
                                                                    </>
                                                                )}
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

            {confirmModal.show && (
                <div className="manager-reason-modal-overlay" onClick={handleConfirmClose}>
                    <div className="manager-reason-modal-box" onClick={(e) => e.stopPropagation()}>
                        <h3 className="manager-reason-modal-title">{confirmModal.title}</h3>
                        <p className="manager-reason-modal-hint">{confirmModal.message}</p>
                        <div className="manager-reason-modal-actions">
                            <button className="manager-btn-secondary" onClick={handleConfirmClose}>
                                Hủy
                            </button>
                            <button
                                className="manager-btn-primary"
                                style={confirmModal.action === 'reject' ? { background: '#dc2626' } : {}}
                                onClick={handleConfirmSubmit}
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {detailModal.show && detailModal.request && (
                <div className="manager-reason-modal-overlay" onClick={closeDetailModal}>
                    <div className="manager-reason-modal-box !max-w-3xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="manager-reason-modal-title">Chi tiết yêu cầu tạo sản phẩm</h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <p><strong>Tên sản phẩm:</strong> {detailModal.request.name || '—'}</p>
                            <p><strong>SKU:</strong> {detailModal.request.sku || '—'}</p>
                            <p><strong>Barcode:</strong> {detailModal.request.barcode || '—'}</p>
                            <p><strong>Giá vốn:</strong> {formatMoney(detailModal.request.cost_price)}</p>
                            <p><strong>Giá bán:</strong> {formatMoney(detailModal.request.sale_price)}</p>
                            <p><strong>Đơn vị gốc:</strong> {detailModal.request.base_unit || '—'}</p>
                            <p><strong>Mức tồn tối thiểu:</strong> {detailModal.request.reorder_level ?? 0}</p>
                            <p><strong>Người gửi:</strong> {detailModal.request.requested_by?.fullName || '—'}</p>
                            <p><strong>Ngày gửi:</strong> {detailModal.request.created_at ? new Date(detailModal.request.created_at).toLocaleString('vi-VN') : '—'}</p>
                            <p><strong>Trạng thái:</strong> {detailModal.request.status === 'pending' ? 'Chờ duyệt' : detailModal.request.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}</p>
                        </div>
                        <div className="mt-3">
                            <p className="text-sm font-semibold text-slate-700">Đơn vị bán</p>
                            {Array.isArray(detailModal.request.selling_units) && detailModal.request.selling_units.length > 0 ? (
                                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full min-w-[520px] text-sm">
                                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Đơn vị</th>
                                                <th className="px-3 py-2 text-left">Tỷ lệ</th>
                                                <th className="px-3 py-2 text-left">Giá bán</th>
                                                <th className="px-3 py-2 text-left">Barcode</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detailModal.request.selling_units.map((u, idx) => (
                                                <tr key={`${u.name || 'unit'}-${idx}`} className="border-t border-slate-100">
                                                    <td className="px-3 py-2">{u.name || '—'}</td>
                                                    <td className="px-3 py-2">{u.ratio ?? 1}</td>
                                                    <td className="px-3 py-2">{formatMoney(u.sale_price)}</td>
                                                    <td className="px-3 py-2">{u.barcode || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="mt-1 text-sm text-slate-500">Không có đơn vị bán.</p>
                            )}
                        </div>
                        <div className="mt-3">
                            <p className="text-sm font-semibold text-slate-700">Ghi chú</p>
                            <p className="mt-1 text-sm text-slate-600">{detailModal.request.note || '—'}</p>
                        </div>
                        <div className="manager-reason-modal-actions">
                            <button className="manager-btn-secondary" onClick={closeDetailModal}>
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ManagerPageFrame>
    );
}
