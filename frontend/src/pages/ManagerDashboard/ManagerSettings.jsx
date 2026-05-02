import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import {
  FolderTree,
  Settings,
  UsersRound,
  Bell,
  UserPlus,
  Receipt,
  Percent,
  Store,
  Building2,
  Info,
  Gift,
} from 'lucide-react';
import {
  getStoreTaxSettings,
  updateStoreTaxSettings,
  getStoreTaxPolicies,
  getStoreBankSettings,
  updateStoreBankSettings,
  getStoreLoyaltySettings,
  updateStoreLoyaltySettings,
  getStoreLoyaltySettingsHistory,
  getStoreLegalSettings,
  updateStoreLegalSettings,
} from '../../services/adminApi';
import { useToast } from '../../contexts/ToastContext';

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
  const { toast } = useToast();
  const [config, setConfig] = useState({
    business_type: 'ho_kinh_doanh',
    tax_rate: 0,
    price_includes_tax: true,
    strict_tax_compliance: true,
    default_tax_profile: 'default',
  });
  const [showAdvancedTax, setShowAdvancedTax] = useState(false);
  const [taxHealth, setTaxHealth] = useState({ checking: true, hasExciseConfig: true });
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
  const [loyaltyConfig, setLoyaltyConfig] = useState({
    enabled: false,
    earn: { spend_amount_vnd: 20000, points: 1, min_invoice_amount_vnd: 20000 },
    redeem: { point_value_vnd: 500, min_points: 10, max_percent_per_invoice: 50, allow_with_promotion: false },
    expiry_months: 12,
    milestones: [
      { points: 10, value_vnd: 5000 },
      { points: 20, value_vnd: 15000 },
      { points: 50, value_vnd: 50000 },
    ],
  });
  const [loyaltyHistory, setLoyaltyHistory] = useState([]);
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  const [loyaltyMsg, setLoyaltyMsg] = useState({ type: '', text: '' });
  const [legalConfig, setLegalConfig] = useState({
    tax_code: '',
    legal_representative: '',
    business_license_number: '',
    bank_name: '',
    bank_account_number: '',
    billing_email: '',
    approval_status: 'draft_profile',
    legal_profile_completed: false,
    rejection_reason: '',
  });
  const [savingLegal, setSavingLegal] = useState(false);
  const [legalMsg, setLegalMsg] = useState({ type: '', text: '' });
  const [legalLoaded, setLegalLoaded] = useState(false);
  const legalStatusToastRef = useRef('');

  useEffect(() => {
    getStoreTaxSettings()
      .then((data) =>
        setConfig({
          business_type: data.business_type || 'ho_kinh_doanh',
          tax_rate: data.tax_rate ?? 0,
          price_includes_tax: data.price_includes_tax !== false,
          strict_tax_compliance: data.strict_tax_compliance !== false,
          default_tax_profile: data.default_tax_profile || 'default',
        })
      )
      .catch(() => {})
      .finally(() => setLoading(false));
    Promise.all([
      getStoreTaxPolicies().catch(() => ({ policies: [] })),
      fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/categories?all=true`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      }).then(async (res) => (res.ok ? res.json() : []))
        .catch(() => []),
    ])
      .then(([policyData, categoriesData]) => {
        const list = Array.isArray(policyData?.policies) ? policyData.policies : [];
        const now = Date.now();
        const activePolicies = list.filter((p) => {
          if (String(p?.approval_state || '').toLowerCase() !== 'active') return false;
          const from = p?.effective_from ? new Date(p.effective_from).getTime() : null;
          const to = p?.effective_to ? new Date(p.effective_to).getTime() : null;
          if (from && now < from) return false;
          if (to && now > to) return false;
          return true;
        });
        const hasExcisePolicy = activePolicies.some((p) => {
          const excise = Number(p?.tax_category_rules?.BEER_2026?.excise_rate);
          return Number.isFinite(excise) && excise > 0;
        });
        const categoryList = Array.isArray(categoriesData) ? categoriesData : [];
        const hasExciseCategory = categoryList.some((c) => {
          const profile = String(c?.tax_profile || '').toUpperCase().trim();
          const tags = Array.isArray(c?.tax_tags) ? c.tax_tags.map((t) => String(t).toLowerCase()) : [];
          return profile === 'BEER_2026' || tags.includes('special_consumption_tax') || tags.includes('ttdb');
        });
        // UX-first: đã áp mẫu thuế ở Danh mục thì coi là "đã cấu hình", không báo đỏ gây nhiễu.
        setTaxHealth({ checking: false, hasExciseConfig: hasExcisePolicy || hasExciseCategory });
      })
      .catch(() => setTaxHealth({ checking: false, hasExciseConfig: false }));

    getStoreBankSettings()
      .then((data) =>
        setBankConfig({
          bank_id: data.bank_id || '',
          bank_account: data.bank_account || '',
          bank_account_name: data.bank_account_name || '',
        })
      )
      .catch(() => {});

    getStoreLoyaltySettings()
      .then((data) =>
        setLoyaltyConfig(
          data.loyalty_settings || {
            enabled: false,
            earn: { spend_amount_vnd: 20000, points: 1, min_invoice_amount_vnd: 20000 },
            redeem: { point_value_vnd: 500, min_points: 10, max_percent_per_invoice: 50, allow_with_promotion: false },
            expiry_months: 12,
            milestones: [
              { points: 10, value_vnd: 5000 },
              { points: 20, value_vnd: 15000 },
              { points: 50, value_vnd: 50000 },
            ],
          }
        )
      )
      .catch(() => {});
    getStoreLoyaltySettingsHistory(10)
      .then((data) => setLoyaltyHistory(data.history || []))
      .catch(() => {});

    getStoreLegalSettings()
      .then((data) =>
        setLegalConfig({
          tax_code: data.tax_code || '',
          legal_representative: data.legal_representative || '',
          business_license_number: data.business_license_number || '',
          bank_name: data.bank_name || '',
          bank_account_number: data.bank_account_number || '',
          billing_email: data.billing_email || '',
          approval_status: data.approval_status || 'draft_profile',
          legal_profile_completed: Boolean(data.legal_profile_completed),
          rejection_reason: data.rejection_reason || '',
        })
      )
      .catch(() => {})
      .finally(() => setLegalLoaded(true));
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
              strict_tax_compliance: config.strict_tax_compliance,
              default_tax_profile: config.default_tax_profile || 'default',
            };
      const res = await updateStoreTaxSettings(payload);
      setConfig({
        business_type: res.business_type || 'ho_kinh_doanh',
        tax_rate: res.tax_rate ?? 0,
        price_includes_tax: res.price_includes_tax !== false,
        strict_tax_compliance: res.strict_tax_compliance !== false,
        default_tax_profile: res.default_tax_profile || 'default',
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

  const handleSaveLoyalty = async () => {
    setSavingLoyalty(true);
    setLoyaltyMsg({ type: '', text: '' });
    try {
      const res = await updateStoreLoyaltySettings({ loyalty_settings: loyaltyConfig });
      setLoyaltyConfig(res.loyalty_settings || loyaltyConfig);
      setLoyaltyMsg({ type: 'success', text: 'Đã lưu cấu hình tích điểm.' });
      const his = await getStoreLoyaltySettingsHistory(10);
      setLoyaltyHistory(his.history || []);
    } catch (err) {
      setLoyaltyMsg({ type: 'error', text: err.message || 'Lỗi khi lưu cấu hình tích điểm.' });
    } finally {
      setSavingLoyalty(false);
    }
  };

  const handleSaveLegal = async () => {
    setSavingLegal(true);
    setLegalMsg({ type: '', text: '' });
    try {
      const payload = {
        tax_code: (legalConfig.tax_code || '').trim(),
        legal_representative: (legalConfig.legal_representative || '').trim(),
        business_license_number: (legalConfig.business_license_number || '').trim(),
        bank_name: (legalConfig.bank_name || '').trim(),
        bank_account_number: (legalConfig.bank_account_number || '').trim(),
      };
      const res = await updateStoreLegalSettings(payload);
      await updateStoreTaxSettings({ business_type: config.business_type });
      setLegalConfig((prev) => ({
        ...prev,
        tax_code: res.tax_code || '',
        legal_representative: res.legal_representative || '',
        business_license_number: res.business_license_number || '',
        bank_name: res.bank_name || '',
        bank_account_number: res.bank_account_number || '',
        billing_email: res.billing_email || prev.billing_email || '',
        approval_status: res.approval_status || prev.approval_status,
        legal_profile_completed: Boolean(res.legal_profile_completed),
        rejection_reason: res.rejection_reason || '',
      }));
      setLegalMsg({ type: 'success', text: 'Đã cập nhật hồ sơ pháp lý.' });
    } catch (err) {
      setLegalMsg({ type: 'error', text: err.message || 'Lỗi khi cập nhật hồ sơ pháp lý.' });
    } finally {
      setSavingLegal(false);
    }
  };

  const isHKD = config.business_type === 'ho_kinh_doanh';
  const preview = calcPreview(100000, config.tax_rate, config.price_includes_tax);
  const approvalLabelMap = {
    draft_profile: 'Chưa hoàn thiện hồ sơ',
    pending_approval: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    suspended: 'Tạm ngưng',
  };
  const approvalLabel = approvalLabelMap[legalConfig.approval_status] || legalConfig.approval_status || 'Chờ duyệt';
  const legalRequiredMissing = !legalConfig.legal_profile_completed;

  useEffect(() => {
    if (!legalLoaded) return;
    const approvalStatus = String(legalConfig.approval_status || '');
    const rejectionReason = String(legalConfig.rejection_reason || '').trim();
    const toastKey = `${approvalStatus}|${legalRequiredMissing}|${rejectionReason}`;
    if (legalStatusToastRef.current === toastKey) return;
    legalStatusToastRef.current = toastKey;

    if (approvalStatus === 'rejected') {
      toast(
        rejectionReason
          ? `Hồ sơ bị từ chối: ${rejectionReason}`
          : 'Vui lòng xem lại thông tin pháp lý để điền chính xác.',
        'error'
      );
      return;
    }
    if (approvalStatus === 'suspended') {
      toast('Hồ sơ đang tạm ngưng. Vui lòng liên hệ admin để được hỗ trợ.', 'error');
      return;
    }
    if (approvalStatus === 'draft_profile' || (approvalStatus === 'pending_approval' && legalRequiredMissing)) {
      toast('Vui lòng điền hồ sơ pháp lý cho cửa hàng để gửi duyệt.', 'info');
      return;
    }
    if (approvalStatus === 'pending_approval') {
      toast('Hồ sơ đã đầy đủ. Vui lòng đợi admin phê duyệt.', 'info');
    }
  }, [legalConfig.approval_status, legalConfig.rejection_reason, legalRequiredMissing, legalLoaded, toast]);

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
                <p className="mb-2 text-sm font-semibold text-slate-700">Bước 1: Chọn loại hình kinh doanh</p>
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
                        Không tách VAT theo từng dòng trên hóa đơn bán lẻ trong hệ thống.
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
                        Áp dụng VAT theo danh mục sản phẩm và tự tính thuế trên hóa đơn.
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
                      <p className="font-semibold">Bạn đang dùng chế độ Hộ kinh doanh</p>
                      <p>
                        Hệ thống không tách VAT theo từng dòng sản phẩm trên hóa đơn bán lẻ. Nếu cửa hàng chuyển sang mô hình doanh nghiệp,
                        hãy quay lại đây để bật cơ chế VAT theo danh mục.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── BƯỚC 2b: Doanh nghiệp → cấu hình VAT ── */}
              {!isHKD && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Đang dùng chế độ doanh nghiệp: hệ thống áp VAT theo danh mục sản phẩm.
                  </div>
                  {!taxHealth.checking && !taxHealth.hasExciseConfig && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      <p className="font-semibold">Cần cấu hình thêm cho nhóm Hàng chịu TTĐB</p>
                      <p className="mt-1">
                        Hệ thống chưa có cấu hình tính TTĐB cho bia/rượu/thuốc lá. Vui lòng vào Danh mục và bấm
                        <strong> Áp mẫu thuế</strong> để áp đủ công thức thuế.
                      </p>
                      <Link
                        to="/manager/categories"
                        className="mt-2 inline-flex rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Mở Danh mục để áp mẫu thuế
                      </Link>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={config.price_includes_tax}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, price_includes_tax: e.target.checked }))
                        }
                        className="h-4 w-4 accent-teal-600"
                      />
                      Hóa đơn 100.000đ đã bao gồm VAT
                    </label>
                    <p className="mt-1 text-xs text-slate-500">
                      Bật: giá đã gồm VAT. Tắt: hệ thống sẽ cộng thêm VAT khi thanh toán.
                    </p>
                  </div>
                  {preview && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                      Ví dụ đơn 100.000đ: VAT {config.tax_rate}% = {preview.tax.toLocaleString('vi-VN')}đ.
                    </div>
                  )}
                  {showAdvancedTax && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-700">VAT mặc định khi sản phẩm chưa có mapping danh mục:</p>
                      <div className="flex flex-wrap gap-2">
                        {TAX_RATE_OPTIONS.filter((opt) => opt.value !== 0).map((opt) => (
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
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div className="max-w-[220px]">
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
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={config.strict_tax_compliance}
                          onChange={(e) => setConfig((prev) => ({ ...prev, strict_tax_compliance: e.target.checked }))}
                          className="h-4 w-4 accent-teal-600"
                        />
                        Chặn bán khi thiếu mapping thuế (strict compliance)
                      </label>
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                        Nếu bán hàng chịu TTĐB (bia/rượu/thuốc lá), hãy gán đúng nhóm thuế cho sản phẩm để tránh sai lợi nhuận.
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-xs text-slate-500">
                        <Info className="mb-0.5 inline h-3.5 w-3.5 text-slate-400" /> Thuế suất phổ biến: <strong>10%</strong>,{' '}
                        <strong>5%</strong>, và <strong>0%</strong> cho một số trường hợp đặc biệt.
                      </div>
                    </div>
                  )}
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
            <h3 className="text-base font-bold text-slate-800">Hồ sơ pháp lý cửa hàng</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Loại hình kinh doanh</label>
              <select
                value={config.business_type}
                onChange={(e) => setConfig((prev) => ({ ...prev, business_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              >
                <option value="ho_kinh_doanh">Hộ kinh doanh</option>
                <option value="doanh_nghiep">Doanh nghiệp</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Trường này đồng bộ với Cấu hình thuế và quyết định cách áp dụng VAT trong hệ thống.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Mã số thuế</label>
              <input
                type="text"
                value={legalConfig.tax_code}
                onChange={(e) => setLegalConfig((prev) => ({ ...prev, tax_code: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Số tài khoản ngân hàng</label>
              <input
                type="text"
                value={legalConfig.bank_account_number}
                onChange={(e) => setLegalConfig((prev) => ({ ...prev, bank_account_number: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Người đại diện pháp luật</label>
              <input
                type="text"
                value={legalConfig.legal_representative}
                onChange={(e) => setLegalConfig((prev) => ({ ...prev, legal_representative: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Số giấy phép kinh doanh</label>
              <input
                type="text"
                value={legalConfig.business_license_number}
                onChange={(e) => setLegalConfig((prev) => ({ ...prev, business_license_number: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">Email xuất hóa đơn (tự động)</label>
              <input
                type="email"
                value={legalConfig.billing_email}
                disabled
                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Trạng thái duyệt hồ sơ: <strong>{approvalLabel}</strong>
            {legalConfig.rejection_reason ? ` - Lý do từ chối: ${legalConfig.rejection_reason}` : ''}
          </p>
          {legalMsg.text && (
            <p className={`mt-2 text-sm font-medium ${legalMsg.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
              {legalMsg.text}
            </p>
          )}
          <button
            type="button"
            onClick={handleSaveLegal}
            disabled={savingLegal}
            className="mt-3 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
          >
            {savingLegal ? 'Đang lưu...' : 'Lưu hồ sơ pháp lý'}
          </button>
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

        <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-2">
            <Gift className="h-5 w-5 text-teal-600" aria-hidden />
            <h3 className="text-base font-bold text-slate-800">Cấu hình tích điểm khách hàng</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">Bật tích điểm</span>
              <input
                type="checkbox"
                checked={Boolean(loyaltyConfig.enabled)}
                onChange={(e) => setLoyaltyConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4 accent-teal-600"
              />
            </label>
            <div className="text-xs text-slate-500">
              Cấu hình đơn giản cho tạp hóa: <b>Mua 20.000đ tặng 1 điểm, 1 điểm = 500đ</b>.
            </div>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">Cứ mua (VNĐ)</span>
              <input
                type="number"
                min={1000}
                value={loyaltyConfig.earn?.spend_amount_vnd ?? 20000}
                onChange={(e) =>
                  setLoyaltyConfig((prev) => ({
                    ...prev,
                    earn: { ...prev.earn, spend_amount_vnd: Number(e.target.value) || 20000 },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">Tặng (điểm)</span>
              <input
                type="number"
                min={1}
                value={loyaltyConfig.earn?.points ?? 1}
                onChange={(e) =>
                  setLoyaltyConfig((prev) => ({
                    ...prev,
                    earn: { ...prev.earn, points: Number(e.target.value) || 1 },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">1 điểm giảm (VNĐ)</span>
              <input
                type="number"
                min={100}
                value={loyaltyConfig.redeem?.point_value_vnd ?? 500}
                onChange={(e) =>
                  setLoyaltyConfig((prev) => ({
                    ...prev,
                    redeem: { ...prev.redeem, point_value_vnd: Number(e.target.value) || 500 },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">Tối thiểu để dùng (điểm)</span>
              <input
                type="number"
                min={1}
                value={loyaltyConfig.redeem?.min_points ?? 10}
                onChange={(e) =>
                  setLoyaltyConfig((prev) => ({
                    ...prev,
                    redeem: { ...prev.redeem, min_points: Number(e.target.value) || 10 },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block text-xs text-slate-500">Giảm tối đa mỗi đơn (%)</span>
              <input
                type="number"
                min={1}
                max={90}
                value={loyaltyConfig.redeem?.max_percent_per_invoice ?? 50}
                onChange={(e) =>
                  setLoyaltyConfig((prev) => ({
                    ...prev,
                    redeem: { ...prev.redeem, max_percent_per_invoice: Number(e.target.value) || 50 },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-600">
            Ví dụ nhanh: Đơn 100.000đ sẽ nhận khoảng{' '}
            <b>{Math.floor(100000 / Number(loyaltyConfig.earn?.spend_amount_vnd || 20000)) * Number(loyaltyConfig.earn?.points || 1)} điểm</b>,
            dùng tối đa <b>{Math.floor((100000 * Number(loyaltyConfig.redeem?.max_percent_per_invoice || 50)) / 100).toLocaleString('vi-VN')}đ</b>.
          </p>
          {loyaltyMsg.text && (
            <p className={`mt-2 text-sm font-medium ${loyaltyMsg.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>
              {loyaltyMsg.text}
            </p>
          )}
          <button
            type="button"
            onClick={handleSaveLoyalty}
            disabled={savingLoyalty}
            className="mt-3 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60"
          >
            {savingLoyalty ? 'Đang lưu...' : 'Lưu cấu hình tích điểm'}
          </button>
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-600">Lịch sử thay đổi gần đây</p>
            {loyaltyHistory.length === 0 ? (
              <p className="text-xs text-slate-500">Chưa có thay đổi nào.</p>
            ) : (
              <div className="space-y-1">
                {loyaltyHistory.slice(0, 5).map((h) => (
                  <p key={h._id} className="text-xs text-slate-600">
                    {new Date(h.changed_at).toLocaleString('vi-VN')} - {h.changed_by?.fullName || h.changed_by?.email || 'N/A'} (v{h.before_version} → v{h.after_version})
                  </p>
                ))}
              </div>
            )}
          </div>
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
