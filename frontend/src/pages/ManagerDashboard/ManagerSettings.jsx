import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { FolderTree, Settings, UsersRound, Bell, UserPlus, Receipt, Percent } from 'lucide-react';
import { getStoreTaxSettings, updateStoreTaxSettings } from '../../services/adminApi';

const linkClass =
  'flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/40';

const TAX_RATE_OPTIONS = [
  { label: 'Không áp dụng thuế (0%)', value: 0 },
  { label: '5%', value: 5 },
  { label: '8%', value: 8 },
  { label: '10%', value: 10 },
];

export default function ManagerSettings() {
  const [taxConfig, setTaxConfig] = useState({ tax_rate: 0, price_includes_tax: true });
  const [taxLoading, setTaxLoading] = useState(true);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxMsg, setTaxMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    getStoreTaxSettings()
      .then((data) => setTaxConfig({ tax_rate: data.tax_rate, price_includes_tax: data.price_includes_tax }))
      .catch(() => {})
      .finally(() => setTaxLoading(false));
  }, []);

  const handleSaveTax = async () => {
    setTaxSaving(true);
    setTaxMsg({ type: '', text: '' });
    try {
      const res = await updateStoreTaxSettings(taxConfig);
      setTaxConfig({ tax_rate: res.tax_rate, price_includes_tax: res.price_includes_tax });
      setTaxMsg({ type: 'success', text: 'Đã lưu cấu hình thuế thành công.' });
    } catch (err) {
      setTaxMsg({ type: 'error', text: err.message || 'Lỗi khi lưu cấu hình thuế.' });
    } finally {
      setTaxSaving(false);
    }
  };

  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Quản lý cửa hàng"
        eyebrowIcon={Settings}
        title="Cài đặt & cấu hình"
        subtitle="Truy cập nhanh các mục thường dùng. Các thay đổi quan trọng vẫn nằm trong từng màn hình chi tiết."
      >
        {/* ── Cấu hình thuế ── */}
        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Percent className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-base font-bold text-slate-800">Cấu hình thuế VAT</h3>
          </div>

          {taxLoading ? (
            <p className="text-sm text-slate-500">Đang tải...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Mức thuế VAT áp dụng
                </label>
                <div className="flex flex-wrap gap-2">
                  {TAX_RATE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTaxConfig((prev) => ({ ...prev, tax_rate: opt.value }))}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                        taxConfig.tax_rate === opt.value
                          ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {taxConfig.tax_rate > 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={taxConfig.price_includes_tax}
                      onChange={(e) => setTaxConfig((prev) => ({ ...prev, price_includes_tax: e.target.checked }))}
                      className="h-4 w-4 accent-teal-600"
                    />
                    Giá bán đã bao gồm VAT
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      (bỏ tick nếu giá bán chưa gồm thuế — cần cộng thêm)
                    </span>
                  </label>
                </div>
              )}

              {taxConfig.tax_rate > 0 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <strong>Ví dụ:</strong>{' '}
                  {taxConfig.price_includes_tax
                    ? `Hóa đơn ${(100000).toLocaleString('vi-VN')}₫ → Tạm tính ${Math.round(100000 / (1 + taxConfig.tax_rate / 100)).toLocaleString('vi-VN')}₫ + VAT ${(100000 - Math.round(100000 / (1 + taxConfig.tax_rate / 100))).toLocaleString('vi-VN')}₫`
                    : `Hóa đơn ${(100000).toLocaleString('vi-VN')}₫ chưa thuế → VAT thêm ${Math.round(100000 * taxConfig.tax_rate / 100).toLocaleString('vi-VN')}₫ → Tổng ${(100000 + Math.round(100000 * taxConfig.tax_rate / 100)).toLocaleString('vi-VN')}₫`}
                </div>
              )}

              {taxMsg.text && (
                <p className={`text-sm font-medium ${taxMsg.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {taxMsg.text}
                </p>
              )}

              <button
                type="button"
                onClick={handleSaveTax}
                disabled={taxSaving}
                className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
              >
                {taxSaving ? 'Đang lưu...' : 'Lưu cấu hình thuế'}
              </button>
            </div>
          )}
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
