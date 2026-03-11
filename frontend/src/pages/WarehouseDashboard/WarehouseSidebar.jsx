import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './WarehouseSidebar.css';

export default function WarehouseSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Tổng quan', path: '/warehouse', icon: 'fa-house' },
    { label: 'Tạo phiếu kiểm kê', path: '/warehouse/stocktakes/new', icon: 'fa-clipboard-list' },
    { label: 'Danh sách phiếu kiểm kê', path: '/warehouse/stocktakes', icon: 'fa-list' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="warehouse-sidebar">
      <div className="warehouse-sidebar-header">
        <div className="warehouse-sidebar-logo">
          <span className="warehouse-logo-icon">K</span>
        </div>
        <p className="warehouse-sidebar-title">Kho hàng</p>
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
  );
}
