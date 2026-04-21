import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Platform } from 'react-bits/lib/modules/Platform';
import { Search, Plus, X, Barcode } from 'lucide-react';
import { createProductRequest, getProducts, uploadProductImages } from '../../services/productsApi';
import { getSuppliers } from '../../services/suppliersApi';
import { minExpiryDateString, isExpiryDateNotInPast } from '../../utils/dateInput';
import {
  trimString,
  validateBarcode,
  validateNoSpecialText,
  validateRequiredText,
  validateNonNegativeNumber,
  validateSku,
} from '../../utils/productValidation';
import { formatCurrencyInput, parseCurrencyInput, toCurrencyInputFromNumber } from '../../utils/currencyInput';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { InlineNotice } from '../../components/ui/inline-notice';

const PRODUCT_BASE_UNITS = ['Cái', 'Chai', 'Lon', 'Thùng', 'Hộp', 'Kg', 'Gói', 'Lít'];

const defaultSellingUnit = () => ({ name: 'Cái', ratio: 1, sale_price: '', barcode: '' });

const createDefaultForm = () => ({
  name: '',
  sku: '',
  barcode: '',
  supplier_id: '',
  cost_price: '',
  stock_qty: '',
  reorder_level: '',
  expiry_date: '',
  base_unit: 'Cái',
  selling_units: [defaultSellingUnit()],
  note: '',
});

export default function WarehouseProductCreateModal({ onClose, onSuccess }) {
  const { toast } = useToast();
  const [form, setForm] = useState(createDefaultForm());
  const [suppliers, setSuppliers] = useState([]);
  const [existingProducts, setExistingProducts] = useState([]);
  const [selectedExistingId, setSelectedExistingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [quickSearch, setQuickSearch] = useState('');
  const [scanMode, setScanMode] = useState(false);
  const [scanConfirmOpen, setScanConfirmOpen] = useState(false);
  const [pendingScanCode, setPendingScanCode] = useState('');
  const [existingMatch, setExistingMatch] = useState(null);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getSuppliers()
      .then((list) => {
        if (!cancelled) setSuppliers(list || []);
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getProducts(1, 1000)
      .then((data) => {
        if (!cancelled) setExistingProducts(data.products || []);
      })
      .catch(() => {
        if (!cancelled) setExistingProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [imagePreviews]);

  useEffect(() => {
    if (!scanMode) return;
    const flushScanBuffer = () => {
      const raw = scanBufferRef.current;
      scanBufferRef.current = '';
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      const code = String(raw || '').trim();
      if (!code) return;
      setScanMode(false);
      const found = existingProducts.find(
        (p) => String(p.barcode || '').trim().toLowerCase() === code.toLowerCase()
      );
      if (found) {
        fillFromExisting(found._id);
        setError('');
        toast(`Đã điền nhanh: ${found.name}`, 'success');
        return;
      }
      setPendingScanCode(code);
      setScanConfirmOpen(true);
    };
    const onKeyDown = (e) => {
      if (['Shift', 'Alt', 'Control', 'Meta', 'CapsLock', 'Escape'].includes(e.key)) return;
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        flushScanBuffer();
        return;
      }
      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => {
          flushScanBuffer();
        }, 180);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [scanMode, existingProducts, toast]);

  const filteredExistingProducts = useMemo(() => {
    const term = String(quickSearch || '').trim().toLowerCase();
    if (!term) return existingProducts;
    return existingProducts.filter(
      (p) =>
        String(p.name || '')
          .toLowerCase()
          .includes(term) ||
        String(p.sku || '')
          .toLowerCase()
          .includes(term) ||
        String(p.barcode || '')
          .toLowerCase()
          .includes(term)
    );
  }, [existingProducts, quickSearch]);

  const quickFillHint = Platform.select({
    web: 'Sửa SKU/tên sau khi điền nhanh để tạo yêu cầu sản phẩm mới (không trùng hàng đã có).',
    default: 'Điền nhanh từ mẫu, sau đó chỉnh lại thông tin gửi duyệt.',
  });

  const update = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'base_unit') {
        next.selling_units = prev.selling_units.map((u) =>
          Number(u.ratio) === 1 ? { ...u, name: value } : u
        );
      }
      return next;
    });
    setError('');
  };

  const updateSellingUnit = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      selling_units: prev.selling_units.map((u, i) => (i === index ? { ...u, [field]: value } : u)),
    }));
    setError('');
  };

  const addSellingUnit = () => {
    setForm((prev) => ({
      ...prev,
      selling_units: [...prev.selling_units, { name: prev.base_unit || 'Cái', ratio: '', sale_price: '', barcode: '' }],
    }));
  };

  const removeSellingUnit = (index) => {
    setForm((prev) => {
      const next = prev.selling_units.filter((_, i) => i !== index);
      const hasBase = next.some((u) => Number(u.ratio) === 1);
      if (!hasBase && next.length > 0) {
        next[0].ratio = 1;
      }
      return { ...prev, selling_units: next.length ? next : [defaultSellingUnit()] };
    });
  };

  const handleSelectImages = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 3) {
      setSelectedImages([]);
      setImagePreviews([]);
      if (e.target) e.target.value = '';
      setError('Chỉ được chọn tối đa 3 ảnh.');
      return;
    }
    setSelectedImages(files);
    setImagePreviews(files.map((f) => URL.createObjectURL(f)));
    setError('');
  };

  const fillFromExisting = (productId) => {
    setSelectedExistingId(productId);
    const p = existingProducts.find((x) => x._id === productId);
    if (!p) {
      setForm(createDefaultForm());
      setSelectedImages([]);
      setImagePreviews([]);
      setError('');
      return;
    }
    setForm((prev) => ({
      ...prev,
      name: p.name || prev.name,
      sku: '',
      barcode: p.barcode || '',
      supplier_id: typeof p.supplier_id === 'object' ? p.supplier_id?._id || '' : p.supplier_id || '',
      cost_price: p.cost_price != null ? toCurrencyInputFromNumber(p.cost_price) : prev.cost_price,
      expiry_date: (() => {
        if (!p.expiry_date) return '';
        const s = new Date(p.expiry_date).toISOString().slice(0, 10);
        return s < minExpiryDateString() ? '' : s;
      })(),
      base_unit: p.base_unit || prev.base_unit,
      selling_units:
        Array.isArray(p.selling_units) && p.selling_units.length > 0
          ? p.selling_units.map((u) => ({
              name: u.name || p.base_unit || 'Cái',
              ratio: u.ratio != null ? u.ratio : 1,
              sale_price: u.sale_price != null ? toCurrencyInputFromNumber(u.sale_price) : '',
              barcode: '',
            }))
          : prev.selling_units,
      note: prev.note,
    }));
    setSelectedImages([]);
    setImagePreviews([]);
    setError('');
  };

  const handleQuickSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const term = String(quickSearch || '').trim().toLowerCase();
    if (!term) {
      setError('Vui lòng nhập tên/SKU/barcode để tìm nhanh.');
      return;
    }
    const exact = existingProducts.find(
      (p) =>
        String(p.name || '').toLowerCase() === term ||
        String(p.sku || '').toLowerCase() === term ||
        String(p.barcode || '').toLowerCase() === term
    );
    const target = exact || filteredExistingProducts[0];
    if (!target) {
      setError('Không tìm thấy sản phẩm phù hợp để điền nhanh.');
      return;
    }
    fillFromExisting(target._id);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setExistingMatch(null);
    const nameCheck = validateRequiredText(form.name, 'Tên sản phẩm');
    if (!nameCheck.ok) {
      setError(nameCheck.message);
      return;
    }
    const skuCheck = validateSku(form.sku);
    if (!skuCheck.ok) {
      setError(skuCheck.message);
      return;
    }
    const barcodeCheck = validateBarcode(form.barcode);
    if (!barcodeCheck.ok) {
      setError(barcodeCheck.message);
      return;
    }
    const baseUnitCheck = validateNoSpecialText(form.base_unit, 'Đơn vị tồn kho', { required: true });
    if (!baseUnitCheck.ok) {
      setError(baseUnitCheck.message);
      return;
    }
    const costCheck = validateNonNegativeNumber(parseCurrencyInput(form.cost_price), 'Giá vốn');
    if (!costCheck.ok) {
      setError(costCheck.message);
      return;
    }
    const stockCheck = validateNonNegativeNumber(form.stock_qty, 'Tồn kho');
    if (!stockCheck.ok) {
      setError(stockCheck.message);
      return;
    }
    const reorderCheck = validateNonNegativeNumber(form.reorder_level, 'Mức tồn tối thiểu');
    if (!reorderCheck.ok) {
      setError(reorderCheck.message);
      return;
    }
    const units = [];
    for (const u of form.selling_units) {
      const nameUnitCheck = validateNoSpecialText(u.name, 'Tên đơn vị bán', { required: true });
      if (!nameUnitCheck.ok) {
        setError(nameUnitCheck.message);
        return;
      }
      const ratioCheck = validateNonNegativeNumber(u.ratio, 'Tỉ lệ đơn vị bán', { required: true });
      if (!ratioCheck.ok || ratioCheck.value <= 0) {
        setError('Tỉ lệ đơn vị bán phải lớn hơn 0.');
        return;
      }
      const salePriceCheck = validateNonNegativeNumber(parseCurrencyInput(u.sale_price), 'Giá bán đơn vị', { required: true });
      if (!salePriceCheck.ok) {
        setError(salePriceCheck.message);
        return;
      }
      units.push({
        name: nameUnitCheck.value,
        ratio: ratioCheck.value,
        sale_price: salePriceCheck.value,
        barcode: trimString(u.barcode || ''),
      });
    }
    if (units.length === 0) {
      setError('Vui lòng thêm ít nhất một đơn vị bán với giá.');
      return;
    }
    const hasBase = units.some((u) => u.ratio === 1);
    if (!hasBase) {
      units.unshift({
        name: form.base_unit || 'Cái',
        ratio: 1,
        sale_price: units[0]?.sale_price ?? 0,
        barcode: barcodeCheck.value || '',
      });
    }
    const seenUnitNames = new Set();
    const seenUnitBarcodes = new Set();
    for (const u of units) {
      const unitKey = String(u.name || '').trim().toLowerCase();
      if (seenUnitNames.has(unitKey)) {
        setError(`Đơn vị "${u.name}" bị trùng trên cùng sản phẩm.`);
        return;
      }
      seenUnitNames.add(unitKey);
      const unitBarcodeCheck = validateBarcode(u.barcode || '');
      if (!unitBarcodeCheck.ok) {
        setError(`${u.name}: ${unitBarcodeCheck.message}`);
        return;
      }
      const ub = unitBarcodeCheck.value || '';
      if (ub) {
        if (seenUnitBarcodes.has(ub)) {
          setError(`Barcode "${ub}" bị trùng giữa các đơn vị.`);
          return;
        }
        seenUnitBarcodes.add(ub);
      }
      u.barcode = ub || undefined;
    }

    const normalizedName = String(nameCheck.value || '').trim().toLowerCase();
    const normalizedSku = String(skuCheck.value || '').trim().toLowerCase();
    const normalizedBarcode = String(barcodeCheck.value || '').trim().toLowerCase();
    const duplicate = (existingProducts || []).find((p) => {
      const pName = String(p?.name || '').trim().toLowerCase();
      const pSku = String(p?.sku || '').trim().toLowerCase();
      const pBarcode = String(p?.barcode || '').trim().toLowerCase();
      if (normalizedBarcode && pBarcode && pBarcode === normalizedBarcode) return true;
      if (normalizedSku && pSku && pSku === normalizedSku) return true;
      if (normalizedName && pName && pName === normalizedName) return true;
      return false;
    });
    if (duplicate) {
      setExistingMatch(duplicate);
      setError(
        `Sản phẩm "${duplicate.name}" đã tồn tại. Theo SOP, hãy nhập hàng trên sản phẩm đã có thay vì tạo yêu cầu mới.`
      );
      return;
    }
    if (form.expiry_date && !isExpiryDateNotInPast(form.expiry_date)) {
      setError('Ngày hết hạn phải từ hôm nay trở đi.');
      return;
    }
    if (selectedImages.length > 3) {
      setError('Chỉ được chọn tối đa 3 ảnh.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      let image_urls = [];
      if (selectedImages.length > 0) {
        image_urls = await uploadProductImages(selectedImages);
      }
      await createProductRequest({
        name: nameCheck.value,
        sku: skuCheck.value,
        barcode: barcodeCheck.value || undefined,
        supplier_id: trimString(form.supplier_id) || undefined,
        cost_price: costCheck.value,
        stock_qty: stockCheck.value,
        reorder_level: reorderCheck.value,
        expiry_date: form.expiry_date || undefined,
        base_unit: baseUnitCheck.value,
        selling_units: units,
        image_urls: image_urls.length ? image_urls : undefined,
        note: trimString(form.note) || undefined,
      });
      onSuccess?.();
    } catch (err) {
      const msg = err.message || 'Không thể gửi yêu cầu tạo sản phẩm.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[7000] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="relative my-6 w-full max-w-4xl rounded-2xl border border-slate-200/80 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Đăng ký sản phẩm mới</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Gửi yêu cầu chờ quản lý duyệt — có thể đính kèm vào phiếu nhập sau khi được chấp nhận.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(78vh,720px)] overflow-y-auto px-5 py-4">
          <InlineNotice message={error} type="error" className="mb-4" />

          <form id="warehouse-product-request-form" onSubmit={handleSubmit} className="space-y-4">
            <Card className="border-slate-200/80">
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Điền nhanh từ sản phẩm có sẵn</h3>
                  {selectedExistingId ? (
                    <Badge className="bg-violet-100 text-violet-800">Đang dùng mẫu</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-600">Không chọn mẫu</Badge>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={quickSearch}
                      onChange={(e) => setQuickSearch(e.target.value)}
                      onKeyDown={handleQuickSearchKeyDown}
                      placeholder="Tìm theo tên, SKU, barcode..."
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none ring-sky-200 focus:ring-2"
                    />
                  </div>
                  <select
                    value={selectedExistingId}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        setSelectedExistingId('');
                        setForm(createDefaultForm());
                        setSelectedImages([]);
                        setImagePreviews([]);
                        setError('');
                        return;
                      }
                      fillFromExisting(v);
                    }}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                  >
                    <option value="">— Không chọn —</option>
                    {filteredExistingProducts.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} — {p.sku}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-500">{quickFillHint}</p>
                {existingMatch && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <div>
                      Trùng với sản phẩm hiện có: <strong>{existingMatch.name}</strong> (SKU: {existingMatch.sku || '—'}).
                    </div>
                    <div className="mt-1">
                      Vui lòng đóng form này và dùng màn nhập hàng để cộng thêm số lượng theo đúng SOP.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200/80">
              <CardContent className="space-y-2 py-4">
                <h3 className="text-sm font-semibold text-slate-800">SOP chuẩn cho cả Staff và Manager</h3>
                <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
                  <li>Tạo sản phẩm một lần duy nhất cho mỗi mặt hàng.</li>
                  <li>Khai báo đủ đơn vị bán và barcode riêng cho từng đơn vị (lon/thùng/...)</li>
                  <li>Nhập hàng theo đơn vị thực tế, hệ thống tự quy đổi về đơn vị gốc.</li>
                  <li>Các lần sau chỉ nhập hàng trên sản phẩm đã có, không tạo yêu cầu mới trùng.</li>
                  <li>Chỉ tạo thêm đơn vị khi có quy cách đóng gói mới từ nhà cung cấp.</li>
                </ol>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-12">
              <Card className="xl:col-span-8">
                <CardContent className="space-y-4 py-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Thông tin chung</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Tên sản phẩm *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => update('name', e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                        placeholder="Tên hiển thị"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">SKU *</label>
                      <input
                        type="text"
                        value={form.sku}
                        onChange={(e) => {
                          update('sku', e.target.value);
                          setSelectedExistingId('');
                        }}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                        placeholder="Mã SKU mới (duy nhất)"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Barcode</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={form.barcode}
                          onChange={(e) => update('barcode', e.target.value)}
                          placeholder="Mã vạch (số)"
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-11 text-sm outline-none ring-sky-200 focus:ring-2"
                        />
                        <button
                          type="button"
                          title={scanMode ? 'Tắt quét mã' : 'Bật quét mã vạch'}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            setScanMode((v) => !v);
                            scanBufferRef.current = '';
                          }}
                          className={`absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                            scanMode
                              ? 'border-sky-300 bg-sky-100 text-sky-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <Barcode className="h-4 w-4" />
                        </button>
                      </div>
                      {scanMode && (
                        <p className="mt-1 text-xs font-semibold text-sky-700">Đang bật chế độ quét mã vạch.</p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Nhà cung cấp</label>
                      <select
                        value={form.supplier_id}
                        onChange={(e) => update('supplier_id', e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                      >
                        <option value="">— Không chọn —</option>
                        {suppliers.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.name}
                            {s.phone ? ` — ${s.phone}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="xl:col-span-4">
                <CardContent className="py-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Đơn vị bán</h3>
                    <Button type="button" variant="outline" size="default" className="h-9 gap-1 text-xs" onClick={addSellingUnit}>
                      <Plus className="h-3.5 w-3.5" />
                      Thêm
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                          <th className="py-2 pr-2">Đơn vị</th>
                          <th className="py-2 pr-2">Tỉ lệ</th>
                          <th className="py-2 pr-2">Giá bán</th>
                          <th className="py-2 pr-2">Barcode</th>
                          <th className="py-2 text-right"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.selling_units.map((u, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-2 pr-2">
                              <input
                                type="text"
                                value={u.name}
                                onChange={(e) => updateSellingUnit(i, 'name', e.target.value)}
                                className="h-9 w-full min-w-[72px] rounded-lg border border-slate-200 px-2 text-sm"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                min="1"
                                step="any"
                                value={u.ratio}
                                onChange={(e) => updateSellingUnit(i, 'ratio', e.target.value)}
                                className="h-9 w-full min-w-[56px] rounded-lg border border-slate-200 px-2 text-sm"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={u.sale_price}
                                onChange={(e) => updateSellingUnit(i, 'sale_price', formatCurrencyInput(e.target.value))}
                                className="h-9 w-full min-w-[80px] rounded-lg border border-slate-200 px-2 text-sm"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="text"
                                value={u.barcode || ''}
                                onChange={(e) => updateSellingUnit(i, 'barcode', e.target.value)}
                                className="h-9 w-full min-w-[110px] rounded-lg border border-slate-200 px-2 text-sm"
                                placeholder="Mã vạch đơn vị"
                              />
                            </td>
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeSellingUnit(i)}
                                disabled={form.selling_units.length <= 1}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card className="xl:col-span-8">
                <CardContent className="space-y-4 py-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Giá &amp; tồn kho</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Đơn vị tồn kho</label>
                      <select
                        value={form.base_unit}
                        onChange={(e) => update('base_unit', e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                      >
                        {PRODUCT_BASE_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Giá vốn (₫) / đơn vị gốc</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.cost_price}
                        onChange={(e) => setForm((prev) => ({ ...prev, cost_price: formatCurrencyInput(e.target.value) }))}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Tồn kho đề xuất</label>
                      <input
                        type="number"
                        min="0"
                        value={form.stock_qty}
                        onChange={(e) => update('stock_qty', e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Mức tồn tối thiểu</label>
                      <input
                        type="number"
                        min="0"
                        value={form.reorder_level}
                        onChange={(e) => update('reorder_level', e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-slate-700">Hạn sử dụng</label>
                      <input
                        type="date"
                        min={minExpiryDateString()}
                        value={form.expiry_date}
                        onChange={(e) => update('expiry_date', e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 focus:ring-2"
                      />
                      <p className="mt-1 text-xs text-slate-500">Chỉ chọn ngày từ hôm nay trở đi.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="xl:col-span-4">
                <CardContent className="space-y-4 py-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Ảnh &amp; ghi chú</h3>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Ảnh (tối đa 3)</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleSelectImages}
                      className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600"
                    />
                  </div>
                  {(imagePreviews.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {imagePreviews.slice(0, 3).map((url, idx) => (
                        <img
                          key={`${url}-${idx}`}
                          src={url}
                          alt=""
                          className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Ghi chú cho quản lý</label>
                    <textarea
                      rows={3}
                      value={form.note}
                      onChange={(e) => update('note', e.target.value)}
                      placeholder="VD: Cần duyệt gấp để nhập kho..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </form>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button type="submit" form="warehouse-product-request-form" disabled={loading}>
            {loading ? 'Đang gửi...' : 'Gửi yêu cầu'}
          </Button>
        </div>
      </div>

      {scanConfirmOpen && (
        <div className="fixed inset-0 z-[7100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Mã chưa có trong hệ thống</h3>
            <p className="mt-2 text-sm text-slate-600">
              Barcode <span className="font-semibold text-slate-900">{pendingScanCode}</span> chưa tồn tại. Dùng mã này
              cho sản phẩm mới?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setScanConfirmOpen(false);
                  setPendingScanCode('');
                }}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={() => {
                  update('barcode', pendingScanCode);
                  setScanConfirmOpen(false);
                  setPendingScanCode('');
                  toast('Đã điền barcode từ mã quét.', 'success');
                }}
              >
                Đồng ý
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
