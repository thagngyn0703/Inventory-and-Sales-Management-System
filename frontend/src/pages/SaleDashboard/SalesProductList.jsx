import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Loader2, PackageSearch, Search, X } from 'lucide-react';
import { getProducts } from '../../services/productsApi';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

const LIMIT = 10;

export default function SalesProductList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getProducts(page, LIMIT, search);
      setProducts(data.products || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || 'Lỗi tải danh sách');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setSearch((prev) => (prev === next ? prev : next));
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const formatMoney = (n) => {
    if (n == null || isNaN(n)) return '0₫';
    return Number(n).toLocaleString('vi-VN') + '₫';
  };

  const highlightMatch = (text, query) => {
    const raw = String(text || '');
    const q = String(query || '').trim();
    if (!q) return raw;
    const lowerRaw = raw.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerRaw.indexOf(lowerQ);
    if (idx < 0) return raw;
    const before = raw.slice(0, idx);
    const match = raw.slice(idx, idx + q.length);
    const after = raw.slice(idx + q.length);
    return (
      <>
        {before}
        <mark className="rounded bg-amber-200/90 px-0.5 text-slate-900">{match}</mark>
        {after}
      </>
    );
  };

  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, total);

  return (
    <StaffPageShell
      eyebrow="Bán hàng"
      eyebrowIcon={PackageSearch}
      eyebrowTone="teal"
      title="Danh mục sản phẩm"
      subtitle="Xem danh sách, giá và tồn kho — 10 sản phẩm mỗi trang."
    >
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Tìm kiếm sản phẩm
            </label>
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none ring-sky-200 transition focus:ring-2"
                placeholder="Tên, SKU, barcode..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Xóa tìm kiếm"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <span>
              Tổng <strong className="text-slate-900">{total}</strong> sản phẩm
              {total > 0 && (
                <>
                  {' '}
                  · Hiển thị <strong className="text-slate-900">{start}</strong>–
                  <strong className="text-slate-900">{end}</strong>
                </>
              )}
            </span>
            {loading && (
              <span className="inline-flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải...
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="p-0 sm:p-0">
          {loading && products.length === 0 ? (
            <div className="flex justify-center py-16 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
            </div>
          ) : products.length === 0 ? (
            <p className="py-14 text-center text-slate-500">
              {search ? 'Không có sản phẩm nào phù hợp.' : 'Chưa có sản phẩm.'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">STT</th>
                      <th className="px-4 py-3">Ảnh</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Tên sản phẩm</th>
                      <th className="px-4 py-3">Barcode</th>
                      <th className="px-4 py-3 text-right">Giá vốn</th>
                      <th className="px-4 py-3 text-right">Giá bán</th>
                      <th className="px-4 py-3 text-right">Tồn kho</th>
                      <th className="px-4 py-3">Đơn vị</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="w-24 px-4 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {products.map((p, idx) => (
                      <tr key={p._id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                          {(page - 1) * LIMIT + idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          {Array.isArray(p.image_urls) && p.image_urls[0] ? (
                            <img
                              src={p.image_urls[0]}
                              alt=""
                              className="h-11 w-11 rounded-lg border border-slate-200 object-cover"
                            />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="max-w-[100px] truncate px-4 py-3 font-mono text-xs text-slate-700">{p.sku || '—'}</td>
                        <td className="max-w-[200px] px-4 py-3">
                          <button
                            type="button"
                            className="text-left font-medium text-sky-700 underline-offset-2 hover:text-sky-800 hover:underline"
                            onClick={() => navigate(`/staff/products/${p._id}`)}
                          >
                            {highlightMatch(p.name || '—', search)}
                          </button>
                        </td>
                        <td className="max-w-[120px] truncate px-4 py-3 text-slate-600">{p.barcode || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-800">{formatMoney(p.cost_price)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                          {formatMoney(p.sale_price)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-800">
                          {Number(p.stock_qty ?? 0).toLocaleString('vi-VN')}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.base_unit || 'Cái'}</td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              'border font-medium',
                              p.status === 'inactive'
                                ? 'border-rose-200/80 bg-rose-100 text-rose-800'
                                : 'border-emerald-200/80 bg-emerald-100 text-emerald-900'
                            )}
                          >
                            {p.status === 'inactive' ? 'Ngừng' : 'Đang bán'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="default"
                            className="h-9 gap-1.5"
                            onClick={() => navigate(`/staff/products/${p._id}`)}
                          >
                            <Eye className="h-4 w-4" />
                            Xem
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row">
                <p className="text-sm text-slate-600">
                  Trang <strong className="text-slate-900">{page}</strong> /{' '}
                  <strong className="text-slate-900">{totalPages}</strong>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Trước
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </StaffPageShell>
  );
}
