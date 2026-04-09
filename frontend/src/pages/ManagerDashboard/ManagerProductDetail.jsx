import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Package } from 'lucide-react';
import { getProduct, setProductStatus } from '../../services/productsApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import './ManagerDashboard.css';
import './ManagerProducts.css';

export default function ManagerProductDetail() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [toggling, setToggling] = useState(false);

    const [batches, setBatches] = useState([]);
    const [loadingBatches, setLoadingBatches] = useState(false);

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isManager = user.role === 'manager' || user.role === 'admin';
    const isStaffPath = window.location.pathname.startsWith('/staff');

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        setError('');
        getProduct(id)
            .then(setProduct)
            .catch((e) => setError(e.message || 'Không tải được sản phẩm'))
            .finally(() => setLoading(false));

        // Fetch FIFO batches
        const { getProductBatches } = require('../../services/productsApi');
        setLoadingBatches(true);
        getProductBatches(id)
            .then(data => setBatches(data.batches || []))
            .catch(e => console.error('Lỗi tải lô hàng:', e))
            .finally(() => setLoadingBatches(false));
    }, [id]);

    const handleToggleStatus = async () => {
        if (!product || toggling) return;
        const nextStatus = product.status === 'active' ? 'inactive' : 'active';
        setToggling(true);
        try {
            const updated = await setProductStatus(product._id, nextStatus);
            setProduct(updated);
            setSuccessMessage(nextStatus === 'active' ? 'Đã kích hoạt sản phẩm.' : 'Đã ngừng bán sản phẩm.');
        } catch (err) {
            setError(err.message || 'Không thể đổi trạng thái');
        } finally {
            setToggling(false);
        }
    };

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

    if (loading) {
        if (isStaffPath) {
            return (
                <div className="manager-content">
                    <p className="manager-products-loading">Đang tải...</p>
                </div>
            );
        }
        return (
            <ManagerPageFrame showNotificationBell>
                <p className="manager-products-loading">Đang tải...</p>
            </ManagerPageFrame>
        );
    }

    if (error && !product) {
        if (isStaffPath) {
            return (
                <div className="manager-content">
                    <div className="manager-products-error">{error}</div>
                    <button type="button" className="manager-btn-secondary" onClick={() => navigate('/staff/products')}>
                        Quay lại danh sách
                    </button>
                </div>
            );
        }
        return (
            <ManagerPageFrame showNotificationBell>
                <div className="manager-products-error">{error}</div>
                <button type="button" className="manager-btn-secondary" onClick={() => navigate('/manager/products')}>
                    Quay lại danh sách
                </button>
            </ManagerPageFrame>
        );
    }

    const p = product || {};
    const profit = (Number(p.sale_price) || 0) - (Number(p.cost_price) || 0);
    const costNum = Number(p.cost_price) || 0;
    const marginPct = costNum > 0 && profit >= 0 ? ((profit / costNum) * 100).toFixed(1) : '0';

    const headerActions = (
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(isStaffPath ? '/staff/products' : '/manager/products')}>
                Danh sách
            </Button>
            {isManager && (
                <>
                    <Button type="button" variant="outline" onClick={() => navigate(`/manager/products/${id}/edit`)}>
                        Sửa
                    </Button>
                    <Button
                        type="button"
                        variant={p.status === 'active' ? 'warning' : 'default'}
                        onClick={handleToggleStatus}
                        disabled={toggling}
                    >
                        {p.status === 'active' ? 'Ngừng bán' : 'Kích hoạt'}
                    </Button>
                </>
            )}
        </div>
    );

    const detailInner = (
        <>
            {successMessage && <div className="manager-products-success">{successMessage}</div>}
            {error && <div className="manager-products-error">{error}</div>}

            <div className="grid gap-4 xl:grid-cols-12">
                <Card className="xl:col-span-8">
                    <CardContent className="space-y-3">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Thông tin chung</h3>
                        <div className="grid gap-2 md:grid-cols-2">
                            <div className="text-sm text-slate-600">Tên: <strong className="text-slate-900">{p.name || '—'}</strong></div>
                            <div className="text-sm text-slate-600">SKU: <strong className="text-slate-900">{p.sku || '—'}</strong></div>
                            <div className="text-sm text-slate-600">Barcode: <strong className="text-slate-900">{p.barcode || '—'}</strong></div>
                            <div className="text-sm text-slate-600">Nhà cung cấp: <strong className="text-slate-900">{typeof p.supplier_id === 'object' ? (p.supplier_id?.name || '—') : '—'}</strong></div>
                            <div className="text-sm text-slate-600">Hạn dùng: <strong className="text-slate-900">{p.expiry_date ? new Date(p.expiry_date).toLocaleDateString('vi-VN') : '—'}</strong></div>
                            <div className="text-sm text-slate-600">Trạng thái: <Badge className={p.status === 'inactive' ? 'border border-rose-200/80 bg-rose-100 text-rose-800' : 'border border-teal-200/80 bg-teal-50 text-teal-800'}>{p.status === 'inactive' ? 'Ngừng bán' : 'Đang bán'}</Badge></div>
                        </div>
                        <p className="text-xs text-slate-500">{Platform.select({ web: 'Thông tin hiển thị đồng bộ với màn thêm/sửa sản phẩm.', default: 'Thông tin sản phẩm.' })}</p>
                    </CardContent>
                </Card>
                <Card className="xl:col-span-4">
                    <CardContent className="space-y-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Ảnh sản phẩm</h3>
                        {Array.isArray(p.image_urls) && p.image_urls.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {p.image_urls.slice(0, 3).map((url, idx) => (
                                    <img key={`${url}-${idx}`} src={url} alt={`${p.name || 'product'}-${idx + 1}`} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
                                ))}
                            </div>
                        ) : <div className="text-sm text-slate-400">Chưa có ảnh</div>}
                    </CardContent>
                </Card>
                <Card className="xl:col-span-8">
                    <CardContent className="space-y-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Giá & tồn kho</h3>
                        <div className="grid gap-2 md:grid-cols-2">
                            <div className="text-sm text-slate-600">Đơn vị gốc: <strong className="text-slate-900">{p.base_unit || 'Cái'}</strong></div>
                            <div className="text-sm text-slate-600">Giá vốn: <strong className="text-slate-900">{formatMoney(p.cost_price)}</strong></div>
                            <div className="text-sm text-slate-600">Giá bán: <strong className="text-slate-900">{formatMoney(p.sale_price)}</strong></div>
                            <div className="text-sm text-slate-600">Tồn hiện tại: <strong className="text-slate-900">{p.stock_qty ?? 0}</strong></div>
                            <div className="text-sm text-slate-600">Mức tối thiểu: <strong className="text-slate-900">{p.reorder_level ?? 0}</strong></div>
                            <div className="text-sm text-slate-600">Lãi dự kiến: <strong className="text-emerald-700">{formatMoney(profit)} ({marginPct}%)</strong></div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="xl:col-span-4">
                    <CardContent className="space-y-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Đơn vị bán & giá</h3>
                        {(p.selling_units && p.selling_units.length) > 0 ? (
                            <div className="space-y-1">
                                {p.selling_units.map((u, i) => (
                                    <div key={i} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700">
                                        {u.name} - tỉ lệ {u.ratio} - {formatMoney(u.sale_price)}
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-sm text-slate-400">Chưa khai báo đơn vị bán</div>}
                    </CardContent>
                </Card>

                {/* FIFO Batches Section */}
                <Card className="xl:col-span-12">
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Quản lý lô học (FIFO)</h3>
                            <Badge variant="outline" className="font-normal text-slate-500">
                                Sắp xếp theo ngày nhập (Cũ nhất trước)
                            </Badge>
                        </div>
                        {loadingBatches ? (
                            <p className="py-4 text-center text-sm text-slate-400">Đang tải lô hàng...</p>
                        ) : batches.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg border border-slate-100">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold">Ngày nhập</th>
                                            <th className="px-4 py-3 font-semibold">Mã phiếu</th>
                                            <th className="px-4 py-3 font-semibold text-right">SL ban đầu</th>
                                            <th className="px-4 py-3 font-semibold text-right">Còn lại</th>
                                            <th className="px-4 py-3 font-semibold text-right">Giá vốn</th>
                                            <th className="px-4 py-3 font-semibold">Ghi chú</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {batches.map((b) => (
                                            <tr key={b._id} className="hover:bg-slate-50/50">
                                                <td className="px-4 py-3 text-slate-600">
                                                    {new Date(b.received_at).toLocaleDateString('vi-VN')}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {b.receipt_id ? (
                                                        <span className="font-mono text-xs text-teal-600">
                                                            #{String(b.receipt_id).slice(-6).toUpperCase()}
                                                        </span>
                                                    ) : <span className="text-slate-400">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-500">
                                                    {b.initial_qty}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <strong className="text-slate-900">{b.remaining_qty}</strong>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600">
                                                    {formatMoney(b.unit_cost)}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500 italic">
                                                    {b.note || ''}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
                                <p className="text-sm text-slate-400">Chưa có lô hàng nào được ghi nhận cho sản phẩm này.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );

    const content = isStaffPath ? (
        <div className="manager-product-create-fullwidth bg-slate-50">
            <div className="manager-products-header">
                <div>
                    <h1 className="manager-page-title">Chi tiết sản phẩm</h1>
                    <p className="manager-page-subtitle">{p.name || p.sku || '—'}</p>
                </div>
                {headerActions}
            </div>
            {detailInner}
        </div>
    ) : (
        <StaffPageShell
            eyebrow="Quản lý cửa hàng"
            eyebrowIcon={Package}
            title="Chi tiết sản phẩm"
            subtitle={p.name || p.sku || '—'}
            headerActions={headerActions}
        >
            <div className="manager-product-create-fullwidth">{detailInner}</div>
        </StaffPageShell>
    );

    if (isStaffPath) return <div className="manager-content">{content}</div>;

    return <ManagerPageFrame showNotificationBell>{content}</ManagerPageFrame>;
}
