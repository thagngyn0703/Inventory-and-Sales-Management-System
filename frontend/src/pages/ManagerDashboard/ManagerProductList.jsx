import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import { Search, X, Package } from 'lucide-react';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import {
    getProducts,
    setProductStatus,
    downloadProductImportTemplate,
    previewProductImport,
    commitProductImport,
} from '../../services/productsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { getStoreTaxSettings } from '../../services/adminApi';

const LIMIT = 10;

export default function ManagerProductList() {
    const navigate = useNavigate();
    const location = useLocation();
    const [products, setProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [toast, setToast] = useState(null);
    const [togglingId, setTogglingId] = useState(null);
    const [categoryVatMap, setCategoryVatMap] = useState({});
    const [defaultVatRate, setDefaultVatRate] = useState(0);

    const [importOpen, setImportOpen] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importCommitting, setImportCommitting] = useState(false);
    const [importError, setImportError] = useState('');
    const fileInputRef = useRef(null);
    const toastTimerRef = useRef(null);

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
        const token = localStorage.getItem('token') || '';
        let cancelled = false;

        const loadTaxContext = async () => {
            try {
                const [categoryRes, taxRes] = await Promise.all([
                    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/categories?all=true`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ([])) })),
                    getStoreTaxSettings().catch(() => ({ tax_rate: 0 })),
                ]);

                if (cancelled) return;
                const list = Array.isArray(categoryRes?.data) ? categoryRes.data : [];
                const nextMap = {};
                list.forEach((c) => {
                    if (!c?._id) return;
                    nextMap[String(c._id)] = c.vat_rate;
                });
                setCategoryVatMap(nextMap);
                setDefaultVatRate(Number(taxRes?.tax_rate) || 0);
            } catch {
                if (!cancelled) {
                    setCategoryVatMap({});
                    setDefaultVatRate(0);
                }
            }
        };

        loadTaxContext();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const stateMessage = location.state?.success;
        if (stateMessage) {
            setSuccessMessage(stateMessage);
            setError('');
            window.history.replaceState({}, document.title, location.pathname + location.search);
        }
    }, [location.state]);

    useEffect(() => {
        if (!successMessage) return;
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ type: 'success', message: successMessage });
        setSuccessMessage('');
        toastTimerRef.current = setTimeout(() => setToast(null), 2800);
    }, [successMessage]);

    useEffect(() => () => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            const next = searchInput.trim();
            setSearch((prev) => (prev === next ? prev : next));
            setPage(1);
        }, 250);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const handleToggleStatus = async (p) => {
        if (togglingId) return;
        const nextStatus = p.status === 'active' ? 'inactive' : 'active';
        setTogglingId(p._id);
        try {
            await setProductStatus(p._id, nextStatus);
            setSuccessMessage(nextStatus === 'active' ? 'Đã kích hoạt sản phẩm.' : 'Đã ngừng bán sản phẩm.');
            fetchList();
        } catch (err) {
            setError(err.message || 'Không thể đổi trạng thái');
        } finally {
            setTogglingId(null);
        }
    };

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

    const getEffectiveVatRate = (product) => {
        const productVat = product?.vat_rate;
        if (productVat !== null && productVat !== undefined && productVat !== '') {
            return Number(productVat) || 0;
        }
        const categoryId = product?.category_id
            ? (typeof product.category_id === 'object' ? product.category_id._id : product.category_id)
            : null;
        if (categoryId) {
            const categoryVat = categoryVatMap[String(categoryId)];
            if (categoryVat !== null && categoryVat !== undefined && categoryVat !== '') {
                return Number(categoryVat) || 0;
            }
        }
        return Number(defaultVatRate) || 0;
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

    const closeImportModal = () => {
        setImportOpen(false);
        setImportPreview(null);
        setImportError('');
        setImportLoading(false);
        setImportCommitting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDownloadTemplate = async () => {
        setImportError('');
        try {
            await downloadProductImportTemplate();
        } catch (e) {
            setImportError(e.message || 'Không tải được file mẫu');
        }
    };

    const handleImportFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportError('');
        setImportPreview(null);
        setImportLoading(true);
        try {
            const data = await previewProductImport(file);
            setImportPreview(data);
        } catch (err) {
            setImportError(err.message || 'Không đọc được file');
        } finally {
            setImportLoading(false);
        }
    };

    const handleCommitImport = async () => {
        if (!importPreview?.rows?.length) return;
        const validRows = importPreview.rows.filter((r) => r.valid);
        if (validRows.length === 0) return;

        const payload = validRows.map((r) => ({
            row: r.row,
            name: r.name,
            cost_price: r.cost_price,
            sale_price: r.sale_price,
            sku: r.sku || '',
            stock_qty: r.stock_qty,
            base_unit: r.base_unit || 'Cái',
            barcode: r.barcode || '',
        }));
        setImportCommitting(true);
        setImportError('');
        try {
            const result = await commitProductImport(payload);

            const parts = [];
            if (result.createdCount > 0) parts.push(`tạo mới ${result.createdCount} sản phẩm`);
            if (result.updatedCount > 0) {
                parts.push(`tăng tồn kho ${result.updatedCount} sản phẩm đã có`);
            }
            const msg =
                parts.length > 0
                    ? `Đã ${parts.join(', ')}.${result.failedCount > 0 ? ` (${result.failedCount} dòng lỗi.)` : ''}`
                    : result.failedCount > 0
                      ? `Không thành công (${result.failedCount} dòng lỗi).`
                      : 'Hoàn tất.';
            setSuccessMessage(msg);
            closeImportModal();
            fetchList();
        } catch (err) {
            setImportError(err.message || 'Import thất bại');
        } finally {
            setImportCommitting(false);
        }
    };

    const renderImportActionBadge = (row) => {
        if (!row?.valid) {
            return (
                <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    Lỗi dữ liệu
                </span>
            );
        }
        if (row.import_action === 'create_new') {
            return (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Tạo mới
                </span>
            );
        }
        if (row.import_action === 'stock_increase_only') {
            return (
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                    Cộng tồn kho
                </span>
            );
        }
        return (
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600">
                Chưa phân loại
            </span>
        );
    };

    const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const end = Math.min(page * LIMIT, total);

    return (
        <ManagerPageFrame
            showNotificationBell
            topBarLeft={
                <div className="relative w-full min-w-0 max-w-xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-900 outline-none ring-teal-200/80 transition focus:ring-2"
                        placeholder="Tìm kiếm theo tên, SKU, barcode..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                    {searchInput.trim() && (
                        <button
                            type="button"
                            onClick={() => setSearchInput('')}
                            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                            title="Xóa tìm kiếm"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            }
        >
            <StaffPageShell
                eyebrow="Quản lý cửa hàng"
                eyebrowIcon={Package}
                title="Sản phẩm"
                subtitle={`Xem danh sách và tìm kiếm sản phẩm. ${Platform.select({ web: 'Giao diện đồng bộ với trang thêm/sửa sản phẩm.', default: 'Danh sách sản phẩm.' })}`}
                    headerActions={
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setImportOpen(true);
                                    setImportPreview(null);
                                    setImportError('');
                                }}
                            >
                                Import Excel
                            </Button>
                            <Button type="button" onClick={() => navigate('/manager/quick-receipt')}>
                                Nhập hàng
                            </Button>
                        </>
                    }
            >
                    {error && <div className="manager-products-error">{error}</div>}

                    <Card className="manager-products-card rounded-2xl border border-slate-200/80 shadow-sm">
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
                                                                onClick={() => navigate(`/manager/products/${p._id}`)}
                                                            >
                                                                {highlightMatch(p.name || '—', search)}
                                                            </button>
                                                            <div style={{ marginTop: 6 }}>
                                                                <Badge className="border border-amber-200/80 bg-amber-50 text-amber-800">
                                                                    VAT ap dung: {getEffectiveVatRate(p)}%
                                                                </Badge>
                                                            </div>
                                                        </td>
                                                        <td>{p.barcode || '—'}</td>
                                                        <td>{formatMoney(p.cost_price)}</td>
                                                        <td>{formatMoney(p.sale_price)}</td>
                                                        <td>{Number(p.stock_qty ?? 0).toLocaleString('vi-VN')}</td>
                                                        <td>{p.base_unit || 'Cái'}</td>
                                                        <td>
                                                            <Badge
                                                                className={
                                                                    p.status === 'inactive'
                                                                        ? 'border border-rose-200/80 bg-rose-100 text-rose-800'
                                                                        : 'border border-teal-200/80 bg-teal-50 text-teal-800'
                                                                }
                                                            >
                                                                {p.status === 'inactive' ? 'Ngừng' : 'Đang bán'}
                                                            </Badge>
                                                        </td>
                                                        <td>
                                                            <div className="manager-products-actions">
                                                                <button
                                                                    type="button"
                                                                    className="manager-btn-icon"
                                                                    title="Xem chi tiết"
                                                                    onClick={() => navigate(`/manager/products/${p._id}`)}
                                                                >
                                                                    <i className="fa-solid fa-eye" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="manager-btn-icon"
                                                                    title="Sửa"
                                                                    onClick={() => navigate(`/manager/products/${p._id}/edit`)}
                                                                >
                                                                    <i className="fa-solid fa-pen" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="manager-btn-icon"
                                                                    title={p.status === 'active' ? 'Ngừng bán' : 'Kích hoạt'}
                                                                    onClick={() => handleToggleStatus(p)}
                                                                    disabled={togglingId === p._id}
                                                                >
                                                                    {p.status === 'active' ? (
                                                                        <i className="fa-solid fa-pause" />
                                                                    ) : (
                                                                        <i className="fa-solid fa-play" />
                                                                    )}
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
            </StaffPageShell>

                    {importOpen && (
                        <div
                            className="manager-import-overlay"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="import-modal-title"
                            onClick={closeImportModal}
                        >
                            <div
                                className="manager-import-modal"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h2 id="import-modal-title">Import sản phẩm từ Excel</h2>

                                <p className="manager-import-hint">
                                    Dòng đầu tiên là tiêu đề. Bắt buộc: <strong>Tên sản phẩm</strong>,{' '}
                                    <strong>Giá nhập</strong>, <strong>Giá bán</strong>. Tùy chọn: SKU, Barcode, Số lượng cộng thêm, Đơn vị cơ bản.
                                    {' '}Ưu tiên định danh theo Barcode, sau đó đến SKU.
                                </p>
                                <div className="manager-import-actions">
                                    <button
                                        type="button"
                                        className="manager-btn-outline"
                                        onClick={handleDownloadTemplate}
                                    >
                                        <i className="fa-solid fa-download" /> Tải file mẫu
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                        onChange={handleImportFileChange}
                                    />
                                </div>
                                {importLoading && <p className="manager-products-loading">Đang đọc file...</p>}
                                {importError && <div className="manager-products-error">{importError}</div>}
                                {importPreview && (
                                    <>
                                        <p className="manager-import-stats">
                                            Tổng: <strong>{importPreview.totalRows}</strong> dòng — Hợp lệ:{' '}
                                            <strong>{importPreview.validCount}</strong> —{' '}
                                            <span className="err">Lỗi: {importPreview.invalidCount}</span>
                                        </p>
                                        <p className="manager-import-hint" style={{ marginTop: -6 }}>
                                            Nhận diện: <strong>{importPreview.newCount || 0}</strong> sản phẩm mới,{' '}
                                            <strong>{importPreview.existingCount || 0}</strong> sản phẩm đã có.
                                        </p>
                                        <p className="manager-import-hint" style={{ marginTop: -6 }}>
                                            Sản phẩm đã có: chỉ cộng tồn kho, không cập nhật giá; nếu để trống Giá nhập sẽ dùng giá vốn hiện tại.
                                            Số lượng trong file phải quy về đơn vị cơ bản (base unit).
                                        </p>

                                        <div className="manager-import-table-wrap">
                                            <table className="manager-import-table">
                                                <thead>
                                                    <tr>
                                                        <th>Dòng</th>
                                                        <th>OK</th>
                                                        <th>Hành động</th>
                                                        <th>Tên</th>
                                                        <th>Giá nhập</th>
                                                        <th>Giá bán</th>
                                                        <th>SKU</th>
                                                        <th>SL cộng thêm</th>
                                                        <th>Đơn vị</th>
                                                        <th>Barcode</th>
                                                        <th>Ghi chú lỗi</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {importPreview.rows.map((r) => (
                                                        <tr
                                                            key={r.row}
                                                            className={r.valid ? '' : 'invalid-row'}
                                                        >
                                                            <td>{r.row}</td>
                                                            <td>
                                                                <span
                                                                    className={`manager-import-badge ${
                                                                        r.valid
                                                                            ? 'manager-import-badge--ok'
                                                                            : 'manager-import-badge--bad'
                                                                    }`}
                                                                >
                                                                    {r.valid ? 'OK' : 'Lỗi'}
                                                                </span>
                                                            </td>
                                                            <td>{renderImportActionBadge(r)}</td>
                                                            <td>{r.name || '—'}</td>
                                                            <td>{r.cost_price == null ? '—' : formatMoney(r.cost_price)}</td>
                                                            <td>{formatMoney(r.sale_price)}</td>
                                                            <td>{r.sku || '—'}</td>
                                                            <td>{r.stock_qty}</td>
                                                            <td>{r.base_unit}</td>
                                                            <td>{r.barcode || '—'}</td>
                                                            <td className="manager-import-err-cell">
                                                                {r.errors?.length
                                                                    ? r.errors.join('; ')
                                                                    : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="manager-import-footer">
                                            <button
                                                type="button"
                                                className="manager-btn-outline"
                                                onClick={closeImportModal}
                                            >
                                                Đóng
                                            </button>
                                            <button
                                                type="button"
                                                className="manager-btn-primary"
                                                disabled={
                                                    importCommitting ||
                                                    !importPreview.validCount
                                                }
                                                onClick={handleCommitImport}
                                            >
                                                {importCommitting
                                                    ? 'Đang import...'
                                                    : `Import ${importPreview.validCount} sản phẩm hợp lệ`}
                                            </button>
                                        </div>
                                    </>
                                )}
                                {!importPreview && (
                                    <div className="manager-import-footer">
                                        <button
                                            type="button"
                                            className="manager-btn-outline"
                                            onClick={closeImportModal}
                                        >
                                            Đóng
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
            {toast && (
                <div className="fixed right-4 top-4 z-[2500]">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
                        {toast.message}
                    </div>
                </div>
            )}
        </ManagerPageFrame>
    );
}
