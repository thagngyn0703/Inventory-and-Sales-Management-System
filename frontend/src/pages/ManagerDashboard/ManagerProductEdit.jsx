import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Platform } from 'react-bits/lib/modules/Platform';
import { Plus, X, Barcode, Package } from 'lucide-react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { getProduct, updateProduct, uploadProductImages } from '../../services/productsApi';
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
import './ManagerDashboard.css';
import './ManagerProducts.css';

const PRODUCT_BASE_UNITS = ['Cái', 'Chai', 'Lon', 'Thùng', 'Hộp', 'Kg', 'Gói', 'Lít'];

const defaultSellingUnit = () => ({ name: 'Cái', ratio: 1, sale_price: '' });

const defaultForm = {
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
};

export default function ManagerProductEdit() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [form, setForm] = useState(defaultForm);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadProduct, setLoadProduct] = useState(true);
    const [error, setError] = useState('');
    const [selectedImages, setSelectedImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [scanMode, setScanMode] = useState(false);
    const scanBufferRef = useRef('');
    const scanTimerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        getSuppliers()
            .then((list) => { if (!cancelled) setSuppliers(list || []); })
            .catch(() => { if (!cancelled) setSuppliers([]); });
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
                        sale_price: u.sale_price != null ? String(u.sale_price) : '',
                    }))
                    : [{ name: p.base_unit || 'Cái', ratio: 1, sale_price: p.sale_price != null ? String(p.sale_price) : '' }];
                const supplierId = p.supplier_id
                    ? (typeof p.supplier_id === 'object' ? p.supplier_id._id : p.supplier_id)
                    : '';
                const expStr = p.expiry_date
                    ? new Date(p.expiry_date).toISOString().slice(0, 10)
                    : '';
                const minD = minExpiryDateString();
                setForm({
                    name: p.name || '',
                    sku: p.sku || '',
                    barcode: p.barcode || '',
                    supplier_id: supplierId || '',
                    cost_price: p.cost_price != null ? String(p.cost_price) : '',
                    stock_qty: p.stock_qty != null ? String(p.stock_qty) : '',
                    reorder_level: p.reorder_level != null ? String(p.reorder_level) : '',
                    expiry_date: expStr && expStr >= minD ? expStr : '',
                    base_unit: p.base_unit || 'Cái',
                    selling_units: units,
                    image_urls: Array.isArray(p.image_urls) ? p.image_urls.slice(0, 3) : [],
                    status: p.status === 'inactive' ? 'inactive' : 'active',
                });
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
            if (!hasBase && next.length > 0) next[0].ratio = 1;
            return { ...prev, selling_units: next.length ? next : [defaultSellingUnit()] };
        });
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
        setError('');
    };

    const removeExistingImage = (urlToRemove) => {
        setForm((prev) => ({
            ...prev,
            image_urls: (prev.image_urls || []).filter((url) => url !== urlToRemove),
        }));
    };

    const removeNewImageAt = (index) => {
        setSelectedImages((prev) => prev.filter((_, i) => i !== index));
        setImagePreviews((prev) => {
            const target = prev[index];
            if (target) URL.revokeObjectURL(target);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!id) return;
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
        if (!hasBase) units.unshift({ name: form.base_unit || 'Cái', ratio: 1, sale_price: units[0]?.sale_price ?? 0 });

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
            await updateProduct(id, {
                name: nameCheck.value,
                sku: skuCheck.value,
                barcode: barcodeCheck.value || undefined,
                supplier_id: trimString(form.supplier_id) || undefined,
                cost_price: costCheck.value,
                stock_qty: stockCheck.value,
                reorder_level: reorderCheck.value,
                expiry_date: form.expiry_date ? form.expiry_date : null,
                base_unit: baseUnitCheck.value,
                selling_units: units,
                image_urls: finalImageUrls,
                status: form.status === 'inactive' ? 'inactive' : 'active',
            });
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
                    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-12">
                            <Card className="xl:col-span-8">
                                <CardContent className="space-y-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Thông tin chung</h3>
                                    <div className="grid gap-3 md:grid-cols-2">
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
                                            <div key={i} className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_5.625rem_minmax(0,1fr)_auto] items-center gap-2">
                                                <input type="text" value={u.name} onChange={(e) => updateSellingUnit(i, 'name', e.target.value)} placeholder="Đơn vị" className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                                <input type="number" min="1" step="any" value={u.ratio} onChange={(e) => updateSellingUnit(i, 'ratio', e.target.value)} placeholder="Tỉ lệ" className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                                <input type="number" min="0" step="1" value={u.sale_price} onChange={(e) => updateSellingUnit(i, 'sale_price', e.target.value)} placeholder="Giá bán" className="h-10 w-full min-w-0 rounded-lg border border-slate-200 px-2 text-sm outline-none ring-sky-200 transition focus:ring-2" />
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
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Giá sản phẩm & tồn kho</h3>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Đơn vị tồn kho (gốc)</label>
                                            <select value={form.base_unit} onChange={(e) => update('base_unit', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2">
                                                {PRODUCT_BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Giá vốn (₫) / 1 đơn vị gốc</label>
                                            <input type="number" min="0" step="1" value={form.cost_price} onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))} placeholder="0" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Tồn kho hiện tại</label>
                                            <input type="number" min="0" value={form.stock_qty} onChange={(e) => update('stock_qty', e.target.value)} placeholder="0" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2" />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Mức tồn tối thiểu</label>
                                            <input type="number" min="0" value={form.reorder_level} onChange={(e) => update('reorder_level', e.target.value)} placeholder="0" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2" />
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
