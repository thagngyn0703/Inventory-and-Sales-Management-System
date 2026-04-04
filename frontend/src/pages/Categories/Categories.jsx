import React, { useState, useEffect } from 'react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { FolderTree, Search } from 'lucide-react';
import './Categories.css';
import '../ManagerDashboard/ManagerDashboard.css';

/**
 * CATEGORIES COMPONENT - Quản lý danh mục sản phẩm
 * Chức năng: CRUD operations cho categories, search, filter
 */

// API base URL - Cấu hình endpoint backend
const API_BASE = 'http://localhost:8000/api';

const Categories = () => {
    // ========== STATE MANAGEMENT ==========
    // Danh sách categories từ API
    const [categories, setCategories] = useState([]);

    // Loading state - hiển thị spinner khi đang fetch
    const [loading, setLoading] = useState(false);

    // Error state - hiển thị lỗi khi API fail
    const [error, setError] = useState('');

    // ========== CREATE MODAL STATE ==========
    // Modal tạo category mới
    const [showCreateModal, setShowCreateModal] = useState(false);
    // Input value cho category name mới
    const [newName, setNewName] = useState('');

    // ========== EDIT MODAL STATE ==========
    // Modal chỉnh sửa category
    const [showEditModal, setShowEditModal] = useState(false);
    // ID của category đang edit
    const [editingId, setEditingId] = useState(null);
    // Name của category đang edit
    const [editingName, setEditingName] = useState('');

    // ========== SEARCH STATE ==========
    // Search term đã được apply (filtered)
    const [search, setSearch] = useState('');
    // Search input hiện tại (real-time)
    const [searchInput, setSearchInput] = useState('');

    // ========== AUTHENTICATION ==========
    // Token từ localStorage để authenticate API calls
    const token = localStorage.getItem('token');

    // ========== LIFECYCLE - FETCH DATA ==========
    /**
     * useEffect - Fetch categories khi component mount
     * Dependency: [token] - refetch khi token thay đổi
     */
    useEffect(() => {
        const fetchCategories = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch(`${API_BASE}/categories?all=true`, {
                    headers: { Authorization: 'Bearer ' + token },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Không thể tải danh mục');
                setCategories(data);
            } catch (err) {
                setError(err.message);
            }
            setLoading(false);
        };
        fetchCategories();
    }, [token]);

    // ========== UTILITY FUNCTIONS ==========
    /**
     * refetchCategories - Re-fetch categories sau khi CRUD operations
     * Được gọi sau create, edit, delete để update UI
     */
    const refetchCategories = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories?all=true`, {
                headers: { Authorization: 'Bearer ' + token },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể tải danh mục');
            setCategories(data);
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    // ========== CRUD HANDLERS ==========
    /**
     * handleCreate - Xử lý tạo category mới
     * POST /api/categories với name và token
     */
    const handleCreate = async (ev) => {
        ev.preventDefault();
        if (!newName.trim()) return; // Validation: không tạo empty name

        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ name: newName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Tạo danh mục thất bại');

            // Reset form và đóng modal
            setNewName('');
            setShowCreateModal(false);
            refetchCategories(); // Update UI
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    // ========== EDIT HANDLERS ==========
    /**
     * startEdit - Mở modal edit với data của category được chọn
     * @param {Object} cat - Category object từ list
     */
    const startEdit = (cat) => {
        setEditingId(cat._id);
        setEditingName(cat.name);
        setShowEditModal(true);
    };

    /**
     * cancelEdit - Hủy edit và reset edit state
     */
    const cancelEdit = () => {
        setEditingId(null);
        setEditingName('');
        setShowEditModal(false);
    };

    /**
     * saveEdit - Lưu thay đổi category
     * PUT /api/categories/:id với name mới
     */
    const saveEdit = async () => {
        if (!editingName.trim()) return; // Validation

        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories/${editingId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ name: editingName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Cập nhật thất bại');

            cancelEdit(); // Reset edit state
            refetchCategories(); // Update UI
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    // ========== TOGGLE STATUS HANDLER ==========
    /**
     * toggleActive - Bật/tắt trạng thái active của category
     * PATCH /api/categories/:id/activate với is_active toggle
     */
    const toggleActive = async (id, current) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories/${id}/activate`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ is_active: !current }), // Toggle value
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Cập nhật thất bại');
            refetchCategories(); // Update UI
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    // ========== SEARCH HANDLER ==========
    /**
     * handleSearchSubmit - Xử lý submit search form
     * Set search term để filter categories
     */
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearch(searchInput.trim());
    };

    // ========== COMPUTED VALUES ==========
    /**
     * filteredCategories - Filter categories dựa trên search term
     * Case-insensitive search
     */
    const filteredCategories = categories.filter(cat =>
        cat.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <ManagerPageFrame
            showNotificationBell
            topBarLeft={
                <form onSubmit={handleSearchSubmit} className="relative w-full min-w-0 max-w-xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none ring-teal-200/80 transition focus:ring-2"
                        placeholder="Tìm danh mục..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </form>
            }
        >
            <StaffPageShell
                eyebrow="Quản lý cửa hàng"
                eyebrowIcon={FolderTree}
                title="Danh mục sản phẩm"
                subtitle="Tạo, sửa và bật/tắt danh mục dùng cho sản phẩm."
                headerActions={
                    <button
                        type="button"
                        className="manager-btn-primary"
                        onClick={() => setShowCreateModal(true)}
                        disabled={loading}
                    >
                        <i className="fa-solid fa-plus" /> Thêm danh mục
                    </button>
                }
            >
                    {error && <div className="manager-products-error">{error}</div>}

                    <div className="manager-panel-card manager-products-card rounded-2xl border border-slate-200/80 shadow-sm">
                        {loading ? (
                            <p className="manager-products-loading">Đang tải...</p>
                        ) : (
                            <div className="manager-products-table-wrap">
                                <table className="manager-products-table">
                                    <thead>
                                        <tr>
                                            <th>TÊN DANH MỤC</th>
                                            <th>TRẠNG THÁI</th>
                                            <th>NGÀY TẠO</th>
                                            <th>THAO TÁC</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCategories.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="manager-products-empty">
                                                    {search ? 'Không có danh mục nào phù hợp.' : 'Chưa có danh mục.'}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredCategories.map((cat) => (
                                                <tr key={cat._id}>
                                                    <td>{cat.name}</td>
                                                    <td>
                                                        <button
                                                            className={`manager-products-status manager-products-status--${cat.is_active ? 'active' : 'inactive'}`}
                                                            onClick={() => toggleActive(cat._id, cat.is_active)}
                                                        >
                                                            {cat.is_active ? 'Hoạt động' : 'Dừng hoạt động'}
                                                        </button>
                                                    </td>
                                                    <td>{new Date(cat.created_at).toLocaleDateString('vi-VN')}</td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="manager-action-btn"
                                                            onClick={() => startEdit(cat)}
                                                            aria-label="Sửa"
                                                        >
                                                            ✏️
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
            </StaffPageShell>

            {showCreateModal && (
                <div className="modal-overlay" data-testid="create-modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal-content" data-testid="create-modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Tạo danh mục mới</h2>
                        <form onSubmit={handleCreate}>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Nhập tên danh mục"
                                autoFocus
                            />
                            <div className="modal-buttons">
                                <button
                                    type="submit"
                                    disabled={!newName.trim() || loading}
                                    className="btn-submit"
                                >
                                    Tạo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setNewName('');
                                    }}
                                    className="btn-cancel"
                                >
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && (
                <div className="modal-overlay" data-testid="edit-modal-overlay" onClick={cancelEdit}>
                    <div className="modal-content" data-testid="edit-modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Chỉnh sửa danh mục</h2>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                saveEdit();
                            }}
                        >
                            <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                placeholder="Nhập tên danh mục"
                                autoFocus
                            />
                            <div className="modal-buttons">
                                <button
                                    type="submit"
                                    disabled={!editingName.trim() || loading}
                                    className="btn-submit"
                                >
                                    Lưu
                                </button>
                                <button type="button" onClick={cancelEdit} className="btn-cancel">
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </ManagerPageFrame>
    );
};

export default Categories;
