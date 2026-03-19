import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getSupplier, updateSupplier } from '../../services/suppliersApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const defaultForm = {
    code: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    tax_code: '',
    note: '',
    status: 'active',
    payable_account: '',
};

export default function ManagerSupplierEdit() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(false);
    const [loadSupplier, setLoadSupplier] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!id) return;
        setLoadSupplier(true);
        setError('');
        getSupplier(id)
            .then((s) => {
                setForm({
                    code: s.code || '',
                    name: s.name || '',
                    phone: s.phone || '',
                    email: s.email || '',
                    address: s.address || '',
                    tax_code: s.tax_code || '',
                    note: s.note || '',
                    status: s.status === 'inactive' ? 'inactive' : 'active',
                    payable_account: s.payable_account != null ? String(s.payable_account) : '',
                });
            })
            .catch((e) => setError(e.message || 'Không tải được nhà cung cấp'))
            .finally(() => setLoadSupplier(false));
    }, [id]);

    const update = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!id) return;
        if (!form.name.trim()) {
            setError('Vui lòng nhập tên nhà cung cấp.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await updateSupplier(id, {
                code: form.code ? String(form.code).trim() : undefined,
                name: form.name.trim(),
                phone: form.phone ? String(form.phone).trim() : undefined,
                email: form.email ? String(form.email).trim() : undefined,
                address: form.address ? String(form.address).trim() : undefined,
                tax_code: form.tax_code ? String(form.tax_code).trim() : undefined,
                note: form.note ? String(form.note).trim() : undefined,
                status: form.status === 'inactive' ? 'inactive' : 'active',
                payable_account: Number(form.payable_account) || 0,
            });
            navigate('/manager/suppliers', { state: { success: 'Cập nhật nhà cung cấp thành công.' } });
        } catch (err) {
            setError(err.message || 'Không thể cập nhật nhà cung cấp.');
        } finally {
            setLoading(false);
        }
    };

    if (loadSupplier) {
        return (
            <div className="manager-page-with-sidebar">
                <ManagerSidebar />
                <div className="manager-main">
                    <div className="manager-content">
                        <p className="manager-products-loading">Đang tải...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <div className="manager-topbar-search-wrap" />
                    <div className="manager-topbar-actions">
                        <button type="button" className="manager-icon-btn" aria-label="Thông báo">
                            <i className="fa-solid fa-bell" />
                        </button>
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content">
                    <div className="manager-products-header">
                        <div>
                            <h1 className="manager-page-title">Cập nhật nhà cung cấp</h1>
                            <p className="manager-page-subtitle">Chỉnh sửa thông tin nhà cung cấp.</p>
                        </div>
                        <button
                            type="button"
                            className="manager-btn-secondary"
                            onClick={() => navigate('/manager/suppliers')}
                        >
                            <i className="fa-solid fa-arrow-left" /> Danh sách
                        </button>
                    </div>

                    {error && (
                        <div className="manager-products-error">{error}</div>
                    )}

                    <div className="manager-panel-card manager-product-form-card">
                        <form onSubmit={handleSubmit} className="manager-product-form">
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Mã nhà cung cấp</label>
                                    <input
                                        type="text"
                                        value={form.code}
                                        onChange={(e) => update('code', e.target.value)}
                                        placeholder="VD: NCC001"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Tên nhà cung cấp <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => update('name', e.target.value)}
                                        placeholder="Nhập tên nhà cung cấp"
                                    />
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Điện thoại</label>
                                    <input
                                        type="text"
                                        value={form.phone}
                                        onChange={(e) => update('phone', e.target.value)}
                                        placeholder="Số điện thoại"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => update('email', e.target.value)}
                                        placeholder="email@example.com"
                                    />
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Mã số thuế</label>
                                    <input
                                        type="text"
                                        value={form.tax_code}
                                        onChange={(e) => update('tax_code', e.target.value)}
                                        placeholder="Mã số thuế"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Trạng thái</label>
                                    <select
                                        value={form.status}
                                        onChange={(e) => update('status', e.target.value)}
                                    >
                                        <option value="active">Hoạt động</option>
                                        <option value="inactive">Ngừng</option>
                                    </select>
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group manager-form-group--full">
                                    <label>Địa chỉ</label>
                                    <input
                                        type="text"
                                        value={form.address}
                                        onChange={(e) => update('address', e.target.value)}
                                        placeholder="Địa chỉ nhà cung cấp"
                                    />
                                </div>
                            </div>
                            <div className="manager-form-row manager-form-row--2">
                                <div className="manager-form-group">
                                    <label>Công nợ (₫)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1000"
                                        value={form.payable_account}
                                        onChange={(e) => update('payable_account', e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                                <div className="manager-form-group">
                                    <label>Ghi chú</label>
                                    <input
                                        type="text"
                                        value={form.note}
                                        onChange={(e) => update('note', e.target.value)}
                                        placeholder="Ghi chú (tùy chọn)"
                                    />
                                </div>
                            </div>
                            <div className="manager-form-actions">
                                <button
                                    type="button"
                                    className="manager-btn-secondary"
                                    onClick={() => navigate('/manager/suppliers')}
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="manager-btn-primary"
                                    disabled={loading}
                                >
                                    {loading ? 'Đang lưu...' : 'Cập nhật nhà cung cấp'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
