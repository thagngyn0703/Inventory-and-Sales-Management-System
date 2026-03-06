import React from 'react';
import Sidebar from '../../components/Sidebar';
import './AdminDashBoard.css';

export default function AdminDashboard() {
    const user = JSON.parse(localStorage.getItem('user'));

    return (
        <div className="admin-page-with-sidebar">
            <Sidebar />
            <div className="admin-main">
                <header className="admin-topbar">
                    <input
                        type="search"
                        className="admin-search"
                        placeholder="Tìm kiếm người dùng, sản phẩm, cài đặt..."
                    />
                    <div className="admin-topbar-actions">
                        <button type="button" className="admin-icon-btn" aria-label="Thông báo">
                            <i className="fa-solid fa-bell" />
                        </button>
                        <div className="admin-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản trị viên</span>
                        </div>
                    </div>
                </header>

                <div className="admin-content">
                    <div className="admin-page-header">
                        <h1 className="admin-page-title">Tổng quan hệ thống</h1>
                        <p className="admin-page-subtitle">
                            Xin chào <b>{user?.email || 'Admin'}</b> — Quản lý người dùng, sản phẩm và giám sát hoạt động hệ thống
                        </p>
                    </div>

                    {/* ── 4 Metric Cards ── */}
                    <div className="admin-cards-row admin-cards-row--4">
                        <div className="admin-metric-card">
                            <div className="admin-metric-icon admin-metric-icon--blue">
                                <i className="fa-solid fa-users" />
                            </div>
                            <div className="admin-metric-body">
                                <p className="admin-metric-label">Tổng người dùng</p>
                                <p className="admin-metric-value">128</p>
                                <p className="admin-metric-trend admin-metric-trend--up">+5 tuần này</p>
                            </div>
                        </div>
                        <div className="admin-metric-card">
                            <div className="admin-metric-icon admin-metric-icon--green">
                                <i className="fa-solid fa-boxes-stacked" />
                            </div>
                            <div className="admin-metric-body">
                                <p className="admin-metric-label">Tổng sản phẩm</p>
                                <p className="admin-metric-value">1.250</p>
                                <p className="admin-metric-trend admin-metric-trend--up">+32 sản phẩm mới</p>
                            </div>
                        </div>
                        <div className="admin-metric-card">
                            <div className="admin-metric-icon admin-metric-icon--purple">
                                <i className="fa-solid fa-building" />
                            </div>
                            <div className="admin-metric-body">
                                <p className="admin-metric-label">Nhà cung cấp</p>
                                <p className="admin-metric-value">45</p>
                                <p className="admin-metric-meta">Đang hoạt động</p>
                            </div>
                        </div>
                        <div className="admin-metric-card">
                            <div className="admin-metric-icon admin-metric-icon--orange">
                                <i className="fa-solid fa-user-clock" />
                            </div>
                            <div className="admin-metric-body">
                                <p className="admin-metric-label">Tài khoản chờ duyệt</p>
                                <p className="admin-metric-value">3</p>
                                <p className="admin-metric-meta">Cần xử lý</p>
                            </div>
                        </div>
                    </div>

                    {/* ── Chart + KPI ── */}
                    <div className="admin-cards-row admin-cards-row--2">
                        <div className="admin-panel-card">
                            <div className="admin-panel-header">
                                <div>
                                    <h2 className="admin-panel-title">Người dùng mới 7 ngày qua</h2>
                                    <p className="admin-panel-subtitle">Theo dõi tăng trưởng người dùng hệ thống</p>
                                </div>
                                <select className="admin-select" defaultValue="7">
                                    <option value="7">7 ngày gần đây</option>
                                    <option value="30">30 ngày</option>
                                </select>
                            </div>
                            <div className="admin-chart-placeholder">
                                <span className="admin-chart-days">T2 · T3 · T4 · T5 · T6 · T7 · CN</span>
                            </div>
                        </div>
                        <div className="admin-panel-card">
                            <h2 className="admin-panel-title">Chỉ số hệ thống</h2>
                            <div className="admin-kpi-list">
                                <div className="admin-kpi-item">
                                    <p className="admin-kpi-label">Tỉ lệ người dùng hoạt động</p>
                                    <p className="admin-kpi-value">85%</p>
                                    <p className="admin-metric-trend admin-metric-trend--up">↑ +2,1% so với tuần trước</p>
                                </div>
                                <div className="admin-kpi-item">
                                    <p className="admin-kpi-label">Đơn hàng trung bình / ngày</p>
                                    <p className="admin-kpi-value">64</p>
                                    <p className="admin-metric-trend admin-metric-trend--up">↑ +8 đơn so với tuần trước</p>
                                </div>
                                <div className="admin-kpi-item">
                                    <p className="admin-kpi-label">Sản phẩm hết hàng</p>
                                    <p className="admin-kpi-value">12</p>
                                    <p className="admin-metric-trend admin-metric-trend--down">↓ cần bổ sung kho</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Recent + Alerts ── */}
                    <div className="admin-cards-row admin-cards-row--2">
                        <div className="admin-panel-card">
                            <div className="admin-panel-header admin-panel-header--space">
                                <h2 className="admin-panel-title">Hoạt động gần đây</h2>
                                <a href="/admin" className="admin-panel-link">Xem tất cả →</a>
                            </div>
                            <div className="admin-list-placeholder">
                                <p className="admin-placeholder-text">Chưa có hoạt động</p>
                            </div>
                        </div>
                        <div className="admin-panel-card">
                            <div className="admin-panel-header admin-panel-header--space">
                                <h2 className="admin-panel-title">Cảnh báo hệ thống</h2>
                                <a href="/admin" className="admin-panel-link">Xem chi tiết →</a>
                            </div>
                            <div className="admin-list-placeholder">
                                <p className="admin-placeholder-text">Không có cảnh báo</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
