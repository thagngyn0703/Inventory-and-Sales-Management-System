import React from 'react';
import { Outlet } from 'react-router-dom';
import WarehouseSidebar from './WarehouseSidebar';
import './WarehouseDashboard.css';

export default function WarehouseDashboard() {
  return (
    <div className="warehouse-page-with-sidebar">
      <WarehouseSidebar />
      <div className="warehouse-main">
        <header className="warehouse-topbar">
          <div className="warehouse-user-badge">
            <i className="fa-solid fa-circle-user" />
            <span>Nhân viên kho</span>
          </div>
        </header>
        <div className="warehouse-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
