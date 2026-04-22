import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import Chart from 'react-apexcharts';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { LayoutDashboard } from 'lucide-react';
import {
  getIncomingFrequencyBySupplier,
  getAnalyticsSummary,
  getInventorySnapshot,
  getRevenueChart,
  getTopProducts,
  getReturnReasonsAnalytics,
  getLoyaltyAnalytics,
  downloadLoyaltyAnalyticsCsv,
  getVatReport,
} from '../../services/analyticsApi';
import { getSupplierPayableSummary } from '../../services/supplierPayablesApi';
import RevenueProfitChart from './RevenueProfitChart';
import './ManagerDashboard.css';
import './ManagerProducts.css';
import { Button } from '../../components/ui/button';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtVND(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Đếm số mượt (requestAnimationFrame, không thêm dependency) */
function useAnimatedNumber(endValue, { duration = 880 } = {}) {
  const [display, setDisplay] = useState(0);
  const completedRef = useRef(0);

  useEffect(() => {
    if (endValue == null || Number.isNaN(Number(endValue))) return;
    const target = Number(endValue);
    const from = completedRef.current;

    if (target === from) {
      setDisplay(target);
      return;
    }

    if (prefersReducedMotion()) {
      setDisplay(target);
      completedRef.current = target;
      return;
    }

    let start = performance.now();
    let raf = 0;
    const easeOutCubic = (t) => 1 - (1 - t) ** 3;

    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
        completedRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endValue, duration]);

  return display;
}

function AnimatedProfitVND({ value }) {
  const n = useAnimatedNumber(value, { duration: 900 });
  if (value == null) return <>—</>;
  return (
    <>
      {Math.round(n).toLocaleString('vi-VN')}
      <span style={{ opacity: 0.82, fontWeight: 500 }}>₫</span>
    </>
  );
}

function fmtPct(n, showPlus = true) {
  if (n == null) return null;
  const sign = n > 0 && showPlus ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function getMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Chuỗi YYYY-MM-DD theo lịch máy người dùng (tránh lệch ngày so với toISOString/UTC). */
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDateStr(baseDate, deltaDays) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + deltaDays);
  return toDateStr(d);
}

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '3m', label: '3 tháng' },
  { value: '6m', label: '6 tháng' },
];

const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ManagerDashboard() {
  const now = new Date();
  const todayStr = toDateStr(now);
  const firstOfMonth = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));

  // ── State ──
  const [summaryFrom, setSummaryFrom] = useState(firstOfMonth);
  const [summaryTo, setSummaryTo] = useState(todayStr);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const [inventory, setInventory] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  const [chartPeriod, setChartPeriod] = useState('7d');
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);

  const [topProducts, setTopProducts] = useState([]);
  const [topLoading, setTopLoading] = useState(true);
  const [topTab, setTopTab] = useState('qty'); // 'qty' | 'profit'
  const [topProfitProducts, setTopProfitProducts] = useState([]);
  const [topProfitLoading, setTopProfitLoading] = useState(true);

  const [incomingYear, setIncomingYear] = useState(now.getFullYear());
  const [incomingMonth, setIncomingMonth] = useState(now.getMonth() + 1);
  const [incomingFreq, setIncomingFreq] = useState({ data: [] });
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [incomingError, setIncomingError] = useState('');
  const [returnReasons, setReturnReasons] = useState(null);
  const [returnReasonsLoading, setReturnReasonsLoading] = useState(true);
  const [loyaltyAnalytics, setLoyaltyAnalytics] = useState(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [exportingLoyalty, setExportingLoyalty] = useState(false);
  const [vatReport, setVatReport] = useState(null);

  // Supplier payable summary
  const [payableSummary, setPayableSummary] = useState(null);
  const [payableLoading, setPayableLoading] = useState(true);

  const fetchPayableSummary = useCallback(async () => {
    setPayableLoading(true);
    try {
      const d = await getSupplierPayableSummary();
      setPayableSummary(d);
    } catch {
      setPayableSummary(null);
    } finally {
      setPayableLoading(false);
    }
  }, []);

  // ── Fetchers ──
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const data = await getAnalyticsSummary({ from: summaryFrom, to: summaryTo });
      setSummary(data);
    } catch (e) {
      setSummaryError(e.message || 'Lỗi tải tổng quan');
    } finally {
      setSummaryLoading(false);
    }
  }, [summaryFrom, summaryTo]);

  const fetchInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const data = await getInventorySnapshot();
      setInventory(data);
    } catch {
      setInventory(null);
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  const fetchChart = useCallback(async () => {
    setChartLoading(true);
    try {
      const data = await getRevenueChart({ period: chartPeriod });
      setChartData(data.data || []);
    } catch {
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, [chartPeriod]);

  const fetchTopProducts = useCallback(async () => {
    setTopLoading(true);
    try {
      const data = await getTopProducts({ from: summaryFrom, to: summaryTo, limit: 5 });
      setTopProducts(data.data || []);
    } catch {
      setTopProducts([]);
    } finally {
      setTopLoading(false);
    }
  }, [summaryFrom, summaryTo]);

  const fetchTopProfitProducts = useCallback(async () => {
    setTopProfitLoading(true);
    try {
      const data = await getTopProducts({ from: summaryFrom, to: summaryTo, limit: 5, sort: 'profit' });
      setTopProfitProducts(data.data || []);
    } catch {
      setTopProfitProducts([]);
    } finally {
      setTopProfitLoading(false);
    }
  }, [summaryFrom, summaryTo]);

  const fetchIncomingFrequency = useCallback(async () => {
    setIncomingLoading(true);
    setIncomingError('');
    try {
      const resp = await getIncomingFrequencyBySupplier({ year: incomingYear, month: incomingMonth });
      setIncomingFreq(resp);
    } catch (e) {
      setIncomingError(e.message || 'Không tải được dữ liệu');
      setIncomingFreq({ data: [] });
    } finally {
      setIncomingLoading(false);
    }
  }, [incomingYear, incomingMonth]);

  const fetchReturnReasons = useCallback(async () => {
    setReturnReasonsLoading(true);
    try {
      const data = await getReturnReasonsAnalytics({ from: summaryFrom, to: summaryTo });
      setReturnReasons(data);
    } catch {
      setReturnReasons(null);
    } finally {
      setReturnReasonsLoading(false);
    }
  }, [summaryFrom, summaryTo]);

  const fetchLoyaltyAnalytics = useCallback(async () => {
    setLoyaltyLoading(true);
    try {
      const data = await getLoyaltyAnalytics({ from: summaryFrom, to: summaryTo });
      setLoyaltyAnalytics(data);
    } catch {
      setLoyaltyAnalytics(null);
    } finally {
      setLoyaltyLoading(false);
    }
  }, [summaryFrom, summaryTo]);

  const fetchVatReport = useCallback(async () => {
    try {
      const data = await getVatReport({ from: summaryFrom, to: summaryTo });
      setVatReport(data);
    } catch {
      setVatReport(null);
    }
  }, [summaryFrom, summaryTo]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchInventory(); }, [fetchInventory]);
  useEffect(() => { fetchPayableSummary(); }, [fetchPayableSummary]);
  useEffect(() => { fetchChart(); }, [fetchChart]);
  useEffect(() => { fetchTopProducts(); }, [fetchTopProducts]);
  useEffect(() => { fetchTopProfitProducts(); }, [fetchTopProfitProducts]);
  useEffect(() => { fetchIncomingFrequency(); }, [fetchIncomingFrequency]);
  useEffect(() => { fetchReturnReasons(); }, [fetchReturnReasons]);
  useEffect(() => { fetchLoyaltyAnalytics(); }, [fetchLoyaltyAnalytics]);
  useEffect(() => { fetchVatReport(); }, [fetchVatReport]);

  // ── Derived ──
  const today = summary?.today;
  const revChangePct = today?.revenue_change_pct;
  const orderDelta = today?.order_change_delta;
  const profitChangePct = today?.profit_change_pct;
  const maxIncoming = Math.max(1, ...(incomingFreq.data || []).map(d => d.total_count));
  const maxReturnReasonAmount = Math.max(1, ...((returnReasons?.data || []).map((d) => d.amount || 0)));
  const returnReasonColors = {
    defective: '#ef4444',
    customer_changed_mind: '#f59e0b',
    expired: '#8b5cf6',
    wrong_item: '#3b82f6',
    other: '#94a3b8',
  };
  const pieSeries = (returnReasons?.data || []).map((d) => Number(d.amount || 0));
  const pieLabels = (returnReasons?.data || []).map((d) => d.reason_label);
  const pieColors = (returnReasons?.data || []).map((d) => returnReasonColors[d.reason_code] || returnReasonColors.other);

  const pieOptions = {
    chart: { type: 'pie', toolbar: { show: false }, fontFamily: 'inherit' },
    labels: pieLabels,
    colors: pieColors,
    legend: { position: 'bottom', fontSize: '12px' },
    dataLabels: {
      enabled: true,
      formatter: (_val, opts) => {
        const amount = pieSeries[opts.seriesIndex] || 0;
        const total = pieSeries.reduce((s, v) => s + v, 0);
        const pct = total > 0 ? (amount / total) * 100 : 0;
        return `${pct.toFixed(1)}%`;
      },
    },
    tooltip: {
      y: {
        formatter: (_val, opts) => {
          const amount = pieSeries[opts.seriesIndex] || 0;
          const total = pieSeries.reduce((s, v) => s + v, 0);
          const pct = total > 0 ? (amount / total) * 100 : 0;
          return `${Number(amount).toLocaleString('vi-VN')}₫ (${pct.toFixed(1)}%)`;
        },
      },
    },
    stroke: { colors: ['#ffffff'] },
  };
  const loyaltyMonthlySeries = loyaltyAnalytics?.monthly || [];

  const handleExportLoyaltyCsv = useCallback(async () => {
    try {
      setExportingLoyalty(true);
      const { blob, fileName } = await downloadLoyaltyAnalyticsCsv({ from: summaryFrom, to: summaryTo });
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(err?.message || 'Không thể xuất báo cáo loyalty');
    } finally {
      setExportingLoyalty(false);
    }
  }, [summaryFrom, summaryTo]);

  const applyReturnQuickFilter = (preset) => {
    const end = new Date();
    const to = toDateStr(end);
    if (preset === '7d') {
      setSummaryFrom(shiftDateStr(end, -6));
      setSummaryTo(to);
      return;
    }
    if (preset === '30d') {
      setSummaryFrom(shiftDateStr(end, -29));
      setSummaryTo(to);
      return;
    }
    // month
    setSummaryFrom(toDateStr(new Date(end.getFullYear(), end.getMonth(), 1)));
    setSummaryTo(to);
  };

  return (
    <ManagerPageFrame>
      <StaffPageShell
        eyebrow="Quản lý cửa hàng"
        eyebrowIcon={LayoutDashboard}
        title="Tổng quan kinh doanh"
        subtitle="Nhìn nhanh hiệu quả bán hàng, tồn kho và nhập hàng."
        headerActions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to="/manager/reports">
              <Button type="button" variant="outline">
                Báo cáo đổi giá
              </Button>
            </Link>
            <label className="hidden text-xs font-medium text-slate-500 sm:inline">Từ</label>
            <input
              type="date"
              value={summaryFrom}
              onChange={(e) => setSummaryFrom(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
            />
            <label className="hidden text-xs font-medium text-slate-500 sm:inline">đến</label>
            <input
              type="date"
              value={summaryTo}
              onChange={(e) => setSummaryTo(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
            />
            <Button type="button" onClick={fetchSummary}>
              Xem
            </Button>
          </div>
        }
      >
          <p className="text-xs text-slate-500">
            {Platform.select({
              web: 'Dashboard đồng bộ giao diện với quầy staff (Tailwind + shadcn).',
              default: 'Dashboard manager.',
            })}
          </p>
          <p className="text-xs text-slate-500" style={{ marginTop: 4 }}>
            Trợ lý AI chỉ mang tính tham khảo; quyết định kế toán, thuế và đối soát dựa trên báo cáo hệ thống.
          </p>

          {summaryError && (
            <p className="text-xs text-slate-500" style={{ marginBottom: 12, maxWidth: 720 }}>
              {summaryError}
            </p>
          )}

          {/* ── 5 Metric cards ── */}
          <div className="manager-cards-row manager-cards-row--5">
            {/* Doanh thu hôm nay */}
            <div className="manager-metric-card transition-transform duration-200 hover:-translate-y-0.5">
              <div className="manager-metric-icon manager-metric-icon--blue">
                <i className="fa-solid fa-sack-dollar" />
              </div>
              <div className="manager-metric-body">
                <p className="manager-metric-label">Doanh thu hôm nay</p>
                {summaryLoading
                  ? <p className="manager-metric-value" style={{ fontSize: 16, color: '#9ca3af' }}>Đang tải...</p>
                  : <p className="manager-metric-value">{fmtVND(today?.revenue)}</p>
                }
                {revChangePct != null && (
                  <p className={`manager-metric-trend ${revChangePct >= 0 ? 'manager-metric-trend--up' : 'manager-metric-trend--down'}`}>
                    {fmtPct(revChangePct)} so với hôm qua
                  </p>
                )}
                {revChangePct == null && !summaryLoading && (
                  <p className="manager-metric-meta">Hôm qua: {fmtVND(today?.yesterday_revenue)}</p>
                )}
              </div>
            </div>

            {/* Lợi nhuận gộp thực hôm nay — NEW */}
            <div className="manager-metric-card transition-transform duration-200 hover:-translate-y-0.5" style={{ borderTop: '3px solid #4ade80' }}>
              <div className="manager-metric-icon" style={{ background: '#ecfdf5', color: '#22c55e' }}>
                <i className="fa-solid fa-circle-dollar-to-slot" />
              </div>
              <div className="manager-metric-body">
                <p className="manager-metric-label" style={{ color: '#15803d', fontWeight: 600 }}>Lãi gộp thực hôm nay</p>
                {summaryLoading
                  ? <p className="manager-metric-value" style={{ fontSize: 16, color: '#9ca3af' }}>Đang tải...</p>
                  : (
                    <p className="manager-metric-value manager-metric-value--animated-profit">
                      <AnimatedProfitVND value={today?.profit} />
                    </p>
                  )
                }
                {profitChangePct != null && !summaryLoading && (
                  <p className={`manager-metric-trend ${profitChangePct >= 0 ? 'manager-metric-trend--up' : 'manager-metric-trend--down'}`}>
                    {fmtPct(profitChangePct)} so với hôm qua
                  </p>
                )}
                {profitChangePct == null && !summaryLoading && (
                  <p className="manager-metric-meta" style={{ fontSize: 11, color: '#6b7280' }}>Tính từ giá vốn snapshot</p>
                )}
              </div>
            </div>

            {/* Đơn hàng hôm nay */}
            <div className="manager-metric-card transition-transform duration-200 hover:-translate-y-0.5">
              <div className="manager-metric-icon manager-metric-icon--green">
                <i className="fa-solid fa-clipboard-list" />
              </div>
              <div className="manager-metric-body">
                <p className="manager-metric-label">Đơn hàng hôm nay</p>
                {summaryLoading
                  ? <p className="manager-metric-value" style={{ fontSize: 16, color: '#9ca3af' }}>Đang tải...</p>
                  : <p className="manager-metric-value">{today?.order_count ?? '—'}</p>
                }
                {orderDelta != null && !summaryLoading && (
                  <p className={`manager-metric-trend ${orderDelta >= 0 ? 'manager-metric-trend--up' : 'manager-metric-trend--down'}`}>
                    {orderDelta >= 0 ? '+' : ''}{orderDelta} đơn so với hôm qua
                  </p>
                )}
              </div>
            </div>

            {/* Giá trị tồn kho */}
            <div className="manager-metric-card transition-transform duration-200 hover:-translate-y-0.5">
              <div className="manager-metric-icon manager-metric-icon--purple">
                <i className="fa-solid fa-warehouse" />
              </div>
              <div className="manager-metric-body">
                <p className="manager-metric-label">Giá trị tồn kho</p>
                {inventoryLoading
                  ? <p className="manager-metric-value" style={{ fontSize: 16, color: '#9ca3af' }}>Đang tải...</p>
                  : <p className="manager-metric-value">{fmtVND(inventory?.total_value)}</p>
                }
                {!inventoryLoading && inventory && (
                  <p className="manager-metric-meta">{inventory.total_sku?.toLocaleString('vi-VN')} SKU đang bán</p>
                )}
              </div>
            </div>

            {/* Nợ nhà cung cấp — NEW */}
            <Link to="/manager/supplier-payables" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="manager-metric-card transition-transform duration-200 hover:-translate-y-0.5" style={{ borderTop: '3px solid #dc2626', cursor: 'pointer' }}>
                <div className="manager-metric-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
                  <i className="fa-solid fa-file-invoice-dollar" />
                </div>
                <div className="manager-metric-body">
                  <p className="manager-metric-label" style={{ color: '#991b1b', fontWeight: 600 }}>Nợ nhà cung cấp</p>
                  {payableLoading
                    ? <p className="manager-metric-value" style={{ fontSize: 16, color: '#9ca3af' }}>Đang tải...</p>
                    : <p className="manager-metric-value" style={{ color: '#dc2626' }}>{fmtVND(payableSummary?.total_remaining)}</p>
                  }
                  {!payableLoading && payableSummary && (
                    <p className="manager-metric-meta" style={{ color: payableSummary.overdue_remaining > 0 ? '#dc2626' : '#6b7280', fontSize: 11 }}>
                      {payableSummary.overdue_remaining > 0
                        ? `⚠️ Quá hạn: ${fmtVND(payableSummary.overdue_remaining)}`
                        : `${payableSummary.open_count} khoản · ${payableSummary.supplier_count} NCC`}
                    </p>
                  )}
                </div>
              </div>
            </Link>

            {/* Vốn đọng 30 ngày — NEW */}
            <div className="manager-metric-card transition-transform duration-200 hover:-translate-y-0.5" style={{ borderTop: '3px solid #f97316' }}>
              <div className="manager-metric-icon" style={{ background: '#ffedd5', color: '#ea580c' }}>
                <i className="fa-solid fa-box-archive" />
              </div>
              <div className="manager-metric-body">
                <p className="manager-metric-label" style={{ color: '#9a3412', fontWeight: 600 }}>Vốn đọng (30 ngày)</p>
                {inventoryLoading
                  ? <p className="manager-metric-value" style={{ fontSize: 16, color: '#9ca3af' }}>Đang tải...</p>
                  : <p className="manager-metric-value" style={{ color: '#ea580c' }}>{fmtVND(inventory?.dead_capital)}</p>
                }
                {!inventoryLoading && inventory && (
                  <p className="manager-metric-meta" style={{ color: '#ea580c', fontSize: 11 }}>
                    {inventory.dead_products?.length ?? 0} SKU không bán được
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 2: Biểu đồ doanh thu + KPI kỳ ── */}
          <div className="manager-cards-row manager-cards-row--2">
            {/* Biểu đồ doanh thu */}
            <div className="manager-panel-card">
              <div className="manager-panel-header">
                <div>
                  <h2 className="manager-panel-title">Biểu đồ doanh thu</h2>
                  <p className="manager-panel-subtitle">Doanh thu bán, hoàn trả và lợi nhuận gộp (lợi nhuận: vốn snapshot; nếu vốn dòng = 0 thì lấy vốn SP hiện tại)</p>
                </div>
                <select
                  className="manager-select"
                  value={chartPeriod}
                  onChange={e => setChartPeriod(e.target.value)}
                >
                  {PERIOD_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <RevenueProfitChart data={chartData} loading={chartLoading} />
            </div>

            {/* KPI tổng kỳ */}
            <div className="manager-panel-card">
              <h2 className="manager-panel-title">Chỉ số trong kỳ</h2>
              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
                {summaryFrom} → {summaryTo}
              </p>
              {summaryLoading
                ? <p style={{ color: '#9ca3af', fontSize: 14 }}>Đang tải...</p>
                : (
                  <div className="manager-kpi-list">
                    <div className="manager-kpi-item">
                      <p className="manager-kpi-label">Tổng doanh thu</p>
                      <p className="manager-kpi-value">{fmtVND(summary?.revenue)}</p>
                      {summary?.revenue_net != null && summary?.total_vat_collected != null && (
                        <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          Doanh thu thuần: {fmtVND(summary.revenue_net)} · VAT thu hộ: {fmtVND(summary.total_vat_collected)}
                        </p>
                      )}
                      {vatReport?.output_vat != null && (
                        <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          VAT đầu ra (đối soát): {fmtVND(vatReport.output_vat)}
                        </p>
                      )}
                    </div>
                    <div className="manager-kpi-item">
                      <p className="manager-kpi-label">Tổng đơn hàng</p>
                      <p className="manager-kpi-value">{summary?.order_count?.toLocaleString('vi-VN') ?? '—'}</p>
                    </div>
                    <div className="manager-kpi-item">
                      <p className="manager-kpi-label">Giá trị đơn TB</p>
                      <p className="manager-kpi-value">{fmtVND(summary?.avg_order_value)}</p>
                    </div>
                    <div className="manager-kpi-item">
                      <p className="manager-kpi-label">Tỉ lệ trả hàng</p>
                      <p className="manager-kpi-value">
                        {summary?.return_rate != null ? `${summary.return_rate}%` : '—'}
                        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 6 }}>
                          ({summary?.return_count ?? 0} đơn)
                        </span>
                      </p>
                    </div>
                    <div className="manager-kpi-item">
                      <p className="manager-kpi-label">Chi phí nhập hàng</p>
                      <p className="manager-kpi-value">{fmtVND(summary?.incoming_cost)}</p>
                      <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        Đã chi trả NCC: {fmtVND(summary?.supplier_payment_total)}
                      </p>
                      <p style={{ fontSize: 11, color: '#94a3b8' }}>
                        Tiền mặt: {fmtVND(summary?.supplier_payment_cash)} · Chuyển khoản: {fmtVND(summary?.supplier_payment_bank_transfer)}
                      </p>
                    </div>
                    <div className="manager-kpi-item">
                      <p className="manager-kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Lợi nhuận gộp
                        <span
                          title="Lợi nhuận được tính bằng: Doanh thu (đã trừ VAT) - Giá vốn hàng bán. Ưu tiên giá vốn snapshot trên dòng; nếu dòng vốn = 0 thì dùng giá vốn sản phẩm hiện tại."
                          style={{ cursor: 'help', color: '#6366f1', fontSize: 13, lineHeight: 1 }}
                        >
                          <i className="fa-solid fa-circle-question" />
                        </span>
                      </p>
                      <p className="manager-kpi-value" style={{
                        color: (summary?.gross_profit ?? 0) >= 0 ? '#166534' : '#b91c1c',
                        fontWeight: 700,
                      }}>
                        {fmtVND(summary?.gross_profit)}
                      </p>
                      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        Tính trên doanh thu thuần (không VAT)
                      </p>
                      {summary?.gross_profit_estimate != null && (
                        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                          Ước tính (DT − nhập kỳ): {fmtVND(summary.gross_profit_estimate)}
                        </p>
                      )}
                    </div>
                    <div className="manager-kpi-item">
                      <p className="manager-kpi-label">Lợi nhuận sau loyalty</p>
                      <p className="manager-kpi-value" style={{
                        color: (summary?.gross_profit_after_loyalty ?? 0) >= 0 ? '#166534' : '#b91c1c',
                        fontWeight: 700,
                      }}>
                        {fmtVND(summary?.gross_profit_after_loyalty)}
                      </p>
                      <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        Lãi gộp trừ chi phí điểm đã dùng: {fmtVND(summary?.loyalty_redeem_value)}
                      </p>
                    </div>
                  </div>
                )
              }
            </div>
          </div>

          {/* ── Row 3: Top sản phẩm + Cảnh báo tồn kho ── */}
          <div className="manager-cards-row manager-cards-row--2">
            {/* Top sản phẩm */}
            <div className="manager-panel-card">
              <div className="manager-panel-header manager-panel-header--space">
                <div>
                  <h2 className="manager-panel-title">Top sản phẩm</h2>
                  <p className="manager-panel-subtitle">Trong kỳ đã chọn</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Tab switcher */}
                  <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 2, gap: 2 }}>
                    <button
                      onClick={() => setTopTab('qty')}
                      style={{
                        padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        background: topTab === 'qty' ? '#fff' : 'transparent',
                        color: topTab === 'qty' ? '#6366f1' : '#6b7280',
                        boxShadow: topTab === 'qty' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      Bán chạy
                    </button>
                    <button
                      onClick={() => setTopTab('profit')}
                      style={{
                        padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        background: topTab === 'profit' ? '#fff' : 'transparent',
                        color: topTab === 'profit' ? '#10b981' : '#6b7280',
                        boxShadow: topTab === 'profit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      Lãi nhất
                    </button>
                  </div>
                  <Link to="/manager/products" className="manager-panel-link">Xem tất cả →</Link>
                </div>
              </div>

              {/* Tab: Bán chạy */}
              {topTab === 'qty' && (
                topLoading
                  ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Đang tải...</p>
                  : topProducts.length === 0
                    ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Chưa có dữ liệu bán hàng</p>
                    : (
                      <div className="warehouse-table-wrap">
                        <table className="warehouse-table manager-table" style={{ fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Sản phẩm</th>
                              <th style={{ textAlign: 'right' }}>SL bán</th>
                              <th style={{ textAlign: 'right' }}>Doanh thu</th>
                              <th style={{ textAlign: 'right' }}>Tồn</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topProducts.map((p, i) => (
                              <tr key={p.product_id}>
                                <td style={{ color: '#9ca3af' }}>{i + 1}</td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.sku}</div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                  {p.total_qty?.toLocaleString('vi-VN')}
                                </td>
                                <td style={{ textAlign: 'right' }}>{fmt(p.total_revenue)}</td>
                                <td style={{ textAlign: 'right', color: p.current_stock <= 5 ? '#b91c1c' : undefined }}>
                                  {p.current_stock?.toLocaleString('vi-VN')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
              )}

              {/* Tab: Lãi nhất */}
              {topTab === 'profit' && (
                topProfitLoading
                  ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Đang tải...</p>
                  : topProfitProducts.length === 0
                    ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Chưa có dữ liệu lợi nhuận</p>
                    : (
                      <div className="warehouse-table-wrap">
                        <table className="warehouse-table manager-table" style={{ fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Sản phẩm</th>
                              <th style={{ textAlign: 'right' }}>
                                <span
                                  title="Lợi nhuận gộp = Doanh thu thuần (đã trừ VAT) - Giá vốn hàng bán"
                                  style={{ cursor: 'help' }}
                                >
                                  Lợi nhuận
                                  <i className="fa-solid fa-circle-question" style={{ marginLeft: 6, fontSize: 11, color: '#64748b' }} />
                                </span>
                              </th>
                              <th style={{ textAlign: 'right' }}>Doanh thu</th>
                              <th style={{ textAlign: 'right' }}>Biên lãi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topProfitProducts.map((p, i) => {
                              const margin = p.total_revenue > 0
                                ? ((p.total_profit / p.total_revenue) * 100).toFixed(1)
                                : '0.0';
                              return (
                                <tr key={p.product_id}>
                                  <td style={{ color: '#9ca3af' }}>{i + 1}</td>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.sku}</div>
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                    {fmtVND(p.total_profit)}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>{fmt(p.total_revenue)}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <span style={{
                                      padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                                      background: parseFloat(margin) >= 20 ? '#d1fae5' : parseFloat(margin) >= 10 ? '#fef3c7' : '#fee2e2',
                                      color: parseFloat(margin) >= 20 ? '#065f46' : parseFloat(margin) >= 10 ? '#92400e' : '#991b1b',
                                    }}>
                                      {margin}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
              )}
            </div>

            {/* Cảnh báo tồn kho */}
            <div className="manager-panel-card">
              <div className="manager-panel-header manager-panel-header--space">
                <div>
                  <h2 className="manager-panel-title">Cảnh báo tồn kho</h2>
                  <p className="manager-panel-subtitle">Sắp hết hàng & hết hạn</p>
                </div>
                <div className="manager-dashboard-links">
                  <Link to="/manager/stocktakes/pending" className="manager-panel-link">Kiểm kê chờ duyệt →</Link>
                  <Link to="/manager/adjustments" className="manager-panel-link">Lịch sử điều chỉnh →</Link>
                </div>
              </div>
              {inventoryLoading
                ? <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Đang tải...</p>
                : (
                  <>
                    {/* Sắp hết hàng */}
                    {inventory?.low_stock_products?.length > 0 && (
                      <>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#b45309', marginBottom: 6 }}>
                          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
                          Sắp hết hàng ({inventory.low_stock_products.length} mặt hàng)
                        </p>
                        <div className="warehouse-table-wrap" style={{ marginBottom: 16 }}>
                          <table className="warehouse-table manager-table" style={{ fontSize: 13 }}>
                            <thead>
                              <tr>
                                <th>Sản phẩm</th>
                                <th style={{ textAlign: 'right' }}>Tồn</th>
                                <th style={{ textAlign: 'right' }}>Mức tối thiểu</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inventory.low_stock_products.map(p => (
                                <tr key={p._id}>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.sku}</div>
                                  </td>
                                  <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>
                                    {p.stock_qty}
                                  </td>
                                  <td style={{ textAlign: 'right', color: '#9ca3af' }}>
                                    {p.reorder_level}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {/* Sắp hết hạn */}
                    {inventory?.expiring_soon?.length > 0 && (
                      <>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c', marginBottom: 6 }}>
                          <i className="fa-solid fa-clock" style={{ marginRight: 4 }} />
                          Sắp hết hạn trong 30 ngày ({inventory.expiring_soon.length} mặt hàng)
                        </p>
                        <div className="warehouse-table-wrap">
                          <table className="warehouse-table manager-table" style={{ fontSize: 13 }}>
                            <thead>
                              <tr>
                                <th>Sản phẩm</th>
                                <th>Hạn dùng</th>
                                <th style={{ textAlign: 'right' }}>Tồn</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inventory.expiring_soon.map(p => (
                                <tr key={p._id}>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.sku}</div>
                                  </td>
                                  <td style={{ color: '#b91c1c', fontWeight: 600 }}>
                                    {new Date(p.expiry_date).toLocaleDateString('vi-VN')}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>{p.stock_qty}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {/* Vốn đọng 30 ngày */}
                    {inventory?.dead_products?.length > 0 && (
                      <>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#ea580c', marginBottom: 6, marginTop: 8 }}>
                          <i className="fa-solid fa-box-archive" style={{ marginRight: 4 }} />
                          Vốn đọng — không bán trong 30 ngày ({inventory.dead_products.length} SKU)
                        </p>
                        <div className="warehouse-table-wrap" style={{ marginBottom: 16 }}>
                          <table className="warehouse-table manager-table" style={{ fontSize: 13 }}>
                            <thead>
                              <tr>
                                <th>Sản phẩm</th>
                                <th style={{ textAlign: 'right' }}>Tồn</th>
                                <th style={{ textAlign: 'right' }}>Vốn kẹt</th>
                                <th>Hạn dùng</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inventory.dead_products.slice(0, 8).map(p => {
                                const isExpiringSoon = p.expiry_date && new Date(p.expiry_date) <= new Date(Date.now() + 30 * 86400000);
                                return (
                                  <tr key={p._id} style={{ background: p.dead_capital > 500000 ? '#fff7ed' : undefined }}>
                                    <td>
                                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.sku}</div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>{p.stock_qty?.toLocaleString('vi-VN')}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.dead_capital > 500000 ? '#dc2626' : '#ea580c' }}>
                                      {fmtVND(p.dead_capital)}
                                    </td>
                                    <td>
                                      {p.expiry_date
                                        ? (
                                          <span style={{ color: isExpiringSoon ? '#dc2626' : '#6b7280', fontWeight: isExpiringSoon ? 700 : 400 }}>
                                            {isExpiringSoon && <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 3 }} />}
                                            {new Date(p.expiry_date).toLocaleDateString('vi-VN')}
                                          </span>
                                        )
                                        : <span style={{ color: '#d1d5db' }}>—</span>
                                      }
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {(!inventory?.low_stock_products?.length && !inventory?.expiring_soon?.length && !inventory?.dead_products?.length) && (
                      <p style={{ padding: 16, color: '#16a34a', fontSize: 14 }}>
                        <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                        Tồn kho đang ổn định, không có cảnh báo.
                      </p>
                    )}
                  </>
                )
              }
            </div>
          </div>

          {/* ── Row 4: Tần suất nhập hàng theo NCC ── */}
          <div className="manager-cards-row manager-cards-row--1">
            <div className="manager-panel-card">
              <div className="manager-panel-header">
                <div>
                  <h2 className="manager-panel-title">Tần suất nhập hàng theo nhà cung cấp</h2>
                  <p className="manager-panel-subtitle">Số đơn mua hàng và phiếu nhập kho trong 1 tháng</p>
                </div>
                <div className="manager-incoming-freq-controls">
                  <select
                    className="manager-select"
                    value={incomingMonth}
                    onChange={e => setIncomingMonth(Number(e.target.value))}
                  >
                    {MONTH_NAMES.map((label, i) => (
                      <option key={i} value={i + 1}>{label}</option>
                    ))}
                  </select>
                  <select
                    className="manager-select"
                    value={incomingYear}
                    onChange={e => setIncomingYear(Number(e.target.value))}
                  >
                    {[incomingYear - 2, incomingYear - 1, incomingYear, incomingYear + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              {incomingError && (
                <p className="text-xs text-slate-500" style={{ marginBottom: 12 }}>{incomingError}</p>
              )}
              {incomingLoading
                ? <p className="manager-products-loading">Đang tải...</p>
                : incomingFreq.data.length === 0
                  ? (
                    <div className="manager-list-placeholder">
                      <p className="manager-placeholder-text">Không có giao dịch nhập hàng trong tháng này</p>
                    </div>
                  )
                  : (
                    <div className="manager-incoming-freq-table-wrap">
                      <table className="manager-products-table">
                        <thead>
                          <tr>
                            <th>Nhà cung cấp</th>
                            <th>Đơn mua hàng</th>
                            <th>Phiếu nhập kho</th>
                            <th>Tổng</th>
                            <th>Tần suất</th>
                          </tr>
                        </thead>
                        <tbody>
                          {incomingFreq.data.map(row => (
                            <tr key={row.supplier_id}>
                              <td><strong>{row.supplier_name}</strong></td>
                              <td>{row.purchase_order_count}</td>
                              <td>{row.goods_receipt_count}</td>
                              <td>{row.total_count}</td>
                              <td>
                                <div className="manager-freq-bar-wrap">
                                  <div
                                    className="manager-freq-bar"
                                    style={{ width: `${(row.total_count / maxIncoming) * 100}%` }}
                                  />
                                  <span className="manager-freq-bar-label">{row.total_count} lần</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
              }
            </div>
          </div>

          {/* ── Row 5: Phân tích trả hàng ── */}
          <div className="manager-cards-row manager-cards-row--1">
            <div className="manager-panel-card">
              <div className="manager-panel-header manager-panel-header--space">
                <div>
                  <h2 className="manager-panel-title">Phân tích trả hàng</h2>
                  <p className="manager-panel-subtitle">Phân bổ lý do trả hàng và tỷ lệ trả hàng trên doanh thu</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="manager-select"
                    style={{ height: 32, minWidth: 68 }}
                    onClick={() => applyReturnQuickFilter('7d')}
                  >
                    7 ngày
                  </button>
                  <button
                    type="button"
                    className="manager-select"
                    style={{ height: 32, minWidth: 68 }}
                    onClick={() => applyReturnQuickFilter('30d')}
                  >
                    30 ngày
                  </button>
                  <button
                    type="button"
                    className="manager-select"
                    style={{ height: 32, minWidth: 84 }}
                    onClick={() => applyReturnQuickFilter('month')}
                  >
                    Tháng này
                  </button>
                </div>
              </div>
              {returnReasonsLoading ? (
                <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Đang tải...</p>
              ) : !returnReasons || !Array.isArray(returnReasons.data) || returnReasons.data.length === 0 ? (
                <p style={{ padding: 16, color: '#9ca3af', fontSize: 14 }}>Chưa có dữ liệu trả hàng trong kỳ.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
                  <div className="warehouse-table-wrap">
                    <table className="warehouse-table manager-table" style={{ fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>Lý do</th>
                          <th style={{ textAlign: 'right' }}>Số phiếu</th>
                          <th style={{ textAlign: 'right' }}>Giá trị hoàn</th>
                          <th>Tỷ trọng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnReasons.data.map((row) => (
                          <tr key={row.reason_code}>
                            <td style={{ fontWeight: 600 }}>{row.reason_label}</td>
                            <td style={{ textAlign: 'right' }}>{(row.count || 0).toLocaleString('vi-VN')}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{fmtVND(row.amount)}</td>
                            <td>
                              <div className="manager-freq-bar-wrap">
                                <div
                                  className="manager-freq-bar"
                                  style={{ width: `${((row.amount || 0) / maxReturnReasonAmount) * 100}%`, background: '#ef4444' }}
                                />
                                <span className="manager-freq-bar-label">{(row.ratio_by_amount || 0).toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#f8fafc', display: 'grid', gap: 10 }}>
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 8 }}>
                      <Chart options={pieOptions} series={pieSeries} type="pie" height={220} />
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>KPI trả hàng trong kỳ</p>
                    <div style={{ fontSize: 14, color: '#334155', display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tổng phiếu trả</span>
                        <strong>{(returnReasons.total_return_count || 0).toLocaleString('vi-VN')}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tổng tiền hoàn</span>
                        <strong style={{ color: '#dc2626' }}>{fmtVND(returnReasons.total_return_amount)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tỷ lệ trả/Doanh thu</span>
                        <strong style={{ color: '#b91c1c' }}>{(returnReasons.return_rate_by_revenue || 0).toFixed(2)}%</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Row 6: Báo cáo chương trình tích điểm ── */}
          <div className="manager-cards-row manager-cards-row--1">
            <div className="manager-panel-card">
              <div className="manager-panel-header manager-panel-header--space">
                <div>
                  <h2 className="manager-panel-title">📊 Báo cáo chương trình tích điểm</h2>
                  <p className="manager-panel-subtitle">Tổng quan hiệu quả và chi phí chương trình khách hàng thân thiết</p>
                </div>
              </div>

              {loyaltyLoading ? (
                <p style={{ padding: 24, color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>Đang tải dữ liệu...</p>
              ) : !loyaltyAnalytics ? (
                <p style={{ padding: 24, color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>Chưa có dữ liệu. Hãy bật chương trình tích điểm trong Cài đặt.</p>
              ) : (() => {
                const liabilityPoints = Number(loyaltyAnalytics.liability_points || 0);
                const liabilityValue = Number(loyaltyAnalytics.liability_value || 0);
                const earnedPoints = Number(loyaltyAnalytics.earned_points || 0);
                const redeemedPoints = Number(loyaltyAnalytics.redeemed_points || 0);
                const expiredPoints = Number(loyaltyAnalytics.expired_points || 0);
                const redeemedValue = Number(loyaltyAnalytics.redeemed_value || 0);
                const redemptionRate = Number(loyaltyAnalytics.redemption_rate || 0);
                const discountPct = Number(loyaltyAnalytics.effective_discount_pct || 0);
                const loyaltyAov = Number(loyaltyAnalytics.retention_lift?.loyalty_aov || 0);
                const nonLoyaltyAov = Number(loyaltyAnalytics.retention_lift?.non_loyalty_aov || 0);
                const liftPct = loyaltyAnalytics.retention_lift?.lift_pct;

                return (
                  <>
                    {/* ── 4 KPI chính ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>

                      {/* KPI 1 */}
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>💰 Điểm chưa dùng (nợ tiềm ẩn)</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#15803d' }}>{fmtVND(liabilityValue)}</div>
                        <div style={{ fontSize: 12, color: '#4ade80', marginTop: 2 }}>{liabilityPoints.toLocaleString('vi-VN')} điểm đang lưu hành</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, lineHeight: 1.4 }}>
                          Tổng giá trị điểm khách chưa đổi — đây là khoản cửa hàng sẽ phải giảm giá khi khách dùng.
                        </div>
                      </div>

                      {/* KPI 2 */}
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ fontSize: 12, color: '#ea580c', fontWeight: 600, marginBottom: 4 }}>🔄 Tỷ lệ đổi điểm</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#c2410c' }}>{redemptionRate.toFixed(1)}%</div>
                        <div style={{ fontSize: 12, color: '#fb923c', marginTop: 2 }}>
                          {redeemedPoints.toLocaleString('vi-VN')} / {earnedPoints.toLocaleString('vi-VN')} điểm đã đổi
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, lineHeight: 1.4 }}>
                          {redemptionRate < 20 ? '⚠ Thấp — khách ít chủ động đổi điểm, cân nhắc nhắc nhở qua SMS.' : redemptionRate < 60 ? '✅ Tốt — khách đang dùng điểm đều đặn.' : '🔥 Rất cao — khách rất tích cực đổi điểm.'}
                        </div>
                      </div>

                      {/* KPI 3 */}
                      <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ fontSize: 12, color: '#9333ea', fontWeight: 600, marginBottom: 4 }}>💸 Chi phí giảm giá từ điểm</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#7e22ce' }}>{discountPct.toFixed(2)}%</div>
                        <div style={{ fontSize: 12, color: '#c084fc', marginTop: 2 }}>đã trừ {fmtVND(redeemedValue)} từ doanh thu</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, lineHeight: 1.4 }}>
                          Cứ 100đ doanh thu thì bị giảm {discountPct.toFixed(2)}đ do khách đổi điểm. Ngưỡng an toàn thường &lt; 3%.
                        </div>
                      </div>

                      {/* KPI 4 */}
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, marginBottom: 4 }}>📈 Khách tích điểm mua nhiều hơn?</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8' }}>
                          {liftPct == null ? '—' : `${liftPct > 0 ? '+' : ''}${Number(liftPct).toFixed(1)}%`}
                        </div>
                        <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 2 }}>
                          TB đơn: {fmtVND(loyaltyAov)} vs {fmtVND(nonLoyaltyAov)}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, lineHeight: 1.4 }}>
                          {liftPct == null ? 'Chưa đủ dữ liệu để so sánh.' : liftPct > 0 ? `Khách có điểm mua cao hơn ${Number(liftPct).toFixed(1)}% — chương trình đang có hiệu quả!` : 'Khách tích điểm chưa mua nhiều hơn — cân nhắc cải thiện ưu đãi.'}
                        </div>
                      </div>
                    </div>

                    {/* ── Thống kê nhanh ── */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                      {[
                        { label: '🎁 Điểm đã tặng', value: earnedPoints.toLocaleString('vi-VN') + ' điểm', color: '#dcfce7', border: '#bbf7d0', text: '#15803d' },
                        { label: '✅ Điểm đã dùng', value: redeemedPoints.toLocaleString('vi-VN') + ' điểm', color: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
                        { label: '⏰ Điểm hết hạn', value: expiredPoints.toLocaleString('vi-VN') + ' điểm', color: '#fafafa', border: '#e5e7eb', text: '#6b7280' },
                      ].map((item) => (
                        <div key={item.label} style={{ flex: '1 1 140px', background: item.color, border: `1px solid ${item.border}`, borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>{item.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: item.text }}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* ── Biểu đồ theo tháng ── */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 12px', background: '#fff' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8, paddingLeft: 4 }}>
                        📅 Biến động điểm theo tháng
                      </div>
                      {loyaltyMonthlySeries.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 13 }}>Chưa có giao dịch điểm nào trong kỳ này.</div>
                      ) : (
                        <Chart
                          type="bar"
                          height={240}
                          series={[
                            { name: 'Điểm tặng ra', data: loyaltyMonthlySeries.map((x) => Number(x.earn_points || 0)) },
                            { name: 'Điểm đã dùng', data: loyaltyMonthlySeries.map((x) => Math.abs(Number(x.redeem_points || 0))) },
                            { name: 'Điểm hết hạn', data: loyaltyMonthlySeries.map((x) => Math.abs(Number(x.expire_points || 0))) },
                          ]}
                          options={{
                            chart: { stacked: false, toolbar: { show: false }, fontFamily: 'inherit' },
                            xaxis: {
                              categories: loyaltyMonthlySeries.map((x) => {
                                const [y, m] = (x.month || '').split('-');
                                return `T${m}/${y}`;
                              }),
                              labels: { style: { fontSize: '12px' } },
                            },
                            colors: ['#22c55e', '#f97316', '#94a3b8'],
                            plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
                            yaxis: {
                              labels: {
                                formatter: (val) => `${Number(val).toLocaleString('vi-VN')} đ`,
                                style: { fontSize: '11px' },
                              },
                            },
                            tooltip: {
                              y: { formatter: (val) => `${Number(val).toLocaleString('vi-VN')} điểm` },
                            },
                            legend: {
                              position: 'top',
                              fontSize: '12px',
                              markers: { width: 10, height: 10, radius: 3 },
                            },
                            grid: { borderColor: '#f1f5f9', strokeDashArray: 3 },
                            dataLabels: { enabled: false },
                          }}
                        />
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

      </StaffPageShell>
    </ManagerPageFrame>
  );
}
