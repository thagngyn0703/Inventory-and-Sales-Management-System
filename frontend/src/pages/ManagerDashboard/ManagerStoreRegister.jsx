import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, CheckCircle2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { InlineNotice } from "../../components/ui/inline-notice";

const API_BASE = process.env.REACT_APP_API_URL || "/api";

const BANNER_BG =
  "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1600&q=80";

export default function ManagerStoreRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [successInfo, setSuccessInfo] = useState(null);
  const redirectTimerRef = useRef(null);

  const canSubmit = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.address.trim().length > 0 &&
      form.phone.trim().length > 0 &&
      !loading,
    [form, loading]
  );

  const finishAndGoManager = useCallback(() => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    setSuccessInfo(null);
    navigate("/manager", { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!successInfo) return;
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = setTimeout(() => {
      redirectTimerRef.current = null;
      finishAndGoManager();
    }, 2600);
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [successInfo, finishAndGoManager]);

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
          // Backward compatibility: một số backend cũ vẫn còn validate 2 trường này.
          // Giá trị tạm sẽ được manager cập nhật lại đúng trong Manager Settings.
          tax_code: "__PENDING_PROFILE__",
          bank_account_number: "__PENDING_PROFILE__",
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
        storeName: data.store?.name || data.user?.storeName || currentUser.storeName || "",
      };
      localStorage.setItem("user", JSON.stringify(nextUser));

      const displayName =
        data.store?.name?.trim() || form.name.trim() || nextUser.storeName || "cửa hàng của bạn";
      setSuccessInfo({ storeName: displayName });
    } catch (err) {
      setError(err?.message || "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  };

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
          <div className="absolute inset-0 bg-gradient-to-b from-teal-900/88 via-sky-900/85 to-slate-950/92" />
          <div className="relative z-10 flex flex-col items-center justify-center px-10 py-16 text-center text-white">
            <motion.div
              initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                Thiết lập cửa hàng
                <br />
                của bạn
              </h1>
              <p className="mt-6 max-w-sm text-sm font-medium text-teal-50/95 md:text-base">
                ISMS — hoàn tất thông tin cửa hàng để quản lý kho và bán hàng.
              </p>
              <p className="mt-4 text-xs text-sky-100/90 md:text-sm">Chỉ mất vài phút</p>
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
                <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Đăng ký cửa hàng</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Tài khoản Manager cần tạo thông tin cửa hàng trước khi sử dụng hệ thống.
                </p>
              </div>

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="store-name">Tên cửa hàng *</Label>
                  <Input
                    id="store-name"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Ví dụ: Cửa hàng ABC"
                    autoComplete="organization"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="store-address">Địa chỉ</Label>
                  <Input
                    id="store-address"
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="Số nhà, đường, quận, thành phố"
                    autoComplete="street-address"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="store-phone">Số điện thoại</Label>
                  <Input
                    id="store-phone"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="09xxxxxxxx"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>

                <InlineNotice message={error} type="error" />

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    variant="auth"
                    size="pill"
                    className="min-w-[160px]"
                    disabled={!canSubmit}
                  >
                    {loading ? "Đang lưu..." : "Tạo cửa hàng"}
                  </Button>
                </div>
              </form>
            </div>
          </div>

          <div
            className="h-36 shrink-0 bg-cover bg-center bg-no-repeat lg:hidden"
            style={{
              backgroundImage: `linear-gradient(to top, rgba(15,118,110,0.92), rgba(14,165,233,0.5)), url(${BANNER_BG})`,
            }}
          />
        </main>
      </div>

      {successInfo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="store-register-success-title"
          aria-describedby="store-register-success-desc"
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
                id="store-register-success-title"
                className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
              >
                Đăng ký cửa hàng thành công
              </h3>
              <p id="store-register-success-desc" className="mt-3 text-sm leading-relaxed text-slate-600">
                <span className="font-semibold text-slate-800">{successInfo.storeName}</span> đã được nộp hồ sơ.
                Hệ thống sẽ kích hoạt đầy đủ sau khi admin phê duyệt thông tin pháp lý.
              </p>

              <div className="mt-6 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2.5, ease: "easeInOut" }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">Đang chuyển vào bảng quản lý…</p>

              <Button
                type="button"
                variant="auth"
                size="pill"
                className="mt-6 w-full sm:w-auto"
                onClick={finishAndGoManager}
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
