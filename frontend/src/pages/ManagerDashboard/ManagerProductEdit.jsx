import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import ManagerNotificationBell from '../../components/ManagerNotificationBell';
import { getProduct, updateProduct } from '../../services/productsApi';
import { minExpiryDateString, isExpiryDateNotInPast } from '../../utils/dateInput';
import { getSuppliers } from '../../services/suppliersApi';
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

    useEffect(() => {
        let cancelled = false;
        getSuppliers()
            .then((list) => { if (!cancelled) setSuppliers(list || []); })
            .catch(() => { if (!cancelled) setSuppliers([]); });
        return () => { cancelled = true; };
    }, []);

    const baseUnitEntry = useMemo(() => form.selling_units.find((u) => Number(u.ratio) === 1) || form.selling_units[0], [form.selling_units]);
    const saleNum = useMemo(() => Number(baseUnitEntry?.sale_price) || 0, [baseUnitEntry]);
    const costNum = useMemo(() => Number(form.cost_price) || 0, [form.cost_price]);
    const expectedProfit = useMemo(() => Math.max(0, saleNum - costNum), [saleNum, costNum]);

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
                    status: p.status === 'inactive' ? 'inactive' : 'active',
                });
            })
            .catch((e) => setError(e.message || 'Không tải được sản phẩm'))
            .finally(() => setLoadProduct(false));
    }, [id]);

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!id) return;
        if (!form.name.trim()) {
            setError('Vui lòng nhập tên sản phẩm.');
            return;
        }
        if (!form.sku.trim()) {
            setError('Vui lòng nhập SKU.');
            return;
        }
        const units = form.selling_units
            .filter((u) => u.name && String(u.ratio).trim() !== '' && String(u.sale_price).trim() !== '')
            .map((u) => ({
                name: String(u.name).trim(),
                ratio: Number(u.ratio) > 0 ? Number(u.ratio) : 1,
                sale_price: Number(u.sale_price) >= 0 ? Number(u.sale_price) : 0,
            }));
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

        setLoading(true);
        setError('');
        try {
            await updateProduct(id, {
                name: form.name.trim(),
                sku: form.sku.trim(),
                barcode: form.barcode ? String(form.barcode).trim() : undefined,
                supplier_id: form.supplier_id && form.supplier_id.trim() ? form.supplier_id.trim() : undefined,
                cost_price: costNum,
                stock_qty: Number(form.stock_qty) || 0,
                reorder_level: Number(form.reorder_level) || 0,
                expiry_date: form.expiry_date ? form.expiry_date : null,
                base_unit: form.base_unit || 'Cái',
                selling_units: units,
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
            <div className="manager-page-with-sidebar">
                <ManagerSidebar />
                <div className="manager-main">
                    <div className="manager-content">
                        <p className="manager-products-loading">Đang tải...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <div className="manager-topbar-search-wrap" />
                    <div className="manager-topbar-actions">
                        <ManagerNotificationBell />
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>

                <div className="manager-content manager-product-detail-page manager-product-form-page">
                    <div className="manager-products-header">
                        <div>
                            <h1 className="manager-page-title">Sửa sản phẩm</h1>
                            <p className="manager-page-subtitle">Đơn vị tồn kho (gốc) và nhiều đơn vị bán với giá khác nhau.</p>
                        </div>
                        <div className="manager-detail-actions">
                            <button type="button" className="manager-btn-outline" onClick={() => navigate(`/manager/products/${id}`)}>
                                <i className="fa-solid fa-eye" /> Xem chi tiết
                            </button>
                            <button type="button" className="manager-btn-outline" onClick={() => navigate('/manager/products')}>
                                <i className="fa-solid fa-arrow-left" /> Danh sách
                            </button>
                        </div>
                    </div>

                    {error && <div className="manager-products-error">{error}</div>}

                    <form onSubmit={handleSubmit}>
                        <div className="manager-detail-card">
                            <div className="manager-detail-sections-row">
                                <div className="manager-detail-section">
                                    <h3 className="manager-detail-section-title">Thông tin cơ bản</h3>
                                    <div className="manager-detail-table-wrap">
                                        <table className="manager-detail-table manager-detail-table--form">
                                            <tbody>
                                                <tr>
                                                    <td className="manager-detail-label">Tên sản phẩm <span className="required">*</span></td>
                                                    <td className="manager-detail-value">
                                                        <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Nhập tên sản phẩm" />
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="manager-detail-label">SKU <span className="required">*</span></td>
                                                    <td className="manager-detail-value">
                                                        <input type="text" value={form.sku} onChange={(e) => update('sku', e.target.value)} placeholder="Mã SKU" />
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="manager-detail-label">Barcode</td>
                                                    <td className="manager-detail-value">
                                                        <input type="text" value={form.barcode} onChange={(e) => update('barcode', e.target.value)} placeholder="Mã vạch (tùy chọn)" />
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="manager-detail-label">Nhà cung cấp</td>
                                                    <td className="manager-detail-value">
                                                        <select value={form.supplier_id} onChange={(e) => update('supplier_id', e.target.value)}>
                                                            <option value="">— Không chọn —</option>
                                                            {suppliers.map((s) => (
                                                                <option key={s._id} value={s._id}>
                                                                    {s.name}
                                                                    {s.phone ? ` — ${s.phone}` : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="manager-detail-label">Trạng thái</td>
                                                    <td className="manager-detail-value">
                                                        <select value={form.status} onChange={(e) => update('status', e.target.value)}>
                                                            <option value="active">Đang bán</option>
                                                            <option value="inactive">Ngừng bán</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="manager-detail-form-col">
                                    <div className="manager-detail-section">
                                        <h3 className="manager-detail-section-title">Giá & đơn vị</h3>
                                        <div className="manager-detail-table-wrap">
                                            <table className="manager-detail-table manager-detail-table--form">
                                                <tbody>
                                                    <tr>
                                                        <td className="manager-detail-label">Đơn vị tồn kho (gốc)</td>
                                                        <td className="manager-detail-value">
                                                            <select value={form.base_unit} onChange={(e) => update('base_unit', e.target.value)}>
                                                                {PRODUCT_BASE_UNITS.map((u) => (
                                                                    <option key={u} value={u}>{u}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td className="manager-detail-label">Giá vốn (₫) / 1 đơn vị gốc</td>
                                                        <td className="manager-detail-value">
                                                            <input type="number" min="0" step="1000" value={form.cost_price} onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))} placeholder="0" />
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="manager-detail-section">
                                        <h3 className="manager-detail-section-title">Tồn kho</h3>
                                        <div className="manager-detail-table-wrap">
                                            <table className="manager-detail-table manager-detail-table--form">
                                                <tbody>
                                                    <tr>
                                                        <td className="manager-detail-label">Tồn kho (theo đơn vị gốc)</td>
                                                        <td className="manager-detail-value">
                                                            <input type="number" min="0" value={form.stock_qty} onChange={(e) => update('stock_qty', e.target.value)} placeholder="0" />
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td className="manager-detail-label">Mức tồn tối thiểu</td>
                                                        <td className="manager-detail-value">
                                                            <input type="number" min="0" value={form.reorder_level} onChange={(e) => update('reorder_level', e.target.value)} placeholder="0" />
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td className="manager-detail-label">Hạn sử dụng</td>
                                                        <td className="manager-detail-value">
                                                            <input
                                                                type="date"
                                                                min={minExpiryDateString()}
                                                                value={form.expiry_date}
                                                                onChange={(e) => update('expiry_date', e.target.value)}
                                                            />
                                                            <p className="manager-form-hint-inline" style={{ marginTop: 6 }}>
                                                                Chỉ chọn ngày từ hôm nay trở đi. Nếu sản phẩm trước đây có hạn quá khứ, hãy nhập lại hạn mới hoặc để trống.
                                                            </p>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="manager-detail-section">
                                <h3 className="manager-detail-section-title">Đơn vị bán & giá</h3>
                                <p className="manager-form-hint-inline">
                                    Tỉ lệ = số đơn vị gốc (vd: 1 Thùng = 24 Lon → tỉ lệ 24). Phải có ít nhất 1 đơn vị với tỉ lệ 1.
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                    <button type="button" className="manager-btn-outline manager-btn-small" onClick={addSellingUnit}>
                                        <i className="fa-solid fa-plus" /> Thêm đơn vị bán
                                    </button>
                                </div>
                                <div className="manager-selling-units-table-wrap">
                                    <table className="manager-selling-units-table">
                                        <thead>
                                            <tr>
                                                <th>Đơn vị</th>
                                                <th>Tỉ lệ</th>
                                                <th>Giá bán (₫)</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {form.selling_units.map((u, i) => (
                                                <tr key={i}>
                                                    <td>
                                                        <input type="text" value={u.name} onChange={(e) => updateSellingUnit(i, 'name', e.target.value)} placeholder="vd: Lon" className="manager-selling-unit-input" />
                                                    </td>
                                                    <td>
                                                        <input type="number" min="1" step="1" value={u.ratio} onChange={(e) => updateSellingUnit(i, 'ratio', e.target.value)} placeholder="1" className="manager-selling-unit-input manager-selling-unit-ratio" />
                                                    </td>
                                                    <td>
                                                        <input type="number" min="0" step="1000" value={u.sale_price} onChange={(e) => updateSellingUnit(i, 'sale_price', e.target.value)} placeholder="0" className="manager-selling-unit-input" />
                                                    </td>
                                                    <td>
                                                        <button type="button" className="manager-btn-icon" title="Xóa" onClick={() => removeSellingUnit(i)} disabled={form.selling_units.length <= 1}>
                                                            <i className="fa-solid fa-trash" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {(saleNum > 0 || costNum > 0) && (
                                    <div className="manager-profit-hint">
                                        Lời dự kiến (theo đơn vị gốc): <strong>{expectedProfit.toLocaleString('vi-VN')}₫</strong>
                                        {costNum > 0 && <span className="manager-profit-margin">(tỷ lệ lãi: {((expectedProfit / costNum) * 100).toFixed(1)}%)</span>}
                                    </div>
                                )}
                            </div>

                            <div className="manager-detail-form-actions">
                                <button type="button" className="manager-btn-outline" onClick={() => navigate('/manager/products')}>Hủy</button>
                                <button type="submit" className="manager-btn-primary" disabled={loading}>{loading ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
