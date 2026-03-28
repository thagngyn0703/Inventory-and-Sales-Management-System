import React, { useMemo, useState } from "react";
// import "./AuthPage.css";
import { useNavigate } from "react-router-dom";
import { normalizeRole } from "../../utils/auth";




const API_BASE = "http://localhost:8000/api";

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function getPostLoginPath(user) {
    const role = normalizeRole(user?.role);
    const hasStoreId = Boolean(user?.storeId);

    if (role === "admin") return "/admin";
    if (role === "manager") return hasStoreId ? "/manager" : "/manager/store/register";
    if (role === "staff") return hasStoreId ? "/sales" : "/no-store-assigned";
    return "/home";
}

export default function AuthPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState("login"); // "login" | "register" | "verify"
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // form state
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Sau khi đăng ký thành công, chuyển sang bước nhập mã (giữ email)
    const [pendingVerifyEmail, setPendingVerifyEmail] = useState("");
    const [verificationToken, setVerificationToken] = useState("");

    const [showPw, setShowPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);

    const title =
        mode === "login"
            ? "Login"
            : mode === "register"
                ? "Create account"
                : "Xác minh email";
    const switchText =
        mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập";

    const canSubmit = useMemo(() => {
        if (mode === "verify") {
            return pendingVerifyEmail.trim() && verificationToken.trim().length >= 4;
        }
        if (!email.trim() || !password) return false;
        if (!isEmail(email.trim())) return false;
        if (password.length < 6) return false;
        if (mode === "register") {
            if (!fullName.trim()) return false;
            if (confirmPassword !== password) return false;
        }
        return true;
    }, [mode, fullName, email, password, confirmPassword, pendingVerifyEmail, verificationToken]);

    const validate = () => {
        if (mode === "verify") {
            if (!verificationToken.trim()) return "Vui lòng nhập mã xác minh.";
            return "";
        }
        const e = email.trim();
        if (mode === "register" && !fullName.trim()) return "Vui lòng nhập họ tên.";
        if (!e) return "Vui lòng nhập email.";
        if (!isEmail(e)) return "Email không hợp lệ.";
        if (!password) return "Vui lòng nhập mật khẩu.";
        if (password.length < 6) return "Mật khẩu phải >= 6 ký tự.";
        if (mode === "register" && confirmPassword !== password)
            return "Mật khẩu nhập lại không khớp.";
        return "";
    };

    const handleSubmit = async (ev) => {
        ev.preventDefault();
        setError("");

        const msg = validate();
        if (msg) {
            setError(msg);
            return;
        }

        setLoading(true);
        try {
            if (mode === "verify") {
                const res = await fetch(`${API_BASE}/auth/verify-email`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: pendingVerifyEmail.trim(),
                        token: verificationToken.trim(),
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.message || data.error || "Xác minh thất bại");
                }
                if (data.token) localStorage.setItem("token", data.token);
                if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
                alert("Xác minh thành công!");
                navigate(getPostLoginPath(data.user), { replace: true });
                return;
            }

            const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
            const payload =
                mode === "login"
                    ? { email: email.trim(), password }
                    : { fullName: fullName.trim(), email: email.trim(), password, role: "manager" };

            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.message || data.error || "Request failed");
            }

            if (mode === "login") {
                if (data.token) localStorage.setItem("token", data.token);
                if (data.user) localStorage.setItem("user", JSON.stringify(data.user));

                navigate(getPostLoginPath(data.user), { replace: true });
                console.log("USER LOGIN:", data.user);
                console.log("ROLE:", data.user?.role, typeof data.user?.role);

            }
            else {
                setPendingVerifyEmail(data.email || email.trim());
                setVerificationToken("");
                setMode("verify");
            }
        } catch (err) {
            setError(err?.message || "Có lỗi xảy ra.");
        } finally {
            setLoading(false);
        }
    };

    const resetFields = () => {
        setError("");
        setFullName("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setShowPw(false);
        setShowConfirmPw(false);
        setVerificationToken("");
    };

    const switchMode = () => {
        setMode((m) => (m === "login" ? "register" : "login"));
        resetFields();
        setPendingVerifyEmail("");
    };

    const backToRegister = () => {
        setMode("register");
        setEmail(pendingVerifyEmail);
        setPendingVerifyEmail("");
        setVerificationToken("");
        setError("");
    };

    const showVerifyForm = mode === "verify";

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                <div style={styles.header}>
                    <h2 style={{ margin: 0 }}>{title}</h2>
                    <p style={styles.subtitle}>
                        {mode === "login" && "Đăng nhập để tiếp tục"}
                        {mode === "register" && "Tạo tài khoản mới để bắt đầu"}
                        {mode === "verify" &&
                            "Nhập mã 6 số đã gửi đến email của bạn để kích hoạt tài khoản"}
                    </p>
                </div>

                {showVerifyForm ? (
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.field}>
                            <label style={styles.label}>Email</label>
                            <input
                                style={{ ...styles.input, background: "#f5f5f5", color: "#555" }}
                                value={pendingVerifyEmail}
                                readOnly
                            />
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>Mã xác minh</label>
                            <input
                                style={styles.input}
                                value={verificationToken}
                                onChange={(e) => setVerificationToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="123456"
                                inputMode="numeric"
                                maxLength={6}
                                autoComplete="one-time-code"
                            />
                            <small style={styles.hint}>Mã có hiệu lực 24 giờ.</small>
                        </div>
                        {error && <div style={styles.errorBox}>{error}</div>}
                        <button
                            type="submit"
                            style={{
                                ...styles.submitBtn,
                                opacity: canSubmit && !loading ? 1 : 0.6,
                                cursor: canSubmit && !loading ? "pointer" : "not-allowed",
                            }}
                            disabled={!canSubmit || loading}
                        >
                            {loading ? "Đang xử lý..." : "Xác minh"}
                        </button>
                        <button type="button" onClick={backToRegister} style={styles.switchBtn}>
                            Quay lại đăng ký
                        </button>
                    </form>
                ) : (
                    <>
                        <form onSubmit={handleSubmit} style={styles.form}>
                            {mode === "register" && (
                                <div style={styles.field}>
                                    <label style={styles.label}>Họ tên</label>
                                    <input
                                        style={styles.input}
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Nguyễn Văn A"
                                        autoComplete="name"
                                    />
                                </div>
                            )}

                            <div style={styles.field}>
                                <label style={styles.label}>Email</label>
                                <input
                                    style={styles.input}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                    inputMode="email"
                                />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label}>Mật khẩu</label>
                                <div style={styles.passwordRow}>
                                    <input
                                        style={{ ...styles.input, margin: 0, flex: 1 }}
                                        type={showPw ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="******"
                                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                                    />
                                    <button
                                        type="button"
                                        style={styles.eyeBtn}
                                        onClick={() => setShowPw((s) => !s)}
                                        aria-label="Toggle password"
                                    >
                                        {showPw ? "Ẩn" : "Hiện"}
                                    </button>
                                </div>
                                <small style={styles.hint}>Tối thiểu 6 ký tự.</small>
                            </div>

                            {mode === "register" && (
                                <div style={styles.field}>
                                    <label style={styles.label}>Nhập lại mật khẩu</label>
                                    <div style={styles.passwordRow}>
                                        <input
                                            style={{ ...styles.input, margin: 0, flex: 1 }}
                                            type={showConfirmPw ? "text" : "password"}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="******"
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            style={styles.eyeBtn}
                                            onClick={() => setShowConfirmPw((s) => !s)}
                                            aria-label="Toggle confirm password"
                                        >
                                            {showConfirmPw ? "Ẩn" : "Hiện"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {error && <div style={styles.errorBox}>{error}</div>}

                            <button
                                type="submit"
                                style={{
                                    ...styles.submitBtn,
                                    opacity: canSubmit && !loading ? 1 : 0.6,
                                    cursor: canSubmit && !loading ? "pointer" : "not-allowed",
                                }}
                                disabled={!canSubmit || loading}
                            >
                                {loading ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}
                            </button>
                        </form>

                        <button type="button" onClick={switchMode} style={styles.switchBtn}>
                            {switchText}
                        </button>
                    </>
                )}
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
        fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    },
    card: {
        width: "100%",
        maxWidth: 420,
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        border: "1px solid #eee",
    },
    header: { marginBottom: 14 },
    subtitle: { margin: "6px 0 0", color: "#666", fontSize: 14 },
    form: { display: "grid", gap: 12 },
    field: { display: "grid", gap: 6 },
    label: { fontSize: 14, fontWeight: 600, color: "#222" },
    input: {
        height: 42,
        borderRadius: 10,
        border: "1px solid #ddd",
        padding: "0 12px",
        outline: "none",
        fontSize: 14,
    },
    passwordRow: { display: "flex", gap: 8, alignItems: "center" },
    eyeBtn: {
        height: 42,
        padding: "0 12px",
        borderRadius: 10,
        border: "1px solid #ddd",
        background: "#fafafa",
        cursor: "pointer",
        fontWeight: 600,
    },
    hint: { color: "#777", fontSize: 12 },
    errorBox: {
        background: "#fff1f1",
        color: "#b00020",
        border: "1px solid #ffd2d2",
        padding: 10,
        borderRadius: 10,
        fontSize: 13,
    },
    submitBtn: {
        height: 44,
        borderRadius: 12,
        border: "none",
        background: "#111827",
        color: "#fff",
        fontWeight: 700,
        fontSize: 15,
        marginTop: 6,
    },
    switchBtn: {
        marginTop: 12,
        width: "100%",
        border: "none",
        background: "transparent",
        color: "#2563eb",
        fontWeight: 700,
        cursor: "pointer",
        padding: 10,
    },
};
