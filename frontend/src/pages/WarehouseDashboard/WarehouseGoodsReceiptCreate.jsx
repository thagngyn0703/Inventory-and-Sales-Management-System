import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWarehouseBase } from '../../utils/useWarehouseBase';
import { getProducts, getProductUnits, scanProductByCode } from '../../services/productsApi';
import { createSupplier, getSuppliers } from '../../services/suppliersApi';
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
  ScanLine,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function WarehouseGoodsReceiptCreate() {
  const navigate = useNavigate();
  const warehouseBase = useWarehouseBase();
  const { toast } = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '' });
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [reason, setReason] = useState('');

  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [scanMode, setScanMode] = useState(false);

  const [items, setItems] = useState([]);
  const [unitMapByProduct, setUnitMapByProduct] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const searchReqSeqRef = useRef(0);
  const submitLockRef = useRef(false);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef(null);

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

  const runSearchProducts = useCallback(async (rawKeyword, opts = {}) => {
    const keyword = String(rawKeyword || '').trim();
    const showEmptyToast = Boolean(opts.showEmptyToast);
    if (!keyword) {
      setProducts([]);
      return;
    }
    const reqSeq = ++searchReqSeqRef.current;
    setSearching(true);
    try {
      const data = await getProducts(1, 20, keyword);
      if (reqSeq !== searchReqSeqRef.current) return;
      const list = data.products || [];
      setProducts(list);
      if (list.length === 0 && showEmptyToast) toast('Không tìm thấy sản phẩm', 'info');
    } catch (e) {
      if (reqSeq === searchReqSeqRef.current) {
        toast(e.message || 'Lỗi tìm kiếm sản phẩm', 'error');
      }
    } finally {
      if (reqSeq === searchReqSeqRef.current) setSearching(false);
    }
  }, [toast]);

  // Realtime search: gõ ký tự là lọc ngay (debounce 250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      runSearchProducts(search, { showEmptyToast: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [search, runSearchProducts]);

  const handleSearchProducts = useCallback(() => {
    runSearchProducts(search, { showEmptyToast: true });
  }, [runSearchProducts, search]);

  /** Đơn giá theo đơn vị dòng = giá gốc (theo đơn vị cơ sở trên hệ thống) × HSQĐ — khớp cách tính trên hóa đơn NCC. */
  const unitCostFromBaseCost = (product, ratio) => {
    const base = Number(product?.cost_price) || 0;
    const r = Number(ratio) > 0 ? Number(ratio) : 1;
    return Math.round(base * r * 100) / 100;
  };

  const ensureUnitsLoaded = useCallback(async (product) => {
    const pid = String(product?._id || '');
    if (!pid) return [];
    if (unitMapByProduct[pid]) return unitMapByProduct[pid];
    try {
      const units = await getProductUnits(pid);
      const normalized = (units || []).sort(
        (a, b) => Number(a.exchange_value || 0) - Number(b.exchange_value || 0)
      );
      setUnitMapByProduct((prev) => ({ ...prev, [pid]: normalized }));
      return normalized;
    } catch (_) {
      return [];
    }
  }, [unitMapByProduct]);

  const handleAddProduct = async (product) => {
    if (addedIds.has(product._id)) {
      toast('Sản phẩm đã có trong danh sách nhập', 'info');
      return;
    }
    const units = await ensureUnitsLoaded(product);
    if (!units || units.length === 0) {
      toast('Sản phẩm chưa được cấu hình đơn vị bán. Vui lòng quản lý cập nhật đơn vị trước.', 'error');
      return;
    }
    const baseUnit = units.find((u) => u.is_base) || units[0];
    if (!baseUnit?._id) {
      toast('Đơn vị cơ sở của sản phẩm chưa hợp lệ. Vui lòng kiểm tra cấu hình đơn vị.', 'error');
      return;
    }
    const defaultRatio = Number(baseUnit?.exchange_value) > 0 ? Number(baseUnit.exchange_value) : 1;
    const defaultUnitName = String(baseUnit?.unit_name || product.base_unit || 'Cái').trim();
    const lineUnitCost = unitCostFromBaseCost(product, defaultRatio);

    setItems((prev) => {
      if (prev.some((row) => String(row?.product?._id) === String(product._id))) {
        return prev;
      }
      return [
        ...prev,
        {
          product,
          unit_id: baseUnit?._id || null,
          quantity: 1,
          unit_cost: lineUnitCost,
          system_unit_cost: lineUnitCost,
          unit_name: defaultUnitName,
          ratio: defaultRatio,
          available_units: units,
          price_gap_note: '',
        },
      ];
    });
  };

  const handleScanSubmit = useCallback(async (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return;
    try {
      const found = await scanProductByCode(code);
      const product = found?.product || null;
      if (!product?._id) {
        toast('Không tìm thấy sản phẩm theo mã vừa quét', 'error');
        return;
      }
      await handleAddProduct(product);
      setSearch(code);
      setProducts((prev) => {
        const already = prev.some((p) => String(p._id) === String(product._id));
        return already ? prev : [product, ...prev];
      });
      const unitText = found?.unit?.unit_name ? ` (${found.unit.unit_name})` : '';
      toast(`Đã quét: ${product.name}${unitText}`, 'success');
    } catch (e) {
      toast(e.message || `Không tìm thấy sản phẩm với mã: ${code}`, 'error');
    }
  }, [handleAddProduct, toast]);

  useEffect(() => {
    if (!scanMode) return undefined;
    const onKeyDown = (e) => {
      if (['Shift', 'Alt', 'Control', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const code = scanBufferRef.current;
        scanBufferRef.current = '';
        if (scanTimerRef.current) {
          clearTimeout(scanTimerRef.current);
          scanTimerRef.current = null;
        }
        handleScanSubmit(code);
        return;
      }
      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => {
          scanBufferRef.current = '';
          scanTimerRef.current = null;
        }, 600);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      scanBufferRef.current = '';
    };
  }, [handleScanSubmit, scanMode]);

  const handleRemoveItem = (productId) => {
    setItems((prev) => prev.filter((item) => item.product._id !== productId));
  };

  const handleItemChange = (productId, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product._id !== productId) return item;
        if (field === 'unit') {
          const selectedUnit = (item.available_units || unitMapByProduct[String(item.product._id)] || [])
            .find((u) => String(u._id || '') === String(value || ''));
          const nextRatio = Number(selectedUnit?.exchange_value) > 0 ? Number(selectedUnit.exchange_value) : 1;
          const nextLineCost = unitCostFromBaseCost(item.product, nextRatio);
          return {
            ...item,
            unit_id: selectedUnit?._id || null,
            unit_name: selectedUnit ? selectedUnit.unit_name : item.unit_name,
            ratio: nextRatio,
            unit_cost: nextLineCost,
            system_unit_cost: nextLineCost,
          };
        }
        if (field === 'price_gap_note') return { ...item, price_gap_note: String(value || '') };
        return { ...item, [field]: Number(value) >= 0 ? Number(value) : 0 };
      })
    );
  };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);

  const handleCreateSupplier = useCallback(async () => {
    const name = String(newSupplier.name || '').trim();
    const phone = String(newSupplier.phone || '').trim();
    if (!name) {
      toast('Vui lòng nhập tên nhà cung cấp mới', 'error');
      return;
    }
    setCreatingSupplier(true);
    try {
      const created = await createSupplier({
        name,
        phone: phone || undefined,
        status: 'active',
      });
      setSuppliers((prev) => [created, ...prev.filter((s) => String(s._id) !== String(created._id))]);
      setSelectedSupplierId(created._id);
      setNewSupplier({ name: '', phone: '' });
      toast('Đã tạo nhà cung cấp mới và chọn tự động', 'success');
    } catch (e) {
      toast(e.message || 'Không thể tạo nhà cung cấp', 'error');
    } finally {
      setCreatingSupplier(false);
    }
  }, [newSupplier.name, newSupplier.phone, toast]);

  const handleSubmit = async (status) => {
    if (submitLockRef.current || submitting) return;
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
    const missingUnitItems = items.filter((item) => !item.unit_id);
    if (missingUnitItems.length > 0) {
      toast('Có dòng chưa chọn đơn vị nhập hợp lệ. Vui lòng chọn lại trước khi gửi.', 'error');
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const payloadItems = items.map((item) => ({
        product_id: item.product._id,
        unit_id: item.unit_id || null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        system_unit_cost: item.system_unit_cost,
        unit_name: item.unit_name,
        ratio: item.ratio,
        price_gap_note: item.price_gap_note,
      }));

      const idempotencyKey = `gr-create-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await createGoodsReceipt({
        supplier_id: selectedSupplierId,
        reason,
        status,
        items: payloadItems,
        total_amount: totalAmount,
      }, { idempotencyKey });

      navigate(`${warehouseBase}/receipts`, {
        state: { success: 'Đã tạo phiếu nhập kho thành công' },
      });
    } catch (err) {
      toast(err.message || 'Không thể tạo phiếu nhập kho', 'error');
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  return (
    <StaffPageShell
      className="max-w-6xl pb-12"
      eyebrow="Luồng nhập chuẩn"
      eyebrowIcon={Sparkles}
      eyebrowTone="sky"
      title="Nhập hàng vào kho"
      subtitle="Ghi nhận hàng từ nhà cung cấp. Giá trên phiếu hiển thị theo giá gốc (vốn) trên hệ thống theo đơn vị — quản lý sẽ chỉnh theo hóa đơn NCC khi duyệt."
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
                Tạo nhanh nhà cung cấp
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  type="text"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Tên NCC mới *"
                />
                <input
                  type="text"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="SĐT (tùy chọn)"
                />
                <Button type="button" variant="outline" className="h-11" onClick={handleCreateSupplier} disabled={creatingSupplier}>
                  {creatingSupplier ? 'Đang tạo...' : 'Tạo NCC & chọn'}
                </Button>
              </div>
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
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-12 text-sm outline-none ring-sky-200 focus:ring-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  setScanMode((prev) => {
                    const next = !prev;
                    if (!next) {
                      scanBufferRef.current = '';
                      if (scanTimerRef.current) {
                        clearTimeout(scanTimerRef.current);
                        scanTimerRef.current = null;
                      }
                    }
                    return next;
                  });
                }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md border p-1.5 transition ${
                  scanMode
                    ? 'border-sky-300 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
                title={scanMode ? 'Tắt chế độ quét mã' : 'Bật chế độ quét mã'}
                aria-label={scanMode ? 'Tắt chế độ quét mã' : 'Bật chế độ quét mã'}
              >
                <ScanLine className="h-4 w-4" />
              </button>
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
          {scanMode && (
            <p className="text-xs font-medium text-sky-700">
              Chế độ quét đang bật. Dùng máy quét barcode và nhấn Enter để tự thêm sản phẩm vào phiếu nhập.
            </p>
          )}

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
                      <th className="px-3 py-2">Giá gốc HS (đ)</th>
                      <th className="px-3 py-2 text-right">Thành tiền</th>
                      <th className="px-3 py-2">Ghi chú chênh lệch giá</th>
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
                            value={item.unit_id || ''}
                            onFocus={() => ensureUnitsLoaded(item.product).then((units) => {
                              setItems((prev) => prev.map((it) => (
                                it.product._id === item.product._id ? { ...it, available_units: units } : it
                              )));
                            })}
                            onChange={(e) => handleItemChange(item.product._id, 'unit', e.target.value)}
                          >
                            {(item.available_units && item.available_units.length > 0 ? item.available_units : []).map((u) => (
                                <option key={String(u._id || u.unit_name)} value={u._id || ''}>
                                  {u.unit_name} (×{u.exchange_value})
                                </option>
                              ))}
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
                            type="text"
                            className="w-32 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700"
                            value={Number(item.unit_cost || 0).toLocaleString('vi-VN')}
                            readOnly
                            title="Giá gốc theo đơn vị = giá gốc sản phẩm × hệ số quy đổi. Chỉ quản lý được sửa khi duyệt."
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {(item.quantity * item.unit_cost).toLocaleString('vi-VN')}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className="w-full min-w-[220px] rounded-lg border border-amber-200 bg-amber-50/50 px-2 py-1.5 text-xs"
                            placeholder="VD: NCC báo giá thay đổi, cần manager kiểm tra"
                            value={item.price_gap_note || ''}
                            onChange={(e) => handleItemChange(item.product._id, 'price_gap_note', e.target.value)}
                          />
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
