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
    { isDivider: true },
    { to: '/warehouse', icon: 'fa-house', label: 'Tổng quan kho' },
    { to: '/warehouse/stocktakes', icon: 'fa-clipboard-list', label: 'Kiểm kê kho' },
    { to: '/warehouse/receipts', icon: 'fa-list', label: 'Phiếu nhập hàng' },
    { to: '/warehouse/receipts/new', icon: 'fa-box', label: 'Nhập hàng mới' },
    { to: '/warehouse/product-requests', icon: 'fa-file-circle-plus', label: 'Yêu cầu tạo sản phẩm' },
  ];

  return (
    <aside className="sales-sidebar">
      <div className="sales-sidebar-brand">
        <div className="brand-icon">S</div>
        <span className="brand-text">Nhân viên</span>
      </div>
      
      <nav className="sales-nav" style={{ overflowY: 'auto' }}>
        {navItems.map((item, index) => item.isDivider ? (
          <div key={`divider-${index}`} className="sales-nav-divider" style={{ height: '1px', background: '#e5e7eb', margin: '12px 20px' }} />
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => 
              `sales-nav-link ${isActive ? 'active' : ''}`
            }
          >
            <i className={`fa-solid ${item.icon}`} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sales-sidebar-footer">
        <button className="sales-logout-btn" onClick={handleLogout}>
          <i className="fa-solid fa-right-from-bracket" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
