import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import Sidebar from "../../components/Sidebar";
import { getAdminDashboard } from "../../services/adminApi";
import AdminMonthlyStatsChart from "./AdminMonthlyStatsChart";
import "../ManagerDashboard/ManagerDashboard.css";
import "../ManagerDashboard/ManagerProducts.css";
import "./AdminDashBoard.css";

function readStoredUser() {
    try {
        return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
        return null;
    }
}

export default function AdminDashboard() {
    const navigate = useNavigate();
    const user = readStoredUser();
    const [monthlyRows, setMonthlyRows] = useState([]);
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState("");

    const loadDashboard = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        setStatsLoading(true);
        setStatsError("");
        try {
            const data = await getAdminDashboard({ months: 12 });
            const rows = data?.monthlyStoreStats?.rows || [];
            setMonthlyRows(rows);
        } catch (e) {
            setStatsError(e.message || "Không thể tải thống kê");
            setMonthlyRows([]);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!localStorage.getItem("token") || !user) {
            navigate("/login", { replace: true });
            return;
        }
        if (user.role !== "admin") {
            navigate("/home", { replace: true });
        }
    }, [user, navigate]);

    useEffect(() => {
        if (user?.role === "admin") loadDashboard();
    }, [user?.role, loadDashboard]);

    if (!user || user.role !== "admin") return null;

    return (
        <div className="manager-page-with-sidebar">
            <Sidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <div className="manager-topbar-search-wrap" />
                    <div className="manager-topbar-actions">
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
                            Xin chào <b>{user?.email || "Admin"}</b> — chọn thao tác quản trị bên dưới.
                        </p>
                    </div>

                    <div className="admin-dash-single">
                        <div className="manager-panel-card">
                            <div className="manager-panel-header manager-panel-header--space">
                                <h2 className="manager-panel-title">Quản trị nhanh</h2>
                            </div>
                            <div className="admin-dash-quick">
                                <button
                                    type="button"
                                    className="admin-dash-quick__btn"
                                    onClick={() => navigate("/admin/stores")}
                                >
                                    <i className="fa-solid fa-store" />
                                    <span>Quản lý cửa hàng</span>
                                    <small>Bật / tắt hoạt động cửa hàng</small>
                                </button>
                                <button
                                    type="button"
                                    className="admin-dash-quick__btn"
                                    onClick={() => navigate("/admin/users")}
                                >
                                    <i className="fa-solid fa-user-gear" />
                                    <span>Quản lý tài khoản</span>
                                    <small>Trạng thái, gán nhân viên vào cửa hàng</small>
                                </button>
                                <button
                                    type="button"
                                    className="admin-dash-quick__btn"
                                    onClick={() => navigate("/admin/support")}
                                >
                                    <i className="fa-solid fa-headset" />
                                    <span>Phiếu hỗ trợ</span>
                                    <small>Yêu cầu từ quản lý cửa hàng</small>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="manager-panel-card admin-dash-stats">
                        <div className="manager-panel-header manager-panel-header--space">
                            <h2 className="manager-panel-title">Biểu đồ thống kê theo tháng (toàn hệ thống)</h2>
                        </div>
                        <p className="admin-dash-stats-hint">
                            Số liệu gộp mọi cửa hàng: <strong>sản phẩm</strong> là số SKU được tạo trong tháng;
                            <strong> đơn hàng</strong> là số hóa đơn bán (không tính đã hủy), theo ngày trên hóa đơn.
                            Trục trái: sản phẩm mới; trục phải: đơn hàng (12 tháng gần nhất, theo lịch Việt Nam).
                        </p>
                        {statsError && <div className="manager-products-error">{statsError}</div>}
                        <AdminMonthlyStatsChart rows={monthlyRows} loading={statsLoading} />
                    </div>
                </div>
            </div>
        </div>
    );
}
