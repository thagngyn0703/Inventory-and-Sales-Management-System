import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import { Plus, X, Barcode, Package } from 'lucide-react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { getProduct, updateProduct, updateProductUnits, uploadProductImages } from '../../services/productsApi';
import { minExpiryDateString, isExpiryDateNotInPast } from '../../utils/dateInput';
import {
    trimString,
    validateBarcode,
    validateNoSpecialText,
    validateRequiredText,
    validateNonNegativeNumber,
    validateSku,
} from '../../utils/productValidation';
import { getSuppliers } from '../../services/suppliersApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { InlineNotice } from '../../components/ui/inline-notice';
import { formatCurrencyInput, parseCurrencyInput, toCurrencyInputFromNumber } from '../../utils/currencyInput';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const PRODUCT_BASE_UNITS = ['Cái', 'Chai', 'Lon', 'Thùng', 'Hộp', 'Kg', 'Gói', 'Lít'];

const defaultSellingUnit = () => ({ name: 'Cái', ratio: 1, sale_price: '', barcode: '' });

const defaultForm = {
    category_id: '',
    name: '',
    sku: '',
    barcode: '',
    supplier_id: '',
    cost_price: '',
    stock_qty: '',
    reorder_level: '',
    vat_rate: '',
    expiry_date: '',
    base_unit: 'Cái',
    selling_units: [defaultSellingUnit()],
    image_urls: [],
    status: 'active',
};

export default function ManagerProductEdit() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [form, setForm] = useState(defaultForm);
    const [suppliers, setSuppliers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadProduct, setLoadProduct] = useState(true);
    const [error, setError] = useState('');
    const [isTouched, setIsTouched] = useState(false);
    const [selectedImages, setSelectedImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [scanMode, setScanMode] = useState(false);
    const scanBufferRef = useRef('');
    const scanTimerRef = useRef(null);
    const initialSnapshotRef = useRef({
        name: '',
        sku: '',
        barcode: '',
        supplier_id: '',
        cost_price: 0,
        reorder_level: 0,
        vat_rate: '',
        expiry_date: '',
        base_unit: '',
        status: 'active',
        image_urls: [],
    });
    const initialUnitPayloadRef = useRef([]);

    const normalizeUnitsForCompare = (units) =>
        (Array.isArray(units) ? units : [])
            .map((u) => ({
                unit_name: trimString(u.unit_name || ''),
                exchange_value: Number(u.exchange_value || 0),
                price: Number(u.price || 0),
                barcode: trimString(u.barcode || ''),
                is_base: Boolean(u.is_base),
            }))
            .sort((a, b) =>
                a.unit_name.localeCompare(b.unit_name)
                || a.exchange_value - b.exchange_value
                || a.price - b.price
            );

    useEffect(() => {
        let cancelled = false;
        getSuppliers()
            .then((list) => { if (!cancelled) setSuppliers(list || []); })
            .catch(() => { if (!cancelled) setSuppliers([]); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token') || '';
        let cancelled = false;
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/categories?all=true`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (cancelled) return;
                if (!ok) throw new Error(data?.message || 'Không thể tải danh mục');
                const list = Array.isArray(data) ? data : [];
                setCategories(list.filter((c) => c?.is_active !== false));
            })
            .catch(() => { if (!cancelled) setCategories([]); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!id) return;
        setLoadProduct(true);
        setError('');
        getProduct(id)
            .then((p) => {
                const units = (p.selling_units && p.selling_units.length > 0)
                    ? p.selling_units.map((u) => ({
                        name: u.name || '',
                        ratio: u.ratio != null ? u.ratio : 1,
                        sale_price: u.sale_price != null ? toCurrencyInputFromNumber(u.sale_price) : '',
                        barcode: (() => {
                            const matchedUnit = (p.units || []).find(
                                (x) => String(x.unit_name || '').trim() === String(u.name || '').trim()
                                    && Number(x.exchange_value || 1) === Number(u.ratio || 1)
                            );
                            return matchedUnit?.barcode || '';
                        })(),
                    }))
                    : [{ name: p.base_unit || 'Cái', ratio: 1, sale_price: p.sale_price != null ? String(p.sale_price) : '', barcode: p.barcode || '' }];
                const supplierId = p.supplier_id
                    ? (typeof p.supplier_id === 'object' ? p.supplier_id._id : p.supplier_id)
                    : '';
                const expStr = p.expiry_date
                    ? new Date(p.expiry_date).toISOString().slice(0, 10)
                    : '';
                const minD = minExpiryDateString();
                setForm({
                    category_id: p.category_id
                        ? (typeof p.category_id === 'object' ? p.category_id._id : p.category_id)
                        : '',
                    name: p.name || '',
                    sku: p.sku || '',
                    barcode: p.barcode || '',
                    supplier_id: supplierId || '',
                    cost_price: p.cost_price != null ? toCurrencyInputFromNumber(p.cost_price) : '',
                    stock_qty: p.stock_qty != null ? String(p.stock_qty) : '',
                    reorder_level: p.reorder_level != null ? String(p.reorder_level) : '',
                    vat_rate: p.vat_rate === null || p.vat_rate === undefined ? '' : String(p.vat_rate),
                    expiry_date: expStr && expStr >= minD ? expStr : '',
                    base_unit: p.base_unit || 'Cái',
                    selling_units: units,
                    image_urls: Array.isArray(p.image_urls) ? p.image_urls.slice(0, 3) : [],
                    status: p.status === 'inactive' ? 'inactive' : 'active',
                });
                initialSnapshotRef.current = {
                    category_id: p.category_id
                        ? (typeof p.category_id === 'object' ? p.category_id._id : p.category_id)
                        : '',
                    name: p.name || '',
                    sku: p.sku || '',
                    barcode: p.barcode || '',
                    supplier_id: supplierId || '',
                    cost_price: Number(p.cost_price || 0),
                    reorder_level: Number(p.reorder_level || 0),
                    vat_rate: p.vat_rate === null || p.vat_rate === undefined ? '' : String(p.vat_rate),
                    expiry_date: expStr && expStr >= minD ? expStr : '',
                    base_unit: p.base_unit || 'Cái',
                    status: p.status === 'inactive' ? 'inactive' : 'active',
                    image_urls: Array.isArray(p.image_urls) ? p.image_urls.slice(0, 3) : [],
                };
                const initialUnitsRaw = (p.units || []).map((u) => ({
                    unit_name: u.unit_name,
                    exchange_value: u.exchange_value,
                    price: u.price,
                    barcode: u.barcode,
                    is_base: Boolean(u.is_base),
                }));
                // Match submit behavior: if base unit barcode is empty but product barcode exists,
                // the submit payload auto-fills base unit barcode from product barcode.
                const baseIdx = initialUnitsRaw.findIndex((u) => Boolean(u.is_base));
                if (baseIdx >= 0) {
                    const unitBarcode = trimString(initialUnitsRaw[baseIdx].barcode || '');
                    const productBarcode = trimString(p.barcode || '');
                    if (!unitBarcode && productBarcode) {
                        initialUnitsRaw[baseIdx].barcode = productBarcode;
                    }
                }
                initialUnitPayloadRef.current = normalizeUnitsForCompare(initialUnitsRaw);
                setIsTouched(false);
            })
            .catch((e) => setError(e.message || 'Không tải được sản phẩm'))
            .finally(() => setLoadProduct(false));
    }, [id]);

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
            setForm((prev) => ({ ...prev, barcode: code }));
            setError('');
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
    }, [scanMode]);

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
        setIsTouched(true);
        setError('');
    };

    const updateSellingUnit = (index, field, value) => {
        setForm((prev) => ({
            ...prev,
            selling_units: prev.selling_units.map((u, i) =>
                i === index ? { ...u, [field]: value } : u
            ),
        }));
        setIsTouched(true);
        setError('');
    };

    const addSellingUnit = () => {
        setForm((prev) => ({
            ...prev,
            selling_units: [...prev.selling_units, { name: prev.base_unit || 'Cái', ratio: '', sale_price: '', barcode: '' }],
        }));
        setIsTouched(true);
    };

    const removeSellingUnit = (index) => {
        setForm((prev) => {
            const next = prev.selling_units.filter((_, i) => i !== index);
            const hasBase = next.some((u) => Number(u.ratio) === 1);
            if (!hasBase && next.length > 0) next[0].ratio = 1;
            return { ...prev, selling_units: next.length ? next : [defaultSellingUnit()] };
        });
        setIsTouched(true);
    };

    const handleSelectImages = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 3) {
            if (e.target) e.target.value = '';
            setSelectedImages([]);
            setImagePreviews([]);
            setError('Mỗi lần chỉ được chọn tối đa 3 ảnh.');
            return;
        }
        setSelectedImages(files);
        setImagePreviews(files.map((f) => URL.createObjectURL(f)));
        setIsTouched(true);
        setError('');
    };

    const removeExistingImage = (urlToRemove) => {
        setForm((prev) => ({
            ...prev,
            image_urls: (prev.image_urls || []).filter((url) => url !== urlToRemove),
        }));
        setIsTouched(true);
    };

    const removeNewImageAt = (index) => {
        setSelectedImages((prev) => prev.filter((_, i) => i !== index));
        setImagePreviews((prev) => {
            const target = prev[index];
            if (target) URL.revokeObjectURL(target);
            return prev.filter((_, i) => i !== index);
        });
        setIsTouched(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!id) return;
        if (!isTouched) {
            navigate('/manager/products', { state: { success: 'Không có thay đổi để lưu.' } });
            return;
        }
        const nameCheck = validateRequiredText(form.name, 'Tên sản phẩm');
        if (!nameCheck.ok) return setError(nameCheck.message);
        const skuCheck = validateSku(form.sku);
        if (!skuCheck.ok) return setError(skuCheck.message);
        const barcodeCheck = validateBarcode(form.barcode);
        if (!barcodeCheck.ok) return setError(barcodeCheck.message);
        const baseUnitCheck = validateNoSpecialText(form.base_unit, 'Đơn vị tồn kho', { required: true });
        if (!baseUnitCheck.ok) return setError(baseUnitCheck.message);
        const costCheck = validateNonNegativeNumber(parseCurrencyInput(form.cost_price), 'Giá vốn');
        if (!costCheck.ok) return setError(costCheck.message);
        const reorderCheck = validateNonNegativeNumber(form.reorder_level, 'Mức tồn tối thiểu');
        if (!reorderCheck.ok) return setError(reorderCheck.message);
        if (form.vat_rate !== '') {
            const vat = Number(form.vat_rate);
            if (!Number.isFinite(vat) || vat < 0 || vat > 100) {
                return setError('VAT sản phẩm phải nằm trong khoảng 0-100%.');
            }
        }
        const units = [];
        for (const u of form.selling_units) {
            const nameUnitCheck = validateNoSpecialText(u.name, 'Tên đơn vị bán', { required: true });
            if (!nameUnitCheck.ok) return setError(nameUnitCheck.message);
            const ratioCheck = validateNonNegativeNumber(u.ratio, 'Tỉ lệ đơn vị bán', { required: true });
            if (!ratioCheck.ok || ratioCheck.value <= 0) {
                return setError('Tỉ lệ đơn vị bán phải lớn hơn 0.');
            }
            const salePriceCheck = validateNonNegativeNumber(parseCurrencyInput(u.sale_price), 'Giá bán đơn vị', { required: true });
            if (!salePriceCheck.ok) return setError(salePriceCheck.message);
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
        const unitPayload = [];
        for (const u of units) {
            const unitNameKey = String(u.name || '').trim().toLowerCase();
            if (seenUnitNames.has(unitNameKey)) {
                setError(`Đơn vị "${u.name}" bị trùng. Mỗi sản phẩm chỉ có một dòng cho mỗi đơn vị.`);
                return;
            }
            seenUnitNames.add(unitNameKey);
            const unitBarcode = validateBarcode(u.barcode || '');
            if (!unitBarcode.ok) return setError(`${u.name}: ${unitBarcode.message}`);
            const normalizedBarcode = unitBarcode.value || '';
            if (normalizedBarcode) {
                if (seenUnitBarcodes.has(normalizedBarcode)) {
                    setError(`Barcode "${normalizedBarcode}" bị trùng giữa các đơn vị bán.`);
                    return;
                }
                seenUnitBarcodes.add(normalizedBarcode);
            }
            unitPayload.push({
                unit_name: u.name,
                exchange_value: u.ratio,
                price: u.sale_price,
                barcode: normalizedBarcode || undefined,
                is_base: Number(u.ratio) === 1,
            });
        }
        if (barcodeCheck.value) {
            const baseUnit = unitPayload.find((u) => u.is_base) || unitPayload[0];
            if (baseUnit && !baseUnit.barcode) baseUnit.barcode = barcodeCheck.value;
        }

        if (form.expiry_date && !isExpiryDateNotInPast(form.expiry_date)) {
            setError('Ngày hết hạn phải từ hôm nay trở đi (không chọn ngày quá khứ).');
            return;
        }

        const existingImages = Array.isArray(form.image_urls) ? form.image_urls : [];
        if (existingImages.length + selectedImages.length > 3) {
            setError('Tổng số ảnh sản phẩm không được vượt quá 3 ảnh.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            let finalImageUrls = existingImages;
            if (selectedImages.length > 0) {
                const uploaded = await uploadProductImages(selectedImages);
                finalImageUrls = [...existingImages, ...uploaded].slice(0, 3);
            }
            const initial = initialSnapshotRef.current || {};
            const nextSku = trimString(skuCheck.value || '');
            const nextBarcode = trimString(barcodeCheck.value || '');
            const nextName = trimString(nameCheck.value || '');
            const nextCategoryId = trimString(form.category_id || '');
            const nextSupplierId = trimString(form.supplier_id || '');
            const nextCostPrice = Number(costCheck.value || 0);
            const nextReorderLevel = Number(reorderCheck.value || 0);
            const nextVatRate = form.vat_rate === '' ? '' : String(form.vat_rate);
            const nextExpiryDate = form.expiry_date ? String(form.expiry_date) : '';
            const nextBaseUnit = trimString(baseUnitCheck.value || '');
            const nextStatus = form.status === 'inactive' ? 'inactive' : 'active';
            const initialSku = trimString(initial.sku || '');
            const initialBarcode = trimString(initial.barcode || '');
            const initialName = trimString(initial.name || '');
            const initialCategoryId = trimString(initial.category_id || '');
            const initialSupplierId = trimString(initial.supplier_id || '');
            const initialCostPrice = Number(initial.cost_price || 0);
            const initialReorderLevel = Number(initial.reorder_level || 0);
            const initialVatRate = initial.vat_rate === '' ? '' : String(initial.vat_rate || '');
            const initialExpiryDate = initial.expiry_date ? String(initial.expiry_date) : '';
            const initialBaseUnit = trimString(initial.base_unit || '');
            const initialStatus = initial.status === 'inactive' ? 'inactive' : 'active';
            const initialImageUrls = Array.isArray(initial.image_urls) ? initial.image_urls : [];
            const imageChanged = JSON.stringify(initialImageUrls) !== JSON.stringify(finalImageUrls);
            const currentUnits = normalizeUnitsForCompare(unitPayload);
            const initialUnits = normalizeUnitsForCompare(initialUnitPayloadRef.current);
            const unitChanged = JSON.stringify(currentUnits) !== JSON.stringify(initialUnits);
            const payload = {
                ...(nextCategoryId !== initialCategoryId ? { category_id: nextCategoryId || undefined } : {}),
                ...(nextName !== initialName ? { name: nameCheck.value } : {}),
                ...(nextSku !== initialSku ? { sku: skuCheck.value } : {}),
                ...(nextBarcode !== initialBarcode ? { barcode: barcodeCheck.value || undefined } : {}),
                ...(nextSupplierId !== initialSupplierId ? { supplier_id: nextSupplierId || undefined } : {}),
                ...(nextCostPrice !== initialCostPrice ? { cost_price: costCheck.value } : {}),
                ...(nextReorderLevel !== initialReorderLevel ? { reorder_level: reorderCheck.value } : {}),
                ...(nextVatRate !== initialVatRate ? { vat_rate: form.vat_rate === '' ? null : Number(form.vat_rate) } : {}),
                ...(nextExpiryDate !== initialExpiryDate ? { expiry_date: form.expiry_date ? form.expiry_date : null } : {}),
                ...(nextBaseUnit !== initialBaseUnit ? { base_unit: baseUnitCheck.value } : {}),
                ...(imageChanged ? { image_urls: finalImageUrls } : {}),
                ...(nextStatus !== initialStatus ? { status: nextStatus } : {}),
            };
            const hasProductChanges = Object.keys(payload).length > 0;
            if (hasProductChanges) {
                await updateProduct(id, payload);
            }
            if (unitChanged) {
                await updateProductUnits(id, unitPayload);
            }
            navigate('/manager/products', { state: { success: 'Cập nhật sản phẩm thành công.' } });
        } catch (err) {
            setError(err.message || 'Không thể cập nhật sản phẩm.');
        } finally {
            setLoading(false);
        }
    };

    if (loadProduct) {
        return (
            <ManagerPageFrame showNotificationBell>
                <p className="manager-products-loading">Đang tải...</p>
            </ManagerPageFrame>
        );
    }

    return (
        <ManagerPageFrame showNotificationBell>
            <StaffPageShell
                eyebrow="Sản phẩm"
                eyebrowIcon={Package}
                title="Sửa sản phẩm"
                subtitle="Cập nhật thông tin và hình ảnh sản phẩm."
                headerActions={
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => navigate(`/manager/products/${id}`)}>
                            Xem chi tiết
                        </Button>
                        <Button type="button" variant="outline" onClick={() => navigate('/manager/products')}>
                            Danh sách
                        </Button>
                    </div>
                }
            >
                <div className="manager-product-create-fullwidth">
                    <InlineNotice message={error} type="error" className="mb-4" />

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-12">
                            <Card className="xl:col-span-8">
                                <CardContent className="space-y-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Thông tin chung</h3>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Danh mục</label>
                                            <select
                                                value={form.category_id}
                                                onChange={(e) => update('category_id', e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                <option value="">— Không chọn —</option>
                                                {categories.map((c) => (
                                                    <option key={c._id} value={c._id}>
                                                        {c.name}{c.vat_rate === null || c.vat_rate === undefined ? '' : ` (VAT ${c.vat_rate}%)`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Tên sản phẩm *</label>
                                            <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Nhập tên sản phẩm" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">SKU *</label>
                                            <input type="text" value={form.sku} onChange={(e) => update('sku', e.target.value)} placeholder="Mã SKU" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Barcode</label>
                                            <div className="relative">
                                                <input type="text" value={form.barcode} onChange={(e) => update('barcode', e.target.value)} placeholder="Mã vạch (tùy chọn)" className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-11 text-sm outline-none ring-sky-200 transition focus:ring-2" />
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
                                            <select value={form.supplier_id} onChange={(e) => update('supplier_id', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2">
                                                <option value="">— Không chọn —</option>
                                                {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}{s.phone ? ` — ${s.phone}` : ''}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="min-w-0 xl:col-span-4">
                                <CardContent className="min-w-0 space-y-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Đơn vị bán & giá</h3>
                                    <Button type="button" variant="outline" onClick={addSellingUnit}>
                                        <Plus className="mr-1 h-4 w-4" /> Thêm đơn vị bán
                                    </Button>
                                    <div className="min-w-0 space-y-2">
                                        {form.selling_units.map((u, i) => (
                                            <div key={i} className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_5.625rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                                                <input type="text" value={u.name} onChange={(e) => updateSellingUnit(i, 'name', e.target.value)} placeholder="Đơn vị" className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                                <input type="number" min="1" step="any" value={u.ratio} onChange={(e) => updateSellingUnit(i, 'ratio', e.target.value)} placeholder="Tỉ lệ" className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                                <input type="text" inputMode="numeric" value={u.sale_price} onChange={(e) => updateSellingUnit(i, 'sale_price', formatCurrencyInput(e.target.value))} placeholder="Giá bán" className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                                <input type="text" value={u.barcode || ''} onChange={(e) => updateSellingUnit(i, 'barcode', e.target.value)} placeholder="Barcode đơn vị" className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                                <button type="button" onClick={() => removeSellingUnit(i)} disabled={form.selling_units.length <= 1} className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-8">
                                <CardContent className="space-y-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Giá sản phẩm</h3>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Đơn vị tồn kho (gốc)</label>
                                            <select value={form.base_unit} onChange={(e) => update('base_unit', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2">
                                                {PRODUCT_BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Giá vốn (₫) / 1 đơn vị gốc</label>
                                            <input type="text" inputMode="numeric" value={form.cost_price} onChange={(e) => setForm((prev) => ({ ...prev, cost_price: formatCurrencyInput(e.target.value) }))} placeholder="0" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Mức tồn tối thiểu</label>
                                            <input type="number" min="0" value={form.reorder_level} onChange={(e) => update('reorder_level', e.target.value)} placeholder="0" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">VAT sản phẩm (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.01"
                                                value={form.vat_rate}
                                                onChange={(e) => update('vat_rate', e.target.value)}
                                                placeholder="Để trống: dùng VAT theo danh mục"
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Hạn sử dụng</label>
                                            <input type="date" min={minExpiryDateString()} value={form.expiry_date} onChange={(e) => update('expiry_date', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                            <p className="mt-1 text-xs text-slate-500">{Platform.select({ web: 'Chỉ chọn ngày từ hôm nay trở đi.', default: 'Chỉ chọn ngày hợp lệ.' })}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="xl:col-span-4">
                                <CardContent className="space-y-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Trạng thái & ảnh</h3>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-600">Trạng thái</label>
                                        <select value={form.status} onChange={(e) => update('status', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2">
                                            <option value="active">Đang bán</option>
                                            <option value="inactive">Ngừng bán</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-slate-600">Ảnh sản phẩm (tối đa 3)</label>
                                        <input type="file" accept="image/*" multiple onChange={handleSelectImages} className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600" />
                                    </div>
                                    {Array.isArray(form.image_urls) && form.image_urls.length > 0 && (
                                        <div>
                                            <div className="mb-1 text-xs text-slate-500">Ảnh hiện tại:</div>
                                            <div className="flex flex-wrap gap-2">
                                                {form.image_urls.map((url, idx) => (
                                                    <div key={`${url}-${idx}`} className="relative">
                                                        <img src={url} alt={`current-${idx + 1}`} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                                                        <button type="button" onClick={() => removeExistingImage(url)} className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {imagePreviews.length > 0 && (
                                        <div>
                                            <div className="mb-1 text-xs text-slate-500">Ảnh mới sẽ thêm:</div>
                                            <div className="flex flex-wrap gap-2">
                                                {imagePreviews.map((url, idx) => (
                                                    <div key={`${url}-${idx}`} className="relative">
                                                        <img src={url} alt={`new-${idx + 1}`} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                                                        <button type="button" onClick={() => removeNewImageAt(idx)} className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => navigate('/manager/products')}>Hủy</Button>
                            <Button type="submit" disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
                        </div>
                    </form>
                </div>
            </StaffPageShell>
        </ManagerPageFrame>
    );
}
