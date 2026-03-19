import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_URL || "/api";

export default function ManagerStoreRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => form.name.trim().length > 0 && !loading, [form.name, loading]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Vui lòng nhập tên cửa hàng.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register-store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim(),
          phone: form.phone.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Đăng ký cửa hàng thất bại");
      }

      const rawUser = localStorage.getItem("user");
      let currentUser = {};
      try {
        currentUser = rawUser ? JSON.parse(rawUser) : {};
      } catch (_) {
        currentUser = {};
      }
      const nextUser = {
        ...currentUser,
        ...(data.user || {}),
        storeId: data.user?.storeId || data.store?.id || currentUser.storeId || null,
      };
      localStorage.setItem("user", JSON.stringify(nextUser));
      navigate("/manager", { replace: true });
    } catch (err) {
      setError(err?.message || "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Đăng ký cửa hàng</h2>
        <p style={styles.subtitle}>
          Tài khoản Manager cần tạo thông tin cửa hàng trước khi sử dụng hệ thống.
        </p>
        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>Tên cửa hàng *</label>
          <input
            style={styles.input}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Ví dụ: Cửa hàng ABC"
          />

          <label style={styles.label}>Địa chỉ</label>
          <input
            style={styles.input}
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Số nhà, đường, quận, thành phố"
          />

          <label style={styles.label}>Số điện thoại</label>
          <input
            style={styles.input}
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="09xxxxxxxx"
          />

          {error ? <div style={styles.error}>{error}</div> : null}

          <button type="submit" style={{ ...styles.button, opacity: canSubmit ? 1 : 0.7 }} disabled={!canSubmit}>
            {loading ? "Đang lưu..." : "Tạo cửa hàng"}
          </button>
        </form>
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
    maxWidth: 500,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
  },
  title: { margin: 0, fontSize: 24 },
  subtitle: { margin: "8px 0 16px", color: "#4b5563", lineHeight: 1.5 },
  form: { display: "grid", gap: 10 },
  label: { fontWeight: 600, fontSize: 14 },
  input: {
    height: 42,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    padding: "0 12px",
    fontSize: 14,
    outline: "none",
  },
  error: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
  },
  button: {
    marginTop: 6,
    height: 42,
    borderRadius: 8,
    border: "none",
    background: "#111827",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
};
