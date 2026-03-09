import React from "react";
import { useNavigate } from "react-router-dom";
import "../pages/AdminHome/AdminDashBoard.css";

export default function AccessDenied({ title = "Access denied", message = "" }) {
  const navigate = useNavigate();
  return (
    <div className="admin-page">
      <div className="admin-card">
        <h1>⛔ {title}</h1>
        <p style={{ color: "#6b7280" }}>
          {message || "Bạn không có quyền truy cập màn hình này."}
        </p>
        <button className="admin-btn" onClick={() => navigate(-1)}>
          Quay lại
        </button>
      </div>
    </div>
  );
}

