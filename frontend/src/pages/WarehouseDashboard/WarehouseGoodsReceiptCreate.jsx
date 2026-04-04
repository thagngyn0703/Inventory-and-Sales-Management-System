import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getProducts } from '../../services/productsApi';
import { getSuppliers } from '../../services/suppliersApi';
import { createGoodsReceipt } from '../../services/goodsReceiptsApi';
import WarehouseProductCreateModal from './WarehouseProductCreateModal';
import { useToast } from '../../contexts/ToastContext';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import {
  Building2,
  ClipboardPlus,
  Loader2,
  PackageSearch,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function WarehouseGoodsReceiptCreate() {
  const navigate = useNavigate();
  const warehouseBase = useWarehouseBase();
  const { toast } = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [reason, setReason] = useState('');

  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [searching, setSearching] = useState(false);

  const [items, setItems] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);

  const addedIds = useMemo(() => new Set(items.map((i) => i.product._id)), [items]);

  const productsPickList = useMemo(
    () => products.filter((p) => !addedIds.has(p._id)),
    [products, addedIds]
  );

  useEffect(() => {
    getSuppliers()
      .then(setSuppliers)
      .catch((e) => toast(e.message || 'Không tải được nhà cung cấp', 'error'));
  }, [toast]);

  const handleSearchProducts = useCallback(async () => {
    if (!search.trim()) {
      toast('Nhập từ khóa để tìm sản phẩm', 'info');
      return;
    }
    setSearching(true);
    try {
      const data = await getProducts(1, 20, search);
      setProducts(data.products || []);
      const list = data.products || [];
      const available = list.filter((p) => !addedIds.has(p._id));
      if (list.length === 0) toast('Không tìm thấy sản phẩm', 'info');
      else if (available.length === 0) toast('Các sản phẩm tìm được đã có trong phiếu nhập', 'info');
    } catch (e) {
      toast(e.message || 'Lỗi tìm kiếm sản phẩm', 'error');
    } finally {
      setSearching(false);
    }
  }, [search, addedIds, toast]);

  const handleAddProduct = (product) => {
    if (addedIds.has(product._id)) {
      toast('Sản phẩm đã có trong danh sách nhập', 'info');
      return;
    }
    const defaultUnit =
      product.selling_units && product.selling_units.length > 0
        ? product.selling_units[0]
        : { name: product.base_unit || 'Cái', ratio: 1, sale_price: product.sale_price };

    setItems((prev) => [
      ...prev,
      {
        product,
        quantity: 1,
        unit_cost: product.cost_price || 0,
        unit_name: defaultUnit.name,
        ratio: defaultUnit.ratio,
      },
    ]);
  };

  const handleRemoveItem = (productId) => {
    setItems((prev) => prev.filter((item) => item.product._id !== productId));
  };

  const handleItemChange = (productId, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product._id !== productId) return item;
        if (field === 'unit') {
          const selectedUnit = item.product.selling_units?.find((u) => u.name === value);
          return {
            ...item,
            unit_name: selectedUnit ? selectedUnit.name : value,
            ratio: selectedUnit ? selectedUnit.ratio : 1,
          };
        }
        return { ...item, [field]: Number(value) >= 0 ? Number(value) : 0 };
      })
    );
  };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);

  const handleSubmit = async (status) => {
    if (!selectedSupplierId) {
      toast('Vui lòng chọn nhà cung cấp', 'error');
      return;
    }
    if (items.length === 0) {
      toast('Vui lòng thêm ít nhất một sản phẩm', 'error');
      return;
    }
    const invalidItems = items.filter((item) => item.quantity <= 0);
    if (invalidItems.length > 0) {
      toast('Số lượng mỗi dòng phải lớn hơn 0', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payloadItems = items.map((item) => ({
        product_id: item.product._id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        unit_name: item.unit_name,
        ratio: item.ratio,
      }));

      await createGoodsReceipt({
        supplier_id: selectedSupplierId,
        reason,
        status,
        items: payloadItems,
        total_amount: totalAmount,
      });

      navigate(`${warehouseBase}/receipts`, {
        state: { success: 'Đã tạo phiếu nhập kho thành công' },
      });
    } catch (err) {
      toast(err.message || 'Không thể tạo phiếu nhập kho', 'error');
      setSubmitting(false);
    }
  };

  return (
    <StaffPageShell
      className="max-w-6xl pb-12"
      eyebrow="Luồng nhập chuẩn"
      eyebrowIcon={Sparkles}
      eyebrowTone="sky"
      title="Nhập hàng vào kho"
      subtitle="Ghi nhận hàng từ nhà cung cấp, thêm sản phẩm có sẵn hoặc đăng ký SKU mới chờ quản lý duyệt."
    >
      <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Building2 className="h-4 w-4 text-slate-500" />
            Thông tin chung
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Nhà cung cấp <span className="text-red-500">*</span>
              </label>
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">— Chọn nhà cung cấp —</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {s.phone ? ` · ${s.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Lý do nhập hàng
              </label>
              <input
                type="text"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Nhập lô hàng tháng 3..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <PackageSearch className="h-4 w-4 text-slate-500" />
              Thêm sản phẩm
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setShowProductModal(true)}>
              <ClipboardPlus className="h-4 w-4" />
              Đăng ký thông tin sản phẩm mới
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Tìm theo tên, SKU..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-sky-200 focus:ring-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchProducts()}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0"
              onClick={handleSearchProducts}
              disabled={searching}
            >
              {searching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang tìm
                </>
              ) : (
                'Tìm kiếm'
              )}
            </Button>
          </div>

          {products.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/40">
              {productsPickList.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">
                  Tất cả sản phẩm tìm được đã được thêm vào phiếu.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {productsPickList.map((p) => (
                    <li
                      key={p._id}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-white"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">SKU: {p.sku}</p>
                      </div>
                      <Button type="button" size="default" className="shrink-0 gap-1" onClick={() => handleAddProduct(p)}>
                        <Plus className="h-4 w-4" />
                        Thêm
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-800">Danh sách sản phẩm nhập</h2>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
              Chưa có sản phẩm. Hãy tìm và thêm từ kho hiện có hoặc đăng ký sản phẩm mới.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-3 py-2">Sản phẩm</th>
                      <th className="px-3 py-2">SL</th>
                      <th className="px-3 py-2">Đơn giá (đ)</th>
                      <th className="px-3 py-2 text-right">Thành tiền</th>
                      <th className="w-10 px-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.product._id} className="bg-white">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{item.product.name}</div>
                          <select
                            className="mt-1 max-w-[200px] rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            value={item.unit_name}
                            onChange={(e) => handleItemChange(item.product._id, 'unit', e.target.value)}
                          >
                            {item.product.selling_units && item.product.selling_units.length > 0 ? (
                              item.product.selling_units.map((u) => (
                                <option key={u.name} value={u.name}>
                                  {u.name} (×{u.ratio})
                                </option>
                              ))
                            ) : (
                              <option value={item.product.base_unit || 'Cái'}>
                                {item.product.base_unit || 'Cái'} (×1)
                              </option>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.product._id, 'quantity', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            className="w-28 rounded-lg border border-slate-200 px-2 py-1.5"
                            value={item.unit_cost}
                            onChange={(e) => handleItemChange(item.product._id, 'unit_cost', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {(item.quantity * item.unit_cost).toLocaleString('vi-VN')}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            className={cn(
                              'inline-flex rounded-lg p-2 text-red-600 transition hover:bg-red-50',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300'
                            )}
                            title="Xóa dòng"
                            onClick={() => handleRemoveItem(item.product._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-lg font-bold text-slate-900">
                  Tổng cộng:{' '}
                  <span className="text-emerald-700">{totalAmount.toLocaleString('vi-VN')} đ</span>
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => navigate(`${warehouseBase}/receipts`)}>
                    Hủy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSubmit('draft')}
                    disabled={submitting}
                  >
                    Lưu nháp
                  </Button>
                  <Button type="button" onClick={() => handleSubmit('pending')} disabled={submitting}>
                    {submitting ? 'Đang xử lý...' : 'Gửi yêu cầu duyệt'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {showProductModal && (
        <WarehouseProductCreateModal
          onClose={() => setShowProductModal(false)}
          onSuccess={() => {
            setShowProductModal(false);
            toast('Đã gửi yêu cầu tạo sản phẩm. Vui lòng chờ quản lý phê duyệt.', 'success');
          }}
        />
      )}
    </StaffPageShell>
  );
}
