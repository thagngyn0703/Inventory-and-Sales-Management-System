import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getProducts } from '../../services/productsApi';
import { createStocktake } from '../../services/stocktakesApi';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { InlineNotice } from '../../components/ui/inline-notice';
import { ClipboardCheck } from 'lucide-react';

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
      await createStocktake({ product_ids: ids });
      navigate(`${warehouseBase}/stocktakes`, { state: { success: 'Đã tạo phiếu kiểm kê thành công.' } });
    } catch (err) {
      setError(err.message || 'Không thể tạo phiếu kiểm kê');
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected = products.length > 0 && selectedIds.size === products.length;

  return (
    <StaffPageShell
      eyebrow="Kiểm kê kho"
      eyebrowIcon={ClipboardCheck}
      eyebrowTone="amber"
      title="Tạo phiếu kiểm kê"
      subtitle="Chọn sản phẩm cần kiểm kê — hệ thống ghi nhận tồn tại thời điểm tạo phiếu. Giao diện đồng bộ với luồng kiểm kê phía quản lý."
      headerActions={
        <Badge className="border border-amber-200 bg-amber-100 font-medium text-amber-900">
          Đã chọn: {selectedIds.size}
        </Badge>
      }
    >
      <InlineNotice message={error} type="error" />

      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="p-4 sm:p-6">
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
              className="h-11 min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2 sm:max-w-md"
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
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3" style={{ width: 48 }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Chọn tất cả"
                        />
                      </th>
                      <th className="px-4 py-3">Tên sản phẩm</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Đơn vị tồn</th>
                      <th className="px-4 py-3 text-right">Tồn hệ thống</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {products.map((p) => (
                      <tr key={p._id} className="hover:bg-slate-50/80">
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
    </StaffPageShell>
  );
}
