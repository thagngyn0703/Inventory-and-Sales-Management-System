import React, { useState, useEffect, useCallback } from 'react';
import { getProductRequests } from '../../services/productsApi';
import '../ManagerDashboard/ManagerDashboard.css';
import '../ManagerDashboard/ManagerProducts.css';

const LIMIT = 10;

export default function WarehouseProductRequests() {
    const [requests, setRequests] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getProductRequests(page, LIMIT, search, statusFilter);
            setRequests(data.productRequests || []);
            setTotal(data.total ?? 0);
            setTotalPages(data.totalPages ?? 1);
        } catch (e) {
            setError(e.message || 'Lỗi tải danh sách yêu cầu');
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

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

    const formatMoney = (n) => {
        if (n == null || isNaN(n)) return '0';
        return Number(n).toLocaleString('vi-VN') + '₫';
    };

    const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const end = Math.min(page * LIMIT, total);

    return (
        <div className="manager-content" style={{ padding: 0 }}>
            <div className="manager-products-header">
                <div>
                    <h1 className="manager-page-title">Yêu cầu tạo sản phẩm mới</h1>
                    <p className="manager-page-subtitle">Quản lý các sản phẩm mới được đề xuất bởi kho</p>
                </div>
            </div>

            <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
                <select
                    className="manager-select"
                    value={statusFilter}
                    onChange={handleFilterChange}
                >
                    <option value="">Tất cả trạng thái</option>
                    <option value="pending">Chờ duyệt</option>
                    <option value="approved">Đã duyệt</option>
                    <option value="rejected">Đã từ chối</option>
                </select>
            </div>

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
                                        <th>SKU</th>
                                        <th>Tên sản phẩm</th>
                                        <th>Giá vốn</th>
                                        <th>Giá bán</th>
                                        <th>Người gửi</th>
                                        <th>Ngày gửi</th>
                                        <th>Ghi chú</th>
                                        <th>Trạng thái</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requests.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="manager-products-empty">
                                                {search ? 'Không có yêu cầu nào phù hợp.' : 'Chưa có yêu cầu tạo sản phẩm nào.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        requests.map((r) => (
                                            <tr key={r._id}>
                                                <td>{r.sku || '—'}</td>
                                                <td><strong>{r.name || '—'}</strong></td>
                                                <td>{formatMoney(r.cost_price)}</td>
                                                <td>{formatMoney(r.sale_price)}</td>
                                                <td>
                                                    <strong>{r.requested_by?.fullName || '—'}</strong>
                                                </td>
                                                <td>
                                                    {new Date(r.created_at).toLocaleDateString('vi-VN')}
                                                </td>
                                                <td style={{ maxWidth: 150 }}>
                                                    <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', fontSize: 12, color: '#4b5563' }}>
                                                        {r.note || ''}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`manager-products-status manager-products-status--${r.status || 'pending'}`}>
                                                        {r.status === 'pending' ? 'Chờ duyệt' : r.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {/* Staff has no actions here */}
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
        </div>
    );
}
