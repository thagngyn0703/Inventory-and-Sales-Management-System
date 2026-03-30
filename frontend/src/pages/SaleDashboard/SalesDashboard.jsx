import React from 'react';
import { Outlet } from 'react-router-dom';
import SalesSidebar from './SalesSidebar';
import './SalesDashboard.css';

export default function SalesDashboard() {
  return (
    <div className="sales-layout collapsed">
      <SalesSidebar />
      <main className="sales-main">
        <header className="sales-header">
          <div className="sales-user-badge">
            <i className="fa-solid fa-circle-user" />
            <span>Nhân viên bán hàng</span>
            <span style={{ fontSize: '12px', opacity: 0.7, marginLeft: '4px' }}>(SALES STAFF)</span>
          </div>
        </header>
        <div className="sales-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
