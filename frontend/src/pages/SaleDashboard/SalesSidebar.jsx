import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../../utils/auth';

export default function SalesSidebar({ collapsed, onToggle }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  });

  // Đồng bộ thông tin user + storeId từ API
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    if (!token) return;
    fetch('http://localhost:8000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json().catch(() => ({})))
      .then(data => {
        if (!data?.user) return;
        setCurrentUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {});
  }, []);

  const storeTitle = currentUser?.storeName
    || (currentUser?.storeId ? `Store: ${String(currentUser.storeId).slice(-6)}` : 'Chưa có cửa hàng');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Nhóm Bán hàng
  const salesItems = [
    { to: '/staff/invoices/new', icon: 'fa-plus-circle', label: 'Tạo hóa đơn', end: true },
    { to: '/staff/invoices', icon: 'fa-file-invoice-dollar', label: 'Lịch sử bán lẻ', end: true },
    { to: '/staff/returns/new', icon: 'fa-rotate-left', label: 'Trả hàng', end: true },
    { to: '/staff/returns', icon: 'fa-arrow-rotate-left', label: 'Hàng trả lại', end: true },
    { to: '/staff/customers', icon: 'fa-user-group', label: 'Khách hàng', end: true },
  ];

  // Nhóm Kho hàng (chuyển từ Warehouse Dashboard)
  const warehouseItems = [
    { to: '/staff/products', icon: 'fa-box-open', label: 'Sản phẩm', end: true },
    { to: '/staff/receipts/new', icon: 'fa-box', label: 'Nhập hàng', end: true },
    { to: '/staff/receipts', icon: 'fa-list', label: 'Phiếu nhập kho', end: true },
    { to: '/staff/stocktakes', icon: 'fa-clipboard-list', label: 'Danh sách kiểm kê', end: true },
    { to: '/staff/stocktakes/new', icon: 'fa-clipboard-check', label: 'Tạo phiếu kiểm kê', end: true },
    { to: '/staff/product-requests', icon: 'fa-file-invoice', label: 'Phiếu đăng ký SP mới', end: true },
  ];

  return (
    <aside className={`sales-sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Header brand + tên cửa hàng */}
      <div className="sales-sidebar-brand">
        <div className="brand-icon">S</div>
        <div style={{ minWidth: 0 }}>
          <div className="brand-text">Quầy bán hàng</div>
          <p className="sales-sidebar-store">
            <i className="fa-solid fa-store" style={{ marginRight: 4, fontSize: 10 }} />
            {storeTitle}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sales-nav">
        {/* --- BÁN HÀNG --- */}
        <p className="sales-nav-group-label">Bán hàng</p>
        {salesItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sales-nav-link ${isActive ? 'active' : ''}`}
          >
            <i className={`fa-solid ${item.icon}`} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        {/* --- KHO HÀNG --- */}
        <p className="sales-nav-group-label" style={{ marginTop: 8 }}>Kho hàng</p>
        {warehouseItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sales-nav-link ${isActive ? 'active' : ''}`}
          >
            <i className={`fa-solid ${item.icon}`} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer logout */}
      <div className="sales-sidebar-footer">
        <button className="sales-logout-btn" onClick={handleLogout}>
          <i className="fa-solid fa-right-from-bracket" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
