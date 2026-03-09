import React from 'react';
import './Topbar.css';

const Topbar = ({
  title = 'Tổng quan bán hàng',
  subtitle = 'Theo dõi hiệu quả kinh doanh và tồn kho theo thời gian thực',
  searchPlaceholder = 'Tìm kiếm đơn hàng, khách hàng, sản phẩm...',
}) => {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__title">{title}</div>
        {subtitle && <div className="topbar__subtitle">{subtitle}</div>}
      </div>
      <div className="topbar__right">
        <div className="topbar__search">
          <span className="topbar__search-icon">
            <i className="fa-solid fa-search" />
          </span>
          <input
            type="text"
            className="topbar__search-input"
            placeholder={searchPlaceholder}
          />
        </div>
        <button type="button" className="topbar__icon-btn" aria-label="Thông báo">
          <i className="fa-solid fa-bell" />
        </button>
        <button type="button" className="topbar__user">
          <span className="topbar__avatar">Q</span>
          <span className="topbar__user-name">Quản lý</span>
        </button>
      </div>
    </header>
  );
};

export default Topbar;

