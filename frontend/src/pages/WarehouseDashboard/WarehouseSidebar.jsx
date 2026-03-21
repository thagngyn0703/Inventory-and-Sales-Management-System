import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import StoreLockedNotice from '../../components/StoreLockedNotice';
import './WarehouseSidebar.css';

export default function WarehouseSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    if (!token) return;
    fetch('http://localhost:8000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!data?.user) return;
        setCurrentUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {});
  }, []);
  const storeTitle = currentUser?.storeName || (currentUser?.storeId ? `Store: ${String(currentUser.storeId).slice(-6)}` : 'Chưa có cửa hàng');

  const navItems = [
    { label: 'Tổng quan', path: '/warehouse', icon: 'fa-house' },
    { label: 'Tạo phiếu kiểm kê', path: '/warehouse/stocktakes/new', icon: 'fa-clipboard-list' },
    { label: 'Danh sách phiếu kiểm kê', path: '/warehouse/stocktakes', icon: 'fa-list' },
    { label: 'Phiếu xuất / Hóa đơn', path: '/warehouse/invoices', icon: 'fa-file-invoice' },
    { label: 'Tạo phiếu xuất', path: '/warehouse/invoices/new', icon: 'fa-plus' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <StoreLockedNotice visible={currentUser?.storeStatus === 'inactive'} />
      <div className="warehouse-sidebar">
        <div className="warehouse-sidebar-header">
        <div className="warehouse-sidebar-logo">
          <span className="warehouse-logo-icon">K</span>
        </div>
        <p className="warehouse-sidebar-title">Kho hàng</p>
        <p className="warehouse-sidebar-store">{storeTitle}</p>
      </div>

      <nav className="warehouse-sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.path}
            className={`warehouse-sidebar-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <i className={`fa-solid ${item.icon} warehouse-item-icon`} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="warehouse-sidebar-footer">
        <button
          className="warehouse-logout-btn"
          onClick={() => {
            localStorage.clear();
            navigate('/login');
          }}
        >
          Đăng xuất
        </button>
      </div>
      </div>
    </>
  );
}
