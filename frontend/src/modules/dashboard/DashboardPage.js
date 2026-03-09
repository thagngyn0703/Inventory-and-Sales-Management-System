import React from 'react';
import './DashboardPage.css';

const summaryCards = [
  {
    id: 1,
    title: 'Doanh thu hôm nay',
    value: '12.450.000₫',
    change: '+18% so với hôm qua',
    tone: 'blue',
    icon: 'fa-money-bill-wave',
  },
  {
    id: 2,
    title: 'Đơn hàng hôm nay',
    value: '86',
    change: '+12 đơn',
    tone: 'green',
    icon: 'fa-receipt',
  },
  {
    id: 3,
    title: 'Giá trị tồn kho',
    value: '320.000.000₫',
    change: '1.250 mặt hàng',
    tone: 'indigo',
    icon: 'fa-warehouse',
  },
  {
    id: 4,
    title: 'Cảnh báo tồn kho thấp',
    value: '18 mặt hàng',
    change: 'Cần nhập trong 3 ngày',
    tone: 'orange',
    icon: 'fa-triangle-exclamation',
  },
];

const salesTrend = [
  { label: 'T2', value: 60 },
  { label: 'T3', value: 80 },
  { label: 'T4', value: 55 },
  { label: 'T5', value: 95 },
  { label: 'T6', value: 75 },
  { label: 'T7', value: 110 },
  { label: 'CN', value: 90 },
];

const recentOrders = [
  {
    id: 'HD01245',
    customer: 'Nguyễn Văn A',
    channel: 'Tại quầy',
    total: '1.250.000₫',
    status: 'Hoàn thành',
    statusVariant: 'success',
    time: '10:25 hôm nay',
  },
  {
    id: 'HD01244',
    customer: 'Trần Thị B',
    channel: 'Online',
    total: '850.000₫',
    status: 'Chờ giao',
    statusVariant: 'warning',
    time: '09:40 hôm nay',
  },
  {
    id: 'HD01243',
    customer: 'Lê Văn C',
    channel: 'Tại quầy',
    total: '450.000₫',
    status: 'Đã hủy',
    statusVariant: 'danger',
    time: 'Hôm qua',
  },
];

const lowStockItems = [
  { id: 1, sku: 'SP001', name: 'Mì Hảo Hảo Tôm Chua Cay', stock: 8, unit: 'thùng', branch: 'Kho chính' },
  { id: 2, sku: 'SP023', name: 'Dầu ăn Tường An 1L', stock: 5, unit: 'chai', branch: 'Kho chính' },
  { id: 3, sku: 'SP044', name: 'Đường tinh luyện 1kg', stock: 3, unit: 'bao', branch: 'Kho lẻ' },
];

const DashboardPage = () => {
  return (
    <section className="dashboard-page">
      <div className="dashboard-page__summary-row">
        {summaryCards.map((card) => (
          <article key={card.id} className={`dash-card dash-card--${card.tone}`}>
            <div className="dash-card__icon-wrap">
              <div className="dash-card__icon">
                <i className={`fa-solid ${card.icon}`} />
              </div>
            </div>
            <div className="dash-card__body">
              <div className="dash-card__title">{card.title}</div>
              <div className="dash-card__value">{card.value}</div>
              <div className="dash-card__change">{card.change}</div>
            </div>
          </article>
        ))}
      </div>

      <div className="dashboard-page__row dashboard-page__row--main">
        <section className="dash-panel dash-panel--primary">
          <header className="dash-panel__header">
            <div>
              <h3 className="dash-panel__title">Doanh thu 7 ngày gần nhất</h3>
              <p className="dash-panel__subtitle">Theo dõi xu hướng doanh thu hàng ngày</p>
            </div>
            <button type="button" className="dash-panel__filter">
                7 ngày gần đây <i className="fa-solid fa-chevron-down" />
            </button>
          </header>
          <div className="dash-panel__chart">
            {salesTrend.map((d) => (
              <div key={d.label} className="dash-bar">
                <div className="dash-bar__inner" style={{ height: `${d.value}%` }} />
                <span className="dash-bar__label">{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="dash-panel dash-panel--kpi">
          <header className="dash-panel__header">
            <h3 className="dash-panel__title">Chỉ số chính</h3>
          </header>
          <ul className="dash-kpi-list">
            <li className="dash-kpi">
              <div className="dash-kpi__label">Tỉ lệ hoàn đơn</div>
              <div className="dash-kpi__value">2,3%</div>
              <span className="dash-kpi__trend dash-kpi__trend--down">
                <i className="fa-solid fa-arrow-down" /> -0,4% so với tuần trước
              </span>
            </li>
            <li className="dash-kpi">
              <div className="dash-kpi__label">Giá trị đơn trung bình</div>
              <div className="dash-kpi__value">145.000₫</div>
              <span className="dash-kpi__trend dash-kpi__trend--up">
                <i className="fa-solid fa-arrow-up" /> +6,2% so với tuần trước
              </span>
            </li>
            <li className="dash-kpi">
              <div className="dash-kpi__label">Khách quay lại</div>
              <div className="dash-kpi__value">38%</div>
              <span className="dash-kpi__trend dash-kpi__trend--up">
                <i className="fa-solid fa-arrow-up" /> +3 khách/ngày
              </span>
            </li>
          </ul>
        </section>
      </div>

      <div className="dashboard-page__row">
        <section className="dash-panel">
          <header className="dash-panel__header">
            <h3 className="dash-panel__title">Đơn hàng gần đây</h3>
            <button type="button" className="dash-panel__link">
              Xem tất cả <i className="fas fa-arrow-right" />
            </button>
          </header>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Mã hóa đơn</th>
                <th>Khách hàng</th>
                <th>Kênh bán</th>
                <th className="dash-table__cell--right">Tổng tiền</th>
                <th className="dash-table__cell--center">Trạng thái</th>
                <th className="dash-table__cell--right">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.customer}</td>
                  <td>{o.channel}</td>
                  <td className="dash-table__cell--right">{o.total}</td>
                  <td className="dash-table__cell--center">
                    <span className={`badge badge--${o.statusVariant}`}>{o.status}</span>
                  </td>
                  <td className="dash-table__cell--right">{o.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="dash-panel">
          <header className="dash-panel__header">
            <h3 className="dash-panel__title">Sản phẩm sắp hết hàng</h3>
            <button type="button" className="dash-panel__link">
              Xem kho hàng <i className="fas fa-arrow-right" />
            </button>
          </header>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Mã SP</th>
                <th>Tên sản phẩm</th>
                <th className="dash-table__cell--center">Kho</th>
                <th className="dash-table__cell--right">Tồn</th>
              </tr>
            </thead>
            <tbody>
              {lowStockItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td className="dash-table__cell--center">{item.branch}</td>
                  <td className="dash-table__cell--right">
                    <span className="dash-low-stock">
                      {item.stock} {item.unit}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
};

export default DashboardPage;

