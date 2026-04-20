import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Zap } from 'lucide-react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { useToast } from '../../contexts/ToastContext';
import { createProduct, createQuickGoodsReceipt, getProductUnits, getProducts, scanProductByCode, updateProductUnits, uploadProductImages } from '../../services/productsApi';
import { createSupplier, getSuppliers } from '../../services/suppliersApi';
import { minExpiryDateString } from '../../utils/dateInput';
import { formatCurrencyInput, parseCurrencyInput, toCurrencyInputFromNumber } from '../../utils/currencyInput';

const PRODUCT_BASE_UNITS = ['Cái', 'Hộp', 'Chai', 'Lon', 'Thùng', 'Kg', 'Gói', 'Lít'];
const makeSellingUnitRow = (base = 'Cái', overrides = {}) => ({
    row_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: base,
    ratio: 1,
    sale_price: '',
    barcode: '',
    ...overrides,
});
const normalizeSku = (value = '') => String(value || '').replace(/\s+/g, '').toUpperCase();

export default function ManagerQuickGoodsReceipt() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { toast } = useToast();
    const [supplierList, setSupplierList] = useState([]);
    const [productList, setProductList] = useState([]);
    const [searchInput, setSearchInput] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [createMode, setCreateMode] = useState(false);
    const [supplierId, setSupplierId] = useState('');
    const [paymentType, setPaymentType] = useState('cash');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [reason, setReason] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unitCost, setUnitCost] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [selectedImages, setSelectedImages] = useState([]);
    const [creatingSupplier, setCreatingSupplier] = useState(false);
    const [newSupplier, setNewSupplier] = useState({ name: '', phone: '' });
    const [imagePreviews, setImagePreviews] = useState([]);
    const [newProductForm, setNewProductForm] = useState({
        name: '',
        sku: '',
        barcode: '',
        base_unit: 'Cái',
        sale_price: '',
        cost_price: '',
        stock_qty: '',
        selling_units: [makeSellingUnitRow('Cái')],
    });
    const [loading, setLoading] = useState(false);
    const [unitOptions, setUnitOptions] = useState([]);
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const applyBarcodeToBaseUnit = (formState, rawBarcode) => {
        const nextBarcode = String(rawBarcode || '').trim();
        const units = Array.isArray(formState.selling_units) && formState.selling_units.length > 0
            ? formState.selling_units
            : [makeSellingUnitRow(formState.base_unit || 'Cái')];
        let hadBase = false;
        const nextUnits = units.map((u) => {
            const ratio = Number(u.ratio);
            if (ratio === 1) {
                hadBase = true;
                return { ...u, barcode: nextBarcode };
            }
            return u;
        });
        if (!hadBase) {
            nextUnits.unshift(
                makeSellingUnitRow(formState.base_unit || 'Cái', {
                    ratio: 1,
                    sale_price: formState.sale_price || '',
                    barcode: nextBarcode,
                })
            );
        }
        return nextUnits;
    };

    const dropdownRef = useRef(null);
    const barcodeInputRef = useRef(null);

    useEffect(() => {
        getSuppliers().then((list) => setSupplierList(list || [])).catch(() => {});
        getProducts(1, 1000).then((d) => setProductList(d.products || [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (!productList.length) return;
        const query = String(searchParams.get('q') || '').trim();
        const productId = String(searchParams.get('productId') || '').trim();
        if (!query && !productId) return;

        const lowerQuery = query.toLowerCase();
        const matched = productList.find((p) => {
            if (productId && String(p._id) === productId) return true;
            if (!lowerQuery) return false;
            return (
                String(p.name || '').toLowerCase().includes(lowerQuery) ||
                String(p.sku || '').toLowerCase().includes(lowerQuery) ||
                String(p.barcode || '').toLowerCase().includes(lowerQuery)
            );
        });
        if (!matched) return;
        setSearchInput(query || matched.name || '');
        selectProduct(matched);
        toast('Đã mở sẵn sản phẩm để nhập hàng theo SOP.', 'success');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productList, searchParams]);

    useEffect(() => {
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        if (createMode && !selectedProduct) {
            barcodeInputRef.current?.focus();
        }
    }, [createMode, selectedProduct]);

    useEffect(() => {
        const urls = selectedImages.map((file) => URL.createObjectURL(file));
        setImagePreviews(urls);
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [selectedImages]);

    const filteredProducts = useMemo(() => {
        const t = String(searchInput || '').trim().toLowerCase();
        if (!t) return productList.slice(0, 12);
        return productList.filter(
            (p) =>
                String(p.name || '').toLowerCase().includes(t) ||
                String(p.sku || '').toLowerCase().includes(t) ||
                String(p.barcode || '').toLowerCase().includes(t)
        ).slice(0, 12);
    }, [productList, searchInput]);

    const findExistingProductForCreateFlow = async ({ name, sku, barcode }) => {
        const normName = String(name || '').trim().toLowerCase();
        const normSku = normalizeSku(sku || '').toLowerCase();
        const normBarcode = String(barcode || '').trim().toLowerCase();
        if (normBarcode) {
            try {
                const scanned = await scanProductByCode(normBarcode);
                if (scanned?.product?._id) return scanned.product;
            } catch (_) {
                // ignore and fallback to list search
            }
        }
        const exactInCache = (productList || []).find((p) => {
            const pName = String(p?.name || '').trim().toLowerCase();
            const pSku = String(p?.sku || '').trim().toLowerCase();
            const pBarcode = String(p?.barcode || '').trim().toLowerCase();
            if (normBarcode && pBarcode && pBarcode === normBarcode) return true;
            if (normSku && pSku && pSku === normSku) return true;
            if (normName && pName && pName === normName) return true;
            return false;
        });
        if (exactInCache) return exactInCache;

        const searchKey = normBarcode || normSku || normName;
        if (!searchKey) return null;
        try {
            const res = await getProducts(1, 100, searchKey);
            const list = res?.products || [];
            return list.find((p) => {
                const pName = String(p?.name || '').trim().toLowerCase();
                const pSku = String(p?.sku || '').trim().toLowerCase();
                const pBarcode = String(p?.barcode || '').trim().toLowerCase();
                if (normBarcode && pBarcode && pBarcode === normBarcode) return true;
                if (normSku && pSku && pSku === normSku) return true;
                if (normName && pName && pName === normName) return true;
                return false;
            }) || null;
        } catch (_) {
            return null;
        }
    };

    const createQuickReceiptForExistingProduct = async (existingProduct) => {
        const qty = Number(newProductForm.stock_qty);
        const cost = parseCurrencyInput(newProductForm.cost_price);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('Số lượng nhập ban đầu phải lớn hơn 0.');
        if (!Number.isFinite(cost) || cost < 0) throw new Error('Giá nhập không hợp lệ.');
        const units = await getProductUnits(existingProduct._id);
        const baseUnit = (units || []).find((u) => u.is_base) || (units || [])[0] || null;
        if (!baseUnit?._id) throw new Error('Sản phẩm đã có nhưng chưa cấu hình đơn vị hợp lệ. Vui lòng mở Sửa sản phẩm để cấu hình đơn vị.');
        await createQuickGoodsReceipt({
            supplier_id: supplierId,
            items: [{
                product_id: existingProduct._id,
                unit_id: baseUnit._id,
                quantity: qty,
                unit_cost: Math.round(cost),
                unit_name: baseUnit.unit_name || existingProduct.base_unit || 'Cái',
                ratio: Number(baseUnit.exchange_value) > 0 ? Number(baseUnit.exchange_value) : 1,
                expiry_date: expiryDate || undefined,
            }],
            payment_type: paymentType,
            payment_method: paymentMethod,
            reason: reason.trim() || 'Nhập hàng từ màn tạo mới (tự động ghép sản phẩm đã có)',
        });
        navigate('/manager/receipts', {
            state: {
                success: `Sản phẩm "${existingProduct.name}" đã tồn tại. Hệ thống đã tự nhập thêm tồn kho cho sản phẩm này thành công.`,
            },
        });
    };
    const quickReceiptTotal = useMemo(() => {
        const qty = Number(quantity);
        const cost = parseCurrencyInput(unitCost);
        if (!Number.isFinite(qty) || !Number.isFinite(cost) || qty <= 0 || cost < 0) return 0;
        return qty * cost;
    }, [quantity, unitCost]);
    const createNewInitialTotal = useMemo(() => {
        const qty = Number(newProductForm.stock_qty);
        const cost = parseCurrencyInput(newProductForm.cost_price);
        if (!Number.isFinite(qty) || !Number.isFinite(cost) || qty < 0 || cost < 0) return 0;
        return qty * cost;
    }, [newProductForm.stock_qty, newProductForm.cost_price]);

    const loadUnitsForSelectedProduct = async (product) => {
        const pid = String(product?._id || '');
        if (!pid) return [];
        try {
            const units = await getProductUnits(pid);
            const sorted = (units || []).sort(
                (a, b) => Number(a.exchange_value || 0) - Number(b.exchange_value || 0)
            );
            if (!sorted.length) {
                setUnitOptions([]);
                setSelectedUnitId('');
                return [];
            }
            const base = sorted.find((u) => u.is_base) || sorted[0];
            setUnitOptions(sorted);
            setSelectedUnitId(base?._id || '');
            const ratio = Number(base?.exchange_value) > 0 ? Number(base.exchange_value) : 1;
            setUnitCost(toCurrencyInputFromNumber(Math.round((Number(product?.cost_price) || 0) * ratio)));
            return sorted;
        } catch (_) {
            setUnitOptions([]);
            setSelectedUnitId('');
            return [];
        }
    };

    const selectProduct = (product) => {
        setSelectedProduct(product);
        setSearchInput(product.name || '');
        setQuantity('');
        loadUnitsForSelectedProduct(product);
        setCreateMode(false);
        setShowDropdown(false);
    };

    const clearFoundProduct = () => {
        setSelectedProduct(null);
        setQuantity('');
        setUnitCost('');
        setUnitOptions([]);
        setSelectedUnitId('');
    };

    const handleSubmitQuickReceipt = async (e) => {
        e.preventDefault();

        if (!selectedProduct?._id) {
            toast('Vui lòng tìm và chọn sản phẩm đã có.', 'error');
            return;
        }
        if (!supplierId) {
            toast('Vui lòng chọn nhà cung cấp.', 'error');
            return;
        }
        if (!quantity || Number(quantity) <= 0) {
            toast('Số lượng nhập phải lớn hơn 0.', 'error');
            return;
        }
        if (unitCost === '' || parseCurrencyInput(unitCost) < 0) {
            toast('Giá nhập không hợp lệ.', 'error');
            return;
        }
        if (!selectedUnitId) {
            toast('Vui lòng chọn đơn vị nhập hợp lệ.', 'error');
            return;
        }

        setLoading(true);
        try {
            const selectedUnit = unitOptions.find((u) => String(u._id || '') === String(selectedUnitId || '')) || unitOptions[0] || null;
            await createQuickGoodsReceipt({
                supplier_id: supplierId,
                items: [{
                    product_id: selectedProduct._id,
                    unit_id: selectedUnit?._id || null,
                    quantity: Number(quantity),
                    unit_cost: parseCurrencyInput(unitCost),
                    unit_name: selectedUnit?.unit_name || selectedProduct.base_unit || 'Cái',
                    ratio: Number(selectedUnit?.exchange_value) > 0 ? Number(selectedUnit.exchange_value) : 1,
                    expiry_date: expiryDate || undefined,
                }],
                payment_type: paymentType,
                payment_method: paymentMethod,
                reason: reason.trim() || undefined,
            });
            navigate('/manager/receipts', {
                state: { success: 'Nhập hàng nhanh thành công. Phiếu nhập kho đã được tạo và duyệt tự động.' },
            });
        } catch (err) {
            toast(err.message || 'Không thể tạo phiếu nhập hàng', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitCreateNew = async (e) => {
        e.preventDefault();
        if (!supplierId) return toast('Vui lòng chọn nhà cung cấp.', 'error');
        if (!newProductForm.name.trim()) return toast('Tên sản phẩm là bắt buộc.', 'error');
        if (!newProductForm.sku.trim()) return toast('SKU là bắt buộc.', 'error');
        if (newProductForm.sale_price === '' || parseCurrencyInput(newProductForm.sale_price) < 0) return toast('Giá bán không hợp lệ.', 'error');
        if (newProductForm.cost_price === '' || parseCurrencyInput(newProductForm.cost_price) < 0) return toast('Giá nhập không hợp lệ.', 'error');
        if (newProductForm.stock_qty === '' || Number(newProductForm.stock_qty) < 0) return toast('Số lượng nhập ban đầu không hợp lệ.', 'error');
        const existingProduct = await findExistingProductForCreateFlow({
            name: newProductForm.name,
            sku: newProductForm.sku,
            barcode: newProductForm.barcode,
        });
        if (existingProduct) {
            setLoading(true);
            try {
                await createQuickReceiptForExistingProduct(existingProduct);
            } catch (err) {
                toast(err.message || 'Không thể nhập thêm tồn cho sản phẩm đã có.', 'error');
            } finally {
                setLoading(false);
            }
            return;
        }
        const unitRows = Array.isArray(newProductForm.selling_units) && newProductForm.selling_units.length > 0
            ? newProductForm.selling_units
            : [makeSellingUnitRow(newProductForm.base_unit || 'Cái')];
        const normalizedUnits = [];
        const unitNameSet = new Set();
        const unitBarcodeSet = new Set();
        for (const u of unitRows) {
            const unitName = String(u.name || '').trim();
            const ratioNum = Number(u.ratio);
            const saleNum = parseCurrencyInput(u.sale_price);
            const unitBarcode = String(u.barcode || '').trim();
            if (!unitName) return toast('Tên đơn vị bán không được để trống.', 'error');
            if (!Number.isFinite(ratioNum) || ratioNum <= 0) return toast(`Tỉ lệ đơn vị "${unitName}" phải lớn hơn 0.`, 'error');
            if (!Number.isFinite(saleNum) || saleNum < 0) return toast(`Giá bán đơn vị "${unitName}" không hợp lệ.`, 'error');
            const key = unitName.toLowerCase();
            if (unitNameSet.has(key)) return toast(`Đơn vị "${unitName}" bị trùng.`, 'error');
            unitNameSet.add(key);
            if (unitBarcode) {
                if (!/^\d+$/.test(unitBarcode)) return toast(`Barcode đơn vị "${unitName}" chỉ được nhập số.`, 'error');
                if (unitBarcodeSet.has(unitBarcode)) return toast(`Barcode "${unitBarcode}" bị trùng giữa các đơn vị.`, 'error');
                unitBarcodeSet.add(unitBarcode);
            }
            normalizedUnits.push({
                name: unitName,
                ratio: ratioNum,
                sale_price: Math.round(saleNum),
                barcode: unitBarcode,
            });
        }
        const hasBase = normalizedUnits.some((u) => Number(u.ratio) === 1);
        if (!hasBase) {
            normalizedUnits.unshift({
                name: String(newProductForm.base_unit || 'Cái').trim() || 'Cái',
                ratio: 1,
                sale_price: Math.round(parseCurrencyInput(newProductForm.sale_price) || 0),
                barcode: String(newProductForm.barcode || '').trim(),
            });
        }

        setLoading(true);
        try {
            let imageUrls = [];
            if (selectedImages.length > 0) {
                imageUrls = await uploadProductImages(selectedImages);
            }
            const created = await createProduct({
                name: newProductForm.name.trim(),
                sku: newProductForm.sku.trim(),
                barcode: String(newProductForm.barcode || '').trim() || undefined,
                supplier_id: supplierId,
                cost_price: parseCurrencyInput(newProductForm.cost_price),
                stock_qty: Number(newProductForm.stock_qty),
                payment_type: paymentType,
                payment_method: paymentMethod,
                reorder_level: 0,
                expiry_date: expiryDate || undefined,
                base_unit: newProductForm.base_unit,
                selling_units: normalizedUnits.map((u) => ({
                    name: u.name,
                    ratio: u.ratio,
                    sale_price: u.sale_price,
                    barcode: String(u.barcode || '').trim() || undefined,
                })),
                image_urls: imageUrls,
                status: 'active',
            });
            const unitPayload = normalizedUnits.map((u) => ({
                unit_name: u.name,
                exchange_value: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
                price: Math.round(parseCurrencyInput(u.sale_price) || 0),
                barcode: String(u.barcode || '').trim() || undefined,
                is_base: Number(u.ratio) === 1,
            }));
            if (created?._id && unitPayload.length > 0) {
                await updateProductUnits(created._id, unitPayload);
            }
            navigate('/manager/products', {
                state: { success: 'Tạo sản phẩm mới thành công. Phiếu nhập kho ban đầu đã được tạo tự động.' },
            });
        } catch (err) {
            const msg = String(err?.message || '');
            if (
                err?.code === 'SKU_ALREADY_EXISTS' ||
                err?.code === 'BARCODE_ALREADY_EXISTS' ||
                err?.code === 'DUPLICATE_DATA' ||
                /SKU đã tồn tại|Barcode đã tồn tại|đã tồn tại|dữ liệu bị trùng|trùng/i.test(msg)
            ) {
                let fallback = null;
                if (err?.existing_product_id) {
                    fallback = (productList || []).find((p) => String(p._id) === String(err.existing_product_id));
                    if (!fallback) {
                        try {
                            const fresh = await getProducts(1, 100, newProductForm.sku || newProductForm.name || newProductForm.barcode || '');
                            fallback = (fresh?.products || []).find((p) => String(p._id) === String(err.existing_product_id)) || null;
                        } catch (_) {}
                    }
                }
                if (!fallback) {
                    fallback = await findExistingProductForCreateFlow({
                        name: newProductForm.name,
                        sku: newProductForm.sku,
                        barcode: newProductForm.barcode,
                    });
                }
                if (!fallback) {
                    const unitBarcodes = [...new Set(
                        (normalizedUnits || [])
                            .map((u) => String(u?.barcode || '').trim())
                            .filter(Boolean)
                    )];
                    for (const ub of unitBarcodes) {
                        try {
                            const scanned = await scanProductByCode(ub);
                            if (scanned?.product?._id) {
                                fallback = scanned.product;
                                break;
                            }
                        } catch (_) {}
                    }
                }
                if (fallback) {
                    try {
                        await createQuickReceiptForExistingProduct(fallback);
                        return;
                    } catch (fallbackErr) {
                        toast(fallbackErr.message || 'Sản phẩm đã có nhưng không thể tự nhập thêm tồn.', 'error');
                        return;
                    }
                }
            }
            toast(err.message || 'Không thể tạo sản phẩm mới.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSupplier = async () => {
        const name = String(newSupplier.name || '').trim();
        const phone = String(newSupplier.phone || '').trim();
        if (!name) {
            toast('Vui lòng nhập tên nhà cung cấp mới.', 'error');
            return;
        }
        setCreatingSupplier(true);
        try {
            const created = await createSupplier({
                name,
                phone: phone || undefined,
                status: 'active',
            });
            setSupplierList((prev) => [created, ...prev.filter((s) => String(s._id) !== String(created._id))]);
            setSupplierId(created._id);
            setNewSupplier({ name: '', phone: '' });
            toast('Đã tạo nhà cung cấp mới và chọn tự động.', 'success');
        } catch (err) {
            toast(err.message || 'Không thể tạo nhà cung cấp mới.', 'error');
        } finally {
            setCreatingSupplier(false);
        }
    };

    return (
        <ManagerPageFrame showNotificationBell>
            <StaffPageShell
                eyebrow="Kho hàng"
                eyebrowIcon={Zap}
                title="Nhập hàng"
                subtitle="Một điểm vào duy nhất: tìm thấy sản phẩm thì nhập nhanh, không thấy thì tạo mới ngay."
                headerActions={
                    <Button type="button" variant="outline" onClick={() => navigate('/manager/receipts')}>
                        Xem phiếu nhập
                    </Button>
                }
            >
                <div className="space-y-4">
                    {/* Tìm kiếm trung tâm */}
                    <Card>
                        <CardContent className="space-y-3 py-4">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                                Quét mã / tìm sản phẩm
                            </h3>
                            <div className="relative" ref={dropdownRef}>
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onFocus={() => setShowDropdown(true)}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setSearchInput(next);
                                        if (!next.trim()) clearFoundProduct();
                                        setShowDropdown(true);
                                        setCreateMode(false);
                                    }}
                                    placeholder="Quét barcode hoặc nhập tên/SKU..."
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                />
                                {showDropdown && filteredProducts.length > 0 && (
                                    <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                        {filteredProducts.map((p) => (
                                            <button
                                                key={p._id}
                                                type="button"
                                                onMouseDown={() => selectProduct(p)}
                                                className="flex w-full flex-col px-3 py-2 text-left text-xs hover:bg-sky-50"
                                            >
                                                <span className="font-semibold text-slate-800">{p.name}</span>
                                                <span className="text-slate-500">
                                                    SKU: {p.sku || '—'} | Tồn: {Number(p.stock_qty || 0).toLocaleString('vi-VN')}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {!selectedProduct && searchInput.trim() && filteredProducts.length === 0 && !createMode && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                    Sản phẩm mới chưa có trong hệ thống.
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const seed = searchInput.trim();
                                            setCreateMode(true);
                                            setNewProductForm((prev) => ({
                                                ...prev,
                                                name: /^\d+$/.test(seed) ? '' : seed,
                                                sku: /^\d+$/.test(seed) ? '' : normalizeSku(seed),
                                                barcode: /^\d+$/.test(seed) ? seed : '',
                                                selling_units: applyBarcodeToBaseUnit(
                                                    {
                                                        ...prev,
                                                        base_unit: prev.base_unit || 'Cái',
                                                        sale_price: prev.sale_price || '',
                                                    },
                                                    /^\d+$/.test(seed) ? seed : ''
                                                ),
                                            }));
                                        }}
                                        className="ml-2 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                                    >
                                        Tạo mới ngay
                                    </button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Nhánh 1: sản phẩm đã có */}
                    {selectedProduct && !createMode && (
                        <form onSubmit={handleSubmitQuickReceipt}>
                            <Card>
                                <CardContent className="space-y-3 py-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                                        Nhập hàng cho sản phẩm đã có
                                    </h3>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                                            <div className="font-semibold text-slate-800">{selectedProduct.name}</div>
                                            <div className="text-slate-600">
                                                {(() => {
                                                    const selectedUnit = unitOptions.find((u) => String(u._id || '') === String(selectedUnitId || '')) || unitOptions[0];
                                                    const ratio = Number(selectedUnit?.exchange_value) > 0 ? Number(selectedUnit.exchange_value) : 1;
                                                    const stock = Number(selectedProduct.stock_qty || 0);
                                                    const whole = Math.floor(stock / ratio);
                                                    const rem = stock - whole * ratio;
                                                    return (
                                                        <>
                                                            Tồn hiện tại: <strong>{whole.toLocaleString('vi-VN')}</strong> {selectedUnit?.unit_name || selectedProduct.base_unit || 'Cái'}
                                                            {rem > 0 ? ` (dư ${rem} ${selectedProduct.base_unit || 'Cái'})` : ''}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Số lượng nhập thêm</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={quantity}
                                                onChange={(e) => setQuantity(e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Đơn vị nhập</label>
                                            <select
                                                value={selectedUnitId}
                                                onFocus={() => selectedProduct && loadUnitsForSelectedProduct(selectedProduct)}
                                                onChange={(e) => {
                                                    const nextId = e.target.value;
                                                    setSelectedUnitId(nextId);
                                                    const u = unitOptions.find((x) => String(x._id || '') === String(nextId || ''));
                                                    const ratio = Number(u?.exchange_value) > 0 ? Number(u.exchange_value) : 1;
                                                    setUnitCost(toCurrencyInputFromNumber(Math.round((Number(selectedProduct?.cost_price) || 0) * ratio)));
                                                }}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                {!unitOptions.length && <option value="">-- Chưa có đơn vị --</option>}
                                                {unitOptions.map((u) => (
                                                    <option key={String(u._id || u.unit_name)} value={u._id || ''}>
                                                        {u.unit_name} (x{u.exchange_value})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Giá nhập</label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={unitCost}
                                                onChange={(e) => setUnitCost(formatCurrencyInput(e.target.value))}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Nhà cung cấp</label>
                                            <select
                                                value={supplierId}
                                                onChange={(e) => setSupplierId(e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                <option value="">— Chọn nhà cung cấp —</option>
                                                {supplierList.map((s) => (
                                                    <option key={s._id} value={s._id}>
                                                        {s.name}{s.phone ? ` — ${s.phone}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Hạn sử dụng</label>
                                            <input
                                                type="date"
                                                min={minExpiryDateString()}
                                                value={expiryDate}
                                                onChange={(e) => setExpiryDate(e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Thanh toán NCC</label>
                                            <select
                                                value={paymentType}
                                                onChange={(e) => setPaymentType(e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                <option value="cash">Đã thanh toán (tiền mặt/chuyển khoản)</option>
                                                <option value="credit">Ghi nợ NCC</option>
                                            </select>
                                        </div>
                                        {paymentType === 'cash' && (
                                            <div>
                                                <label className="mb-1 block text-sm font-medium text-slate-600">Phương thức trả ngay</label>
                                                <select
                                                    value={paymentMethod}
                                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                >
                                                    <option value="cash">Tiền mặt</option>
                                                    <option value="bank_transfer">Chuyển khoản</option>
                                                </select>
                                            </div>
                                        )}
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Ghi chú</label>
                                            <input
                                                type="text"
                                                value={reason}
                                                onChange={(e) => setReason(e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div className="md:col-span-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
                                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Không thấy nhà cung cấp trong danh sách?</div>
                                            <div className="grid gap-2 md:grid-cols-3">
                                                <input
                                                    type="text"
                                                    value={newSupplier.name}
                                                    onChange={(e) => setNewSupplier((prev) => ({ ...prev, name: e.target.value }))}
                                                    placeholder="Tên NCC mới *"
                                                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                />
                                                <input
                                                    type="text"
                                                    value={newSupplier.phone}
                                                    onChange={(e) => setNewSupplier((prev) => ({ ...prev, phone: e.target.value }))}
                                                    placeholder="Số điện thoại (tùy chọn)"
                                                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                />
                                                <Button type="button" variant="outline" onClick={handleCreateSupplier} disabled={creatingSupplier}>
                                                    {creatingSupplier ? 'Đang tạo...' : 'Tạo NCC & chọn'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                                            Tổng tiền phiếu nhập:{' '}
                                            <strong>{quickReceiptTotal.toLocaleString('vi-VN')} đ</strong>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button type="button" variant="outline" onClick={clearFoundProduct}>Đổi sản phẩm</Button>
                                        <Button type="submit" disabled={loading}>{loading ? 'Đang lưu...' : 'Nhập hàng ngay'}</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </form>
                    )}

                    {/* Nhánh 2: tạo mới ngay */}
                    {createMode && !selectedProduct && (
                        <form onSubmit={handleSubmitCreateNew}>
                            <Card>
                                <CardContent className="space-y-3 py-4">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                                        Tạo sản phẩm mới ngay
                                    </h3>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Tên sản phẩm *</label>
                                            <input
                                                type="text"
                                                value={newProductForm.name}
                                                onChange={(e) => setNewProductForm((p) => ({ ...p, name: e.target.value }))}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">SKU *</label>
                                            <input
                                                type="text"
                                                value={newProductForm.sku}
                                                onChange={(e) => setNewProductForm((p) => ({ ...p, sku: normalizeSku(e.target.value) }))}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Barcode</label>
                                            <input
                                                type="text"
                                                value={newProductForm.barcode}
                                                onChange={(e) =>
                                                    setNewProductForm((p) => {
                                                        const nextBarcode = e.target.value;
                                                        return {
                                                            ...p,
                                                            barcode: nextBarcode,
                                                            selling_units: applyBarcodeToBaseUnit(p, nextBarcode),
                                                        };
                                                    })
                                                }
                                                ref={barcodeInputRef}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Đơn vị</label>
                                            <select
                                                value={newProductForm.base_unit}
                                                onChange={(e) => setNewProductForm((p) => {
                                                    const nextBase = e.target.value || 'Cái';
                                                    const nextUnits = (p.selling_units || []).map((u) =>
                                                        Number(u.ratio) === 1 ? { ...u, name: nextBase } : u
                                                    );
                                                    return { ...p, base_unit: nextBase, selling_units: nextUnits };
                                                })}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                {PRODUCT_BASE_UNITS.map((unit) => (
                                                    <option key={unit} value={unit}>{unit}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Giá bán *</label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={newProductForm.sale_price}
                                                onChange={(e) => setNewProductForm((p) => {
                                                    const nextSale = formatCurrencyInput(e.target.value);
                                                    const nextUnits = (p.selling_units || []).map((u) =>
                                                        Number(u.ratio) === 1 ? { ...u, sale_price: nextSale } : u
                                                    );
                                                    return { ...p, sale_price: nextSale, selling_units: nextUnits };
                                                })}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Giá nhập *</label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={newProductForm.cost_price}
                                                onChange={(e) => setNewProductForm((p) => ({ ...p, cost_price: formatCurrencyInput(e.target.value) }))}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Số lượng nhập ban đầu *</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={newProductForm.stock_qty}
                                                onChange={(e) => setNewProductForm((p) => ({ ...p, stock_qty: e.target.value }))}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Nhà cung cấp</label>
                                            <select
                                                value={supplierId}
                                                onChange={(e) => setSupplierId(e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                <option value="">— Chọn nhà cung cấp —</option>
                                                {supplierList.map((s) => (
                                                    <option key={s._id} value={s._id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Hạn sử dụng</label>
                                            <input
                                                type="date"
                                                min={minExpiryDateString()}
                                                value={expiryDate}
                                                onChange={(e) => setExpiryDate(e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Thanh toán NCC</label>
                                            <select
                                                value={paymentType}
                                                onChange={(e) => setPaymentType(e.target.value)}
                                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                            >
                                                <option value="cash">Đã thanh toán (tiền mặt/chuyển khoản)</option>
                                                <option value="credit">Ghi nợ NCC</option>
                                            </select>
                                        </div>
                                        {paymentType === 'cash' && (
                                            <div>
                                                <label className="mb-1 block text-sm font-medium text-slate-600">Phương thức trả ngay</label>
                                                <select
                                                    value={paymentMethod}
                                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                >
                                                    <option value="cash">Tiền mặt</option>
                                                    <option value="bank_transfer">Chuyển khoản</option>
                                                </select>
                                            </div>
                                        )}
                                        <div className="md:col-span-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
                                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Không thấy nhà cung cấp trong danh sách?</div>
                                            <div className="grid gap-2 md:grid-cols-3">
                                                <input
                                                    type="text"
                                                    value={newSupplier.name}
                                                    onChange={(e) => setNewSupplier((prev) => ({ ...prev, name: e.target.value }))}
                                                    placeholder="Tên NCC mới *"
                                                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                />
                                                <input
                                                    type="text"
                                                    value={newSupplier.phone}
                                                    onChange={(e) => setNewSupplier((prev) => ({ ...prev, phone: e.target.value }))}
                                                    placeholder="Số điện thoại (tùy chọn)"
                                                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                />
                                                <Button type="button" variant="outline" onClick={handleCreateSupplier} disabled={creatingSupplier}>
                                                    {creatingSupplier ? 'Đang tạo...' : 'Tạo NCC & chọn'}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="mb-2 flex items-center justify-between">
                                                <label className="block text-sm font-medium text-slate-600">Đơn vị bán & barcode</label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() =>
                                                        setNewProductForm((p) => ({
                                                            ...p,
                                                            selling_units: [
                                                                ...(p.selling_units || []),
                                                                makeSellingUnitRow(p.base_unit || 'Cái', { ratio: '', sale_price: '', barcode: '' }),
                                                            ],
                                                        }))
                                                    }
                                                >
                                                    + Đơn vị
                                                </Button>
                                            </div>
                                            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                                                {(newProductForm.selling_units || []).map((u, idx) => (
                                                    <div key={u.row_id || idx} className="grid gap-2 md:grid-cols-4">
                                                        <input
                                                            type="text"
                                                            value={u.name}
                                                            onChange={(e) =>
                                                                setNewProductForm((p) => ({
                                                                    ...p,
                                                                    selling_units: (p.selling_units || []).map((x, i) =>
                                                                        i === idx ? { ...x, name: e.target.value } : x
                                                                    ),
                                                                }))
                                                            }
                                                            placeholder="Đơn vị (Lon/Thùng...)"
                                                            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                        />
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            step="any"
                                                            value={u.ratio}
                                                            onChange={(e) =>
                                                                setNewProductForm((p) => ({
                                                                    ...p,
                                                                    selling_units: (p.selling_units || []).map((x, i) =>
                                                                        i === idx ? { ...x, ratio: e.target.value } : x
                                                                    ),
                                                                }))
                                                            }
                                                            placeholder="Tỉ lệ (vd 24)"
                                                            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                        />
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={u.sale_price}
                                                            onChange={(e) =>
                                                                setNewProductForm((p) => ({
                                                                    ...p,
                                                                    selling_units: (p.selling_units || []).map((x, i) =>
                                                                        i === idx ? { ...x, sale_price: formatCurrencyInput(e.target.value) } : x
                                                                    ),
                                                                }))
                                                            }
                                                            placeholder="Giá bán đơn vị"
                                                            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                        />
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={u.barcode || ''}
                                                                onChange={(e) =>
                                                                    setNewProductForm((p) => ({
                                                                        ...p,
                                                                        selling_units: (p.selling_units || []).map((x, i) =>
                                                                            i === idx ? { ...x, barcode: e.target.value } : x
                                                                        ),
                                                                    }))
                                                                }
                                                                placeholder="Barcode đơn vị"
                                                                className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none ring-sky-200 transition focus:ring-2"
                                                            />
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                onClick={() =>
                                                                    setNewProductForm((p) => {
                                                                        const list = (p.selling_units || []).filter((_, i) => i !== idx);
                                                                        return {
                                                                            ...p,
                                                                            selling_units: list.length
                                                                                ? list
                                                                                : [makeSellingUnitRow(p.base_unit || 'Cái')],
                                                                        };
                                                                    })
                                                                }
                                                                disabled={(newProductForm.selling_units || []).length <= 1}
                                                            >
                                                                Xóa
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="mb-1 block text-sm font-medium text-slate-600">Ảnh sản phẩm (tối đa 3)</label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                onChange={(e) => setSelectedImages(Array.from(e.target.files || []).slice(0, 3))}
                                                className="block w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600"
                                            />
                                            {imagePreviews.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {imagePreviews.map((url, idx) => (
                                                        <img
                                                            key={`${url}-${idx}`}
                                                            src={url}
                                                            alt={`preview-${idx + 1}`}
                                                            className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                                            Tổng tiền nhập ban đầu:{' '}
                                            <strong>{createNewInitialTotal.toLocaleString('vi-VN')} đ</strong>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button type="button" variant="outline" onClick={() => setCreateMode(false)}>Quay lại tìm kiếm</Button>
                                        <Button type="submit" disabled={loading}>{loading ? 'Đang lưu...' : 'Tạo mới và nhập hàng'}</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </form>
                    )}

                    {/* Ghi chú nghiệp vụ */}
                    <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 text-xs text-teal-800">
                        <strong>Lưu ý:</strong> Khi có phát sinh tồn kho, hệ thống luôn tự tạo phiếu nhập kho và duyệt tự động.
                        {paymentType === 'credit' && supplierId ? <span> Khoản nợ NCC sẽ ghi vào mục <strong>Công nợ nhà cung cấp</strong>.</span> : null}
                    </div>
                </div>
            </StaffPageShell>
        </ManagerPageFrame>
    );
}
