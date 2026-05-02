import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CircleDollarSign, Clock3, Eye, ReceiptText, Search, UserRound, X } from 'lucide-react';
import { closeShift, getShiftInvoices, getShiftSessions } from '../../services/shiftsApi';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { useToast } from '../../contexts/ToastContext';

function formatMoney(n) {
  return `${Number(n || 0).toLocaleString('vi-VN')}₫`;
}

function formatDateTime(v) {
  if (!v) return '--';
  return new Date(v).toLocaleString('vi-VN');
}

function formatDuration(start, end) {
  if (!start) return '--';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return '--';
  const totalMins = Math.floor((e - s) / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h <= 0) return `${m} phút`;
  if (m <= 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'open', label: 'Đang mở' },
  { value: 'closed', label: 'Đã đóng' },
];

const btnBaseClass =
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition';
const btnTealClass = `${btnBaseClass} border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100`;
const btnAmberClass = `${btnBaseClass} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`;
const btnSlateClass = `${btnBaseClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`;

function getTodayLocalDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseFlexibleDateStart(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let y = 0; let m = 0; let d = 0;
  if (raw.includes('-')) {
    [y, m, d] = raw.split('-').map(Number);
  } else if (raw.includes('/')) {
    const parts = raw.split('/').map(Number);
    if (parts.length === 3) [m, d, y] = parts;
  }
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseFlexibleDateEnd(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let y = 0; let m = 0; let d = 0;
  if (raw.includes('-')) {
    [y, m, d] = raw.split('-').map(Number);
  } else if (raw.includes('/')) {
    const parts = raw.split('/').map(Number);
    if (parts.length === 3) [m, d, y] = parts;
  }
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export default function ManagerShiftSessionsPage() {
  const { toast: notify } = useToast();
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ shifts: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  const [detailShift, setDetailShift] = useState(null);
  const [detailData, setDetailData] = useState({ invoices: [], total: 0, page: 1, totalPages: 1 });
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [overrideModal, setOverrideModal] = useState({
    open: false,
    shift: null,
    actualCashInput: '',
    note: 'Nhân viên quên đóng ca',
    submitting: false,
    error: '',
  });
  const todayStr = useMemo(() => getTodayLocalDateString(), []);

  const hydrateShiftKpisFallback = useCallback(async (shifts = [], dateRange = {}) => {
    const rangeStart = parseFlexibleDateStart(dateRange?.from || '');
    const rangeEnd = parseFlexibleDateEnd(dateRange?.to || '');
    const hasDateFilter = Boolean(rangeStart || rangeEnd);
    const enriched = await Promise.all(
      (shifts || []).map(async (shift) => {
        // Chỉ fallback khi KPI trả về bằng 0 để tránh gọi API thừa
        const currentCount = Number(shift?.kpis?.invoice_count || 0);
        const currentRevenue = Number(shift?.kpis?.total_revenue || 0);
        if (currentCount > 0 || currentRevenue > 0) return shift;

        try {
          // Dùng đúng endpoint chi tiết hóa đơn theo ca để tránh lệch số liệu.
          const detailPayload = await getShiftInvoices(shift._id, { page: 1, limit: 500 });
          const source = Array.isArray(detailPayload?.invoices) ? detailPayload.invoices : [];
          const scoped = source.filter((inv) => {
            if (!hasDateFilter) return true;
            const t = new Date(inv?.invoice_at || '').getTime();
            if (Number.isNaN(t)) return false;
            if (rangeStart && t < rangeStart.getTime()) return false;
            if (rangeEnd && t > rangeEnd.getTime()) return false;
            return true;
          });
          const totalRevenue = scoped.reduce((sum, inv) => sum + Number(inv?.total_amount || 0), 0);
          const totalProfit = scoped.reduce((sum, inv) => {
            const itemProfit = Array.isArray(inv?.items)
              ? inv.items.reduce((x, item) => x + Number(item?.line_profit || 0), 0)
              : 0;
            return sum + itemProfit;
          }, 0);
          return {
            ...shift,
            kpis: {
              invoice_count: scoped.length,
              total_revenue: Math.round(totalRevenue),
              total_profit: Math.round(totalProfit),
            },
          };
        } catch {
          return shift;
        }
      })
    );
    return enriched;
  }, []);

  const fetchData = useCallback(async () => {
    if (fromDate && fromDate > todayStr) {
      setFilterError('Từ ngày không được lớn hơn ngày hiện tại.');
      return;
    }
    if (toDate && toDate > todayStr) {
      setFilterError('Đến ngày không được lớn hơn ngày hiện tại.');
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      setFilterError('Khoảng ngày không hợp lệ: "Từ ngày" phải nhỏ hơn hoặc bằng "Đến ngày".');
      return;
    }
    if (keyword.trim().length > 100) {
      setFilterError('Từ khóa tìm nhân viên tối đa 100 ký tự.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setFilterError('');
      const payload = await getShiftSessions({
        page,
        limit: 12,
        status,
        from: fromDate,
        to: toDate,
        keyword: keyword.trim(),
      });
      let base = payload || { shifts: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      if ((base.shifts || []).length === 0 && (fromDate || toDate)) {
        const raw = await getShiftSessions({
          page: 1,
          limit: 200,
          status,
          keyword: keyword.trim(),
        });
        const source = Array.isArray(raw?.shifts) ? raw.shifts : [];
        const rangeStart = parseFlexibleDateStart(fromDate);
        const rangeEnd = parseFlexibleDateEnd(toDate);
        const filtered = source.filter((shift) => {
          const opened = new Date(shift?.opened_at || '').getTime();
          const closed = shift?.closed_at ? new Date(shift.closed_at).getTime() : null;
          if (Number.isNaN(opened)) return false;
          const lowerOk = !rangeEnd || opened <= rangeEnd.getTime();
          const upperOk = !rangeStart || closed == null || (Number.isFinite(closed) && closed >= rangeStart.getTime());
          return lowerOk && upperOk;
        });
        base = {
          shifts: filtered.slice(0, 12),
          total: filtered.length,
          page: 1,
          limit: 12,
          totalPages: Math.max(1, Math.ceil(filtered.length / 12)),
        };
      }
      const hydratedShifts = await hydrateShiftKpisFallback(base.shifts || [], { from: fromDate, to: toDate });
      setData({ ...base, shifts: hydratedShifts });
    } catch (e) {
      setError(e.message || 'Không thể tải dữ liệu ca làm việc');
      setData({ shifts: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, status, fromDate, toDate, keyword, hydrateShiftKpisFallback, todayStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totals = useMemo(() => {
    return (data.shifts || []).reduce(
      (acc, shift) => {
        acc.revenue += Number(shift?.kpis?.total_revenue || 0);
        acc.profit += Number(shift?.kpis?.total_profit || 0);
        acc.invoices += Number(shift?.kpis?.invoice_count || 0);
        return acc;
      },
      { revenue: 0, profit: 0, invoices: 0 }
    );
  }, [data.shifts]);

  const openShiftDetail = useCallback(async (shift) => {
    try {
      setDetailShift(shift);
      setDetailLoading(true);
      const payload = await getShiftInvoices(shift._id, { page: 1, limit: 30 });
      setDetailData(payload || { invoices: [], total: 0, page: 1, totalPages: 1 });
    } catch (e) {
      setError(e.message || 'Không thể tải chi tiết hóa đơn theo ca');
      setDetailData({ invoices: [], total: 0, page: 1, totalPages: 1 });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openOverrideModal = useCallback((shift) => {
    const opener = shift?.opened_by?.fullName || shift?.opened_by?.email || 'nhân viên';
    notify(`Bạn đang đóng ca hộ cho ${opener}.`, 'warning');
    const expectedCash = Number(shift?.expected_cash || 0) || 0;
    setOverrideModal({
      open: true,
      shift,
      actualCashInput: String(expectedCash.toLocaleString('vi-VN')),
      note: 'Nhân viên quên đóng ca',
      submitting: false,
      error: '',
    });
  }, [notify]);

  const closeOverrideModal = useCallback(() => {
    setOverrideModal({
      open: false,
      shift: null,
      actualCashInput: '',
      note: 'Nhân viên quên đóng ca',
      submitting: false,
      error: '',
    });
  }, []);

  const submitOverrideClose = useCallback(async () => {
    if (!overrideModal?.shift?._id || overrideModal.submitting) return;
    const actualCash = Number(String(overrideModal.actualCashInput || '').replace(/[^\d]/g, ''));
    if (!Number.isFinite(actualCash) || actualCash < 0) {
      setOverrideModal((prev) => ({ ...prev, error: 'Số tiền kiểm đếm không hợp lệ.' }));
      return;
    }
    setOverrideModal((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      await closeShift(overrideModal.shift._id, {
        actual_cash: actualCash,
        reconciliation_status: 'confirmed',
        reconciliation_note: String(overrideModal.note || '').trim(),
        override_close: true,
      });
      await fetchData();
      setError('');
      notify('Đã đóng ca hộ thành công.', 'success');
      closeOverrideModal();
    } catch (e) {
      const msg = e.message || 'Không thể đóng ca hộ';
      setError(msg);
      setOverrideModal((prev) => ({ ...prev, submitting: false, error: msg }));
      notify(msg, 'error');
    }
  }, [closeOverrideModal, fetchData, notify, overrideModal]);

  return (
    <ManagerPageFrame>
      <div className="mx-auto max-w-[1200px] p-4 md:p-6">
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 md:text-2xl">Nhật ký thu ngân</h1>
            <p className="mt-1 text-sm text-slate-500">
              Theo dõi giờ làm, doanh thu, lợi nhuận và số hóa đơn theo từng ca.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className={`${btnTealClass} px-4 py-2 text-sm`}
          >
            Làm mới
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Trạng thái
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 outline-none focus:border-teal-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Từ ngày
            <input
              type="date"
              value={fromDate}
              max={todayStr}
              onChange={(e) => {
                setPage(1);
                const next = e.target.value;
                if (next && next > todayStr) {
                  setFilterError('Từ ngày không được lớn hơn ngày hiện tại.');
                  return;
                }
                setFilterError('');
                setFromDate(next);
              }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 outline-none focus:border-teal-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Đến ngày
            <input
              type="date"
              value={toDate}
              max={todayStr}
              onChange={(e) => {
                setPage(1);
                const next = e.target.value;
                if (next && next > todayStr) {
                  setFilterError('Đến ngày không được lớn hơn ngày hiện tại.');
                  return;
                }
                setFilterError('');
                setToDate(next);
              }}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 outline-none focus:border-teal-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tìm nhân viên
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                placeholder="Tên / email / mã NV"
                onChange={(e) => {
                  setPage(1);
                  const next = e.target.value.replace(/\s{2,}/g, ' ').slice(0, 100);
                  setFilterError('');
                  setKeyword(next);
                }}
                className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm font-medium text-slate-700 outline-none focus:border-teal-500"
              />
            </div>
          </label>
        </div>
        {filterError && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
            {filterError}
          </div>
        )}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <CircleDollarSign className="h-4 w-4 text-emerald-500" />
            Tổng doanh thu (trang hiện tại)
          </div>
          <div className="text-xl font-extrabold text-slate-800">{formatMoney(totals.revenue)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <CalendarDays className="h-4 w-4 text-cyan-500" />
            Tổng lợi nhuận (trang hiện tại)
          </div>
          <div className="text-xl font-extrabold text-slate-800">{formatMoney(totals.profit)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <ReceiptText className="h-4 w-4 text-indigo-500" />
            Số hóa đơn
          </div>
          <div className="text-xl font-extrabold text-slate-800">{totals.invoices.toLocaleString('vi-VN')}</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-500">
            Đang tải danh sách ca...
          </div>
        )}

        {!loading && (data.shifts || []).length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Không có ca nào phù hợp bộ lọc hiện tại.
          </div>
        )}

        {!loading && (data.shifts || []).length > 0 && (
          <div className="max-h-[58vh] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600 shadow-sm">
                <tr>
                  <th className="px-3 py-2 text-left">Nhân viên</th>
                  <th className="px-3 py-2 text-left">Quầy</th>
                  <th className="px-3 py-2 text-left">Thời gian ca</th>
                  <th className="px-3 py-2 text-right">Doanh thu</th>
                  <th className="px-3 py-2 text-right">Lợi nhuận gộp</th>
                  <th className="px-3 py-2 text-right">Bàn giao</th>
                  <th className="px-3 py-2 text-right">Hóa đơn</th>
                  <th className="px-3 py-2 text-right">Chênh lệch</th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {(data.shifts || []).map((shift) => {
                  const openUser = shift?.opened_by;
                  const closeUser = shift?.closed_by;
                  const discrepancy = Number(shift?.discrepancy_cash || 0);
                  const handover = Number(shift?.cash_to_handover || 0);
                  const isCritical = discrepancy < 0;
                  const isOverrideClosed = Boolean(
                    shift?.status === 'closed'
                    && openUser?._id
                    && closeUser?._id
                    && String(openUser._id) !== String(closeUser._id)
                  );
                  return (
                    <tr
                      key={shift._id}
                      className={`border-t border-slate-200 align-top ${
                        isCritical ? 'bg-rose-50/80' : ''
                      }`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 font-semibold text-slate-700">
                          <UserRound className="h-4 w-4 text-teal-600" />
                          {openUser?.fullName || openUser?.email || 'Nhân viên chưa xác định'}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">Mã NV: {openUser?.employeeCode || 'N/A'}</div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">
                        {shift?.register_id?.name || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-xs text-slate-500">{formatDateTime(shift.opened_at)} - {formatDateTime(shift.closed_at)}</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                          {formatDuration(shift.opened_at, shift.closed_at)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-extrabold text-slate-800">
                        {formatMoney(shift?.kpis?.total_revenue || 0)}
                      </td>
                      <td className="px-3 py-3 text-right font-extrabold text-slate-800">
                        {formatMoney(shift?.kpis?.total_profit || 0)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-700">
                        {formatMoney(handover)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-700">
                        {Number(shift?.kpis?.invoice_count || 0).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`text-xs font-bold ${
                            discrepancy < 0 ? 'text-rose-600' : discrepancy > 0 ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {discrepancy === 0 ? 'Khớp' : `${discrepancy > 0 ? '+' : ''}${formatMoney(discrepancy)}`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              shift.status === 'open'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {shift.status === 'open' ? 'Đang mở' : 'Đã đóng'}
                          </span>
                          {isOverrideClosed && (
                            <span className="whitespace-nowrap rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                              Đóng ca hộ
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-2 whitespace-nowrap">
                          {shift.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => openOverrideModal(shift)}
                              className={`${btnAmberClass} gap-1`}
                              title="Đóng ca hộ (override)"
                            >
                              Đóng ca hộ
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openShiftDetail(shift)}
                            className={`${btnTealClass} gap-1`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Hóa đơn
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="font-semibold text-slate-600">
          Tổng ca: <span className="text-slate-800">{Number(data.total || 0).toLocaleString('vi-VN')}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`${btnSlateClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Trước
          </button>
          <span className="font-semibold text-slate-600">
            Trang {page} / {Math.max(1, Number(data.totalPages || 1))}
          </span>
          <button
            type="button"
            disabled={page >= Math.max(1, Number(data.totalPages || 1))}
            onClick={() => setPage((p) => p + 1)}
            className={`${btnSlateClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Sau
          </button>
        </div>
      </div>

      {detailShift && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="flex max-h-[84vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div>
                <div className="text-base font-bold text-slate-800">
                  Chi tiết hóa đơn theo ca • {detailShift?.opened_by?.fullName || 'Nhân viên'}
                </div>
                <div className="mt-0.5 text-sm text-slate-500">
                  {formatDateTime(detailShift?.opened_at)} - {formatDateTime(detailShift?.closed_at)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailShift(null)}
                className={`${btnSlateClass} p-1.5`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-auto p-4">
              {detailLoading && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
                  Đang tải hóa đơn...
                </div>
              )}

              {!detailLoading && detailData.invoices.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
                  Không có hóa đơn trong ca này.
                </div>
              )}

              {!detailLoading && detailData.invoices.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm md:text-base">
                    <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600 md:text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">Giờ tạo</th>
                        <th className="px-3 py-2 text-left">Mã đơn</th>
                        <th className="px-3 py-2 text-left">Người bán</th>
                        <th className="px-3 py-2 text-left">Khách hàng</th>
                        <th className="px-3 py-2 text-left">Thanh toán</th>
                        <th className="px-3 py-2 text-right">Tổng tiền</th>
                        <th className="px-3 py-2 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.invoices.map((inv) => {
                        return (
                          <tr key={inv._id} className="border-t border-slate-200 align-top">
                            <td className="px-3 py-3">{formatDateTime(inv.invoice_at)}</td>
                            <td className="px-3 py-3 font-semibold text-slate-700">{inv?.display_code || `#${String(inv._id || '').slice(-8)}`}</td>
                            <td className="px-3 py-3">
                              {inv?.seller_name || inv?.created_by?.fullName || inv?.created_by?.email || '--'}
                            </td>
                            <td className="px-3 py-3">{inv?.recipient_name || inv?.customer_id?.full_name || 'Khách lẻ'}</td>
                            <td className="px-3 py-3">{inv?.payment_method || '--'}</td>
                            <td className="px-3 py-3 text-right font-bold text-emerald-700">{formatMoney(inv?.total_amount || 0)}</td>
                            <td className="px-3 py-3 text-right">
                              <a
                                href={`/manager/invoices/${inv._id}/view`}
                                className={`${btnSlateClass} md:text-sm`}
                              >
                                Xem hóa đơn
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {overrideModal.open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">Đóng ca hộ</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Nhân viên: {overrideModal.shift?.opened_by?.fullName || overrideModal.shift?.opened_by?.email || 'N/A'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeOverrideModal}
                className={`${btnSlateClass} p-1.5`}
                disabled={overrideModal.submitting}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tiền mặt kiểm đếm
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={overrideModal.actualCashInput}
                  onChange={(e) =>
                    setOverrideModal((prev) => ({
                      ...prev,
                      actualCashInput: String(e.target.value || '').replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
                      error: '',
                    }))
                  }
                  placeholder="Nhập tổng tiền mặt"
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 outline-none focus:border-teal-500"
                  disabled={overrideModal.submitting}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ghi chú
                </span>
                <textarea
                  value={overrideModal.note}
                  onChange={(e) =>
                    setOverrideModal((prev) => ({
                      ...prev,
                      note: e.target.value,
                      error: '',
                    }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-500"
                  placeholder="Nhập lý do đóng ca hộ"
                  disabled={overrideModal.submitting}
                />
              </label>

              {overrideModal.error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {overrideModal.error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeOverrideModal}
                className={btnSlateClass}
                disabled={overrideModal.submitting}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={submitOverrideClose}
                className={btnAmberClass}
                disabled={overrideModal.submitting}
              >
                {overrideModal.submitting ? 'Đang xử lý...' : 'Xác nhận đóng ca hộ'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </ManagerPageFrame>
  );
}
