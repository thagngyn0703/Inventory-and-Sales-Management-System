import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import AdminPageFrame from "../../components/admin/AdminPageFrame";
import { useToast } from "../../contexts/ToastContext";
import { getAdminDashboard, getAdminSubscriptionPlanPrices, putAdminSubscriptionPlanPrices } from "../../services/adminApi";
import AdminMonthlyStatsChart from "./AdminMonthlyStatsChart";
import { formatVndIntegerDots } from "../../utils/currencyInput";
import "../ManagerDashboard/ManagerDashboard.css";
import "../ManagerDashboard/ManagerProducts.css";
import "./AdminDashBoard.css";

function readStoredUser() {
    try {
        return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
        return null;
    }
}

export default function AdminDashboard() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const user = readStoredUser();
    const [monthlyRows, setMonthlyRows] = useState([]);
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState("");
    const [planPricesLoading, setPlanPricesLoading] = useState(true);
    const [planPricesSaving, setPlanPricesSaving] = useState(false);
    const [planPricesError, setPlanPricesError] = useState("");
    const [planMonthly, setPlanMonthly] = useState("");
    const [planYearly, setPlanYearly] = useState("");
    const [planDefaults, setPlanDefaults] = useState({ monthly_price_vnd: 100000, yearly_price_vnd: 1100000 });
    const [planUpdatedAt, setPlanUpdatedAt] = useState(null);

    const loadDashboard = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        setStatsLoading(true);
        setStatsError("");
        try {
            const data = await getAdminDashboard({ months: 12 });
            const rows = data?.monthlyStoreStats?.rows || [];
            setMonthlyRows(rows);
        } catch (e) {
            setStatsError(e.message || "Không thể tải thống kê");
            setMonthlyRows([]);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    const loadPlanPrices = useCallback(async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        setPlanPricesLoading(true);
        setPlanPricesError("");
        try {
            const data = await getAdminSubscriptionPlanPrices();
            const m = Number(data?.monthly_price_vnd ?? 100000);
            const y = Number(data?.yearly_price_vnd ?? 1100000);
            setPlanMonthly(formatVndIntegerDots(String(Math.round(m))));
            setPlanYearly(formatVndIntegerDots(String(Math.round(y))));
            setPlanDefaults({
                monthly_price_vnd: Number(data?.defaults?.monthly_price_vnd ?? 100000),
                yearly_price_vnd: Number(data?.defaults?.yearly_price_vnd ?? 1100000),
            });
            setPlanUpdatedAt(data?.updated_at || null);
        } catch (e) {
            setPlanPricesError(e.message || "Không thể tải cấu hình giá gói");
        } finally {
            setPlanPricesLoading(false);
        }
    }, []);

    const applyPlanPrices = useCallback(async () => {
        setPlanPricesSaving(true);
        setPlanPricesError("");
        try {
            const monthly_price_vnd = Math.round(Number(String(planMonthly).replace(/\D/g, "")) || 0);
            const yearly_price_vnd = Math.round(Number(String(planYearly).replace(/\D/g, "")) || 0);
            await putAdminSubscriptionPlanPrices({ monthly_price_vnd, yearly_price_vnd });
            await loadPlanPrices();
            toast(
                `Đã áp dụng giá gói: ${formatVndIntegerDots(String(monthly_price_vnd))}đ/tháng · ${formatVndIntegerDots(String(yearly_price_vnd))}đ/năm.`,
                "success"
            );
        } catch (e) {
            const msg = e.message || "Không thể lưu giá";
            setPlanPricesError(msg);
            toast(msg, "error");
        } finally {
            setPlanPricesSaving(false);
        }
    }, [planMonthly, planYearly, loadPlanPrices, toast]);

    useEffect(() => {
        if (!localStorage.getItem("token") || !user) {
            navigate("/login", { replace: true });
            return;
        }
        if (user.role !== "admin") {
            navigate("/home", { replace: true });
        }
    }, [user, navigate]);

    useEffect(() => {
        if (user?.role === "admin") loadDashboard();
    }, [user?.role, loadDashboard]);

    useEffect(() => {
        if (user?.role === "admin") loadPlanPrices();
    }, [user?.role, loadPlanPrices]);

    if (!user || user.role !== "admin") return null;

    return (
        <AdminPageFrame>
                    <div className="manager-page-header">
                        <h1 className="manager-page-title">Tổng quan hệ thống</h1>
                        <p className="manager-page-subtitle">
                            Xin chào <b>{user?.email || "Admin"}</b> — chọn thao tác quản trị bên dưới.
                        </p>
                    </div>

                    <div className="manager-panel-card">
                        <div className="manager-panel-header manager-panel-header--space">
                            <h2 className="manager-panel-title">Quản trị nhanh</h2>
                        </div>
                        <div className="admin-dash-quick admin-dash-quick--grid">
                            <button
                                type="button"
                                className="admin-dash-quick__btn"
                                onClick={() => navigate("/admin/stores")}
                            >
                                <i className="fa-solid fa-store" />
                                <span>Quản lý cửa hàng</span>
                                <small>Bật / tắt hoạt động cửa hàng, duyệt hồ sơ pháp lý</small>
                            </button>
                            <button
                                type="button"
                                className="admin-dash-quick__btn"
                                onClick={() => navigate("/admin/users")}
                            >
                                <i className="fa-solid fa-user-gear" />
                                <span>Quản lý tài khoản</span>
                                <small>Trạng thái tài khoản và gán nhân viên vào cửa hàng</small>
                            </button>
                            <button
                                type="button"
                                className="admin-dash-quick__btn"
                                onClick={() => navigate("/admin/support")}
                            >
                                <i className="fa-solid fa-headset" />
                                <span>Phiếu hỗ trợ</span>
                                <small>Theo dõi yêu cầu từ quản lý cửa hàng theo trạng thái</small>
                            </button>
                            <button
                                type="button"
                                className="admin-dash-quick__btn"
                                onClick={() => navigate("/admin/categories")}
                            >
                                <i className="fa-solid fa-folder-tree" />
                                <span>Danh mục sản phẩm</span>
                                <small>Thêm, sửa, xóa danh mục và cấu hình thuế áp dụng</small>
                            </button>
                        </div>
                    </div>

                    <div className="manager-panel-card">
                        <div className="manager-panel-header manager-panel-header--space">
                            <h2 className="manager-panel-title">Giá gói thuê (SaaS)</h2>
                        </div>
                        <p className="admin-dash-stats-hint" style={{ marginTop: 0 }}>
                            Sau <strong>7 ngày dùng thử</strong>, cửa hàng chọn gói <strong>theo tháng</strong> hoặc{" "}
                            <strong>theo năm</strong>. Điều chỉnh số tiền bên dưới rồi nhấn <strong>Áp dụng</strong> — giá
                            hiển thị trên trang cài đặt quản lý, trang công khai (nếu có) và số tiền trên đơn thanh toán
                            / QR sẽ theo mức mới ngay.
                        </p>
                        <p className="admin-dash-stats-hint">
                            Giá gốc mặc định hệ thống:{" "}
                            <strong>{formatVndIntegerDots(String(planDefaults.monthly_price_vnd))}đ</strong> / tháng ·{" "}
                            <strong>{formatVndIntegerDots(String(planDefaults.yearly_price_vnd))}đ</strong> / năm.
                        </p>
                        {planUpdatedAt && (
                            <p className="text-xs text-slate-500" style={{ marginTop: "0.25rem" }}>
                                Cập nhật lần cuối: {new Date(planUpdatedAt).toLocaleString("vi-VN")}
                            </p>
                        )}
                        {planPricesError && <div className="manager-products-error">{planPricesError}</div>}
                        {planPricesLoading ? (
                            <p className="py-6 text-center text-sm text-slate-500">Đang tải cấu hình giá…</p>
                        ) : (
                            <div className="admin-dash-quick admin-dash-quick--grid" style={{ marginTop: "1rem" }}>
                                <label className="flex flex-col gap-1 text-left">
                                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Gói theo tháng (VNĐ)
                                    </span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={planMonthly}
                                        onChange={(e) => setPlanMonthly(formatVndIntegerDots(e.target.value))}
                                        className="h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800"
                                        placeholder={formatVndIntegerDots("100000")}
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-left">
                                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        Gói theo năm (VNĐ)
                                    </span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={planYearly}
                                        onChange={(e) => setPlanYearly(formatVndIntegerDots(e.target.value))}
                                        className="h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800"
                                        placeholder={formatVndIntegerDots("1100000")}
                                    />
                                </label>
                            </div>
                        )}
                        {!planPricesLoading && (
                            <div className="mt-4">
                                <button
                                    type="button"
                                    onClick={applyPlanPrices}
                                    disabled={planPricesSaving}
                                    className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {planPricesSaving ? "Đang lưu…" : "Áp dụng giá"}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="manager-panel-card admin-dash-stats">
                        <div className="manager-panel-header manager-panel-header--space">
                            <h2 className="manager-panel-title">Biểu đồ thống kê theo tháng (toàn hệ thống)</h2>
                        </div>
                        <p className="admin-dash-stats-hint">
                            Số liệu gộp mọi cửa hàng: <strong>sản phẩm</strong> là số SKU được tạo trong tháng;
                            <strong> đơn hàng</strong> là số hóa đơn bán (không tính đã hủy), theo ngày trên hóa đơn.
                            Trục trái: sản phẩm mới; trục phải: đơn hàng (12 tháng gần nhất, theo lịch Việt Nam).
                        </p>
                        {statsError && <div className="manager-products-error">{statsError}</div>}
                        <AdminMonthlyStatsChart rows={monthlyRows} loading={statsLoading} />
                    </div>
        </AdminPageFrame>
    );
}
