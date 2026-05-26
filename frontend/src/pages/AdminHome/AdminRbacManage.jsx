import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import {
  assignUserRole,
  getRbacPermissions,
  getRbacRoles,
  getRbacUsers,
} from '../../services/adminApi';
import '../ManagerDashboard/ManagerDashboard.css';
import '../ManagerDashboard/ManagerProducts.css';
import './AdminUserList.css';

export default function AdminRbacManage() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const permissionMap = useMemo(() => new Map(permissions.map((p) => [p.key, p.name])), [permissions]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [r, p, u] = await Promise.all([getRbacRoles(), getRbacPermissions(), getRbacUsers()]);
      setRoles(r.roles || []);
      setPermissions(p.permissions || []);
      setUsers(u.users || []);
    } catch (e) {
      setError(e.message || 'Không thể tải dữ liệu RBAC');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onUserRoleChange = async (userId, role) => {
    try {
      await assignUserRole(userId, role);
      await load();
    } catch (err) {
      setError(err.message || 'Không thể gán role');
    }
  };

  return (
    <div className="admin-page-with-sidebar">
      <Sidebar />
      <div className="admin-users-main">
        <header className="admin-users-topbar">
          <div className="admin-users-topbar-spacer" />
          <div className="admin-users-topbar-actions">
            <div className="admin-users-badge">
              <i className="fa-solid fa-circle-user" />
              <span>Quản trị viên</span>
            </div>
          </div>
        </header>
        <div className="admin-users-content">
          <div className="manager-products-header">
            <div>
              <h1 className="manager-page-title">Quản lý RBAC</h1>
              <p className="manager-page-subtitle">Role, Permission và gán role cho user.</p>
            </div>
          </div>
          {error && <div className="manager-products-error">{error}</div>}

          <div className="manager-panel-card manager-products-card admin-users-table-card" style={{ marginBottom: 16 }}>
            <h3 className="manager-detail-section-title">Danh sách role</h3>
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : (
              <div className="manager-products-table-wrap">
                <table className="manager-products-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Mô tả</th>
                      <th>System</th>
                      <th>Status</th>
                      <th>Permissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((r) => (
                      <tr key={r._id}>
                        <td>{r.name}</td>
                        <td>{r.description || '—'}</td>
                        <td>{r.isSystem ? 'Yes' : 'No'}</td>
                        <td>{r.status}</td>
                        <td>{(r.permissions || []).map((k) => permissionMap.get(k) || k).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="manager-panel-card manager-products-card admin-users-table-card">
            <h3 className="manager-detail-section-title">Gán role cho user</h3>
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : (
              <div className="manager-products-table-wrap">
                <table className="manager-products-table">
                  <thead>
                    <tr>
                      <th>Họ tên</th>
                      <th>Email</th>
                      <th>Role hiện tại</th>
                      <th>Đổi role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u._id}>
                        <td>{u.fullName}</td>
                        <td>{u.email}</td>
                        <td>{u.role}</td>
                        <td>
                          <select className="admin-soft-select" value={u.role} onChange={(e) => onUserRoleChange(u._id, e.target.value)}>
                            <option value="admin">admin</option>
                            <option value="manager">manager</option>
                            <option value="staff">staff</option>
                          </select>
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

