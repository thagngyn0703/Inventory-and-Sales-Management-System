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
    { label: 'Kiểm kê kho', path: '/warehouse/stocktakes', icon: 'fa-clipboard-list' },
    { label: 'Danh sách phiếu nhập', path: '/warehouse/receipts', icon: 'fa-list' },
    { label: 'Nhập hàng', path: '/warehouse/receipts/new', icon: 'fa-box' },
    { label: 'Yêu cầu tạo sản phẩm', path: '/warehouse/product-requests', icon: 'fa-file-circle-plus' },
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
