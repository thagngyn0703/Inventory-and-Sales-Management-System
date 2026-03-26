import React from "react";
import { useNavigate } from "react-router-dom";

export default function NoStoreAssignedPage() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Tài khoản chưa thuộc cửa hàng</h2>
        <p style={styles.text}>
          Tài khoản của bạn hiện chưa được gán vào cửa hàng nào.
          <br />
          Vui lòng liên hệ Manager để được thêm vào cửa hàng trước khi sử dụng hệ thống.
        </p>
        <button type="button" style={styles.button} onClick={handleLogout}>
          Quay lại đăng nhập
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f7fb",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 22,
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
    textAlign: "center",
  },
  title: { margin: 0, fontSize: 24, color: "#111827" },
  text: { margin: "12px 0 18px", color: "#374151", lineHeight: 1.6 },
  button: {
    height: 42,
    padding: "0 16px",
    border: "none",
    borderRadius: 8,
    background: "#111827",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
};
