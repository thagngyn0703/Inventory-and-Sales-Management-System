import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import SalesSidebar from './SalesSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import { getProducts } from '../../services/productsApi';
import './SalesDashboard.css';
import '../ManagerDashboard/ManagerProducts.css';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

const LIMIT = 10;

export default function SalesProductList() {
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getProducts(page, LIMIT, search);
            setProducts(data.products || []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách');
            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    useEffect(() => {
        const timer = setTimeout(() => {
            const next = searchInput.trim();
            setSearch((prev) => (prev === next ? prev : next));
            setPage(1);
        }, 250);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

    const highlightMatch = (text, query) => {
        const raw = String(text || '');
        const q = String(query || '').trim();
        if (!q) return raw;
        const lowerRaw = raw.toLowerCase();
        const lowerQ = q.toLowerCase();
        const idx = lowerRaw.indexOf(lowerQ);
        if (idx < 0) return raw;
        const before = raw.slice(0, idx);
        const match = raw.slice(idx, idx + q.length);
        const after = raw.slice(idx + q.length);
        return (
            <>
                {before}
                <mark className="rounded bg-amber-200 px-0.5 text-slate-900">{match}</mark>
                {after}
            </>
        );
    };

    const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const end = Math.min(page * LIMIT, total);

    return (
        <>
            <div style={{ marginBottom: 16, background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 500 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Tìm kiếm sản phẩm</label>
                    <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            className="pos-search-input h-10 w-full pl-9 pr-10"
                            placeholder="Tìm theo tên, SKU, barcode..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                        {searchInput.trim() && (
                            <button
                                type="button"
                                onClick={() => setSearchInput('')}
                                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <h1 className="warehouse-page-title">Danh mục Sản phẩm</h1>
            <p className="warehouse-page-subtitle">Xem danh sách và tồn kho sản phẩm trong cửa hàng.</p>

            {error && <div className="manager-products-error">{error}</div>}

            <Card className="manager-products-card">
                <CardContent className="p-0">
                {loading ? (
                    <p className="manager-products-loading">Đang tải...</p>
                ) : (
                    <>
                        <div className="manager-products-table-wrap">
                            <table className="manager-products-table">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Ảnh</th>
                                        <th>SKU</th>
                                        <th>Tên sản phẩm</th>
                                        <th>Barcode</th>
                                        <th>Giá vốn</th>
                                        <th>Giá bán</th>
                                        <th>Tồn kho</th>
                                        <th>Đơn vị</th>
                                        <th>Trạng thái</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="manager-products-empty">
                                                {search ? 'Không có sản phẩm nào phù hợp.' : 'Chưa có sản phẩm.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        products.map((p, idx) => (
                                            <tr key={p._id}>
                                                <td>{(page - 1) * LIMIT + idx + 1}</td>
                                                <td>
                                                    {Array.isArray(p.image_urls) && p.image_urls[0] ? (
                                                        <img
                                                            src={p.image_urls[0]}
                                                            alt={p.name || 'product-image'}
                                                            style={{
                                                                width: 44,
                                                                height: 44,
                                                                objectFit: 'cover',
                                                                borderRadius: 6,
                                                                border: '1px solid #e5e7eb',
                                                            }}
                                                        />
                                                    ) : (
                                                        <span style={{ color: '#9ca3af' }}>—</span>
                                                    )}
                                                </td>
                                                <td>{p.sku || '—'}</td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="manager-product-name-link"
                                                        onClick={() => navigate(`/staff/products/${p._id}`)}
                                                    >
                                                        {highlightMatch(p.name || '—', search)}
                                                    </button>
                                                </td>
                                                <td>{p.barcode || '—'}</td>
                                                <td>{formatMoney(p.cost_price)}</td>
                                                <td>{formatMoney(p.sale_price)}</td>
                                                <td>{Number(p.stock_qty ?? 0).toLocaleString('vi-VN')}</td>
                                                <td>{p.base_unit || 'Cái'}</td>
                                                <td>
                                                    <Badge className={p.status === 'inactive' ? 'bg-rose-100 text-rose-700' : ''}>
                                                        {p.status === 'inactive' ? 'Ngừng' : 'Đang bán'}
                                                    </Badge>
                                                </td>
                                                <td>
                                                    <div className="manager-products-actions">
                                                        <button
                                                            type="button"
                                                            className="manager-btn-icon"
                                                            title="Xem chi tiết"
                                                            onClick={() => navigate(`/staff/products/${p._id}`)}
                                                        >
                                                            <i className="fa-solid fa-eye" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="manager-pagination">
                                <span className="manager-pagination-info">
                                    Hiển thị {start}–{end} / {total}
                                </span>
                                <div className="manager-pagination-btns">
                                    <button
                                        type="button"
                                        className="manager-btn-secondary manager-pagination-btn"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        Trước
                                    </button>
                                    <span className="manager-pagination-page">
                                        Trang {page} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        className="manager-btn-secondary manager-pagination-btn"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    >
                                        Sau
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
                </CardContent>
            </Card>
        </>
    );
}
