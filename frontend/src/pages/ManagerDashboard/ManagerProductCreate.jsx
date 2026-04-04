import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import { Search, Plus, X, Barcode, Package } from 'lucide-react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { createProduct, getProducts, updateProduct, uploadProductImages } from '../../services/productsApi';
import { minExpiryDateString, isExpiryDateNotInPast } from '../../utils/dateInput';
import {
    trimString,
    validateBarcode,
    validateNoSpecialText,
    validateNonNegativeNumber,
    validateSku,
} from '../../utils/productValidation';
import { getSuppliers } from '../../services/suppliersApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const PRODUCT_BASE_UNITS = ['Cái', 'Chai', 'Lon', 'Thùng', 'Hộp', 'Kg', 'Gói', 'Lít'];

const defaultSellingUnit = () => ({ name: 'Cái', ratio: 1, sale_price: '' });

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
    image_urls: [],
    status: 'active',
});

export default function ManagerProductCreate() {
    const navigate = useNavigate();
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
    const [toast, setToast] = useState(null);
    const scanBufferRef = useRef('');
    const scanTimerRef = useRef(null);
    const toastTimerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        getSuppliers()
            .then((list) => { if (!cancelled) setSuppliers(list || []); })
            .catch(() => { if (!cancelled) setSuppliers([]); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        getProducts(1, 1000)
            .then((data) => { if (!cancelled) setExistingProducts(data.products || []); })
            .catch(() => { if (!cancelled) setExistingProducts([]); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        return () => {
            imagePreviews.forEach((url) => URL.revokeObjectURL(url));
            if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        };
    }, [imagePreviews]);

    const showToast = (type, message) => {
        if (!message) return;
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ type, message });
        toastTimerRef.current = setTimeout(() => setToast(null), 2800);
    };

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
                showToast('success', `Da dien nhanh: ${found.name}`);
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
    }, [scanMode, existingProducts]);

    const filteredExistingProducts = useMemo(() => {
        const term = String(quickSearch || '').trim().toLowerCase();
        if (!term) return existingProducts;
        return existingProducts.filter((p) =>
            String(p.name || '').toLowerCase().includes(term) ||
            String(p.sku || '').toLowerCase().includes(term) ||
            String(p.barcode || '').toLowerCase().includes(term)
        );
    }, [existingProducts, quickSearch]);
    const quickFillHint = Platform.select({
        web: 'Khi bạn sửa tên/SKU/barcode sau khi chọn mẫu, hệ thống sẽ tự chuyển về trạng thái không chọn để tránh nhầm sản phẩm gốc.',
        default: 'Sửa thông tin sau khi điền nhanh để tạo sản phẩm mới.',
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
            selling_units: prev.selling_units.map((u, i) =>
                i === index ? { ...u, [field]: value } : u
            ),
        }));
        setError('');
    };

    const addSellingUnit = () => {
        setForm((prev) => ({
            ...prev,
            selling_units: [...prev.selling_units, { name: prev.base_unit || 'Cái', ratio: '', sale_price: '' }],
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
            setError('Chỉ được chọn tối đa 3 ảnh cho mỗi sản phẩm.');
            return;
        }
        setSelectedImages(files);
        setImagePreviews(files.map((f) => URL.createObjectURL(f)));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const nameCheck = validateNoSpecialText(form.name, 'Tên sản phẩm', { required: true });
        if (!nameCheck.ok) return setError(nameCheck.message);
        const skuCheck = validateSku(form.sku);
        if (!skuCheck.ok) return setError(skuCheck.message);
        const barcodeCheck = validateBarcode(form.barcode);
        if (!barcodeCheck.ok) return setError(barcodeCheck.message);
        const baseUnitCheck = validateNoSpecialText(form.base_unit, 'Đơn vị tồn kho', { required: true });
        if (!baseUnitCheck.ok) return setError(baseUnitCheck.message);
        const costCheck = validateNonNegativeNumber(form.cost_price, 'Giá vốn');
        if (!costCheck.ok) return setError(costCheck.message);
        const stockCheck = validateNonNegativeNumber(form.stock_qty, 'Tồn kho');
        if (!stockCheck.ok) return setError(stockCheck.message);
        const reorderCheck = validateNonNegativeNumber(form.reorder_level, 'Mức tồn tối thiểu');
        if (!reorderCheck.ok) return setError(reorderCheck.message);
        const units = [];
        for (const u of form.selling_units) {
            const nameUnitCheck = validateNoSpecialText(u.name, 'Tên đơn vị bán', { required: true });
            if (!nameUnitCheck.ok) return setError(nameUnitCheck.message);
            const ratioCheck = validateNonNegativeNumber(u.ratio, 'Tỉ lệ đơn vị bán', { required: true });
            if (!ratioCheck.ok || ratioCheck.value <= 0) {
                return setError('Tỉ lệ đơn vị bán phải lớn hơn 0.');
            }
            const salePriceCheck = validateNonNegativeNumber(u.sale_price, 'Giá bán đơn vị', { required: true });
            if (!salePriceCheck.ok) return setError(salePriceCheck.message);
            units.push({
                name: nameUnitCheck.value,
                ratio: ratioCheck.value,
                sale_price: salePriceCheck.value,
            });
        }
        if (units.length === 0) {
            setError('Vui lòng thêm ít nhất một đơn vị bán với giá.');
            return;
        }
        const hasBase = units.some((u) => u.ratio === 1);
        if (!hasBase) {
            units.unshift({ name: form.base_unit || 'Cái', ratio: 1, sale_price: units[0]?.sale_price ?? 0 });
        }

        if (form.expiry_date && !isExpiryDateNotInPast(form.expiry_date)) {
            setError('Ngày hết hạn phải từ hôm nay trở đi (không chọn ngày quá khứ).');
            return;
        }
        if (selectedImages.length > 3) {
            setError('Chỉ được chọn tối đa 3 ảnh cho mỗi sản phẩm.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            let uploadedImageUrls = form.image_urls || [];
            if (selectedImages.length > 0) {
                uploadedImageUrls = await uploadProductImages(selectedImages);
            }
            const payload = {
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
                image_urls: uploadedImageUrls,
                status: form.status === 'inactive' ? 'inactive' : 'active',
            };

            if (selectedExistingId) {
                const existing = existingProducts.find((x) => x._id === selectedExistingId);
                const currentStock = Number(existing?.stock_qty) || 0;
                const incomingQty = Number(form.stock_qty) || 0;
                await updateProduct(selectedExistingId, {
                    ...payload,
                    stock_qty: currentStock + incomingQty,
                });
                navigate('/manager/products', { state: { success: 'Da cap nhat san pham hien co va cong don ton kho.' } });
                return;
            }

            await createProduct(payload);
            navigate('/manager/products', { state: { success: 'Thêm sản phẩm thành công.' } });
        } catch (err) {
            const msg = err.message || 'Không thể tạo sản phẩm.';
            setError(msg);
            showToast('error', msg);
        } finally {
            setLoading(false);
        }
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
            sku: p.sku || prev.sku,
            barcode: p.barcode || '',
            supplier_id: typeof p.supplier_id === 'object' ? (p.supplier_id?._id || '') : (p.supplier_id || ''),
            cost_price: p.cost_price != null ? String(p.cost_price) : prev.cost_price,
            expiry_date: (() => {
                if (!p.expiry_date) return '';
                const s = new Date(p.expiry_date).toISOString().slice(0, 10);
                return s < minExpiryDateString() ? '' : s;
            })(),
            base_unit: p.base_unit || prev.base_unit,
            selling_units: Array.isArray(p.selling_units) && p.selling_units.length > 0
                ? p.selling_units.map((u) => ({
                    name: u.name || p.base_unit || 'Cái',
                    ratio: u.ratio != null ? u.ratio : 1,
                    sale_price: u.sale_price != null ? String(u.sale_price) : '',
                }))
                : prev.selling_units,
            image_urls: Array.isArray(p.image_urls) ? p.image_urls.slice(0, 3) : [],
            status: p.status === 'inactive' ? 'inactive' : 'active',
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

        const exact = existingProducts.find((p) => (
            String(p.name || '').toLowerCase() === term ||
            String(p.sku || '').toLowerCase() === term ||
            String(p.barcode || '').toLowerCase() === term
        ));

        const target = exact || filteredExistingProducts[0];
        if (!target) {
            setError('Không tìm thấy sản phẩm phù hợp để điền nhanh.');
            return;
        }

        fillFromExisting(target._id);
        setError('');
    };

    return (
        <ManagerPageFrame showNotificationBell>
            <StaffPageShell
                eyebrow="Sản phẩm"
                eyebrowIcon={Package}
                title="Thêm sản phẩm"
                subtitle="Điền nhanh từ mẫu có sẵn, sau đó chỉnh lại để tạo sản phẩm mới."
                headerActions={
                    <Button type="button" variant="outline" onClick={() => navigate('/manager/products')}>
                        Quay lại danh sách
                    </Button>
                }
            >
                <div className="manager-product-create-fullwidth">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-12">
                            <Card className="xl:col-span-12">
                                <CardContent className="space-y-2 py-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm font-semibold text-slate-700">Điền nhanh từ sản phẩm có sẵn</h2>
                                        {selectedExistingId ? <Badge>Đang dùng mẫu có sẵn</Badge> : <Badge className="bg-slate-100 text-slate-600">Không chọn</Badge>}
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
                                                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <select
                                            value={selectedExistingId}
                                            onChange={(e) => fillFromExisting(e.target.value)}
                                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
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
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-8">
                                <CardContent className="space-y-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Thông tin chung</h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Tên sản phẩm *</label>
                                            <input
                                                type="text"
                                                value={form.name}
                                                onChange={(e) => update('name', e.target.value)}
                                                placeholder="Nhập tên sản phẩm"
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">SKU *</label>
                                            <input
                                                type="text"
                                                value={form.sku}
                                                onChange={(e) => update('sku', e.target.value)}
                                                placeholder="Mã SKU"
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Barcode</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={form.barcode}
                                                    onChange={(e) => update('barcode', e.target.value)}
                                                    placeholder="Mã vạch (tùy chọn)"
                                                    className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-11 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                />
                                                <button
                                                    type="button"
                                                    title={scanMode ? 'Tắt quét mã' : 'Bật quét mã'}
                                                    onMouseDown={(e) => e.preventDefault()}
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
                                            {scanMode && <p className="mt-1 text-xs font-semibold text-sky-700">Dang bat che do quet ma.</p>}
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Nhà cung cấp</label>
                                            <select
                                                value={form.supplier_id}
                                                onChange={(e) => update('supplier_id', e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                <option value="">— Không chọn —</option>
                                                {suppliers.map((s) => (
                                                    <option key={s._id} value={s._id}>
                                                        {s.name}{s.phone ? ` — ${s.phone}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-4">
                                <CardContent>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Đơn vị bán & giá</h3>
                                        <Button type="button" variant="outline" onClick={addSellingUnit}>
                                            <Plus className="mr-1 h-4 w-4" />
                                            Thêm đơn vị bán
                                        </Button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                                                    <th className="py-2 pr-2">Đơn vị</th>
                                                    <th className="py-2 pr-2">Tỉ lệ</th>
                                                    <th className="py-2 pr-2">Giá bán (₫)</th>
                                                    <th className="py-2 text-right">Thao tác</th>
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
                                                                placeholder="vd: Lon"
                                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                            />
                                                        </td>
                                                        <td className="py-2 pr-2">
                                                            <input
                                                                type="number"
                                                                min="1"
                                                step="any"
                                                                value={u.ratio}
                                                                onChange={(e) => updateSellingUnit(i, 'ratio', e.target.value)}
                                                                placeholder="1"
                                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                            />
                                                        </td>
                                                        <td className="py-2 pr-2">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                step="any"
                                                                value={u.sale_price}
                                                                onChange={(e) => updateSellingUnit(i, 'sale_price', e.target.value)}
                                                                placeholder="0"
                                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                            />
                                                        </td>
                                                        <td className="py-2 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => removeSellingUnit(i)}
                                                                disabled={form.selling_units.length <= 1}
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                                                title="Xóa"
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
                                <CardContent className="space-y-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Giá sản phẩm & tồn kho</h3>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Đơn vị tồn kho (gốc)</label>
                                            <select
                                                value={form.base_unit}
                                                onChange={(e) => update('base_unit', e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                {PRODUCT_BASE_UNITS.map((u) => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Giá vốn (₫) / 1 đơn vị gốc</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={form.cost_price}
                                                onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                                                placeholder="0"
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Tồn kho ban đầu</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={form.stock_qty}
                                                onChange={(e) => update('stock_qty', e.target.value)}
                                                placeholder="vd: 24"
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Mức tồn tối thiểu</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={form.reorder_level}
                                                onChange={(e) => update('reorder_level', e.target.value)}
                                                placeholder="0"
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Hạn sử dụng</label>
                                            <input
                                                type="date"
                                                min={minExpiryDateString()}
                                                value={form.expiry_date}
                                                onChange={(e) => update('expiry_date', e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                            <p className="mt-1 text-xs text-slate-500">Chỉ chọn ngày từ hôm nay trở đi.</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-4">
                                <CardContent className="space-y-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Trạng thái & ảnh</h3>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-600">Trạng thái</label>
                                        <select
                                            value={form.status}
                                            onChange={(e) => update('status', e.target.value)}
                                            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                        >
                                            <option value="active">Đang bán</option>
                                            <option value="inactive">Ngừng bán</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-600">Ảnh sản phẩm (tối đa 3)</label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={handleSelectImages}
                                            className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600"
                                        />
                                        <p className="mt-1 text-xs text-slate-500">Ảnh sẽ upload lên Cloudinary hoặc local fallback.</p>
                                    </div>
                                    {(imagePreviews.length > 0 || form.image_urls.length > 0) && (
                                        <div className="flex flex-wrap gap-2">
                                            {(imagePreviews.length > 0 ? imagePreviews : form.image_urls).slice(0, 3).map((url, idx) => (
                                                <img
                                                    key={`${url}-${idx}`}
                                                    src={url}
                                                    alt={`preview-${idx + 1}`}
                                                    className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                                                />
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="flex items-center justify-end gap-2 pb-2">
                            <Button type="button" variant="outline" onClick={() => navigate('/manager/products')}>
                                Hủy
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Đang lưu...' : 'Tạo sản phẩm'}
                            </Button>
                        </div>
                    </form>
                </div>
            </StaffPageShell>
            {toast && (
                <div className="fixed right-4 top-4 z-[2500]">
                    <div className={`rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
                        toast.type === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                    }`}>
                        {toast.message}
                    </div>
                </div>
            )}
            {scanConfirmOpen && (
                <div className="fixed inset-0 z-[2600] flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                        <h3 className="text-base font-semibold text-slate-900">Mã chưa có trong hệ thống</h3>
                        <p className="mt-2 text-sm text-slate-600">
                            Barcode <span className="font-semibold text-slate-900">{pendingScanCode}</span> chưa tồn tại.
                            Bạn có muốn dùng mã này cho sản phẩm mới không?
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
                                    showToast('success', 'Da dien barcode tu ma quet.');
                                }}
                            >
                                Đồng ý
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </ManagerPageFrame>
    );
}
