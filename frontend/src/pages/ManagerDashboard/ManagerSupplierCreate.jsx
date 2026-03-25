import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import { createSupplier } from '../../services/suppliersApi';
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

export default function ManagerSupplierCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const update = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) {
            setError('Vui lòng nhập tên nhà cung cấp.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await createSupplier({
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
            navigate('/manager/suppliers', { state: { success: 'Thêm nhà cung cấp thành công.' } });
        } catch (err) {
            setError(err.message || 'Không thể tạo nhà cung cấp.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <div className="manager-topbar-search-wrap" />
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
                            <h1 className="manager-page-title">Thêm nhà cung cấp</h1>
                            <p className="manager-page-subtitle">Tạo nhà cung cấp mới trong hệ thống.</p>
                        </div>
                        <button
                            type="button"
                            className="manager-btn-secondary"
                            onClick={() => navigate('/manager/suppliers')}
                        >
                            <i className="fa-solid fa-arrow-left" /> Quay lại
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
                                    {loading ? 'Đang lưu...' : 'Tạo nhà cung cấp'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
