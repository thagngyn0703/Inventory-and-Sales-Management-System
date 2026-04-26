import React, { useState, useEffect } from 'react';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { FolderTree, Search } from 'lucide-react';
import './Categories.css';
import '../ManagerDashboard/ManagerDashboard.css';
import { useToast } from '../../contexts/ToastContext';

/**
 * CATEGORIES COMPONENT - Quản lý danh mục sản phẩm
 * Chức năng: CRUD operations cho categories, search, filter
 */

// API base URL - Cấu hình endpoint backend
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const TAX_PRESET_CATEGORIES = [
    {
        name: 'Hàng không chịu thuế',
        vat_rate: 0,
        tax_profile: 'NO_VAT',
        tax_tags: ['no_vat'],
        keywords: ['gao', 'nong san', 'lua', 'thoc', 'agri_raw'],
    },
    {
        name: 'Hàng thiết yếu',
        vat_rate: 5,
        tax_profile: 'VAT_5',
        tax_tags: ['essential_goods', 'clean_water'],
        keywords: ['nuoc sach', 'nuoc sinh hoat', 'vat_5', 'essential'],
    },
    {
        name: 'Hàng chịu TTĐB',
        vat_rate: 10,
        tax_profile: 'BEER_2026',
        tax_tags: ['special_consumption_tax', 'ttdb'],
        keywords: ['bia', 'ruou', 'thuoc la', 'ttdb', 'beer', 'alcohol', 'tobacco'],
    },
    {
        name: 'Hàng xuất khẩu',
        vat_rate: 0,
        tax_profile: 'VAT_0',
        tax_tags: ['vat_0', 'export'],
        keywords: ['xuat khau', 'export', 'vat_0'],
    },
    {
        name: 'Hàng hóa thông thường',
        vat_rate: 10,
        tax_profile: 'VAT_10',
        tax_tags: ['standard_vat'],
        keywords: ['tieu dung', 'do gia dung', 'hang hoa', 'vat_10', 'standard', 'nuoc ngot', 'nuoc giai khat', 'soft drink', 'coca', 'pepsi'],
    },
];

function normalizeText(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatTaxProfileLabel(profile = '') {
    const code = String(profile || '').toUpperCase().trim();
    const map = {
        NO_VAT: 'Gạo, nông sản thô chưa chế biến (VD: gạo tẻ, lúa thóc)',
        VAT_0: 'Hàng/dịch vụ xuất khẩu đủ điều kiện (VD: bán hàng ra nước ngoài, dịch vụ làm cho khách ở nước ngoài)',
        VAT_5: 'Nước sạch sinh hoạt, hàng thiết yếu nhóm 5% (VD: tiền nước máy sinh hoạt, phân bón cây trồng)',
        VAT_10: 'Hàng tiêu dùng thông thường (VD: Lavie/Aquafina đóng chai, Coca/Pepsi)',
        BEER_2026: 'Bia, rượu, thuốc lá (VD: bia lon, thuốc lá điếu)',
    };
    return map[code] || 'Mặt hàng thông thường theo cấu hình hiện tại';
}

function formatCategoryDisplayName(name = '') {
    const raw = String(name || '').trim();
    if (!raw) return '—';
    // Ẩn hậu tố kỹ thuật trong ngoặc để tên danh mục ngắn gọn, dễ đọc.
    return raw.replace(/\s*\((VAT_[0-9]+|NO_VAT|BEER_2026|VAT\s*[0-9]+%?)\)\s*$/i, '').trim() || raw;
}

function getEffectiveProfile(cat) {
    const profile = String(cat?.tax_profile || '').toUpperCase().trim();
    if (['NO_VAT', 'VAT_0', 'VAT_5', 'VAT_10', 'BEER_2026'].includes(profile)) return profile;
    const tags = Array.isArray(cat?.tax_tags) ? cat.tax_tags.map((x) => String(x).toLowerCase()) : [];
    const vat = Number(cat?.vat_rate ?? 0);
    if (tags.includes('special_consumption_tax') || tags.includes('ttdb')) return 'BEER_2026';
    if (tags.includes('export') || tags.includes('vat_0')) return 'VAT_0';
    if (vat === 5) return 'VAT_5';
    if (vat === 10) return 'VAT_10';
    return 'NO_VAT';
}

const Categories = () => {
    // ========== STATE MANAGEMENT ==========
    // Danh sách categories từ API
    const [categories, setCategories] = useState([]);

    // Loading state - hiển thị spinner khi đang fetch
    const [loading, setLoading] = useState(false);

    // Error state - hiển thị lỗi khi API fail
    const [, setError] = useState('');

    // ========== CREATE MODAL STATE ==========
    // Modal tạo category mới
    const [showCreateModal, setShowCreateModal] = useState(false);
    // Input value cho category name mới
    const [newName, setNewName] = useState('');
    const [newVatRate, setNewVatRate] = useState('');
    const [newTaxProfile, setNewTaxProfile] = useState('default');
    const [newTaxTags, setNewTaxTags] = useState('');

    // ========== EDIT MODAL STATE ==========
    // Modal chỉnh sửa category
    const [showEditModal, setShowEditModal] = useState(false);
    // ID của category đang edit
    const [editingId, setEditingId] = useState(null);
    // Name của category đang edit
    const [editingName, setEditingName] = useState('');
    const [editingVatRate, setEditingVatRate] = useState('');
    const [editingTaxProfile, setEditingTaxProfile] = useState('default');
    const [editingTaxTags, setEditingTaxTags] = useState('');

    // ========== SEARCH STATE ==========
    // Search term đã được apply (filtered)
    const [search, setSearch] = useState('');
    // Search input hiện tại (real-time)
    const [searchInput, setSearchInput] = useState('');
    const [syncingTaxSetup, setSyncingTaxSetup] = useState(false);
    const { toast } = useToast();

    // ========== AUTHENTICATION ==========
    // Token từ localStorage để authenticate API calls
    const token = localStorage.getItem('token');

    // ========== LIFECYCLE - FETCH DATA ==========
    /**
     * useEffect - Fetch categories khi component mount
     * Dependency: [token] - refetch khi token thay đổi
     */
    useEffect(() => {
        const fetchCategories = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch(`${API_BASE}/categories`, {
                    headers: { Authorization: 'Bearer ' + token },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Không thể tải danh mục');
                setCategories(data);
            } catch (err) {
                setError(err.message);
                toast(err.message || 'Không thể tải danh mục', 'error');
            }
            setLoading(false);
        };
        fetchCategories();
    }, [token]);

    // ========== UTILITY FUNCTIONS ==========
    /**
     * refetchCategories - Re-fetch categories sau khi CRUD operations
     * Được gọi sau create, edit, delete để update UI
     */
    const refetchCategories = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories`, {
                headers: { Authorization: 'Bearer ' + token },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Không thể tải danh mục');
            setCategories(data);
        } catch (err) {
            setError(err.message);
            toast(err.message || 'Không thể tải danh mục', 'error');
        }
        setLoading(false);
    };

    // ========== CRUD HANDLERS ==========
    /**
     * handleCreate - Xử lý tạo category mới
     * POST /api/categories với name và token
     */
    const handleCreate = async (ev) => {
        ev.preventDefault();
        if (!newName.trim()) return; // Validation: không tạo empty name

        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({
                    name: newName.trim(),
                    vat_rate: newVatRate === '' ? null : Number(newVatRate),
                    tax_profile: newTaxProfile || 'default',
                    tax_tags: String(newTaxTags || '').split(',').map((x) => x.trim()).filter(Boolean),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Tạo danh mục thất bại');

            // Reset form và đóng modal
            setNewName('');
            setNewVatRate('');
            setNewTaxProfile('default');
            setNewTaxTags('');
            setShowCreateModal(false);
            refetchCategories(); // Update UI
        } catch (err) {
            setError(err.message);
            toast(err.message || 'Tạo danh mục thất bại', 'error');
        }
        setLoading(false);
    };

    // ========== EDIT HANDLERS ==========
    /**
     * startEdit - Mở modal edit với data của category được chọn
     * @param {Object} cat - Category object từ list
     */
    const startEdit = (cat) => {
        setEditingId(cat._id);
        setEditingName(cat.name);
        setEditingVatRate(
            cat.vat_rate === null || cat.vat_rate === undefined || cat.vat_rate === ''
                ? ''
                : String(cat.vat_rate)
        );
        setEditingTaxProfile(cat.tax_profile || 'default');
        setEditingTaxTags(Array.isArray(cat.tax_tags) ? cat.tax_tags.join(', ') : '');
        setShowEditModal(true);
    };

    /**
     * cancelEdit - Hủy edit và reset edit state
     */
    const cancelEdit = () => {
        setEditingId(null);
        setEditingName('');
        setEditingVatRate('');
        setEditingTaxProfile('default');
        setEditingTaxTags('');
        setShowEditModal(false);
    };

    /**
     * saveEdit - Lưu thay đổi category
     * PUT /api/categories/:id với name mới
     */
    const saveEdit = async () => {
        if (!editingName.trim()) return; // Validation

        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories/${editingId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({
                    name: editingName.trim(),
                    vat_rate: editingVatRate === '' ? null : Number(editingVatRate),
                    tax_profile: editingTaxProfile || 'default',
                    tax_tags: String(editingTaxTags || '').split(',').map((x) => x.trim()).filter(Boolean),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Cập nhật thất bại');

            cancelEdit(); // Reset edit state
            refetchCategories(); // Update UI
        } catch (err) {
            setError(err.message);
            toast(err.message || 'Cập nhật danh mục thất bại', 'error');
        }
        setLoading(false);
    };

    // ========== TOGGLE STATUS HANDLER ==========
    /**
     * toggleActive - Bật/tắt trạng thái active của category
     * PATCH /api/categories/:id/activate với is_active toggle
     */
    const toggleActive = async (id, current) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories/${id}/activate`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ is_active: !current }), // Toggle value
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Cập nhật thất bại');
            refetchCategories(); // Update UI
        } catch (err) {
            setError(err.message);
            toast(err.message || 'Cập nhật trạng thái thất bại', 'error');
        }
        setLoading(false);
    };

    const deleteCategory = async (cat) => {
        if (!cat?._id) return;
        const ok = window.confirm(`Xóa danh mục "${cat.name}"?\nDanh mục đang có sản phẩm sử dụng sẽ không xóa được.`);
        if (!ok) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/categories/${cat._id}`, {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + token },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'Không thể xóa danh mục');
            await refetchCategories();
            toast(`Đã xóa danh mục "${cat.name}".`, 'success');
        } catch (err) {
            setError(err.message);
            toast(err.message || 'Không thể xóa danh mục', 'error');
        } finally {
            setLoading(false);
        }
    };

    // ========== SEARCH HANDLER ==========
    /**
     * handleSearchSubmit - Xử lý submit search form
     * Set search term để filter categories
     */
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setSearch(searchInput.trim());
    };

    const applyVietnamTaxPresetCore = async () => {
        setError('');
        try {
            const normalizedExisting = categories.map((cat) => ({
                ...cat,
                __normalized: normalizeText(cat.name),
            }));

            let updatedCount = 0;
            let createdCount = 0;

            for (const preset of TAX_PRESET_CATEGORIES) {
                const matchedByProfile = normalizedExisting.find((cat) => String(cat.tax_profile || '').toUpperCase() === preset.tax_profile);
                const matched = matchedByProfile || normalizedExisting.find((cat) => {
                    if (!cat.__normalized) return false;
                    return preset.keywords.some((kw) => cat.__normalized.includes(normalizeText(kw)));
                });

                if (matched) {
                    const res = await fetch(`${API_BASE}/categories/${matched._id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: 'Bearer ' + token,
                        },
                        body: JSON.stringify({
                            name: preset.name,
                            vat_rate: preset.vat_rate,
                            tax_profile: preset.tax_profile,
                            tax_tags: preset.tax_tags,
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || `Không thể cập nhật danh mục: ${matched.name}`);
                    updatedCount += 1;
                    continue;
                }

                const res = await fetch(`${API_BASE}/categories`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token,
                    },
                    body: JSON.stringify({
                        name: preset.name,
                        vat_rate: preset.vat_rate,
                        tax_profile: preset.tax_profile,
                        tax_tags: preset.tax_tags,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || `Không thể tạo danh mục mẫu: ${preset.name}`);
                createdCount += 1;
            }

            await refetchCategories();
            setError('');
            return { updatedCount, createdCount };
        } catch (err) {
            setError(err.message || 'Không thể áp mẫu thuế VN 2026');
            throw err;
        }
    };

    const syncProductTaxFromCategoriesCore = async (sourceCategories = categories) => {
        setError('');
        try {
            const categoryMap = new Map(
                sourceCategories.map((cat) => [
                    String(cat._id),
                    {
                        vat_rate: cat.vat_rate === null || cat.vat_rate === undefined || cat.vat_rate === '' ? 0 : Number(cat.vat_rate),
                        tax_profile: String(cat.tax_profile || 'default'),
                        tax_tags: Array.isArray(cat.tax_tags) ? cat.tax_tags : [],
                    },
                ])
            );

            const allProducts = [];
            let page = 1;
            let totalPages = 1;
            while (page <= totalPages) {
                const res = await fetch(`${API_BASE}/products?page=${page}&limit=100`, {
                    headers: { Authorization: 'Bearer ' + token },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Không thể tải danh sách sản phẩm');
                allProducts.push(...(data.products || []));
                totalPages = Number(data.totalPages) || 1;
                page += 1;
            }

            let updated = 0;
            for (const product of allProducts) {
                const categoryId = String(product.category_id?._id || product.category_id || '');
                const fromCat = categoryMap.get(categoryId);
                if (!fromCat) continue;

                const desiredTaxCategory = String(fromCat.tax_profile || 'default').toUpperCase();
                const currentTaxCategory = String(product.tax_category || '').toUpperCase();
                const currentTaxProfile = String(product.tax_profile || 'default');
                const currentVatRate = Number(product.vat_rate ?? 0);
                const currentTags = Array.isArray(product.tax_tags) ? product.tax_tags : [];
                const same =
                    currentTaxCategory === desiredTaxCategory
                    && currentTaxProfile === fromCat.tax_profile
                    && currentVatRate === fromCat.vat_rate
                    && JSON.stringify(currentTags) === JSON.stringify(fromCat.tax_tags);
                if (same) continue;

                const res = await fetch(`${API_BASE}/products/${product._id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token,
                    },
                    body: JSON.stringify({
                        tax_category: desiredTaxCategory,
                        tax_profile: fromCat.tax_profile,
                        vat_rate: fromCat.vat_rate,
                        tax_tags: fromCat.tax_tags,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || `Không thể cập nhật thuế cho sản phẩm: ${product.name || product._id}`);
                updated += 1;
            }

            return { updated };
        } catch (err) {
            setError(err.message || 'Không thể gán thuế sản phẩm theo category');
            throw err;
        }
    };

    const consolidateTaxCategoriesCore = async () => {
        const res = await fetch(`${API_BASE}/categories?all=true`, {
            headers: { Authorization: 'Bearer ' + token },
        });
        const freshCategories = await res.json();
        if (!res.ok) throw new Error('Không thể tải danh mục để gộp nhóm thuế');

        const profileList = ['NO_VAT', 'VAT_0', 'VAT_5', 'VAT_10', 'BEER_2026'];
        const canonicalByProfile = new Map();
        for (const profile of profileList) {
            const candidates = (freshCategories || []).filter((c) => getEffectiveProfile(c) === profile);
            if (!candidates.length) continue;
            const presetName = TAX_PRESET_CATEGORIES.find((x) => x.tax_profile === profile)?.name;
            const canonical = candidates.find((c) => String(c.name || '').trim() === String(presetName || '').trim()) || candidates[0];
            canonicalByProfile.set(profile, canonical);
        }

        const allProducts = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
            const pRes = await fetch(`${API_BASE}/products?page=${page}&limit=100`, {
                headers: { Authorization: 'Bearer ' + token },
            });
            const pData = await pRes.json();
            if (!pRes.ok) throw new Error(pData.message || 'Không thể tải sản phẩm để gộp danh mục');
            allProducts.push(...(pData.products || []));
            totalPages = Number(pData.totalPages) || 1;
            page += 1;
        }

        let movedProducts = 0;
        let deactivatedCategories = 0;
        for (const profile of profileList) {
            const canonical = canonicalByProfile.get(profile);
            if (!canonical) continue;
            const duplicates = (freshCategories || []).filter(
                (c) => getEffectiveProfile(c) === profile && String(c._id) !== String(canonical._id)
            );
            for (const dup of duplicates) {
                const usingProducts = allProducts.filter(
                    (p) => String(p.category_id?._id || p.category_id || '') === String(dup._id)
                );
                for (const p of usingProducts) {
                    const uRes = await fetch(`${API_BASE}/products/${p._id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: 'Bearer ' + token,
                        },
                        body: JSON.stringify({ category_id: canonical._id }),
                    });
                    const uData = await uRes.json().catch(() => ({}));
                    if (!uRes.ok) throw new Error(uData.message || `Không thể chuyển sản phẩm "${p.name}" sang danh mục chuẩn`);
                    movedProducts += 1;
                }
                // Không xóa cứng category trùng trong bước auto để tránh fail do liên kết chéo dữ liệu.
                // Thay vào đó hạ trạng thái inactive để danh mục không còn xuất hiện trong luồng sử dụng chính.
                const inactiveRes = await fetch(`${API_BASE}/categories/${dup._id}/activate`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + token,
                    },
                    body: JSON.stringify({ is_active: false }),
                });
                const inactiveData = await inactiveRes.json().catch(() => ({}));
                if (!inactiveRes.ok) {
                    throw new Error(inactiveData.message || `Không thể ẩn danh mục trùng: ${dup.name}`);
                }
                deactivatedCategories += 1;
            }
        }

        const finalRes = await fetch(`${API_BASE}/categories?all=true`, {
            headers: { Authorization: 'Bearer ' + token },
        });
        const finalCategories = await finalRes.json();
        if (!finalRes.ok) throw new Error('Không thể tải danh mục sau khi gộp');
        return { finalCategories, movedProducts, deactivatedCategories };
    };

    const applyTaxPresetAndSyncProducts = async () => {
        setSyncingTaxSetup(true);
        setError('');
        try {
            const { updatedCount, createdCount } = await applyVietnamTaxPresetCore();
            const { finalCategories, movedProducts, deactivatedCategories } = await consolidateTaxCategoriesCore();
            const { updated } = await syncProductTaxFromCategoriesCore(finalCategories);
            await refetchCategories();
            toast(
                `Đồng bộ thuế hoàn tất: cập nhật ${updatedCount}, tạo mới ${createdCount}, ẩn ${deactivatedCategories} danh mục trùng, chuyển ${movedProducts} sản phẩm, cập nhật thuế ${updated} sản phẩm.`,
                'success'
            );
        } catch (err) {
            toast(err.message || 'Không thể đồng bộ mẫu thuế và sản phẩm', 'error');
        } finally {
            setSyncingTaxSetup(false);
        }
    };


    // ========== COMPUTED VALUES ==========
    /**
     * filteredCategories - Filter categories dựa trên search term
     * Case-insensitive search
     */
    const filteredCategories = categories.filter(cat =>
        cat.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <ManagerPageFrame
            showNotificationBell
            topBarLeft={
                <form onSubmit={handleSearchSubmit} className="relative w-full min-w-0 max-w-xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none ring-teal-200/80 transition focus:ring-2"
                        placeholder="Tìm danh mục..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </form>
            }
        >
            <StaffPageShell
                eyebrow="Quản lý cửa hàng"
                eyebrowIcon={FolderTree}
                title="Danh mục sản phẩm"
                subtitle="Tạo, sửa và bật/tắt danh mục dùng cho sản phẩm."
                headerActions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="manager-btn-primary"
                            onClick={applyTaxPresetAndSyncProducts}
                            disabled={loading || syncingTaxSetup}
                            title="Áp mẫu thuế VN 2026 và đồng bộ thuế cho sản phẩm hiện có"
                        >
                            <i className="fa-solid fa-wand-magic-sparkles" /> {syncingTaxSetup ? 'Đang đồng bộ thuế...' : 'Áp mẫu thuế'}
                        </button>
                        <button
                            type="button"
                            className="manager-btn-primary"
                            onClick={() => setShowCreateModal(true)}
                            disabled={loading}
                        >
                            <i className="fa-solid fa-plus" /> Thêm danh mục
                        </button>
                    </div>
                }
            >
                    <div className="manager-panel-card manager-products-card rounded-2xl border border-slate-200/80 shadow-sm">
                        {loading ? (
                            <p className="manager-products-loading">Đang tải...</p>
                        ) : (
                            <div className="manager-products-table-wrap">
                                <table className="manager-products-table">
                                    <thead>
                                        <tr>
                                            <th>TÊN DANH MỤC</th>
                                            <th>MẶT HÀNG ÁP DỤNG</th>
                                            <th>VAT (%)</th>
                                            <th>TRẠNG THÁI</th>
                                            <th>NGÀY TẠO</th>
                                            <th>THAO TÁC</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCategories.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="manager-products-empty">
                                                    {search ? 'Không có danh mục nào phù hợp.' : 'Chưa có danh mục.'}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredCategories.map((cat) => (
                                                <tr key={cat._id}>
                                                    <td>{formatCategoryDisplayName(cat.name)}</td>
                                                    <td>{formatTaxProfileLabel(cat.tax_profile)}</td>
                                                    <td>
                                                        {cat.vat_rate === null || cat.vat_rate === undefined || cat.vat_rate === ''
                                                            ? '—'
                                                            : `${Number(cat.vat_rate)}%`}
                                                    </td>
                                                    <td>
                                                        <button
                                                            className={`manager-products-status manager-products-status--${cat.is_active ? 'active' : 'inactive'}`}
                                                            onClick={() => toggleActive(cat._id, cat.is_active)}
                                                        >
                                                            {cat.is_active ? 'Hoạt động' : 'Dừng hoạt động'}
                                                        </button>
                                                    </td>
                                                    <td>{new Date(cat.created_at).toLocaleDateString('vi-VN')}</td>
                                                    <td>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                className="manager-action-btn"
                                                                onClick={() => startEdit(cat)}
                                                                aria-label="Sửa"
                                                                title="Sửa danh mục"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="manager-action-btn"
                                                                onClick={() => deleteCategory(cat)}
                                                                aria-label="Xóa"
                                                                title="Xóa danh mục"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
            </StaffPageShell>

            {showCreateModal && (
                <div className="modal-overlay" data-testid="create-modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal-content" data-testid="create-modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Tạo danh mục mới</h2>
                        <form onSubmit={handleCreate}>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Nhập tên danh mục"
                                autoFocus
                            />
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={newVatRate}
                                onChange={(e) => setNewVatRate(e.target.value)}
                                placeholder="VAT (%) - để trống nếu không áp dụng"
                            />
                            <input
                                type="text"
                                value={newTaxProfile}
                                onChange={(e) => setNewTaxProfile(e.target.value)}
                                placeholder="Tax profile (default)"
                            />
                            <input
                                type="text"
                                value={newTaxTags}
                                onChange={(e) => setNewTaxTags(e.target.value)}
                                placeholder="Tax tags (comma separated)"
                            />
                            <div className="modal-buttons">
                                <button
                                    type="submit"
                                    disabled={!newName.trim() || loading}
                                    className="btn-submit"
                                    onClick={(e) => {
                                        if (newVatRate !== '' && (Number(newVatRate) < 0 || Number(newVatRate) > 100)) {
                                            e.preventDefault();
                                            const msg = 'VAT phải nằm trong khoảng 0-100%.';
                                            setError(msg);
                                            toast(msg, 'error');
                                        }
                                    }}
                                >
                                    Tạo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setNewName('');
                                        setNewVatRate('');
                                        setNewTaxProfile('default');
                                        setNewTaxTags('');
                                    }}
                                    className="btn-cancel"
                                >
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && (
                <div className="modal-overlay" data-testid="edit-modal-overlay" onClick={cancelEdit}>
                    <div className="modal-content" data-testid="edit-modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Chỉnh sửa danh mục</h2>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                saveEdit();
                            }}
                        >
                            <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                placeholder="Nhập tên danh mục"
                                autoFocus
                            />
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={editingVatRate}
                                onChange={(e) => setEditingVatRate(e.target.value)}
                                placeholder="VAT (%) - để trống nếu không áp dụng"
                            />
                            <input
                                type="text"
                                value={editingTaxProfile}
                                onChange={(e) => setEditingTaxProfile(e.target.value)}
                                placeholder="Tax profile"
                            />
                            <input
                                type="text"
                                value={editingTaxTags}
                                onChange={(e) => setEditingTaxTags(e.target.value)}
                                placeholder="Tax tags (comma separated)"
                            />
                            <div className="modal-buttons">
                                <button
                                    type="submit"
                                    disabled={!editingName.trim() || loading}
                                    className="btn-submit"
                                >
                                    Lưu
                                </button>
                                <button type="button" onClick={cancelEdit} className="btn-cancel">
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </ManagerPageFrame>
    );
};

export default Categories;
