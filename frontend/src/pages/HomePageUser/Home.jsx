import { useNavigate } from "react-router-dom";
import "./Home.css";

export default function Home() {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user"));

    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    };

    return (
        <div className="home-page">
            <div className="home-card">
                <h1>🏠 Home</h1>
                <p>
                    Xin chào <b>{user?.email || "User"}</b>
                </p>
                <p>
                    Role: <b>{user?.role || "user"}</b>
                </p>

                <button className="home-btn" onClick={logout}>
                    Đăng xuất
                </button>
            </div>
        </div>
    );
}
