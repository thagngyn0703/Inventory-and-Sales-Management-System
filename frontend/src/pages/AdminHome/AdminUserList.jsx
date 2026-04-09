import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import { useToast } from '../../contexts/ToastContext';
import {
    getAdminUsers,
    patchAdminUserStatus,
    getAdminStores,
    assignUserToStore,
} from '../../services/adminApi';
import './AdminDashBoard.css';
import './AdminUserList.css';

const ROLE_LABELS = {
    admin: 'Quản trị hệ thống',
    manager: 'Quản lý',
    staff: 'Nhân viên',
    warehouse_staff: 'Nhân viên (cũ)',
    sales_staff: 'Nhân viên (cũ)',
};

function storeLabel(u) {
    if (u.storeId && typeof u.storeId === 'object' && u.storeId.name) {
        const suffix = u.storeId.status === 'inactive' ? ' (cửa hàng ngừng HD)' : '';
        return `${u.storeId.name}${suffix}`;
    }
    if (u.role === 'admin') return '—';
    if (u.role === 'manager') return 'Chưa đăng ký cửa hàng';
    return 'Chưa gán cửa hàng';
}

function canAssignToStore(u) {
    return u.role === 'staff' && !u.storeId;
}

const PAGE_SIZE = 10;

export default function AdminUserList() {
    const { toast } = useToast();
    const [users, setUsers] = useState([]);
    const [stores, setStores] = useState([]);
    const [summary, setSummary] = useState({ totalAll: 0, totalActive: 0, totalInactive: 0, totalAdmin: 0 });
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [toggling, setToggling] = useState(null);
    const [assigning, setAssigning] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ show: false, userId: null, currentStatus: '', userName: '' });
    const [assignModal, setAssignModal] = useState({
        show: false,
        userId: null,
        userName: '',
        storeId: '',
    });

    const currentUserId = useMemo(() => {
        try {
            const raw = localStorage.getItem('user');
            const u = raw ? JSON.parse(raw) : {};
            return u?.id || u?._id || '';
        } catch {
            return '';
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch((prev) => {
                const next = search.trim();
                if (next !== prev) {
                    setPage(1);
                }
                return next;
            });
        }, 350);
        return () => clearTimeout(t);
    }, [search]);

    const loadStores = useCallback(async () => {
        try {
            const data = await getAdminStores({ all: true, status: 'all' });
            setStores(data.stores || []);
        } catch {
            setStores([]);
        }
    }, []);

    useEffect(() => {
        loadStores();
    }, [loadStores]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getAdminUsers({
                page,
                limit: PAGE_SIZE,
                q: debouncedSearch,
                status: statusFilter,
            });
            setUsers(data.users || []);
            setSummary(data.summary || {});
            setTotal(Number(data.total) || 0);
            setTotalPages(Math.max(1, Number(data.totalPages) || 1));
        } catch (err) {
            setError(err.message || 'Không thể tải danh sách người dùng');
            setUsers([]);
            setTotal(0);
            setTotalPages(1);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, statusFilter, page]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        if (totalPages >= 1 && page > totalPages) {
            setPage(totalPages);
        }
    }, [totalPages, page]);

    const handleSearch = (e) => {
        setSearch(e.target.value);
    };

    const handleFilterChange = (val) => {
        setStatusFilter(val);
        setPage(1);
    };

    const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const endItem = Math.min(page * PAGE_SIZE, total);

    const handleClickToggle = (user) => {
        setConfirmModal({
            show: true,
            userId: user._id,
            currentStatus: user.status,
            userName: user.fullName,
        });
    };

    const confirmToggleStatus = async () => {
        const { userId, currentStatus } = confirmModal;
        setConfirmModal({ show: false, userId: null, currentStatus: '', userName: '' });

        setToggling(userId);
        const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
        try {
            await patchAdminUserStatus(userId, newStatus);
            await fetchUsers();
            toast(
                newStatus === 'active'
                    ? 'Đã kích hoạt tài khoản thành công'
                    : 'Đã vô hiệu hóa tài khoản thành công',
                'success'
            );
        } catch (err) {
            toast(err.message || 'Lỗi khi cập nhật', 'error');
        }
        setToggling(null);
    };

    const openAssignModal = (user) => {
        setAssignModal({
            show: true,
            userId: user._id,
            userName: user.fullName,
            storeId: stores[0]?._id || '',
        });
    };

    const confirmAssignStore = async () => {
        const { userId, storeId } = assignModal;
        if (!storeId) {
            toast('Vui lòng chọn cửa hàng', 'error');
            return;
        }
        setAssigning(true);
        try {
            await assignUserToStore(userId, storeId);
            setAssignModal({ show: false, userId: null, userName: '', storeId: '' });
            await fetchUsers();
            toast('Đã gán cửa hàng thành công', 'success');
        } catch (err) {
            toast(err.message || 'Không thể gán cửa hàng', 'error');
        }
        setAssigning(false);
    };

    const formatDate = (d) => {
        if (!d) return '-';
        return new Date(d).toLocaleDateString('vi-VN');
    };

    const summaryCards = [
        { title: 'Tổng tài khoản', value: summary.totalAll, icon: '👥', tone: 'blue' },
        { title: 'Đang hoạt động', value: summary.totalActive, icon: '✅', tone: 'green' },
        { title: 'Đã vô hiệu hóa', value: summary.totalInactive, icon: '🚫', tone: 'red' },
        { title: 'Quản trị hệ thống', value: summary.totalAdmin, icon: '🛡️', tone: 'purple' },
    ];

    return (
        <div className="admin-page-with-sidebar">
            <Sidebar />
            <div className="admin-users-main">
                <header className="admin-users-topbar">
                    <input
                        type="search"
                        className="admin-users-search"
                        placeholder="Tìm kiếm theo tên, email..."
                        value={search}
                        onChange={handleSearch}
                    />
                    <div className="admin-users-topbar-actions">
                        <div className="admin-users-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản trị viên</span>
                        </div>
                    </div>
                </header>

                <div className="admin-users-content">
                    <div className="admin-users-page-header">
                        <h1 className="admin-users-page-title">Quản lý tài khoản</h1>
                        <p className="admin-users-page-subtitle">
                            Danh sách toàn bộ tài khoản, cửa hàng đang thuộc về, bật/tắt hoạt động và gán nhân viên chưa có
                            cửa hàng.
                        </p>
                    </div>

                    {error && <div className="admin-users-banner-error">{error}</div>}

                    <div className="admin-users-summary-row">
                        {summaryCards.map((card, i) => (
                            <div key={i} className={`au-summary-card au-summary-card--${card.tone}`}>
                                <div className="au-summary-card__icon-wrap">
                                    <span className="au-summary-card__icon">{card.icon}</span>
                                </div>
                                <div className="au-summary-card__body">
                                    <div className="au-summary-card__title">{card.title}</div>
                                    <div className="au-summary-card__value">{card.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="admin-users-toolbar">
                        <div className="admin-users-toolbar-filters">
                            {[
                                { label: 'Tất cả', value: '' },
                                { label: 'Hoạt động', value: 'active' },
                                { label: 'Vô hiệu hóa', value: 'inactive' },
                            ].map((f) => (
                                <button
                                    key={f.value || 'all'}
                                    type="button"
                                    className={`au-filter-tab ${statusFilter === f.value ? 'au-filter-tab--active' : ''}`}
                                    onClick={() => handleFilterChange(f.value)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <p className="admin-users-count-hint">
                            {loading
                                ? 'Đang tải…'
                                : total === 0
                                  ? 'Không có tài khoản phù hợp'
                                  : `Hiển thị ${startItem}-${endItem} / ${total} tài khoản`}
                        </p>
                    </div>

                    <div className="admin-users-table-card">
                        {loading ? (
                            <div className="admin-users-loading">Đang tải...</div>
                        ) : users.length === 0 ? (
                            <div className="admin-users-empty">Không tìm thấy người dùng nào</div>
                        ) : (
                            <>
                            <table className="au-table">
                                <thead>
                                    <tr>
                                        <th>HỌ TÊN</th>
                                        <th>EMAIL</th>
                                        <th>VAI TRÒ</th>
                                        <th>CỬA HÀNG</th>
                                        <th>TRẠNG THÁI</th>
                                        <th>NGÀY TẠO</th>
                                        <th>THAO TÁC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => {
                                        const isSelf = String(u._id) === String(currentUserId);
                                        return (
                                            <tr key={u._id}>
                                                <td>
                                                    <div className="au-table__name">{u.fullName}</div>
                                                </td>
                                                <td>
                                                    <div className="au-table__email">{u.email}</div>
                                                </td>
                                                <td>
                                                    <span className={`au-role-badge au-role-badge--${u.role}`}>
                                                        {ROLE_LABELS[u.role] || u.role}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="au-store-cell">{storeLabel(u)}</span>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`au-status-pill au-status-pill--${
                                                            u.status === 'inactive' ? 'inactive' : 'active'
                                                        }`}
                                                    >
                                                        {u.status === 'inactive' ? 'Vô hiệu hóa' : 'Hoạt động'}
                                                    </span>
                                                </td>
                                                <td>{formatDate(u.createdAt)}</td>
                                                <td>
                                                    <div className="au-actions-cell">
                                                        <button
                                                            type="button"
                                                            className={`au-toggle-btn ${
                                                                u.status === 'inactive'
                                                                    ? 'au-toggle-btn--activate'
                                                                    : 'au-toggle-btn--deactivate'
                                                            }`}
                                                            onClick={() => handleClickToggle(u)}
                                                            disabled={toggling === u._id || isSelf}
                                                            title={isSelf ? 'Không thể đổi trạng thái chính mình' : ''}
                                                        >
                                                            {toggling === u._id
                                                                ? '...'
                                                                : u.status === 'inactive'
                                                                  ? 'Kích hoạt'
                                                                  : 'Vô hiệu hóa'}
                                                        </button>
                                                        {canAssignToStore(u) && (
                                                            <button
                                                                type="button"
                                                                className="au-assign-btn"
                                                                onClick={() => openAssignModal(u)}
                                                                disabled={stores.length === 0}
                                                                title={
                                                                    stores.length === 0
                                                                        ? 'Chưa có cửa hàng trong hệ thống'
                                                                        : 'Gán vào cửa hàng'
                                                                }
                                                            >
                                                                Gán cửa hàng
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {total > 0 && (
                                <div className="admin-users-pagination">
                                    <div className="admin-users-pagination-text">
                                        Trang <strong>{page}</strong> / <strong>{totalPages}</strong>
                                    </div>
                                    <div className="admin-users-pagination-controls">
                                        <button
                                            type="button"
                                            className="au-page-btn"
                                            disabled={page <= 1}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            aria-label="Trang trước"
                                        >
                                            <i className="fas fa-chevron-left" />
                                        </button>
                                        <button
                                            type="button"
                                            className="au-page-btn"
                                            disabled={page >= totalPages}
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            aria-label="Trang sau"
                                        >
                                            <i className="fas fa-chevron-right" />
                                        </button>
                                    </div>
                                </div>
                            )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {confirmModal.show && (
                <div className="au-modal-overlay">
                    <div className="au-modal-content">
                        <h3>Xác nhận thao tác</h3>
                        <p>
                            Bạn có chắc chắn muốn{' '}
                            {confirmModal.currentStatus === 'inactive' ? (
                                <strong>kích hoạt</strong>
                            ) : (
                                <strong style={{ color: '#dc2626' }}>vô hiệu hóa</strong>
                            )}{' '}
                            tài khoản của <strong>{confirmModal.userName}</strong>?
                        </p>
                        <div className="au-modal-actions">
                            <button
                                type="button"
                                className="au-modal-btn au-modal-btn--cancel"
                                onClick={() =>
                                    setConfirmModal({ show: false, userId: null, currentStatus: '', userName: '' })
                                }
                            >
                                Hủy
                            </button>
                            <button type="button" className="au-modal-btn au-modal-btn--confirm" onClick={confirmToggleStatus}>
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {assignModal.show && (
                <div className="au-modal-overlay">
                    <div className="au-modal-content au-modal-content--assign">
                        <h3>Gán nhân viên vào cửa hàng</h3>
                        <p>
                            Chọn cửa hàng cho <strong>{assignModal.userName}</strong>. Chỉ áp dụng khi tài khoản là nhân viên
                            và chưa thuộc cửa hàng nào.
                        </p>
                        <div className="au-assign-select-wrap">
                            <label htmlFor="au-assign-store">Cửa hàng</label>
                            <select
                                id="au-assign-store"
                                className="au-assign-select"
                                value={assignModal.storeId}
                                onChange={(e) => setAssignModal((p) => ({ ...p, storeId: e.target.value }))}
                            >
                                {stores.length === 0 ? (
                                    <option value="">— Không có cửa hàng —</option>
                                ) : (
                                    stores.map((s) => (
                                        <option key={s._id} value={s._id}>
                                            {s.name}
                                            {s.status === 'inactive' ? ' (đang ngừng HD)' : ''}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                        <div className="au-modal-actions">
                            <button
                                type="button"
                                className="au-modal-btn au-modal-btn--cancel"
                                onClick={() =>
                                    setAssignModal({ show: false, userId: null, userName: '', storeId: '' })
                                }
                                disabled={assigning}
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                className="au-modal-btn au-modal-btn--confirm"
                                onClick={confirmAssignStore}
                                disabled={assigning || !assignModal.storeId}
                            >
                                {assigning ? 'Đang lưu…' : 'Xác nhận gán'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
