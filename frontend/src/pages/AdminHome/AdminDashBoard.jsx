import { useNavigate } from "react-router-dom";
import "./AdminDashBoard.css";

export default function AdminDashboard() {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user"));

    const logout = () => {
        localStorage.clear();
        navigate("/login");
    };

    return (
        <div className="admin-page">
            <div className="admin-card">
                <h1>🛠 Admin Dashboard</h1>
                <p>
                    Xin chào <b>{user?.email || "Admin"}</b>
                </p>
                <p>
                    Role: <b>{user?.role || "admin"}</b>
                </p>

                <div className="admin-grid">
                    <button
                        type="button"
                        className="admin-box admin-box-btn"
                        onClick={() => navigate("/admin/products")}
                    >
                        📦 Quản lý sản phẩm
                    </button>
                    <div className="admin-box">👥 Quản lý người dùng</div>
                    <div className="admin-box">📊 Báo cáo</div>
                    <div className="admin-box">⚙️ Cài đặt hệ thống</div>
                </div>

                <button className="admin-btn" onClick={logout}>
                    Đăng xuất
                </button>
            </div>
        </div>
    );
}
