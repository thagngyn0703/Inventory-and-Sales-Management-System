import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const MAIN_MENU = [
  { key: 'dashboard', label: 'Tổng quan', icon: 'fa-house', to: '/' },
  { key: 'orders', label: 'Đơn hàng', icon: 'fa-receipt', to: '/orders' },
  { key: 'products', label: 'Sản phẩm', icon: 'fa-cart-shopping', to: '/products' },
  { key: 'customers', label: 'Khách hàng', icon: 'fa-users', to: '/customers' },
  { key: 'reports', label: 'Báo cáo', icon: 'fa-chart-column', to: '/reports' },
];

const MANAGE_MENU = [
  { key: 'inventory', label: 'Kho hàng', icon: 'fa-warehouse', to: '/inventory' },
  { key: 'invoices', label: 'Hóa đơn', icon: 'fa-file-invoice', to: '/invoices' },
  { key: 'settings', label: 'Cài đặt', icon: 'fa-gear', to: '/settings' },
];

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-icon">🛍</div>
        <div>
          <div className="sidebar__brand-title">Mini Store</div>
          <div className="sidebar__brand-sub">Quản lý bán hàng</div>
        </div>
      </div>

      <nav className="sidebar__nav sidebar__nav--main">
        {MAIN_MENU.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`
            }
          >
            <span className="sidebar__icon" aria-hidden="true">
              <i className={`fa-solid ${item.icon}`} />
            </span>
            <span className="sidebar__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__section-title">QUẢN LÝ</div>
      <nav className="sidebar__nav">
        {MANAGE_MENU.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            className={({ isActive }) =>
              `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`
            }
          >
            <span className="sidebar__icon" aria-hidden="true">
              <i className={`fa-solid ${item.icon}`} />
            </span>
            <span className="sidebar__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__user">
        <div className="sidebar__user-avatar">NV</div>
        <div className="sidebar__user-info">
          <div className="sidebar__user-name">Nguyễn Văn A</div>
          <div className="sidebar__user-role">Quản lý cửa hàng</div>
        </div>
        <button type="button" className="sidebar__user-menu" aria-label="User menu">
          ⋮
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

