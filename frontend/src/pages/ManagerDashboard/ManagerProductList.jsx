import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import {
    getProducts,
    setProductStatus,
    downloadProductImportTemplate,
    previewProductImport,
    commitProductImport,
} from '../../services/productsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

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
    const [togglingId, setTogglingId] = useState(null);

    const [importOpen, setImportOpen] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importCommitting, setImportCommitting] = useState(false);
    const [importError, setImportError] = useState('');
    const fileInputRef = useRef(null);

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
        const stateMessage = location.state?.success;
        if (stateMessage) {
            setSuccessMessage(stateMessage);
            setError('');
            window.history.replaceState({}, document.title, location.pathname + location.search);
        }
    }, [location.state]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearch(searchInput.trim());
        setPage(1);
    };

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
            if (result.updatedCount > 0) parts.push(`cập nhật ${result.updatedCount} sản phẩm (cộng tồn kho)`);
            const msg =
                parts.length > 0
                    ? `Đã ${parts.join(', ')}.${
                          result.failedCount > 0 ? ` (${result.failedCount} dòng lỗi.)` : ''
                      }`
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

    const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const end = Math.min(page * LIMIT, total);

    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <form onSubmit={handleSearchSubmit} className="manager-topbar-search-wrap">
                        <input
                            type="search"
                            className="manager-search"
                            placeholder="Tìm kiếm theo tên, SKU, barcode..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                        <button type="submit" className="manager-icon-btn" aria-label="Tìm kiếm">
                            <i className="fa-solid fa-search" />
                        </button>
                    </form>
                    <div className="manager-topbar-actions">
                        <ManagerNotificationBell />
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content">
                    <div className="manager-products-header">
                        <div>
                            <h1 className="manager-page-title">Sản phẩm</h1>
                            <p className="manager-page-subtitle">Xem danh sách và tìm kiếm sản phẩm</p>
                        </div>
                        <div className="manager-supplier-header-actions">
                            <button
                                type="button"
                                className="manager-btn-outline"
                                onClick={() => {
                                    setImportOpen(true);
                                    setImportPreview(null);
                                    setImportError('');
                                }}
                            >
                                <i className="fa-solid fa-file-import" /> Import Excel
                            </button>
                            <button
                                type="button"
                                className="manager-btn-primary"
                                onClick={() => navigate('/manager/products/new')}
                            >
                                <i className="fa-solid fa-plus" /> Thêm sản phẩm
                            </button>
                        </div>
                    </div>

                    {successMessage && (
                        <div className="manager-products-success">{successMessage}</div>
                    )}
                    {error && <div className="manager-products-error">{error}</div>}

                    <div className="manager-panel-card manager-products-card">
                        {loading ? (
                            <p className="manager-products-loading">Đang tải...</p>
                        ) : (
                            <>
                                <div className="manager-products-table-wrap">
                                    <table className="manager-products-table">
                                        <thead>
                                            <tr>
                                                <th>STT</th>
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
                                                    <td colSpan={10} className="manager-products-empty">
                                                        {search ? 'Không có sản phẩm nào phù hợp.' : 'Chưa có sản phẩm.'}
                                                    </td>
                                                </tr>
                                            ) : (
                                                products.map((p, idx) => (
                                                    <tr key={p._id}>
                                                        <td>{(page - 1) * LIMIT + idx + 1}</td>
                                                        <td>{p.sku || '—'}</td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="manager-product-name-link"
                                                                onClick={() => navigate(`/manager/products/${p._id}`)}
                                                            >
                                                                {p.name || '—'}
                                                            </button>
                                                        </td>
                                                        <td>{p.barcode || '—'}</td>
                                                        <td>{formatMoney(p.cost_price)}</td>
                                                        <td>{formatMoney(p.sale_price)}</td>
                                                        <td>{Number(p.stock_qty ?? 0).toLocaleString('vi-VN')}</td>
                                                        <td>{p.base_unit || 'Cái'}</td>
                                                        <td>
                                                            <span className={`manager-products-status manager-products-status--${p.status || 'active'}`}>
                                                                {p.status === 'inactive' ? 'Ngừng' : 'Đang bán'}
                                                            </span>
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
                    </div>

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
                                    <strong>Giá gốc</strong>, <strong>Giá bán</strong>. Tùy chọn: SKU, Tồn kho, Đơn vị,
                                    Barcode.                                     Ưu tiên khớp theo <strong>tên sản phẩm</strong> (đúng như trên hệ thống, không phân
                                    biệt hoa thường); nếu không trùng tên thì mới xét <strong>SKU</strong> (khi đã có mã
                                    trên hệ thống). Khi khớp, hệ thống <strong>cộng tồn kho</strong> và cập nhật giá —
                                    không tạo bản ghi trùng.
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
                                        <div className="manager-import-table-wrap">
                                            <table className="manager-import-table">
                                                <thead>
                                                    <tr>
                                                        <th>Dòng</th>
                                                        <th>OK</th>
                                                        <th>Tên</th>
                                                        <th>Giá gốc</th>
                                                        <th>Giá bán</th>
                                                        <th>SKU</th>
                                                        <th>Tồn (+)</th>
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
                                                            <td>{r.name || '—'}</td>
                                                            <td>{formatMoney(r.cost_price)}</td>
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
                </div>
            </div>
        </div>
    );
}
