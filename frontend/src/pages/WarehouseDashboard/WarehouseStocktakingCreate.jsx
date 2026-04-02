import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getProducts } from '../../services/productsApi';
import { createStocktake } from '../../services/stocktakesApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

const PRODUCT_LIMIT = 10;

export default function WarehouseStocktakingCreate() {
  const navigate = useNavigate();
  const warehouseBase = useWarehouseBase();
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getProducts(page, PRODUCT_LIMIT, search);
      setProducts(data.products || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách sản phẩm');
      setProducts([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

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
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tạo phiếu kiểm kê</h1>
          <p className="text-sm text-slate-500">Chọn các sản phẩm cần kiểm kê. Hệ thống sẽ ghi nhận tồn kho tại thời điểm tạo phiếu.</p>
          <p className="text-xs text-slate-400">
            {Platform.select({ web: 'Thiết kế đồng bộ với các màn kiểm kê manager để thao tác nhanh và rõ ràng.', default: 'Thiết kế đồng bộ manager.' })}
          </p>
        </div>
        <Badge className="bg-sky-100 text-sky-700 border border-sky-200">Đã chọn: {selectedIds.size}</Badge>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
        <form onSubmit={handleSubmit}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Tìm theo tên, SKU, mã vạch..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 min-w-[220px] rounded-md border border-slate-300 bg-white px-3 text-sm"
            />
            <Button type="button" variant="outline" onClick={fetchProducts}>
              Tìm kiếm
            </Button>
            <Button type="button" variant="outline" onClick={toggleAll} disabled={products.length === 0}>
              {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </Button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-slate-500">Đang tải danh sách sản phẩm...</p>
          ) : products.length === 0 ? (
            <p className="py-8 text-center text-slate-500">Không có sản phẩm nào.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold" style={{ width: 48 }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Chọn tất cả"
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">Tên sản phẩm</th>
                      <th className="px-4 py-3 text-left font-semibold">SKU</th>
                      <th className="px-4 py-3 text-left font-semibold">Đơn vị tồn</th>
                      <th className="px-4 py-3 text-right font-semibold">Tồn hệ thống</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p._id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p._id)}
                            onChange={() => toggleOne(p._id)}
                            aria-label={`Chọn ${p.name}`}
                          />
                        </td>
                        <td className="px-4 py-3">{p.name}</td>
                        <td className="px-4 py-3">{p.sku || '—'}</td>
                        <td className="px-4 py-3">{p.base_unit || 'Cái'}</td>
                        <td className="px-4 py-3 text-right">{Number(p.stock_qty ?? 0).toLocaleString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Đã chọn <strong>{selectedIds.size}</strong> sản phẩm — Trang {page} / {totalPages} (10 sản phẩm/trang, tổng {total}).
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">Phân trang: 10 sản phẩm/trang</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Trước
                  </Button>
                  <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Sau
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={submitting || selectedIds.size === 0}
                >
                  {submitting ? 'Đang tạo...' : 'Tạo phiếu kiểm kê'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`${warehouseBase}/stocktakes`)}
                >
                  Hủy
                </Button>
              </div>
            </>
          )}
        </form>
        </CardContent>
      </Card>
    </>
  );
}
