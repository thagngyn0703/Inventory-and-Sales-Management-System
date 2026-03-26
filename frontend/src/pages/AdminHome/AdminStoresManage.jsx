import React, { useEffect, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import {
  createAdminStore,
  getAdminStores,
  setAdminStoreStatus,
  updateAdminStore,
  getRbacUsers,
} from '../../services/adminApi';
import '../ManagerDashboard/ManagerDashboard.css';
import '../ManagerDashboard/ManagerProducts.css';

const initialForm = { name: '', phone: '', address: '', managerId: '', status: 'active' };

export default function AdminStoresManage() {
  const [stores, setStores] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [storeData, userData] = await Promise.all([getAdminStores({ page: 1, limit: 200 }), getRbacUsers()]);
      setStores(storeData.stores || []);
      setManagers((userData.users || []).filter((u) => u.role === 'manager'));
    } catch (e) {
      setError(e.message || 'Không thể tải dữ liệu');
      setStores([]);
      setManagers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await updateAdminStore(editingId, form);
      } else {
        await createAdminStore(form);
      }
      setForm(initialForm);
      setEditingId('');
      await load();
    } catch (err) {
      setError(err.message || 'Không thể lưu cửa hàng');
    }
  };

  const onEdit = (s) => {
    setEditingId(s._id);
    setForm({
      name: s.name || '',
      phone: s.phone || '',
      address: s.address || '',
      managerId: s.managerId?._id || '',
      status: s.status === 'inactive' ? 'inactive' : 'active',
    });
  };

  const onToggleStatus = async (s) => {
    try {
      const status = s.status === 'active' ? 'inactive' : 'active';
      await setAdminStoreStatus(s._id, status);
      await load();
    } catch (err) {
      setError(err.message || 'Không thể cập nhật trạng thái');
    }
  };

  return (
    <div className="manager-page-with-sidebar">
      <Sidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-search-wrap" />
          <div className="manager-topbar-actions">
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Admin</span>
            </div>
          </div>
        </header>
        <div className="manager-content">
          <div className="manager-products-header">
            <div>
              <h1 className="manager-page-title">Quản lý cửa hàng</h1>
              <p className="manager-page-subtitle">Xem, tạo, cập nhật và khóa/mở hoạt động cửa hàng.</p>
            </div>
          </div>
          {error && <div className="manager-products-error">{error}</div>}

          <div className="manager-panel-card manager-product-form-card" style={{ marginBottom: 16 }}>
            <form onSubmit={onSubmit} className="manager-product-form">
              <div className="manager-form-row manager-form-row--2">
                <div className="manager-form-group">
                  <label>Tên cửa hàng *</label>
                  <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
                </div>
                <div className="manager-form-group">
                  <label>Manager *</label>
                  <select value={form.managerId} onChange={(e) => setForm((p) => ({ ...p, managerId: e.target.value }))} required>
                    <option value="">-- Chọn manager --</option>
                    {managers.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.fullName} - {m.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="manager-form-row manager-form-row--2">
                <div className="manager-form-group">
                  <label>Số điện thoại</label>
                  <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="manager-form-group">
                  <label>Trạng thái</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Ngừng</option>
                  </select>
                </div>
              </div>
              <div className="manager-form-row manager-form-row--2">
                <div className="manager-form-group manager-form-group--full">
                  <label>Địa chỉ</label>
                  <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                </div>
              </div>
              <div className="manager-form-actions">
                {editingId && (
                  <button type="button" className="manager-btn-secondary" onClick={() => { setEditingId(''); setForm(initialForm); }}>
                    Hủy sửa
                  </button>
                )}
                <button type="submit" className="manager-btn-primary">
                  {editingId ? 'Lưu cập nhật' : 'Tạo cửa hàng'}
                </button>
              </div>
            </form>
          </div>

          <div className="manager-panel-card manager-products-card">
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : (
              <div className="manager-products-table-wrap">
                <table className="manager-products-table">
                  <thead>
                    <tr>
                      <th>Tên cửa hàng</th>
                      <th>Chủ cửa hàng</th>
                      <th>SĐT</th>
                      <th>Địa chỉ</th>
                      <th>Ngày tạo</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s._id}>
                        <td>{s.name}</td>
                        <td>{s.managerId?.fullName || s.managerId?.email || '—'}</td>
                        <td>{s.phone || '—'}</td>
                        <td>{s.address || '—'}</td>
                        <td>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
                        <td>{s.status === 'inactive' ? 'Ngừng' : 'Hoạt động'}</td>
                        <td>
                          <button type="button" className="manager-btn-icon" onClick={() => onEdit(s)} title="Sửa">
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button type="button" className="manager-btn-icon" onClick={() => onToggleStatus(s)} title="Đổi trạng thái">
                            <i className={`fa-solid ${s.status === 'active' ? 'fa-pause' : 'fa-play'}`} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

