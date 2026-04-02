import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ManagerSidebar from './ManagerSidebar';
import { getPriceChangeImpactReport } from '../../services/analyticsApi';

function toDateInput(d) {
  return d.toISOString().slice(0, 10);
}

function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString('vi-VN')}₫`;
}

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('vi-VN');
}

export default function ManagerPriceChangeReport() {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);

  const [from, setFrom] = useState(toDateInput(defaultFrom));
  const [to, setTo] = useState(toDateInput(now));
  const [productId, setProductId] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ products: [], events: [], summary: null });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await getPriceChangeImpactReport({
        from,
        to,
        productId: productId || undefined,
      });
      setData(resp);
    } catch (e) {
      setError(e.message || 'Không thể tải báo cáo');
      setData({ products: [], events: [], summary: null });
    } finally {
      setLoading(false);
    }
  }, [from, to, productId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const selectedProductName = useMemo(() => {
    if (!productId) return 'Tất cả sản phẩm';
    const p = (data.products || []).find((x) => String(x._id) === String(productId));
    return p ? `${p.name} (${p.sku || '—'})` : 'Sản phẩm đã chọn';
  }, [data.products, productId]);

  return (
    <div className="manager-page-with-sidebar">
      <ManagerSidebar />
      <div className="manager-main">
        <header className="manager-topbar">
          <div className="manager-topbar-actions" style={{ marginLeft: 'auto' }}>
            <div className="manager-user-badge">
              <i className="fa-solid fa-chart-line" />
              <span>Báo cáo giá & lợi nhuận</span>
            </div>
          </div>
        </header>

        <div className="manager-content">
          <div className="manager-page-header" style={{ marginBottom: 12 }}>
            <h1 className="manager-page-title">Báo cáo tác động theo từng lần đổi giá</h1>
            <p className="manager-page-subtitle">
              Theo dõi từng đợt đổi giá sản phẩm và doanh thu/lợi nhuận ước tính sau mỗi lần đổi.
            </p>
          </div>

          <div className="manager-panel-card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
              <label style={{ fontSize: 13, color: '#374151' }}>
                Từ ngày
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{ marginLeft: 8, padding: '6px 8px' }}
                />
              </label>
              <label style={{ fontSize: 13, color: '#374151' }}>
                Đến ngày
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  style={{ marginLeft: 8, padding: '6px 8px' }}
                />
              </label>
              <label style={{ fontSize: 13, color: '#374151' }}>
                Sản phẩm
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  style={{ marginLeft: 8, padding: '6px 8px', minWidth: 260 }}
                >
                  <option value="">Tất cả sản phẩm</option>
                  {(data.products || []).map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.sku || '—'})
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="manager-btn-primary" onClick={fetchReport}>
                Xem báo cáo
              </button>
            </div>
            <p style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              Bộ lọc hiện tại: <strong>{selectedProductName}</strong>
            </p>
          </div>

          {error && (
            <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div className="manager-cards-row manager-cards-row--4" style={{ marginBottom: 14 }}>
            <div className="manager-metric-card">
              <div className="manager-metric-body">
                <p className="manager-metric-label">Số lần đổi giá</p>
                <p className="manager-metric-value">{data.summary?.total_events ?? 0}</p>
              </div>
            </div>
            <div className="manager-metric-card">
              <div className="manager-metric-body">
                <p className="manager-metric-label">Tổng SL bán sau đổi giá</p>
                <p className="manager-metric-value">{(data.summary?.total_qty ?? 0).toLocaleString('vi-VN')}</p>
              </div>
            </div>
            <div className="manager-metric-card">
              <div className="manager-metric-body">
                <p className="manager-metric-label">Doanh thu (cửa sổ đổi giá)</p>
                <p className="manager-metric-value">{fmtMoney(data.summary?.total_revenue ?? 0)}</p>
              </div>
            </div>
            <div className="manager-metric-card">
              <div className="manager-metric-body">
                <p className="manager-metric-label">Lợi nhuận ước tính</p>
                <p className="manager-metric-value">{fmtMoney(data.summary?.estimated_profit ?? 0)}</p>
              </div>
            </div>
          </div>

          <div className="manager-panel-card">
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : data.events?.length ? (
              <div className="warehouse-table-wrap">
                <table className="warehouse-table manager-table">
                  <thead>
                    <tr>
                      <th>Thời điểm đổi giá</th>
                      <th>Sản phẩm</th>
                      <th>Giá vốn</th>
                      <th>Giá bán</th>
                      <th>Người đổi</th>
                      <th>Nguồn</th>
                      <th>Khoảng tính</th>
                      <th style={{ textAlign: 'right' }}>SL bán</th>
                      <th style={{ textAlign: 'right' }}>Doanh thu</th>
                      <th style={{ textAlign: 'right' }}>Lợi nhuận ước</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <tr key={e._id}>
                        <td>{fmtDate(e.changed_at)}</td>
                        <td>
                          <strong>{e.product_name}</strong>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{e.sku || '—'}</div>
                        </td>
                        <td>
                          <div>{fmtMoney(e.old_cost_price)} → {fmtMoney(e.new_cost_price)}</div>
                        </td>
                        <td>
                          <div>{fmtMoney(e.old_sale_price)} → {fmtMoney(e.new_sale_price)}</div>
                        </td>
                        <td>{e.changed_by}</td>
                        <td>{e.source === 'import_excel' ? 'Import Excel' : 'Sửa tay'}</td>
                        <td>
                          {new Date(e.window.from).toLocaleDateString('vi-VN')} - {new Date(e.window.to).toLocaleDateString('vi-VN')}
                        </td>
                        <td style={{ textAlign: 'right' }}>{Number(e.impact.qty_sold || 0).toLocaleString('vi-VN')}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMoney(e.impact.revenue)}</td>
                        <td style={{ textAlign: 'right', color: e.impact.estimated_profit < 0 ? '#b91c1c' : '#166534' }}>
                          {fmtMoney(e.impact.estimated_profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="manager-products-loading">Không có dữ liệu đổi giá trong khoảng thời gian đã chọn.</p>
            )}
          </div>

          <p style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
            Ghi chú: Lợi nhuận trong màn hình này là <strong>ước tính theo giá vốn mới sau mỗi lần đổi giá</strong>,
            dùng để theo dõi xu hướng vận hành. Khi cần chuẩn kế toán sâu hơn có thể nâng cấp sang tính COGS theo lô nhập.
          </p>
        </div>
      </div>
    </div>
  );
}

