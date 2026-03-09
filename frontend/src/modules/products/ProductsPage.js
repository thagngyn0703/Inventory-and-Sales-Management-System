import React from 'react';
import './ProductsPage.css';

const mockProducts = [
  {
    id: 1,
    name: 'Mì Hảo Hảo Tôm Chua Cay',
    code: '893456123001',
    category: 'Thực phẩm',
    costPrice: 3800,
    salePrice: 4500,
    stock: 120,
    status: 'Đang bán',
  },
  {
    id: 2,
    name: 'Dầu ăn Tường An 1L',
    code: '893456123099',
    category: 'Thực phẩm',
    costPrice: 48000,
    salePrice: 55000,
    stock: 5,
    status: 'Đang bán',
    lowStock: true,
  },
];

const formatCurrency = (value) =>
  value.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ProductsPage = () => {
  return (
    <section className="products-page">
      <div className="products-page__toolbar">
        <div className="products-page__filters">
          <div className="products-page__search">
            <span className="products-page__search-icon">🔍</span>
            <input
              type="text"
              placeholder="Tìm tên, mã vạch..."
              className="products-page__search-input"
            />
          </div>
          <select className="products-page__select">
            <option>Tất cả nhóm</option>
          </select>
        </div>
        <div className="products-page__actions">
          <button type="button" className="btn btn--primary">
            + Thêm mới
          </button>
          <button type="button" className="btn btn--outline">
            ⬇ Xuất file
          </button>
        </div>
      </div>

      <div className="products-page__table-card">
        <table className="products-table">
          <thead>
            <tr>
              <th>MÃ / TÊN HÀNG</th>
              <th>NHÓM HÀNG</th>
              <th>GIÁ VỐN</th>
              <th>GIÁ BÁN</th>
              <th>TỒN KHO</th>
              <th>TRẠNG THÁI</th>
              <th>THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            {mockProducts.map((p) => (
              <tr key={p.id} className={p.lowStock ? 'products-table__row--low' : ''}>
                <td>
                  <div className="products-table__name">{p.name}</div>
                  <div className="products-table__code">{p.code}</div>
                </td>
                <td>{p.category}</td>
                <td>{formatCurrency(p.costPrice)}</td>
                <td className="products-table__highlight">{formatCurrency(p.salePrice)}</td>
                <td className={p.lowStock ? 'products-table__stock--low' : ''}>{p.stock}</td>
                <td>
                  <span className="status-pill status-pill--success">{p.status}</span>
                </td>
                <td>
                  <button type="button" className="icon-btn" aria-label="Sửa">
                    ✏️
                  </button>
                  <button type="button" className="icon-btn" aria-label="Xóa">
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="products-page__footer">
          <span>
            Hiển thị 1-10 của <strong>150</strong> kết quả
          </span>
          <div className="pagination">
            <button type="button" className="pagination__btn">
              Trước
            </button>
            <button type="button" className="pagination__btn pagination__btn--active">
              1
            </button>
            <button type="button" className="pagination__btn">
              2
            </button>
            <button type="button" className="pagination__btn">
              Sau
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductsPage;

