import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import "./AdminDashBoard.css";

export default function AdminDashboard() {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user"));

    const logout = () => {
        localStorage.clear();
        navigate("/login");
    };

    return (
        <div className="admin-page-with-sidebar">
            <Sidebar />
            <div className="admin-content">
                <div className="admin-card">
                    <h1>🛠 Admin Dashboard</h1>
                    <p>
                        Xin chào <b>{user?.email || "Admin"}</b>
                    </p>
                    <p>
                        Role: <b>{user?.role || "admin"}</b>
                    </p>

                    <div className="admin-grid">
                        <div className="admin-box">👥 Quản lý người dùng</div>
                        <div className="admin-box">📊 Báo cáo</div>
                        <div className="admin-box">⚙️ Cài đặt hệ thống</div>
                    </div>

                    <button className="admin-btn" onClick={logout}>
                        Đăng xuất
                    </button>
                </div>
            </div>
        </div>
    );
}
