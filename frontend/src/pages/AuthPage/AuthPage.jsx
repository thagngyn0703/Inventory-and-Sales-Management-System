import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, Eye, EyeOff, CheckCircle2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { normalizeRole } from "../../utils/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const API_BASE = "http://localhost:8000/api";

const BANNER_BG =
    "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1600&q=80";

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function getPostLoginPath(user) {
    const role = normalizeRole(user?.role);
    const hasStoreId = Boolean(user?.storeId);

    if (role === "admin") return "/admin";
    if (role === "manager") return hasStoreId ? "/manager" : "/manager/store/register";
    if (role === "staff") return hasStoreId ? "/staff" : "/no-store-assigned";
    return "/home";
}

export default function AuthPage({ forcedMode = null }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [mode, setMode] = useState("login");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [pendingVerifyEmail, setPendingVerifyEmail] = useState("");
    const [verificationToken, setVerificationToken] = useState("");
    const [forgotEmail, setForgotEmail] = useState("");
    const [resetEmail, setResetEmail] = useState("");
    const [resetToken, setResetToken] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [changeEmail, setChangeEmail] = useState("");
    const [oldPassword, setOldPassword] = useState("");
    const [changeNewPassword, setChangeNewPassword] = useState("");
    const [confirmChangeNewPassword, setConfirmChangeNewPassword] = useState("");

    const [showPw, setShowPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmNewPw, setShowConfirmNewPw] = useState(false);
    const [showOldPw, setShowOldPw] = useState(false);
    const [showChangeNewPw, setShowChangeNewPw] = useState(false);
    const [showConfirmChangeNewPw, setShowConfirmChangeNewPw] = useState(false);

    const [verifySuccessUser, setVerifySuccessUser] = useState(null);
    const verifyRedirectTimerRef = useRef(null);

    const completeEmailVerification = useCallback(
        (user) => {
            if (verifyRedirectTimerRef.current) {
                clearTimeout(verifyRedirectTimerRef.current);
                verifyRedirectTimerRef.current = null;
            }
            setVerifySuccessUser(null);
            navigate(getPostLoginPath(user), { replace: true });
        },
        [navigate]
    );

    useEffect(() => {
        if (!verifySuccessUser) return;
        if (verifyRedirectTimerRef.current) clearTimeout(verifyRedirectTimerRef.current);
        verifyRedirectTimerRef.current = setTimeout(() => {
            verifyRedirectTimerRef.current = null;
            completeEmailVerification(verifySuccessUser);
        }, 2600);
        return () => {
            if (verifyRedirectTimerRef.current) {
                clearTimeout(verifyRedirectTimerRef.current);
                verifyRedirectTimerRef.current = null;
            }
        };
    }, [verifySuccessUser, completeEmailVerification]);

    useEffect(() => {
        if (forcedMode) {
            setMode(forcedMode);
            if (forcedMode === "reset") {
                const resetEmailFromQuery = new URLSearchParams(location.search).get("email") || "";
                if (resetEmailFromQuery) setResetEmail(resetEmailFromQuery);
            }
            return;
        }
        if (location.pathname === "/login") {
            setMode("login");
        }
    }, [forcedMode, location.pathname, location.search]);

    useEffect(() => {
        if (forcedMode) return;
        const authMessage = location.state?.authMessage;
        const prefillEmail = location.state?.email;
        if (authMessage) setError(authMessage);
        if (prefillEmail) setEmail(prefillEmail);
        if (authMessage || prefillEmail) {
            navigate(location.pathname, { replace: true, state: null });
        }
    }, [forcedMode, location.state, location.pathname, navigate]);

    const title =
        mode === "login"
            ? "Đăng nhập tài khoản"
            : mode === "register"
                ? "Tạo tài khoản"
                : mode === "verify"
                    ? "Xác minh email"
                    : mode === "forgot"
                        ? "Quên mật khẩu"
                        : mode === "reset"
                            ? "Đặt lại mật khẩu"
                            : "Đổi mật khẩu";

    const canSubmit = useMemo(() => {
        if (mode === "verify") {
            return pendingVerifyEmail.trim() && verificationToken.trim().length >= 4;
        }
        if (mode === "forgot") {
            return forgotEmail.trim() && isEmail(forgotEmail.trim());
        }
        if (mode === "reset") {
            return (
                resetEmail.trim() &&
                isEmail(resetEmail.trim()) &&
                resetToken.trim().length >= 4 &&
                newPassword.length >= 6 &&
                confirmNewPassword === newPassword
            );
        }
        if (mode === "change") {
            return (
                changeEmail.trim() &&
                isEmail(changeEmail.trim()) &&
                oldPassword.length >= 1 &&
                changeNewPassword.length >= 6 &&
                confirmChangeNewPassword === changeNewPassword
            );
        }
        if (!email.trim() || !password) return false;
        if (!isEmail(email.trim())) return false;
        if (password.length < 6) return false;
        if (mode === "register") {
            if (!fullName.trim()) return false;
            if (confirmPassword !== password) return false;
        }
        return true;
    }, [
        mode,
        fullName,
        email,
        password,
        confirmPassword,
        pendingVerifyEmail,
        verificationToken,
        forgotEmail,
        resetEmail,
        resetToken,
        newPassword,
        confirmNewPassword,
        changeEmail,
        oldPassword,
        changeNewPassword,
        confirmChangeNewPassword,
    ]);

    const validate = () => {
        if (mode === "verify") {
            if (!verificationToken.trim()) return "Vui lòng nhập mã xác minh.";
            return "";
        }
        if (mode === "forgot") {
            const forgot = forgotEmail.trim();
            if (!forgot) return "Vui lòng nhập email.";
            if (!isEmail(forgot)) return "Email không hợp lệ.";
            return "";
        }
        if (mode === "reset") {
            const resetMail = resetEmail.trim();
            if (!resetMail) return "Vui lòng nhập email.";
            if (!isEmail(resetMail)) return "Email không hợp lệ.";
            if (!resetToken.trim()) return "Vui lòng nhập mã xác nhận.";
            if (newPassword.length < 6) return "Mật khẩu mới phải >= 6 ký tự.";
            if (confirmNewPassword !== newPassword) return "Mật khẩu nhập lại không khớp.";
            return "";
        }
        if (mode === "change") {
            const cEmail = changeEmail.trim();
            if (!cEmail) return "Vui lòng nhập email.";
            if (!isEmail(cEmail)) return "Email không hợp lệ.";
            if (!oldPassword) return "Vui lòng nhập mật khẩu cũ.";
            if (changeNewPassword.length < 6) return "Mật khẩu mới phải >= 6 ký tự.";
            if (confirmChangeNewPassword !== changeNewPassword) return "Mật khẩu nhập lại không khớp.";
            if (oldPassword === changeNewPassword) return "Mật khẩu mới phải khác mật khẩu cũ.";
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
                setVerifySuccessUser(data.user || {});
                return;
            }

            if (mode === "forgot") {
                const res = await fetch(`${API_BASE}/auth/forgot-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: forgotEmail.trim(),
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.message || data.error || "Gửi mã thất bại");
                }
                setResetEmail(data.email || forgotEmail.trim());
                setResetToken("");
                setNewPassword("");
                setConfirmNewPassword("");
                navigate(`/reset-password?email=${encodeURIComponent(data.email || forgotEmail.trim())}`, {
                    replace: true,
                });
                return;
            }

            if (mode === "reset") {
                const res = await fetch(`${API_BASE}/auth/reset-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: resetEmail.trim(),
                        token: resetToken.trim(),
                        newPassword,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.message || data.error || "Đặt lại mật khẩu thất bại");
                }
                navigate("/login", {
                    replace: true,
                    state: {
                        authMessage: data.message || "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
                        email: resetEmail.trim(),
                    },
                });
                return;
            }

            if (mode === "change") {
                const res = await fetch(`${API_BASE}/auth/change-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: changeEmail.trim(),
                        oldPassword,
                        newPassword: changeNewPassword,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.message || data.error || "Đổi mật khẩu thất bại");
                }
                navigate("/login", {
                    replace: true,
                    state: {
                        authMessage: data.message || "Đổi mật khẩu thành công. Vui lòng đăng nhập lại.",
                        email: changeEmail.trim(),
                    },
                });
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
            } else {
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
        setForgotEmail("");
        setResetEmail("");
        setResetToken("");
        setNewPassword("");
        setConfirmNewPassword("");
        setShowNewPw(false);
        setShowConfirmNewPw(false);
        setChangeEmail("");
        setOldPassword("");
        setChangeNewPassword("");
        setConfirmChangeNewPassword("");
        setShowOldPw(false);
        setShowChangeNewPw(false);
        setShowConfirmChangeNewPw(false);
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

    const toForgotMode = () => {
        setForgotEmail(email.trim());
        setError("");
        setPassword("");
        setShowPw(false);
        navigate("/forgot-password");
    };

    const toChangePasswordMode = () => {
        setChangeEmail(email.trim());
        setOldPassword("");
        setChangeNewPassword("");
        setConfirmChangeNewPassword("");
        setError("");
        setPassword("");
        setShowPw(false);
        setShowOldPw(false);
        setShowChangeNewPw(false);
        setShowConfirmChangeNewPw(false);
        navigate("/change-password");
    };

    const backToLogin = () => {
        const loginEmail = resetEmail || forgotEmail || changeEmail || email;
        setError("");
        setForgotEmail("");
        setResetEmail("");
        setResetToken("");
        setNewPassword("");
        setConfirmNewPassword("");
        setShowNewPw(false);
        setShowConfirmNewPw(false);
        setChangeEmail("");
        setOldPassword("");
        setChangeNewPassword("");
        setConfirmChangeNewPassword("");
        setShowOldPw(false);
        setShowChangeNewPw(false);
        setShowConfirmChangeNewPw(false);
        navigate("/login", {
            replace: true,
            state: loginEmail ? { email: loginEmail } : null,
        });
    };

    const showVerifyForm = mode === "verify";
    const showForgotForm = mode === "forgot";
    const showResetForm = mode === "reset";
    const showChangePasswordForm = mode === "change";

    return (
        <>
        <div className="flex min-h-screen w-full bg-white">
            <aside
                className="relative hidden w-[42%] min-w-[320px] flex-col justify-center overflow-hidden lg:flex"
                aria-hidden
            >
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${BANNER_BG})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-blue-900/85 via-blue-800/88 to-blue-950/90" />
                <div className="relative z-10 flex flex-col items-center justify-center px-10 py-16 text-center text-white">
                    <motion.div
                        initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                            Quản lý dễ dàng
                            <br />
                            Vận hành đơn giản
                        </h1>
                        <p className="mt-6 max-w-sm text-sm font-medium text-blue-100/95 md:text-base">
                            ISMS — hệ thống quản lý kho &amp; bán hàng cho cửa hàng của bạn.
                        </p>
                        <p className="mt-4 text-xs text-blue-200/90 md:text-sm">Hỗ trợ: liên hệ quản trị hệ thống</p>
                    </motion.div>
                </div>
            </aside>

            <main className="relative flex min-h-screen flex-1 flex-col bg-sky-50/90">
                <div className="absolute right-4 top-4 z-20 md:right-6 md:top-6">
                    <Button
                        type="button"
                        variant="ghost"
                        size="default"
                        className="h-9 w-9 rounded-full p-0 text-slate-500 hover:text-slate-800"
                        onClick={() => navigate("/home")}
                        aria-label="Đóng"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
                    <div className="w-full max-w-md">
                        <div className="mb-8 text-center lg:text-left">
                            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2>
                            <p className="mt-2 text-sm text-slate-600">
                                {mode === "login" && "Đăng nhập để tiếp tục làm việc."}
                                {mode === "register" && "Tạo tài khoản mới để bắt đầu."}
                                {mode === "verify" &&
                                    "Nhập mã đã gửi đến email của bạn để kích hoạt tài khoản."}
                                {mode === "forgot" && "Nhập email để nhận mã xác nhận đặt lại mật khẩu."}
                                {mode === "reset" && "Nhập mã xác nhận từ email và đặt mật khẩu mới."}
                                {mode === "change" &&
                                    "Nhập mật khẩu cũ và mật khẩu mới để đổi mật khẩu tài khoản."}
                            </p>
                        </div>

                        {showVerifyForm ? (
                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="verify-email">Email</Label>
                                    <Input
                                        id="verify-email"
                                        value={pendingVerifyEmail}
                                        readOnly
                                        className="border-slate-200 bg-slate-100 text-slate-600"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="verify-token">Mã xác minh</Label>
                                    <Input
                                        id="verify-token"
                                        value={verificationToken}
                                        onChange={(e) =>
                                            setVerificationToken(e.target.value.replace(/\D/g, "").slice(0, 6))
                                        }
                                        placeholder="123456"
                                        inputMode="numeric"
                                        maxLength={6}
                                        autoComplete="one-time-code"
                                    />
                                    <p className="text-xs text-slate-500">Mã có hiệu lực 24 giờ.</p>
                                </div>
                                {error && (
                                    <div
                                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                                        role="alert"
                                    >
                                        {error}
                                    </div>
                                )}
                                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={backToRegister}
                                        className="order-2 sm:order-1"
                                    >
                                        Quay lại đăng ký
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="auth"
                                        size="pill"
                                        className="order-1 min-w-[140px] sm:order-2"
                                        disabled={!canSubmit || loading}
                                    >
                                        {loading ? "Đang xử lý..." : "Xác minh"}
                                    </Button>
                                </div>
                            </form>
                        ) : showForgotForm ? (
                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="forgot-email">Email</Label>
                                    <Input
                                        id="forgot-email"
                                        value={forgotEmail}
                                        onChange={(e) => setForgotEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        inputMode="email"
                                    />
                                </div>
                                {error && (
                                    <div
                                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                                        role="alert"
                                    >
                                        {error}
                                    </div>
                                )}
                                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={backToLogin}
                                        className="order-2 sm:order-1"
                                    >
                                        Quay lại đăng nhập
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="auth"
                                        size="pill"
                                        className="order-1 min-w-[170px] sm:order-2"
                                        disabled={!canSubmit || loading}
                                    >
                                        {loading ? "Đang gửi mã..." : "Gửi mã xác nhận"}
                                    </Button>
                                </div>
                            </form>
                        ) : showResetForm ? (
                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="reset-email">Email</Label>
                                    <Input
                                        id="reset-email"
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        inputMode="email"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reset-token">Mã xác nhận</Label>
                                    <Input
                                        id="reset-token"
                                        value={resetToken}
                                        onChange={(e) => setResetToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                        placeholder="123456"
                                        inputMode="numeric"
                                        maxLength={6}
                                        autoComplete="one-time-code"
                                    />
                                    <p className="text-xs text-slate-500">Mã có hiệu lực 1 giờ.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new-password">Mật khẩu mới</Label>
                                    <div className="relative flex gap-2">
                                        <Input
                                            id="new-password"
                                            className="pr-11"
                                            type={showNewPw ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="••••••"
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                            onClick={() => setShowNewPw((s) => !s)}
                                            aria-label={showNewPw ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
                                        >
                                            {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm-new-password">Nhập lại mật khẩu mới</Label>
                                    <div className="relative flex gap-2">
                                        <Input
                                            id="confirm-new-password"
                                            className="pr-11"
                                            type={showConfirmNewPw ? "text" : "password"}
                                            value={confirmNewPassword}
                                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                                            placeholder="••••••"
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                            onClick={() => setShowConfirmNewPw((s) => !s)}
                                            aria-label={showConfirmNewPw ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
                                        >
                                            {showConfirmNewPw ? (
                                                <EyeOff className="h-4 w-4" />
                                            ) : (
                                                <Eye className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                {error && (
                                    <div
                                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                                        role="alert"
                                    >
                                        {error}
                                    </div>
                                )}
                                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={backToLogin}
                                        className="order-2 sm:order-1"
                                    >
                                        Quay lại đăng nhập
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="auth"
                                        size="pill"
                                        className="order-1 min-w-[170px] sm:order-2"
                                        disabled={!canSubmit || loading}
                                    >
                                        {loading ? "Đang xử lý..." : "Đặt lại mật khẩu"}
                                    </Button>
                                </div>
                            </form>
                        ) : showChangePasswordForm ? (
                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="change-email">Email</Label>
                                    <Input
                                        id="change-email"
                                        value={changeEmail}
                                        onChange={(e) => setChangeEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        inputMode="email"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="old-password">Mật khẩu cũ</Label>
                                    <div className="relative flex gap-2">
                                        <Input
                                            id="old-password"
                                            className="pr-11"
                                            type={showOldPw ? "text" : "password"}
                                            value={oldPassword}
                                            onChange={(e) => setOldPassword(e.target.value)}
                                            placeholder="••••••"
                                            autoComplete="current-password"
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                            onClick={() => setShowOldPw((s) => !s)}
                                            aria-label={showOldPw ? "Ẩn mật khẩu cũ" : "Hiện mật khẩu cũ"}
                                        >
                                            {showOldPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="change-new-password">Mật khẩu mới</Label>
                                    <div className="relative flex gap-2">
                                        <Input
                                            id="change-new-password"
                                            className="pr-11"
                                            type={showChangeNewPw ? "text" : "password"}
                                            value={changeNewPassword}
                                            onChange={(e) => setChangeNewPassword(e.target.value)}
                                            placeholder="••••••"
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                            onClick={() => setShowChangeNewPw((s) => !s)}
                                            aria-label={showChangeNewPw ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
                                        >
                                            {showChangeNewPw ? (
                                                <EyeOff className="h-4 w-4" />
                                            ) : (
                                                <Eye className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm-change-new-password">Nhập lại mật khẩu mới</Label>
                                    <div className="relative flex gap-2">
                                        <Input
                                            id="confirm-change-new-password"
                                            className="pr-11"
                                            type={showConfirmChangeNewPw ? "text" : "password"}
                                            value={confirmChangeNewPassword}
                                            onChange={(e) => setConfirmChangeNewPassword(e.target.value)}
                                            placeholder="••••••"
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                            onClick={() => setShowConfirmChangeNewPw((s) => !s)}
                                            aria-label={showConfirmChangeNewPw ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
                                        >
                                            {showConfirmChangeNewPw ? (
                                                <EyeOff className="h-4 w-4" />
                                            ) : (
                                                <Eye className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                {error && (
                                    <div
                                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                                        role="alert"
                                    >
                                        {error}
                                    </div>
                                )}
                                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={backToLogin}
                                        className="order-2 sm:order-1"
                                    >
                                        Quay lại đăng nhập
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="auth"
                                        size="pill"
                                        className="order-1 min-w-[170px] sm:order-2"
                                        disabled={!canSubmit || loading}
                                    >
                                        {loading ? "Đang xử lý..." : "Đổi mật khẩu"}
                                    </Button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                    {mode === "register" && (
                                        <div className="space-y-2">
                                            <Label htmlFor="fullName">Họ tên</Label>
                                            <Input
                                                id="fullName"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                placeholder="Nguyễn Văn A"
                                                autoComplete="name"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@example.com"
                                            autoComplete="email"
                                            inputMode="email"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="password">Mật khẩu</Label>
                                        <div className="relative flex gap-2">
                                            <Input
                                                id="password"
                                                className="pr-11"
                                                type={showPw ? "text" : "password"}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••"
                                                autoComplete={mode === "login" ? "current-password" : "new-password"}
                                            />
                                            <button
                                                type="button"
                                                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                                onClick={() => setShowPw((s) => !s)}
                                                aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                            >
                                                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500">Tối thiểu 6 ký tự.</p>
                                    </div>

                                    {mode === "register" && (
                                        <div className="space-y-2">
                                            <Label htmlFor="confirm">Nhập lại mật khẩu</Label>
                                            <div className="relative">
                                                <Input
                                                    id="confirm"
                                                    className="pr-11"
                                                    type={showConfirmPw ? "text" : "password"}
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="••••••"
                                                    autoComplete="new-password"
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                                    onClick={() => setShowConfirmPw((s) => !s)}
                                                    aria-label={showConfirmPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                                >
                                                    {showConfirmPw ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {error && (
                                        <div
                                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                                            role="alert"
                                        >
                                            {error}
                                        </div>
                                    )}

                                    <div className="flex justify-end pt-2">
                                        <Button
                                            type="submit"
                                            variant="auth"
                                            size="pill"
                                            className="min-w-[160px]"
                                            disabled={!canSubmit || loading}
                                        >
                                            {loading
                                                ? "Đang xử lý..."
                                                : mode === "login"
                                                    ? "Đăng nhập"
                                                    : "Đăng ký"}
                                        </Button>
                                    </div>
                                </form>

                                <button
                                    type="button"
                                    onClick={switchMode}
                                    className="mt-6 w-full text-center text-sm font-semibold text-blue-600 hover:underline"
                                >
                                    {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
                                </button>
                                {mode === "login" && (
                                    <div className="mt-3 flex items-center justify-center gap-4 text-sm font-semibold">
                                        <button
                                            type="button"
                                            onClick={toForgotMode}
                                            className="text-slate-600 hover:underline"
                                        >
                                            Quên mật khẩu?
                                        </button>
                                        <span className="text-slate-300">|</span>
                                        <button
                                            type="button"
                                            onClick={toChangePasswordMode}
                                            className="text-slate-600 hover:underline"
                                        >
                                            Đổi mật khẩu
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div
                    className="h-36 shrink-0 bg-cover bg-center bg-no-repeat lg:hidden"
                    style={{
                        backgroundImage: `linear-gradient(to top, rgba(30,58,138,0.92), rgba(37,99,235,0.55)), url(${BANNER_BG})`,
                    }}
                />
            </main>
        </div>

        {verifySuccessUser && (
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="verify-success-title"
                aria-describedby="verify-success-desc"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    className="relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-emerald-100/80 bg-white shadow-[0_25px_50px_-12px_rgba(15,23,42,0.35)]"
                >
                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/15 blur-2xl" />
                    <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-sky-400/10 blur-2xl" />

                    <div className="relative px-8 pb-8 pt-10 text-center">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.08 }}
                            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30"
                        >
                            <CheckCircle2 className="h-9 w-9 text-white" strokeWidth={2.25} aria-hidden />
                        </motion.div>

                        <div className="mt-6 flex items-center justify-center gap-1.5 text-emerald-600">
                            <Sparkles className="h-4 w-4" aria-hidden />
                            <span className="text-xs font-bold uppercase tracking-wider">Hoàn tất</span>
                            <Sparkles className="h-4 w-4" aria-hidden />
                        </div>

                        <h3
                            id="verify-success-title"
                            className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
                        >
                            Xác minh email thành công
                        </h3>
                        <p id="verify-success-desc" className="mt-3 text-sm leading-relaxed text-slate-600">
                            Tài khoản của bạn đã được kích hoạt. Chào mừng bạn đến với{" "}
                            <span className="font-semibold text-slate-800">ISMS</span>.
                        </p>

                        <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                            <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ duration: 2.5, ease: "easeInOut" }}
                            />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Đang chuyển vào hệ thống…</p>

                        <Button
                            type="button"
                            variant="auth"
                            size="pill"
                            className="mt-6 w-full sm:w-auto"
                            onClick={() => completeEmailVerification(verifySuccessUser)}
                        >
                            Vào hệ thống ngay
                        </Button>
                    </div>
                </motion.div>
            </div>
        )}
        </>
    );
}
