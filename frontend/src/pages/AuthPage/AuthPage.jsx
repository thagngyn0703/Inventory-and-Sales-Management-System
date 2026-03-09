import React, { useMemo, useState, useEffect } from "react";
// import "./AuthPage.css";
import { useNavigate, useLocation } from "react-router-dom";




const API_BASE = "http://localhost:8000/api";

const SAVED_EMAIL_KEY = "saved_login_email";
const SAVED_PASSWORD_KEY = "saved_login_password";
const SAVE_PASSWORD_KEY = "save_password_checked";

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export default function AuthPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [mode, setMode] = useState(() =>
        location.pathname === "/register" ? "register" : "login"
    ); // "login" | "register" | "verify" | "forgot" | "reset"
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // form state
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [role, setRole] = useState("warehouse_staff"); // manager | warehouse_staff | sales_staff

    // Sau khi đăng ký thành công, chuyển sang bước nhập mã (giữ email)
    const [pendingVerifyEmail, setPendingVerifyEmail] = useState("");
    const [verificationToken, setVerificationToken] = useState("");

    const [showPw, setShowPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);

    const [savePassword, setSavePassword] = useState(() => {
        try { return localStorage.getItem(SAVE_PASSWORD_KEY) === "1"; } catch { return false; }
    });
    const [forgotEmail, setForgotEmail] = useState("");
    const [resetToken, setResetToken] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");

    useEffect(() => {
        const path = location.pathname;
        if (path === "/register") setMode("register");
        else if (path === "/login") setMode("login");
        else if (path === "/resetpassword" && (mode === "login" || mode === "register")) setMode("forgot");
    }, [location.pathname]);

    useEffect(() => {
        if (mode !== "login") return;
        try {
            const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
            const savedPw = localStorage.getItem(SAVED_PASSWORD_KEY);
            if (savedEmail) setEmail(savedEmail);
            if (savedPw) setPassword(savedPw);
        } catch (_) {}
    }, [mode]);

    const title =
        mode === "forgot"
            ? "Quên mật khẩu"
            : mode === "reset"
                ? "Đặt lại mật khẩu"
                : mode === "login"
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
        if (mode === "forgot") {
            return forgotEmail.trim() && isEmail(forgotEmail.trim());
        }
        if (mode === "reset") {
            return forgotEmail.trim() && resetToken.trim().length >= 4 && newPassword.length >= 6 && newPassword === confirmNewPassword;
        }
        if (!email.trim() || !password) return false;
        if (!isEmail(email.trim())) return false;
        if (password.length < 6) return false;
        if (mode === "register") {
            if (!fullName.trim()) return false;
            if (confirmPassword !== password) return false;
            if (!role) return false;
        }
        return true;
    }, [mode, fullName, email, password, confirmPassword, role, pendingVerifyEmail, verificationToken, forgotEmail, resetToken, newPassword, confirmNewPassword]);

    const validate = () => {
        if (mode === "verify") {
            if (!verificationToken.trim()) return "Vui lòng nhập mã xác minh.";
            return "";
        }
        if (mode === "forgot") {
            if (!forgotEmail.trim()) return "Vui lòng nhập email.";
            if (!isEmail(forgotEmail.trim())) return "Email không hợp lệ.";
            return "";
        }
        if (mode === "reset") {
            if (!resetToken.trim()) return "Vui lòng nhập mã xác nhận.";
            if (newPassword.length < 6) return "Mật khẩu mới phải >= 6 ký tự.";
            if (newPassword !== confirmNewPassword) return "Mật khẩu nhập lại không khớp.";
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
            if (mode === "forgot") {
                const res = await fetch(`${API_BASE}/auth/forgot-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: forgotEmail.trim() }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || data.error || "Gửi mã thất bại");
                setError("");
                setForgotEmail((data.email && data.email.trim()) ? data.email.trim().toLowerCase() : forgotEmail.trim().toLowerCase());
                setResetToken("");
                setNewPassword("");
                setConfirmNewPassword("");
                setMode("reset");
                setLoading(false);
                return;
            }
            if (mode === "reset") {
                const res = await fetch(`${API_BASE}/auth/reset-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: forgotEmail.trim().toLowerCase(),
                        token: String(resetToken).trim().replace(/\D/g, ""),
                        newPassword,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || data.error || "Đặt lại mật khẩu thất bại");
                alert(data.message || "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập.");
                setMode("login");
                setForgotEmail("");
                setResetToken("");
                setNewPassword("");
                setConfirmNewPassword("");
                setLoading(false);
                navigate("/login", { replace: true });
                return;
            }
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
                const role = data.user?.role;
                if (role === "admin") {
                    navigate("/admin", { replace: true });
                } else if (role === "manager") {
                    navigate("/manager", { replace: true });
                } else if (role === "warehouse_staff" || role === "sales_staff") {
                    navigate("/home", { replace: true });
                } else {
                    navigate("/home", { replace: true });
                }
                return;
            }

            const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
            const payload =
                mode === "login"
                    ? { email: email.trim(), password }
                    : { fullName: fullName.trim(), email: email.trim(), password, role };

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

                if (savePassword) {
                    try {
                        localStorage.setItem(SAVED_EMAIL_KEY, email.trim());
                        localStorage.setItem(SAVED_PASSWORD_KEY, password);
                        localStorage.setItem(SAVE_PASSWORD_KEY, "1");
                    } catch (_) {}
                } else {
                    try {
                        localStorage.removeItem(SAVED_EMAIL_KEY);
                        localStorage.removeItem(SAVED_PASSWORD_KEY);
                        localStorage.removeItem(SAVE_PASSWORD_KEY);
                    } catch (_) {}
                }

                const role = data.user?.role;

                if (role === "admin") {
                    navigate("/admin", { replace: true });
                } else if (role === "manager") {
                    navigate("/manager", { replace: true });
                } else if (role === "warehouse_staff" || role === "sales_staff") {
                    navigate("/home", { replace: true });
                } else {
                    setError("Vai trò không hợp lệ");
                }
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
        setRole("warehouse_staff");
        setShowPw(false);
        setShowConfirmPw(false);
        setVerificationToken("");
    };

    const switchMode = () => {
        if (mode === "login") {
            resetFields();
            setPendingVerifyEmail("");
            navigate("/register", { replace: true });
        } else {
            resetFields();
            setPendingVerifyEmail("");
            navigate("/login", { replace: true });
        }
    };

    const backToRegister = () => {
        setEmail(pendingVerifyEmail);
        setPendingVerifyEmail("");
        setVerificationToken("");
        setError("");
        navigate("/register", { replace: true });
    };

    const showVerifyForm = mode === "verify";
    const showForgotForm = mode === "forgot";
    const showResetForm = mode === "reset";

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
                        {mode === "forgot" && "Nhập email đăng ký để nhận mã đặt lại mật khẩu"}
                        {mode === "reset" && "Nhập mã đã gửi đến email và mật khẩu mới"}
                    </p>
                </div>

                {showForgotForm ? (
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.field}>
                            <label style={styles.label}>Email</label>
                            <input
                                style={styles.input}
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                placeholder="you@example.com"
                                type="email"
                                autoComplete="email"
                            />
                        </div>
                        {error && <div style={styles.errorBox}>{error}</div>}
                        <button
                            type="submit"
                            style={{ ...styles.submitBtn, opacity: canSubmit && !loading ? 1 : 0.6, cursor: canSubmit && !loading ? "pointer" : "not-allowed" }}
                            disabled={!canSubmit || loading}
                        >
                            {loading ? "Đang gửi..." : "Gửi mã qua email"}
                        </button>
                        <button type="button" onClick={() => { setMode("login"); setError(""); setEmail(forgotEmail || email); setForgotEmail(""); navigate("/login", { replace: true }); }} style={styles.switchBtn}>
                            Quay lại đăng nhập
                        </button>
                    </form>
                ) : showResetForm ? (
                    <form onSubmit={handleSubmit} style={styles.form}>
                        <div style={styles.field}>
                            <label style={styles.label}>Email</label>
                            <input style={{ ...styles.input, background: "#f5f5f5", color: "#555" }} value={forgotEmail} readOnly />
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>Mã xác nhận (6 số)</label>
                            <input
                                style={styles.input}
                                value={resetToken}
                                onChange={(e) => setResetToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="123456"
                                inputMode="numeric"
                                maxLength={6}
                            />
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>Mật khẩu mới</label>
                            <input style={styles.input} type={showPw ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="******" autoComplete="new-password" />
                            <small style={styles.hint}>Tối thiểu 6 ký tự.</small>
                        </div>
                        <div style={styles.field}>
                            <label style={styles.label}>Nhập lại mật khẩu mới</label>
                            <input style={styles.input} type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="******" autoComplete="new-password" />
                        </div>
                        {error && <div style={styles.errorBox}>{error}</div>}
                        <button type="submit" style={{ ...styles.submitBtn, opacity: canSubmit && !loading ? 1 : 0.6, cursor: canSubmit && !loading ? "pointer" : "not-allowed" }} disabled={!canSubmit || loading}>
                            {loading ? "Đang xử lý..." : "Đặt lại mật khẩu"}
                        </button>
                        <button type="button" onClick={() => { setMode("forgot"); setResetToken(""); setNewPassword(""); setConfirmNewPassword(""); setError(""); }} style={styles.switchBtn}>
                            Quay lại bước trước
                        </button>
                    </form>
                ) : showVerifyForm ? (
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

                            {mode === "register" && (
                                <div style={styles.field}>
                                    <label style={styles.label}>Vai trò</label>
                                    <select
                                        style={styles.input}
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                    >
                                        <option value="manager">Manager</option>
                                        <option value="warehouse_staff">Warehouse Staff</option>
                                        <option value="sales_staff">Sales Staff</option>
                                    </select>
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

                            {mode === "login" && (
                                <>
                                    <div style={styles.field}>
                                        <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 400 }}>
                                            <input
                                                type="checkbox"
                                                checked={savePassword}
                                                onChange={(e) => setSavePassword(e.target.checked)}
                                            />
                                            Lưu mật khẩu
                                        </label>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setMode("forgot"); setForgotEmail(email.trim()); setError(""); navigate("/resetpassword", { replace: true }); }}
                                        style={{ ...styles.switchBtn, marginTop: 0, padding: "4px 0", fontSize: 13 }}
                                    >
                                        Quên mật khẩu?
                                    </button>
                                </>
                            )}

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
