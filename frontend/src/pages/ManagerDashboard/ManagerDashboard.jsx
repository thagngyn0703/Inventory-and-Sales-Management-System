import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import {
  getIncomingFrequencyBySupplier,
  getAnalyticsSummary,
  getInventorySnapshot,
  getRevenueChart,
  getTopProducts,
} from '../../services/analyticsApi';
import './ManagerDashboard.css';
import './ManagerProducts.css';

// ─── Helpers ────────────────────────────────────────────────────────────────

function useCurrentUser() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  });
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    if (!token) return;
    fetch('http://localhost:8000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json().catch(() => ({})))
      .then(data => {
        if (!data?.user) return;
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {});
  }, []);
  return user;
}

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

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: '3m', label: '3 tháng' },
  { value: '6m', label: '6 tháng' },
];

const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

// ─── Mini bar chart (SVG, không cần thư viện) ────────────────────────────────

function RevenueBarChart({ data }) {
  if (!data || data.length === 0) {
    return <p style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Chưa có dữ liệu</p>;
  }
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const W = 600, H = 160, padL = 8, padR = 8, padTop = 12, padBot = 28;
  const barW = Math.max(4, Math.floor((W - padL - padR) / data.length) - 4);
  const gap = (W - padL - padR - barW * data.length) / Math.max(data.length - 1, 1);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 280, display: 'block' }}>
        {data.map((d, i) => {
          const barH = Math.max(2, ((d.revenue / maxRev) * (H - padTop - padBot)));
          const x = padL + i * (barW + gap);
          const y = H - padBot - barH;
          const isLast = i === data.length - 1;
          return (
            <g key={d.key}>
              <rect
                x={x} y={y} width={barW} height={barH}
                rx={3}
                fill={isLast ? '#6366f1' : '#a5b4fc'}
              />
              {d.revenue > 0 && (
                <text
                  x={x + barW / 2} y={y - 3}
                  textAnchor="middle" fontSize={9} fill="#6b7280"
                >
                  {fmt(d.revenue)}
                </text>
              )}
              <text
                x={x + barW / 2} y={H - 6}
                textAnchor="middle" fontSize={9} fill="#9ca3af"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ManagerDashboard() {
  const currentUser = useCurrentUser();
  const storeName = currentUser?.storeName || '';
  const displayName = currentUser?.fullName || currentUser?.email || 'Quản lý';

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

  const [incomingYear, setIncomingYear] = useState(now.getFullYear());
  const [incomingMonth, setIncomingMonth] = useState(now.getMonth() + 1);
  const [incomingFreq, setIncomingFreq] = useState({ data: [] });
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [incomingError, setIncomingError] = useState('');

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

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchInventory(); }, [fetchInventory]);
  useEffect(() => { fetchChart(); }, [fetchChart]);
  useEffect(() => { fetchTopProducts(); }, [fetchTopProducts]);
  useEffect(() => { fetchIncomingFrequency(); }, [fetchIncomingFrequency]);

  // ── Derived ──
  const today = summary?.today;
  const revChangePct = today?.revenue_change_pct;
  const orderDelta = today?.order_change_delta;
  const maxIncoming = Math.max(1, ...(incomingFreq.data || []).map(d => d.total_count));

  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        {/* ── Topbar ── */}
        <header className="manager-topbar">
          <div className="manager-topbar-actions" style={{ marginLeft: 'auto' }}>
            <ManagerNotificationBell />
            <div className="manager-user-badge">
              <i className="fa-solid fa-circle-user" style={{ color: '#6366f1' }} />
              {storeName && (
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#6366f1',
                  background: '#eef2ff', border: '1px solid #c7d2fe',
                  borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap',
                }}>
                  <i className="fa-solid fa-store" style={{ marginRight: 4, fontSize: 10 }} />
                  {storeName}
                </span>
              )}
              <span>{displayName}</span>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>(Quản lý)</span>
            </div>
          </div>
        </header>

        <div className="manager-content">
          {/* ── Header + bộ lọc kỳ ── */}
          <div className="manager-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 className="manager-page-title">Tổng quan kinh doanh</h1>
              <p className="manager-page-subtitle">Nhìn nhanh hiệu quả bán hàng, tồn kho và nhập hàng</p>
            </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Link to="/manager/reports" className="manager-panel-link" style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid #c7d2fe',
                                background: '#eef2ff',
                                fontWeight: 700,
                            }}>
                                <i className="fa-solid fa-chart-column" style={{ marginRight: 6 }} />
                                Báo cáo đổi giá
                            </Link>
                        </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, color: '#6b7280' }}>Từ</label>
              <input
                type="date" value={summaryFrom}
                onChange={e => setSummaryFrom(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
              />
              <label style={{ fontSize: 13, color: '#6b7280' }}>đến</label>
              <input
                type="date" value={summaryTo}
                onChange={e => setSummaryTo(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
              />
              <button
                onClick={fetchSummary}
                style={{
                  padding: '6px 14px', background: '#6366f1', color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                }}
              >
                Xem
              </button>
            </div>
          </div>

          {summaryError && (
            <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: 16 }}>{summaryError}</div>
          )}

          {/* ── 4 Metric cards ── */}
          <div className="manager-cards-row manager-cards-row--4">
            {/* Doanh thu hôm nay */}
            <div className="manager-metric-card">
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

            {/* Đơn hàng hôm nay */}
            <div className="manager-metric-card">
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
            <div className="manager-metric-card">
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

            {/* Cảnh báo tồn kho thấp */}
            <div className="manager-metric-card">
              <div className="manager-metric-icon manager-metric-icon--orange">
                <i className="fa-solid fa-triangle-exclamation" />
              </div>
              <div className="manager-metric-body">
                <p className="manager-metric-label">Cảnh báo tồn kho</p>
                {inventoryLoading
                  ? <p className="manager-metric-value" style={{ fontSize: 16, color: '#9ca3af' }}>Đang tải...</p>
                  : <p className="manager-metric-value">{inventory?.low_stock_count ?? 0} sắp hết</p>
                }
                {!inventoryLoading && inventory && (
                  <p className="manager-metric-meta">{inventory.out_of_stock_count} mặt hàng đã hết</p>
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
                  <p className="manager-panel-subtitle">Theo dõi xu hướng doanh thu</p>
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
              {chartLoading
                ? <p style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Đang tải...</p>
                : <RevenueBarChart data={chartData} />
              }
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
                    </div>
                    <div className="manager-kpi-item">
                      <p className="manager-kpi-label">Lợi nhuận gộp ước</p>
                      <p className="manager-kpi-value" style={{
                        color: (summary?.gross_profit_estimate ?? 0) >= 0 ? '#166534' : '#b91c1c'
                      }}>
                        {fmtVND(summary?.gross_profit_estimate)}
                      </p>
                      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        * Doanh thu − chi phí nhập kỳ
                      </p>
                    </div>
                  </div>
                )
              }
            </div>
          </div>

          {/* ── Row 3: Top sản phẩm + Cảnh báo tồn kho ── */}
          <div className="manager-cards-row manager-cards-row--2">
            {/* Top sản phẩm bán chạy */}
            <div className="manager-panel-card">
              <div className="manager-panel-header manager-panel-header--space">
                <div>
                  <h2 className="manager-panel-title">Top sản phẩm bán chạy</h2>
                  <p className="manager-panel-subtitle">Trong kỳ đã chọn</p>
                </div>
                <Link to="/manager/products" className="manager-panel-link">Xem tất cả →</Link>
              </div>
              {topLoading
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
              }
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

                    {(!inventory?.low_stock_products?.length && !inventory?.expiring_soon?.length) && (
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
                <p className="manager-products-error" style={{ marginBottom: 12 }}>{incomingError}</p>
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

        </div>
      </div>
    </div>
  );
}
