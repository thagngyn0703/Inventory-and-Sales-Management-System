import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import "./Home.css";

export default function Home() {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user"));

    useEffect(() => {
        if (!localStorage.getItem("token") || !user) {
            navigate("/login", { replace: true });
            return;
        }
        if (user.role === "manager" || user.role === "admin") {
            navigate("/admin", { replace: true });
        }
    }, [user, navigate]);

    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    if (!user || user.role === "manager" || user.role === "admin") return null;

    return (
        <div className="home-page-with-sidebar">
            <div className="home-content">
                <div className="home-card">
                    <h1>🏠 Home</h1>
                    <p>
                        Xin chào <b>{user?.email || "User"}</b>
                    </p>
                    <p>
                        Role: <b>{user?.role === "warehouse_staff" ? "Warehouse Staff" : user?.role === "sales_staff" ? "Sales Staff" : user?.role}</b>
                    </p>

                    <button className="home-btn" onClick={logout}>
                        Đăng xuất
                    </button>
                </div>
            </div>
        </div>
    );
}
