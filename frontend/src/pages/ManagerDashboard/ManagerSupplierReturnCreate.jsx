import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { InlineNotice } from '../../components/ui/inline-notice';
import { createSupplierReturn, getSuppliers } from '../../services/suppliersApi';
import { getProducts } from '../../services/productsApi';

export default function ManagerSupplierReturnCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    supplier_id: '',
    return_date: new Date().toISOString().slice(0, 10),
    reason: 'Trả hàng nhà cung cấp',
    reference_code: '',
    note: '',
    items: [{ product_id: '', quantity: '1' }],
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingSuppliers(true);
      setError('');
      try {
        const data = await getSuppliers(1, 1000, '', 'active');
        if (!mounted) return;
        const list = data?.suppliers || [];
        setSuppliers(list);
        const supplierIdFromQuery = searchParams.get('supplier_id') || '';
        if (supplierIdFromQuery && list.some((s) => String(s._id) === supplierIdFromQuery)) {
          setForm((prev) => ({ ...prev, supplier_id: supplierIdFromQuery }));
        }
      } catch (e) {
        if (mounted) setError(e.message || 'Không thể tải danh sách nhà cung cấp.');
      } finally {
        if (mounted) setLoadingSuppliers(false);
      }
    })();
    return () => { mounted = false; };
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingProducts(true);
      try {
        const data = await getProducts(1, 500, '');
        if (!mounted) return;
        setProducts(data?.products || []);
      } catch (e) {
        if (mounted) setError(e.message || 'Không thể tải danh sách sản phẩm.');
      } finally {
        if (mounted) setLoadingProducts(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => String(s._id) === String(form.supplier_id)) || null,
    [suppliers, form.supplier_id]
  );

  const availableProducts = useMemo(
    () =>
      products.filter((p) => {
        if (Number(p?.stock_qty || 0) <= 0) return false;
        if (!form.supplier_id) return true;
        return String(p?.supplier_id || '') === String(form.supplier_id);
      }),
    [products, form.supplier_id]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.supplier_id) {
      setError('Vui lòng chọn nhà cung cấp.');
      return;
    }
    if (!Array.isArray(form.items) || form.items.length === 0) {
      setError('Vui lòng thêm ít nhất 1 sản phẩm trả NCC.');
      return;
    }
    const normalizedItems = [];
    for (const item of form.items) {
      if (!item.product_id) {
        setError('Vui lòng chọn sản phẩm cho từng dòng.');
        return;
      }
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) {
        setError('Số lượng trả phải lớn hơn 0.');
        return;
      }
      const product = availableProducts.find((p) => String(p._id) === String(item.product_id));
      if (!product) {
        setError('Sản phẩm không hợp lệ hoặc không thuộc nhà cung cấp đã chọn.');
        return;
      }
      if (qty > Number(product.stock_qty || 0)) {
        setError(`Sản phẩm ${product.name} không đủ tồn kho để trả.`);
        return;
      }
      normalizedItems.push({ product_id: item.product_id, quantity: qty });
    }

    setSubmitting(true);
    try {
      const data = await createSupplierReturn(form.supplier_id, {
        items: normalizedItems,
        return_date: form.return_date || undefined,
        reason: form.reason || undefined,
        reference_code: form.reference_code || undefined,
        note: form.note || undefined,
      });
      const createdId = data?.supplier_return?._id;
      if (createdId) {
        navigate(`/manager/supplier-returns/${createdId}`);
        return;
      }
      navigate('/manager/supplier-returns');
    } catch (e) {
      setError(e.message || 'Không thể tạo phiếu trả NCC.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ManagerPageFrame showNotificationBell={false}>
      <StaffPageShell
        eyebrow="Mua hàng & NCC"
        eyebrowIcon={RotateCcw}
        title="Tạo phiếu trả nhà cung cấp"
        subtitle={selectedSupplier?.name || 'Ghi nhận trả hàng để giảm công nợ NCC'}
      >
        <InlineNotice message={error} type="error" className="mb-3" />
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Nhà cung cấp <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.supplier_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_id: e.target.value }))}
                  disabled={loadingSuppliers || submitting}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">{loadingSuppliers ? 'Đang tải...' : 'Chọn nhà cung cấp'}</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Ngày trả</label>
                <input
                  type="date"
                  value={form.return_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, return_date: e.target.value }))}
                  disabled={submitting}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                />
              </div>

              <div className="md:col-span-2 rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Sản phẩm trả NCC</label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() =>
                      setForm((prev) => ({ ...prev, items: [...prev.items, { product_id: '', quantity: '1' }] }))
                    }
                  >
                    Thêm dòng
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.items.map((row, idx) => (
                    <div key={`return-item-${idx}`} className="grid gap-2 md:grid-cols-[1fr_160px_80px]">
                      <select
                        value={row.product_id}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            items: prev.items.map((it, i) => (i === idx ? { ...it, product_id: v } : it)),
                          }));
                        }}
                        disabled={submitting || loadingProducts}
                        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                      >
                        <option value="">
                          {loadingProducts ? 'Đang tải sản phẩm...' : 'Chọn sản phẩm trong kho'}
                        </option>
                        {availableProducts.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} ({Number(p.stock_qty || 0).toLocaleString('vi-VN')} tồn)
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row.quantity}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            items: prev.items.map((it, i) => (i === idx ? { ...it, quantity: e.target.value } : it)),
                          }))
                        }
                        disabled={submitting}
                        placeholder="Số lượng"
                        className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={submitting || form.items.length === 1}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            items: prev.items.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        Xóa
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Lý do</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                  disabled={submitting}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Mã tham chiếu</label>
                <input
                  type="text"
                  value={form.reference_code}
                  onChange={(e) => setForm((prev) => ({ ...prev, reference_code: e.target.value }))}
                  disabled={submitting}
                  placeholder="Tuỳ chọn"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Ghi chú</label>
                <textarea
                  rows={4}
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  disabled={submitting}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/manager/supplier-returns')}
                  disabled={submitting}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={submitting || loadingSuppliers}>
                  {submitting ? 'Đang lưu...' : 'Tạo phiếu trả NCC'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
