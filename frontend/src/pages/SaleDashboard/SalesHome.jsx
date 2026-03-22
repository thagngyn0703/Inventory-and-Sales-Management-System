import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInvoices, getDailySalesStats } from '../../services/invoicesApi';

export default function SalesHome() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    todaySales: 0,
    invoiceCount: 0,
    recentInvoices: [],
    dailyStats: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [{ invoices = [] }, daily = []] = await Promise.all([
          getInvoices({ page: 1, limit: 10 }),
          getDailySalesStats()
        ]);

        // Filter for "confirmed" today
        const today = new Date().toDateString();
        const todayInvoices = invoices.filter(inv => 
          new Date(inv.invoice_at).toDateString() === today && 
          inv.status === 'confirmed'
        );
        
        const total = todayInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
        
        setStats({
          todaySales: total,
          invoiceCount: todayInvoices.length,
          recentInvoices: invoices.slice(0, 5),
          dailyStats: daily
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const formatMoney = (val) => Number(val || 0).toLocaleString('vi-VN') + '₫';

  const maxDaily = Math.max(...stats.dailyStats.map(s => s.total), 1);

  return (
    <div className="sales-home">
      <div className="sales-welcome">
        <h2>Chào buổi chiều, <span>Nhân viên bán hàng!</span> 👋</h2>
        <p>Đây là kết quả bán hàng của bạn hôm nay.</p>
      </div>

      <div className="sales-stats-grid">
        <div className="sales-stat-card">
          <div className="stat-icon-wrapper" style={{background: '#dcfce7', color: '#166534'}}>
            <i className="fa-solid fa-money-bill-trend-up" />
          </div>
          <div className="stat-details">
            <h4>Doanh thu hôm nay</h4>
            <div className="stat-value">{formatMoney(stats.todaySales)}</div>
          </div>
        </div>

        <div className="sales-stat-card">
          <div className="stat-icon-wrapper" style={{background: '#e0e7ff', color: '#3730a3'}}>
            <i className="fa-solid fa-file-invoice" />
          </div>
          <div className="stat-details">
            <h4>Số hóa đơn</h4>
            <div className="stat-value">{stats.invoiceCount}</div>
          </div>
        </div>

        <div className="sales-stat-card">
          <div className="stat-icon-wrapper" style={{background: '#fef3c7', color: '#92400e'}}>
            <i className="fa-solid fa-star" />
          </div>
          <div className="stat-details">
            <h4>Sản phẩm bán chạy</h4>
            <div className="stat-value">Sơn Expo 5L</div>
          </div>
        </div>
      </div>

      <div className="sales-dashboard-row" style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
        <div className="sales-chart-card" style={{ flex: 2, background: 'white', borderRadius: 16, padding: 24, boxShadow: 'var(--sales-shadow)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem' }}>Doanh thu 7 ngày gần nhất</h3>
          <div className="chart-container" style={{ height: 250, display: 'flex', alignItems: 'flex-end', gap: 12, paddingBottom: 30, position: 'relative' }}>
            {stats.dailyStats.map((d, i) => {
              const height = (d.total / maxDaily) * 100;
              const isToday = i === stats.dailyStats.length - 1;
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                  <div className="chart-bar-wrapper" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                     <div 
                        className="chart-bar" 
                        style={{ 
                          width: '100%', 
                          height: `${height}%`, 
                          background: isToday ? 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)' : '#e2e8f0',
                          borderRadius: '6px 6px 0 0',
                          transition: 'height 0.5s ease-out',
                          position: 'relative'
                        }}
                     >
                        <div className="chart-tooltip" style={{ 
                            position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
                            background: '#1e293b', color: 'white', padding: '4px 8px', borderRadius: 4,
                            fontSize: 10, whiteSpace: 'nowrap', opacity: 0, transition: 'opacity 0.2s',
                            pointerEvents: 'none'
                        }}>
                            {formatMoney(d.total)}
                        </div>
                     </div>
                  </div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: isToday ? 700 : 400 }}>
                    {new Date(d.date).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sales-quick-actions" style={{ flex: 1, marginBottom: 0 }}>
            <h3>Truy cập nhanh</h3>
            <div className="quick-actions-grid" style={{ flexDirection: 'column' }}>
            <button className="q-btn" onClick={() => navigate('/sales/invoices/new')}>
                <i className="fa-solid fa-plus-circle" />
                Tạo đơn mới
            </button>
            <button className="q-btn" onClick={() => navigate('/sales/invoices/new?type=return')}>
                <i className="fa-solid fa-arrow-rotate-left" />
                Trả hàng
            </button>
            <button className="q-btn" onClick={() => navigate('/sales/invoices')}>
                <i className="fa-solid fa-clock-rotate-left" />
                Lịch sử
            </button>
            </div>
        </div>
      </div>

      <div className="sales-recent-card">
        <h3>Đơn hàng gần đây</h3>
        <div className="sales-table-wrapper">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Tổng tiền</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stats.recentInvoices.map(inv => (
                <tr key={inv._id}>
                  <td>#{inv._id?.slice(-6)}</td>
                  <td>{inv.recipient_name || 'Khách lẻ'}</td>
                  <td style={{fontWeight: 700}}>{formatMoney(inv.total_amount)}</td>
                  <td>
                    <span className={`badge badge-${inv.status}`}>
                      {inv.status === 'confirmed' ? 'Đã xuất' : inv.status}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => navigate(`/sales/${inv._id}`)}>Chi tiết</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .sales-welcome { margin-bottom: 32px; }
        .sales-welcome h2 { font-size: 1.8rem; font-weight: 800; color: #1e293b; margin: 0 0 8px 0; }
        .sales-welcome h2 span { color: var(--sales-primary); }
        .sales-welcome p { color: var(--sales-text-muted); font-size: 1rem; }

        .sales-quick-actions h3 { font-size: 1.1rem; margin-bottom: 16px; color: #334155; }
        .quick-actions-grid { display: flex; gap: 16px; }
        .q-btn { 
          flex: 1; height: 60px; border-radius: 12px; border: 1px solid #e2e8f0; background: white; 
          display: flex; align-items: center; justify-content: center; gap: 10px; font-weight: 600; 
          color: #475569; cursor: pointer; transition: all 0.2s;
        }
        .q-btn:hover { background: #f1f5f9; border-color: #cbd5e1; }
        .q-btn i { color: var(--sales-primary); font-size: 1.2rem; }

        .chart-bar:hover .chart-tooltip { opacity: 1 !important; }
        .chart-bar:hover { filter: brightness(1.1); transform: scaleX(1.1); }
        .chart-bar { transform-origin: center bottom; cursor: pointer; }

        .sales-recent-card { background: white; border-radius: 16px; padding: 24px; box-shadow: var(--sales-shadow); }
        .sales-recent-card h3 { margin: 0 0 20px 0; font-size: 1.1rem; }
        .sales-table-wrapper { overflow-x: auto; }
        .sales-table { width: 100%; border-collapse: collapse; text-align: left; }
        .sales-table th { padding: 12px 16px; border-bottom: 2px solid #f1f5f9; color: var(--sales-text-muted); font-size: 0.85rem; text-transform: uppercase; }
        .sales-table td { padding: 16px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
        .badge { padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
        .badge-confirmed { background: #dcfce7; color: #166534; }
        .badge-paid { background: #e0e7ff; color: #3730a3; }
        .badge-cancelled { background: #fee2e2; color: #991b1b; }
      `}</style>
    </div>
  );
}
