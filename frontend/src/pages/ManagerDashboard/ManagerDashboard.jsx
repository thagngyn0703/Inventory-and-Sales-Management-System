import React from 'react';
import ManagerSidebar from './ManagerSidebar';
import './ManagerDashboard.css';

export default function ManagerDashboard() {
    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <input
                        type="search"
                        className="manager-search"
                        placeholder="Tìm kiếm đơn hàng, khách hàng, sản phẩm..."
                    />
                    <div className="manager-topbar-actions">
                        <button type="button" className="manager-icon-btn" aria-label="Thông báo">
                            <i className="fa-solid fa-bell" />
                        </button>
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content">
                    <div className="manager-page-header">
                        <h1 className="manager-page-title">Tổng quan bán hàng & kho hàng</h1>
                        <p className="manager-page-subtitle">
                            Nhìn nhanh hiệu quả kinh doanh, tồn kho và đơn hàng gần đây
                        </p>
                    </div>

                    <div className="manager-cards-row manager-cards-row--4">
                        <div className="manager-metric-card">
                            <div className="manager-metric-icon manager-metric-icon--blue">
                                <i className="fa-solid fa-sack-dollar" />
                            </div>
                            <div className="manager-metric-body">
                                <p className="manager-metric-label">Doanh thu hôm nay</p>
                                <p className="manager-metric-value">12.450.000₫</p>
                                <p className="manager-metric-trend manager-metric-trend--up">+18% so với hôm qua</p>
                            </div>
                        </div>
                        <div className="manager-metric-card">
                            <div className="manager-metric-icon manager-metric-icon--green">
                                <i className="fa-solid fa-clipboard-list" />
                            </div>
                            <div className="manager-metric-body">
                                <p className="manager-metric-label">Đơn hàng hôm nay</p>
                                <p className="manager-metric-value">86</p>
                                <p className="manager-metric-trend manager-metric-trend--up">+12 đơn</p>
                            </div>
                        </div>
                        <div className="manager-metric-card">
                            <div className="manager-metric-icon manager-metric-icon--purple">
                                <i className="fa-solid fa-warehouse" />
                            </div>
                            <div className="manager-metric-body">
                                <p className="manager-metric-label">Giá trị tồn kho</p>
                                <p className="manager-metric-value">320.000.000₫</p>
                                <p className="manager-metric-meta">1.250 mặt hàng</p>
                            </div>
                        </div>
                        <div className="manager-metric-card">
                            <div className="manager-metric-icon manager-metric-icon--orange">
                                <i className="fa-solid fa-triangle-exclamation" />
                            </div>
                            <div className="manager-metric-body">
                                <p className="manager-metric-label">Cảnh báo tồn kho thấp</p>
                                <p className="manager-metric-value">18 mặt hàng</p>
                                <p className="manager-metric-meta">Cần nhập trong 3 ngày</p>
                            </div>
                        </div>
                    </div>

                    <div className="manager-cards-row manager-cards-row--2">
                        <div className="manager-panel-card">
                            <div className="manager-panel-header">
                                <div>
                                    <h2 className="manager-panel-title">Doanh thu 7 ngày gần nhất</h2>
                                    <p className="manager-panel-subtitle">Theo dõi xu hướng doanh thu hàng ngày</p>
                                </div>
                                <select className="manager-select" defaultValue="7">
                                    <option value="7">7 ngày gần đây</option>
                                    <option value="30">30 ngày</option>
                                </select>
                            </div>
                            <div className="manager-chart-placeholder">
                                <span className="manager-chart-days">T2 · T3 · T4 · T5 · T6 · T7 · CN</span>
                            </div>
                        </div>
                        <div className="manager-panel-card">
                            <h2 className="manager-panel-title">Chỉ số chính</h2>
                            <div className="manager-kpi-list">
                                <div className="manager-kpi-item">
                                    <p className="manager-kpi-label">Tỉ lệ hoàn đơn</p>
                                    <p className="manager-kpi-value">2,3%</p>
                                    <p className="manager-metric-trend manager-metric-trend--down">↓ -0,4% so với tuần trước</p>
                                </div>
                                <div className="manager-kpi-item">
                                    <p className="manager-kpi-label">Giá trị đơn trung bình</p>
                                    <p className="manager-kpi-value">145.000₫</p>
                                    <p className="manager-metric-trend manager-metric-trend--up">↑ +6,2% so với tuần trước</p>
                                </div>
                                <div className="manager-kpi-item">
                                    <p className="manager-kpi-label">Khách quay lại</p>
                                    <p className="manager-kpi-value">38%</p>
                                    <p className="manager-metric-trend manager-metric-trend--up">↑ +3 khách/ngày</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="manager-cards-row manager-cards-row--2">
                        <div className="manager-panel-card">
                            <div className="manager-panel-header manager-panel-header--space">
                                <h2 className="manager-panel-title">Đơn hàng gần đây</h2>
                                <a href="/manager/orders" className="manager-panel-link">Xem tất cả →</a>
                            </div>
                            <div className="manager-list-placeholder">
                                <p className="manager-placeholder-text">Chưa có đơn hàng</p>
                            </div>
                        </div>
                        <div className="manager-panel-card">
                            <div className="manager-panel-header manager-panel-header--space">
                                <h2 className="manager-panel-title">Sản phẩm sắp hết hàng</h2>
                                <a href="/manager/warehouse" className="manager-panel-link">Xem kho hàng →</a>
                            </div>
                            <div className="manager-list-placeholder">
                                <p className="manager-placeholder-text">Chưa có dữ liệu</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
