import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../../utils/auth';

export default function SalesSidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/sales/invoices/new', icon: 'fa-plus-circle', label: 'Tạo hóa đơn', end: true },
    { to: '/sales/invoices', icon: 'fa-file-invoice-dollar', label: 'Lịch sử bán lẻ' },
    { to: '/sales/returns/new', icon: 'fa-rotate-left', label: 'Trả hàng', end: true },
    { to: '/sales/returns', icon: 'fa-arrow-rotate-left', label: 'Hàng trả lại' },
    { to: '/sales/customers', icon: 'fa-user-group', label: 'Khách hàng' },
  ];

  return (
    <aside className="sales-sidebar collapsed-hoverable">
      <div className="sales-sidebar-brand">
        <div className="brand-content">
          <div className="brand-icon">S</div>
          <span className="brand-text">Nhân viên bán hàng</span>
        </div>
      </div>
      
      <nav className="sales-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => 
              `sales-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <i className={`fa-solid ${item.icon}`} />
            <span className="nav-text">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sales-sidebar-footer">
        <button className="sales-logout-btn" onClick={handleLogout}>
          <i className="fa-solid fa-right-from-bracket" />
          <span className="footer-text">Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
