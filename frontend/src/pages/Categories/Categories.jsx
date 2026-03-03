import React, { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import './Categories.css';

const API_BASE = 'http://localhost:8000/api';

export default function Categories() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [showEditModal, setShowEditModal] = useState(false);

    const token = localStorage.getItem('token');

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

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleCreate = async (ev) => {
        ev.preventDefault();
        if (!newName.trim()) return;
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
            setNewName('');
            setShowCreateModal(false);
            fetchCategories();
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const startEdit = (cat) => {
        setEditingId(cat._id);
        setEditingName(cat.name);
        setShowEditModal(true);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingName('');
        setShowEditModal(false);
    };

    const saveEdit = async () => {
        if (!editingName.trim()) return;
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
            cancelEdit();
            fetchCategories();
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

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
                body: JSON.stringify({ is_active: !current }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Cập nhật thất bại');
            fetchCategories();
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    return (
        <div className="category-page-with-sidebar">
            <Sidebar />
            <div className="category-content">
                <div className="category-page">
                    <div className="category-card">
                <h1>🗂 Quản lý danh mục</h1>
                {error && <div className="error">{error}</div>}
                <button 
                    className="btn-create"
                    onClick={() => setShowCreateModal(true)}
                    disabled={loading}
                >
                    + Tạo danh mục
                </button>

                {showCreateModal && (
                    <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
                    <div className="modal-overlay" onClick={cancelEdit}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
                                    <button
                                        type="button"
                                        onClick={cancelEdit}
                                        className="btn-cancel"
                                    >
                                        Hủy
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading && <p>Đang xử lý...</p>}
                <div className="table-wrapper">
                    <table className="category-table">
                    <thead>
                        <tr>
                            <th>Tên</th>
                            <th>Trạng thái</th>
                            <th>Ngày tạo</th>
                            <th>Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((cat) => (
                            <tr key={cat._id}>
                                <td>
                                    {cat.name}
                                </td>
                                <td>
                                    <button
                                        className={`status-btn ${cat.is_active ? 'active' : 'inactive'}`}
                                        onClick={() => toggleActive(cat._id, cat.is_active)}
                                    >
                                        {cat.is_active ? '✓ Hoạt động' : '✕ Ngừng hoạt động'}
                                    </button>
                                </td>
                                <td className="date-cell">{new Date(cat.created_at).toLocaleDateString()}</td>
                                <td>
                                    <button
                                        className="category-btn edit"
                                        onClick={() => startEdit(cat)}
                                    >
                                        Sửa
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </div>
        </div>
            </div>
        </div>
    );
}
