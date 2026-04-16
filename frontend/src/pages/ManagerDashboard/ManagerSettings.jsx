import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { FolderTree, Settings, UsersRound, Bell, UserPlus, Receipt, Percent, Store, Building2, Info } from 'lucide-react';
import {
  getStoreTaxSettings,
  updateStoreTaxSettings,
  getStoreBankSettings,
  updateStoreBankSettings,
} from '../../services/adminApi';

const linkClass =
  'flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/40';

const TAX_RATE_OPTIONS = [
  { label: '0%', value: 0 },
  { label: '5%', value: 5 },
  { label: '8%', value: 8 },
  { label: '10%', value: 10 },
];

/** Tính ví dụ breakdown để hiển thị preview */
function calcPreview(amount, taxRate, priceIncludes) {
  if (taxRate === 0) return null;
  if (priceIncludes) {
    const sub = Math.round(amount / (1 + taxRate / 100));
    return { sub, tax: amount - sub, total: amount };
  }
  const tax = Math.round(amount * (taxRate / 100));
  return { sub: amount, tax, total: amount + tax };
}

export default function ManagerSettings() {
  const [config, setConfig] = useState({
    business_type: 'ho_kinh_doanh',
    tax_rate: 0,
    price_includes_tax: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [bankConfig, setBankConfig] = useState({
    bank_id: '',
    bank_account: '',
    bank_account_name: '',
  });
  const [savingBank, setSavingBank] = useState(false);
  const [bankMsg, setBankMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    getStoreTaxSettings()
      .then((data) =>
        setConfig({
          business_type: data.business_type || 'ho_kinh_doanh',
          tax_rate: data.tax_rate ?? 0,
          price_includes_tax: data.price_includes_tax !== false,
        })
      )
      .catch(() => {})
      .finally(() => setLoading(false));

    getStoreBankSettings()
      .then((data) =>
        setBankConfig({
          bank_id: data.bank_id || '',
          bank_account: data.bank_account || '',
          bank_account_name: data.bank_account_name || '',
        })
      )
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const payload =
        config.business_type === 'ho_kinh_doanh'
          ? { business_type: 'ho_kinh_doanh' }
          : {
              business_type: 'doanh_nghiep',
              price_includes_tax: config.price_includes_tax,
              tax_rate: config.tax_rate,
            };
      const res = await updateStoreTaxSettings(payload);
      setConfig({
        business_type: res.business_type || 'ho_kinh_doanh',
        tax_rate: res.tax_rate ?? 0,
        price_includes_tax: res.price_includes_tax !== false,
      });
      setMsg({ type: 'success', text: 'Đã lưu cấu hình thành công.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Lỗi khi lưu cấu hình.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBank = async () => {
    setSavingBank(true);
    setBankMsg({ type: '', text: '' });
    try {
      const payload = {
        bank_id: (bankConfig.bank_id || '').trim().toLowerCase(),
        bank_account: (bankConfig.bank_account || '').trim(),
        bank_account_name: (bankConfig.bank_account_name || '').trim(),
      };
      const res = await updateStoreBankSettings(payload);
      setBankConfig({
        bank_id: res.bank_id || '',
        bank_account: res.bank_account || '',
        bank_account_name: res.bank_account_name || '',
      });
      setBankMsg({ type: 'success', text: 'Đã lưu cấu hình ngân hàng.' });
    } catch (err) {
      setBankMsg({ type: 'error', text: err.message || 'Lỗi khi lưu cấu hình ngân hàng.' });
    } finally {
      setSavingBank(false);
    }
  };

  const isHKD = config.business_type === 'ho_kinh_doanh';
  const preview = calcPreview(100000, config.tax_rate, config.price_includes_tax);

  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Quản lý cửa hàng"
        eyebrowIcon={Settings}
        title="Cài đặt & cấu hình"
        subtitle="Truy cập nhanh các mục thường dùng. Các thay đổi quan trọng vẫn nằm trong từng màn hình chi tiết."
      >
        {/* ══════════════════════════════════════════
            BẢNG CẤU HÌNH THUẾ
        ══════════════════════════════════════════ */}
        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-2">
            <Percent className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-base font-bold text-slate-800">Cấu hình thuế</h3>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Đang tải...</p>
          ) : (
            <div className="space-y-5">

              {/* ── BƯỚC 1: Loại hình kinh doanh ── */}
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  Loại hình kinh doanh
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Hộ kinh doanh */}
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, business_type: 'ho_kinh_doanh', tax_rate: 0 }))
                    }
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                      isHKD
                        ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500'
                        : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/40'
                    }`}
                  >
                    <Store className={`mt-0.5 h-5 w-5 shrink-0 ${isHKD ? 'text-teal-600' : 'text-slate-400'}`} />
                    <div>
                      <p className={`text-sm font-bold ${isHKD ? 'text-teal-800' : 'text-slate-700'}`}>
                        Hộ kinh doanh
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Nộp thuế khoán cố định theo tháng/năm cho cơ quan thuế. Không thu VAT trên hóa đơn.
                      </p>
                    </div>
                  </button>

                  {/* Doanh nghiệp */}
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        business_type: 'doanh_nghiep',
                        tax_rate: prev.tax_rate > 0 ? prev.tax_rate : 10,
                      }))
                    }
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                      !isHKD
                        ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500'
                        : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/40'
                    }`}
                  >
                    <Building2 className={`mt-0.5 h-5 w-5 shrink-0 ${!isHKD ? 'text-teal-600' : 'text-slate-400'}`} />
                    <div>
                      <p className={`text-sm font-bold ${!isHKD ? 'text-teal-800' : 'text-slate-700'}`}>
                        Doanh nghiệp
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Kê khai VAT theo từng hóa đơn. Hóa đơn hiển thị tạm tính + VAT + tổng cộng.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* ── Phân cách ── */}
              <hr className="border-slate-100" />

              {/* ── BƯỚC 2a: Hộ kinh doanh → thông tin thuế khoán ── */}
              {isHKD && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="text-amber-800 space-y-1">
                      <p className="font-semibold">Hộ kinh doanh — Thuế khoán</p>
                      <p>
                        Bạn <strong>không cần cấu hình VAT</strong> tại đây. Nghĩa vụ thuế của hộ kinh doanh
                        là nộp <strong>thuế khoán cố định</strong> hằng tháng trực tiếp cho Chi cục Thuế
                        dựa trên mức doanh thu ước tính — hệ thống POS không cần tính toán thêm.
                      </p>
                      <p className="text-xs text-amber-700">
                        Ngưỡng doanh thu chịu thuế áp dụng theo <strong>quy định hiện hành</strong> của cơ quan thuế.
                        Khi quy mô lớn hơn, hãy chuyển sang loại hình <strong>Doanh nghiệp</strong> để kê khai VAT đầy đủ.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── BƯỚC 2b: Doanh nghiệp → cấu hình VAT ── */}
              {!isHKD && (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-700">Mức thuế suất VAT</p>
                    <div className="flex flex-wrap gap-2">
                      {TAX_RATE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setConfig((prev) => ({ ...prev, tax_rate: opt.value }))}
                          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                            config.tax_rate === opt.value
                              ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'
                          }`}
                        >
                          {opt.value === 0 ? 'Miễn VAT (0%)' : opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 max-w-[220px]">
                      <label className="mb-1 block text-xs font-medium text-slate-500">
                        Thuế suất khác (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={config.tax_rate}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next)) return;
                          const clamped = Math.max(0, Math.min(100, next));
                          setConfig((prev) => ({ ...prev, tax_rate: clamped }));
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>
                  </div>

                  {config.tax_rate > 0 && (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700 select-none">
                        <input
                          type="checkbox"
                          checked={config.price_includes_tax}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, price_includes_tax: e.target.checked }))
                          }
                          className="h-4 w-4 accent-teal-600"
                        />
                        Giá bán đã bao gồm VAT
                        <span className="ml-1 text-xs font-normal text-slate-500">
                          (bỏ tick nếu giá bán chưa gồm thuế — cần cộng thêm khi xuất hóa đơn)
                        </span>
                      </label>
                    </div>
                  )}

                  <p className="text-xs text-slate-500">
                    Lưu ý: giá bán sản phẩm được hệ thống hiểu là <strong>đã bao gồm</strong> hoặc{' '}
                    <strong>chưa bao gồm</strong> thuế theo thiết lập này.
                  </p>

                  {preview && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      <p className="font-semibold mb-1">Ví dụ với hóa đơn 100.000₫:</p>
                      <div className="space-y-0.5 text-xs">
                        <div className="flex justify-between">
                          <span>Tạm tính (chưa VAT):</span>
                          <span className="font-medium">{preview.sub.toLocaleString('vi-VN')}₫</span>
                        </div>
                        <div className="flex justify-between">
                          <span>VAT {config.tax_rate}%:</span>
                          <span className="font-medium">{preview.tax.toLocaleString('vi-VN')}₫</span>
                        </div>
                        <div className="flex justify-between border-t border-blue-200 pt-0.5 font-semibold">
                          <span>Tổng cộng:</span>
                          <span>{preview.total.toLocaleString('vi-VN')}₫</span>
                        </div>
                      </div>
                      {config.price_includes_tax ? (
                        <p className="mt-2 text-xs text-blue-700">
                          Giá bán đã gồm VAT → hệ thống tách ngược để hiển thị và báo cáo.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-blue-700">
                          Giá bán chưa gồm VAT → hệ thống cộng thêm VAT khi xuất hóa đơn.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    <Info className="mb-0.5 inline h-3.5 w-3.5 text-slate-400" />{' '}
                    Thuế suất phổ biến tại Việt Nam: <strong>10%</strong> (hàng hoá/dịch vụ thông thường),{' '}
                    <strong>5%</strong> (thực phẩm thiết yếu, thuốc, phân bón), <strong>0%</strong> (xuất khẩu).
                  </div>
                </div>
              )}

              {/* ── Thông báo kết quả ── */}
              {msg.text && (
                <p
                  className={`text-sm font-medium ${
                    msg.type === 'success' ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {msg.text}
                </p>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
              >
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          )}
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-base font-bold text-slate-800">Cấu hình ngân hàng (VietQR)</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Mã ngân hàng</label>
              <input
                type="text"
                value={bankConfig.bank_id}
                onChange={(e) =>
                  setBankConfig((prev) => ({ ...prev, bank_id: e.target.value.toLowerCase() }))
                }
                placeholder="vd: vcb, tcb, mb"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Số tài khoản</label>
              <input
                type="text"
                value={bankConfig.bank_account}
                onChange={(e) =>
                  setBankConfig((prev) => ({ ...prev, bank_account: e.target.value }))
                }
                placeholder="Nhập số tài khoản"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tên chủ tài khoản</label>
              <input
                type="text"
                value={bankConfig.bank_account_name}
                onChange={(e) =>
                  setBankConfig((prev) => ({ ...prev, bank_account_name: e.target.value }))
                }
                placeholder="Nhập tên chủ tài khoản"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Dùng cho QR thu nợ ở màn Khách hàng. Ví dụ mã ngân hàng: <strong>vcb</strong>,{' '}
            <strong>tcb</strong>, <strong>mb</strong>.
          </p>

          {bankMsg.text && (
            <p
              className={`mt-3 text-sm font-medium ${
                bankMsg.type === 'success' ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {bankMsg.text}
            </p>
          )}

          <button
            type="button"
            onClick={handleSaveBank}
            disabled={savingBank}
            className="mt-3 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
          >
            {savingBank ? 'Đang lưu...' : 'Lưu cấu hình ngân hàng'}
          </button>
        </div>

        {/* ── Truy cập nhanh ── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/manager/categories" className={linkClass}>
            <span className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-teal-600" aria-hidden />
              Danh mục sản phẩm
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
          <Link to="/manager/notifications" className={linkClass}>
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-teal-600" aria-hidden />
              Thông báo
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
          <Link to="/manager/staff/manage" className={linkClass}>
            <span className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-teal-600" aria-hidden />
              Quản lý nhân viên
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
          <Link to="/manager/staff/new" className={linkClass}>
            <span className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-teal-600" aria-hidden />
              Tạo tài khoản nhân viên
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
          <Link to="/manager/invoices" className={linkClass}>
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-teal-600" aria-hidden />
              Hóa đơn / phiếu xuất
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
        </div>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
