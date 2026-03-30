import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getProducts } from '../../services/productsApi';
import { createStocktake } from '../../services/stocktakesApi';

const PRODUCT_LIMIT = 500;

export default function WarehouseStocktakingCreate() {
  const navigate = useNavigate();
  const warehouseBase = useWarehouseBase();
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getProducts(1, PRODUCT_LIMIT, search);
      setProducts(data.products || []);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách sản phẩm');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p._id)));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setError('Vui lòng chọn ít nhất một sản phẩm để tạo phiếu kiểm kê.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { stocktake } = await createStocktake({ product_ids: ids });
      navigate(`${warehouseBase}/stocktakes`, { state: { success: 'Đã tạo phiếu kiểm kê thành công.' } });
    } catch (err) {
      setError(err.message || 'Không thể tạo phiếu kiểm kê');
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected = products.length > 0 && selectedIds.size === products.length;

  return (
    <>
      <h1 className="warehouse-page-title">Tạo phiếu kiểm kê</h1>
      <p className="warehouse-page-subtitle">
        Chọn các sản phẩm cần kiểm kê. Hệ thống sẽ ghi nhận tồn kho tại thời điểm tạo phiếu.
      </p>

      {error && (
        <div className="warehouse-alert warehouse-alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="warehouse-card">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="search"
              placeholder="Tìm theo tên, SKU, mã vạch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="warehouse-search-input"
              style={{
                padding: '8px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                minWidth: 220,
                fontSize: 14,
              }}
            />
            <button type="button" className="warehouse-btn warehouse-btn-secondary" onClick={fetchProducts}>
              Tìm kiếm
            </button>
          </div>

          {loading ? (
            <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Đang tải danh sách sản phẩm...</p>
          ) : products.length === 0 ? (
            <p style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Không có sản phẩm nào.</p>
          ) : (
            <>
              <div className="warehouse-table-wrap">
                <table className="warehouse-table">
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Chọn tất cả"
                        />
                      </th>
                      <th>Tên sản phẩm</th>
                      <th>SKU</th>
                      <th>Đơn vị tồn</th>
                      <th style={{ textAlign: 'right' }}>Tồn hệ thống</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p._id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p._id)}
                            onChange={() => toggleOne(p._id)}
                            aria-label={`Chọn ${p.name}`}
                          />
                        </td>
                        <td>{p.name}</td>
                        <td>{p.sku || '—'}</td>
                        <td>{p.base_unit || 'Cái'}</td>
                        <td style={{ textAlign: 'right' }}>{Number(p.stock_qty ?? 0).toLocaleString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ marginTop: 12, fontSize: 13, color: '#6b7280' }}>
                Đã chọn <strong>{selectedIds.size}</strong> / {products.length} sản phẩm.
              </p>
              <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                <button
                  type="submit"
                  className="warehouse-btn warehouse-btn-primary"
                  disabled={submitting || selectedIds.size === 0}
                >
                  {submitting ? 'Đang tạo...' : 'Tạo phiếu kiểm kê'}
                </button>
                <button
                  type="button"
                  className="warehouse-btn warehouse-btn-secondary"
                  onClick={() => navigate(`${warehouseBase}/stocktakes`)}
                >
                  Hủy
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </>
  );
}
