import React, { useState } from 'react';
import './CustomersPage.css';

const summaryCards = [
  {
    id: 1,
    title: 'Tổng khách hàng',
    value: '248',
    chip: '+5 tháng này',
    icon: '👥',
    tone: 'blue',
  },
  {
    id: 2,
    title: 'Tổng công nợ',
    value: '12.450.000₫',
    sub: '32 khách hàng nợ',
    icon: '💰',
    tone: 'orange',
  },
  {
    id: 3,
    title: 'Nợ quá hạn',
    value: '3.200.000₫',
    sub: '8 khách hàng',
    icon: '⚠️',
    tone: 'red',
  },
  {
    id: 4,
    title: 'Đã thu',
    value: '8.250.000₫',
    sub: 'Tháng này',
    icon: '✅',
    tone: 'green',
  },
];

const mockCustomers = [
  {
    id: 1,
    code: 'KH001',
    name: 'Nguyễn Văn A',
    segment: 'VIP',
    segmentVariant: 'vip',
    phone: '0987654321',
    email: 'nguyenvana@email.com',
    debt: '2.500.000₫',
    invoices: '5 hóa đơn',
    dueDate: '25/01/2026',
    status: 'Có nợ',
    statusVariant: 'warning',
    debtVariant: 'orange',
  },
  {
    id: 2,
    code: 'KH002',
    name: 'Trần Thị B',
    segment: 'Thường xuyên',
    segmentVariant: 'regular',
    phone: '0912345678',
    email: 'tranthib@email.com',
    debt: '850.000₫',
    invoices: 'Quá hạn',
    dueDate: '15/01/2026',
    status: 'Quá hạn',
    statusVariant: 'danger',
    debtVariant: 'red',
  },
  {
    id: 3,
    code: 'KH003',
    name: 'Lê Văn C',
    segment: 'Mới',
    segmentVariant: 'new',
    phone: '0923456789',
    email: 'levanc@email.com',
    debt: '0₫',
    invoices: 'Không nợ',
    dueDate: '-',
    status: 'Không nợ',
    statusVariant: 'success',
    debtVariant: 'green',
  },
];

const CustomersPage = () => {
  const [activeFilter, setActiveFilter] = useState('all');

  // TODO: sau này thay bằng dữ liệu từ API, filter theo activeFilter
  const displayedCustomers = mockCustomers;

  return (
    <section className="customers-page">
      <div className="customers-page__summary-row">
        {summaryCards.map((card) => (
          <div key={card.id} className={`summary-card summary-card--${card.tone}`}>
            <div className="summary-card__icon-wrap">
              <span className="summary-card__icon">{card.icon}</span>
            </div>
            <div className="summary-card__body">
              <div className="summary-card__title-row">
                <span className="summary-card__title">{card.title}</span>
                {card.chip && <span className="summary-card__chip">{card.chip}</span>}
              </div>
              <div className="summary-card__value">{card.value}</div>
              {card.sub && <div className="summary-card__sub">{card.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="customers-page__toolbar">
        <div className="customers-page__toolbar-left">
          <button type="button" className="btn btn--primary">
            <i className="fas fa-user-plus" /> Thêm khách hàng
          </button>
          <button type="button" className="btn btn--secondary">
            <i className="fas fa-file-import" /> Import Excel
          </button>
          <button type="button" className="btn btn--secondary">
            <i className="fas fa-file-export" /> Export
          </button>
        </div>
        <div className="customers-page__toolbar-filters">
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'all' ? 'filter-tab--active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            Tất cả
          </button>
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'debt' ? 'filter-tab--active' : ''}`}
            onClick={() => setActiveFilter('debt')}
          >
            Có nợ
          </button>
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'overdue' ? 'filter-tab--active' : ''}`}
            onClick={() => setActiveFilter('overdue')}
          >
            Quá hạn
          </button>
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'vip' ? 'filter-tab--active' : ''}`}
            onClick={() => setActiveFilter('vip')}
          >
            VIP
          </button>
        </div>
      </div>

      <div className="customers-page__table-card">
        <table className="customers-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" />
              </th>
              <th>MÃ KH</th>
              <th>TÊN KHÁCH HÀNG</th>
              <th>SDT / EMAIL</th>
              <th>CÔNG NỢ</th>
              <th>HẠN THANH TOÁN</th>
              <th>TRẠNG THÁI</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            {displayedCustomers.map((c) => (
              <tr key={c.id}>
                <td>
                  <input type="checkbox" />
                </td>
                <td>
                  <span className="customers-table__code">{c.code}</span>
                </td>
                <td>
                  <div className="customers-table__name">{c.name}</div>
                  {c.segment && (
                    <span
                      className={`customers-table__tag customers-table__tag--${c.segmentVariant}`}
                    >
                      <i className="customers-table__tag-icon fas fa-crown" />
                      {c.segment}
                    </span>
                  )}
                </td>
                <td>
                  <div>{c.phone}</div>
                  <div className="customers-table__email">{c.email}</div>
                </td>
                <td className="customers-table__cell--right">
                  <div
                    className={`customers-table__debt customers-table__debt--${c.debtVariant}`}
                  >
                    {c.debt}
                  </div>
                  <div className="customers-table__debt-sub">{c.invoices}</div>
                </td>
                <td className="customers-table__cell--center">
                  <span
                    className={`customers-table__due-date customers-table__due-date--${c.statusVariant}`}
                  >
                    {c.dueDate}
                  </span>
                </td>
                <td className="customers-table__cell--center">
                  <span className={`status-pill status-pill--${c.statusVariant}`}>
                    {c.status}
                  </span>
                </td>
                <td className="customers-table__cell--center">
                  <div className="customers-table__actions">
                    <button type="button" className="icon-btn" aria-label="Xem">
                      <i className="fas fa-eye" />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Sửa">
                      <i className="fas fa-edit" />
                    </button>
                    <button type="button" className="icon-btn icon-btn--danger" aria-label="Xóa">
                      <i className="fas fa-trash" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="customers-page__pagination">
          <div className="customers-page__pagination-text">
            Hiển thị <strong>1-10</strong> của <strong>248</strong> khách hàng
          </div>
          <div className="customers-page__pagination-controls">
            <button type="button" className="customers-page__pagination-btn">
              <i className="fas fa-chevron-left" />
            </button>
            <button
              type="button"
              className="customers-page__pagination-btn customers-page__pagination-btn--active"
            >
              1
            </button>
            <button type="button" className="customers-page__pagination-btn">
              2
            </button>
            <button type="button" className="customers-page__pagination-btn">
              3
            </button>
            <button type="button" className="customers-page__pagination-btn">...</button>
            <button type="button" className="customers-page__pagination-btn">25</button>
            <button type="button" className="customers-page__pagination-btn">
              <i className="fas fa-chevron-right" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CustomersPage;

