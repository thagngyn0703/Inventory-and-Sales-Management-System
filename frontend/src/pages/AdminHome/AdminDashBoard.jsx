import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import "../ManagerDashboard/ManagerDashboard.css";
import "../ManagerDashboard/ManagerProducts.css";

export default function AdminDashboard() {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user"));

    useEffect(() => {
        if (!localStorage.getItem("token") || !user) {
            navigate("/login", { replace: true });
            return;
        }
        if (user.role !== "admin") {
            navigate("/home", { replace: true });
        }
    }, [user, navigate]);

    if (!user || user.role !== "admin") return null;

    return (
        <div className="manager-page-with-sidebar">
            <Sidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <input
                        type="search"
                        className="manager-search"
                        placeholder="Tìm kiếm người dùng, sản phẩm, báo cáo..."
                    />
                    <div className="manager-topbar-actions">
                        <button type="button" className="manager-icon-btn" aria-label="Thông báo">
                            <i className="fa-solid fa-bell" />
                        </button>
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản trị hệ thống</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content">
                    <div className="manager-page-header">
                        <h1 className="manager-page-title">Tổng quan hệ thống</h1>
                        <p className="manager-page-subtitle">
                            Xin chào <b>{user?.email || "Admin"}</b> - quản trị tổng thể người dùng, vận hành và báo cáo.
                        </p>
                    </div>

                    <div className="manager-cards-row manager-cards-row--4">
                        <div className="manager-metric-card">
                            <div className="manager-metric-icon manager-metric-icon--blue">
                                <i className="fa-solid fa-users" />
                            </div>
                            <div className="manager-metric-body">
                                <p className="manager-metric-label">Tổng người dùng</p>
                                <p className="manager-metric-value">-</p>
                                <p className="manager-metric-meta">Manager / Staff</p>
                            </div>
                        </div>
                        <div className="manager-metric-card">
                            <div className="manager-metric-icon manager-metric-icon--green">
                                <i className="fa-solid fa-store" />
                            </div>
                            <div className="manager-metric-body">
                                <p className="manager-metric-label">Cửa hàng đang hoạt động</p>
                                <p className="manager-metric-value">-</p>
                                <p className="manager-metric-meta">Theo dữ liệu hệ thống</p>
                            </div>
                        </div>
                        <div className="manager-metric-card">
                            <div className="manager-metric-icon manager-metric-icon--purple">
                                <i className="fa-solid fa-boxes-stacked" />
                            </div>
                            <div className="manager-metric-body">
                                <p className="manager-metric-label">Sản phẩm toàn hệ thống</p>
                                <p className="manager-metric-value">-</p>
                                <p className="manager-metric-meta">Tổng SKU đang quản lý</p>
                            </div>
                        </div>
                        <div className="manager-metric-card">
                            <div className="manager-metric-icon manager-metric-icon--orange">
                                <i className="fa-solid fa-triangle-exclamation" />
                            </div>
                            <div className="manager-metric-body">
                                <p className="manager-metric-label">Cảnh báo hệ thống</p>
                                <p className="manager-metric-value">-</p>
                                <p className="manager-metric-meta">Đang chờ xử lý</p>
                            </div>
                        </div>
                    </div>

                    <div className="manager-cards-row manager-cards-row--2">
                        <div className="manager-panel-card">
                            <div className="manager-panel-header manager-panel-header--space">
                                <h2 className="manager-panel-title">Quản trị nhanh</h2>
                            </div>
                            <div className="manager-list-placeholder">
                                <p className="manager-placeholder-text">Điều hướng qua menu bên trái để quản lý dữ liệu.</p>
                            </div>
                        </div>
                        <div className="manager-panel-card">
                            <div className="manager-panel-header manager-panel-header--space">
                                <h2 className="manager-panel-title">Báo cáo tổng hợp</h2>
                            </div>
                            <div className="manager-list-placeholder">
                                <p className="manager-placeholder-text">Khu vực hiển thị biểu đồ và thống kê toàn hệ thống.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
