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
    const [priceChangeConfirmed, setPriceChangeConfirmed] = useState(false);
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

    const thStyle = { padding: '6px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' };
    const tdStyle = { padding: '6px 10px', verticalAlign: 'middle' };

    const closeImportModal = () => {
        setImportOpen(false);
        setImportPreview(null);
        setImportError('');
        setImportLoading(false);
        setImportCommitting(false);
        setPriceChangeConfirmed(false);
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
        setPriceChangeConfirmed(false);
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

        // Nếu có thay đổi giá mà chưa xác nhận thì chặn
        if (importPreview.has_price_changes && !priceChangeConfirmed) {
            setImportError('Vui lòng đọc và tích xác nhận thay đổi giá trước khi import.');
            return;
        }

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
            const result = await commitProductImport(payload, priceChangeConfirmed);

            // Backend trả 409 — cần xác nhận (double-check an toàn)
            if (result.needsConfirmation) {
                setImportError('Vui lòng xác nhận thay đổi giá trước khi import.');
                setImportCommitting(false);
                return;
            }

            const parts = [];
            if (result.createdCount > 0) parts.push(`tạo mới ${result.createdCount} sản phẩm`);
            if (result.updatedCount > 0) parts.push(`cập nhật ${result.updatedCount} sản phẩm (cộng tồn kho)`);
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

                                        {/* ── Cảnh báo thay đổi giá ── */}
                                        {importPreview.has_price_changes && (
                                            <div style={{
                                                border: '1.5px solid #f59e0b',
                                                borderRadius: 10,
                                                background: '#fffbeb',
                                                padding: '14px 16px',
                                                marginBottom: 16,
                                            }}>
                                                <p style={{ margin: '0 0 8px 0', fontWeight: 700, color: '#b45309', fontSize: 14 }}>
                                                    <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
                                                    Phát hiện {importPreview.price_changes.length} sản phẩm bị thay đổi giá
                                                </p>
                                                <p style={{ margin: '0 0 10px 0', fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>
                                                    Các sản phẩm dưới đây đang có giá khác so với hệ thống.
                                                    Sau khi import, giá mới sẽ được áp dụng ngay.
                                                    Điều này <strong>không ảnh hưởng</strong> đến các đơn hàng đã bán trước đó
                                                    (giá cũ vẫn được lưu trong từng hóa đơn),
                                                    nhưng sẽ ảnh hưởng đến <strong>báo cáo lợi nhuận từ thời điểm này trở đi</strong>.
                                                </p>
                                                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                                        <thead>
                                                            <tr style={{ background: '#fef3c7' }}>
                                                                <th style={thStyle}>Sản phẩm</th>
                                                                <th style={thStyle}>SKU</th>
                                                                <th style={{ ...thStyle, textAlign: 'right' }}>Giá vốn cũ</th>
                                                                <th style={{ ...thStyle, textAlign: 'right' }}>Giá vốn mới</th>
                                                                <th style={{ ...thStyle, textAlign: 'right' }}>Giá bán cũ</th>
                                                                <th style={{ ...thStyle, textAlign: 'right' }}>Giá bán mới</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {importPreview.price_changes.map((pc, i) => (
                                                                <tr key={i} style={{ borderBottom: '1px solid #fde68a' }}>
                                                                    <td style={tdStyle}><strong>{pc.name}</strong></td>
                                                                    <td style={tdStyle}>{pc.sku || '—'}</td>
                                                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatMoney(pc.old_cost_price)}</td>
                                                                    <td style={{ ...tdStyle, textAlign: 'right', color: pc.cost_changed ? '#b91c1c' : undefined, fontWeight: pc.cost_changed ? 700 : undefined }}>
                                                                        {formatMoney(pc.new_cost_price)}
                                                                        {pc.cost_changed && (
                                                                            <span style={{ fontSize: 11, marginLeft: 4 }}>
                                                                                ({pc.new_cost_price > pc.old_cost_price ? '▲' : '▼'}
                                                                                {Math.abs(pc.new_cost_price - pc.old_cost_price).toLocaleString('vi-VN')}₫)
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatMoney(pc.old_sale_price)}</td>
                                                                    <td style={{ ...tdStyle, textAlign: 'right', color: pc.sale_changed ? '#b91c1c' : undefined, fontWeight: pc.sale_changed ? 700 : undefined }}>
                                                                        {formatMoney(pc.new_sale_price)}
                                                                        {pc.sale_changed && (
                                                                            <span style={{ fontSize: 11, marginLeft: 4 }}>
                                                                                ({pc.new_sale_price > pc.old_sale_price ? '▲' : '▼'}
                                                                                {Math.abs(pc.new_sale_price - pc.old_sale_price).toLocaleString('vi-VN')}₫)
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: '#78350f' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={priceChangeConfirmed}
                                                        onChange={e => setPriceChangeConfirmed(e.target.checked)}
                                                        style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', accentColor: '#d97706' }}
                                                    />
                                                    <span>
                                                        <strong>Tôi đã kiểm tra và xác nhận</strong> các thay đổi giá trên là đúng.
                                                        Hệ thống sẽ cập nhật giá mới ngay sau khi import.
                                                    </span>
                                                </label>
                                            </div>
                                        )}

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
                                                    !importPreview.validCount ||
                                                    (importPreview.has_price_changes && !priceChangeConfirmed)
                                                }
                                                title={
                                                    importPreview.has_price_changes && !priceChangeConfirmed
                                                        ? 'Vui lòng tích xác nhận thay đổi giá ở trên trước khi import'
                                                        : ''
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
