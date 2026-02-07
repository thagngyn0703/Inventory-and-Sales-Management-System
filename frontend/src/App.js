import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './modules/dashboard/DashboardPage';
import CustomersPage from './modules/customers/CustomersPage';

const PAGE_CONFIG = {
  '/': {
    title: 'Tổng quan bán hàng & kho hàng',
    subtitle: 'Nhìn nhanh hiệu quả kinh doanh, tồn kho và đơn hàng gần đây',
    searchPlaceholder: 'Tìm kiếm đơn hàng, khách hàng, sản phẩm...',
  },
  '/customers': {
    title: 'Quản lý khách hàng',
    subtitle: 'Quản lý thông tin khách hàng và công nợ',
    searchPlaceholder: 'Tìm kiếm khách hàng...',
  },
};

function App() {
  const location = useLocation();
  const config = PAGE_CONFIG[location.pathname] || PAGE_CONFIG['/'];

  return (
    <MainLayout
      pageTitle={config.title}
      pageSubtitle={config.subtitle}
      searchPlaceholder={config.searchPlaceholder}
    >
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
      </Routes>
    </MainLayout>
  );
}

export default App;
