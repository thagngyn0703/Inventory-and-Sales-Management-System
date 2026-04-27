import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { createSupplier, uploadSupplierQrImage } from '../../services/suppliersApi';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import './ManagerDashboard.css';
import './ManagerProducts.css';

const defaultForm = {
    code: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    tax_code: '',
    note: '',
    status: 'active',
    payable_account: '',
    bank_qr_image_url: '',
};

export default function ManagerSupplierCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedQrFile, setSelectedQrFile] = useState(null);
    const [qrPreviewUrl, setQrPreviewUrl] = useState('');

    const update = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) {
            setError('Vui lòng nhập tên nhà cung cấp.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            let qrUrl = form.bank_qr_image_url ? String(form.bank_qr_image_url).trim() : '';
            if (selectedQrFile) {
                qrUrl = await uploadSupplierQrImage(selectedQrFile);
            }
            await createSupplier({
                code: form.code ? String(form.code).trim() : undefined,
                name: form.name.trim(),
                phone: form.phone ? String(form.phone).trim() : undefined,
                email: form.email ? String(form.email).trim() : undefined,
                address: form.address ? String(form.address).trim() : undefined,
                tax_code: form.tax_code ? String(form.tax_code).trim() : undefined,
                note: form.note ? String(form.note).trim() : undefined,
                status: form.status === 'inactive' ? 'inactive' : 'active',
                payable_account: Number(form.payable_account) || 0,
                bank_qr_image_url: qrUrl || undefined,
            });
            navigate('/manager/suppliers', { state: { success: 'Thêm nhà cung cấp thành công.' } });
        } catch (err) {
            setError(err.message || 'Không thể tạo nhà cung cấp.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ManagerPageFrame showNotificationBell>
            <StaffPageShell
                eyebrow="Nhà cung cấp"
                eyebrowIcon={Plus}
                title="Thêm nhà cung cấp"
                subtitle="Tạo nhà cung cấp mới trong hệ thống."
                headerActions={
                    <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/manager/suppliers')}>
                        <ArrowLeft className="h-4 w-4" />
                        Quay lại
                    </Button>
                }
            >
                    {error && (
                        <div className="manager-products-error mb-4">{error}</div>
                    )}

                    <Card className="border-slate-200/80 shadow-sm">
                        <CardContent className="p-5 sm:p-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Mã nhà cung cấp</label>
                                    <input
                                        type="text"
                                        value={form.code}
                                        onChange={(e) => update('code', e.target.value)}
                                        placeholder="VD: NCC001"
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Tên nhà cung cấp <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => update('name', e.target.value)}
                                        placeholder="Nhập tên nhà cung cấp"
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Điện thoại</label>
                                    <input
                                        type="text"
                                        value={form.phone}
                                        onChange={(e) => update('phone', e.target.value)}
                                        placeholder="Số điện thoại"
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => update('email', e.target.value)}
                                        placeholder="email@example.com"
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Mã số thuế</label>
                                    <input
                                        type="text"
                                        value={form.tax_code}
                                        onChange={(e) => update('tax_code', e.target.value)}
                                        placeholder="Mã số thuế"
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Trạng thái</label>
                                    <select
                                        value={form.status}
                                        onChange={(e) => update('status', e.target.value)}
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    >
                                        <option value="active">Hoạt động</option>
                                        <option value="inactive">Ngừng</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Địa chỉ</label>
                                    <input
                                        type="text"
                                        value={form.address}
                                        onChange={(e) => update('address', e.target.value)}
                                        placeholder="Địa chỉ nhà cung cấp"
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Công nợ (đ)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1000"
                                        value={form.payable_account}
                                        onChange={(e) => update('payable_account', e.target.value)}
                                        placeholder="0"
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">Ảnh QR chuyển khoản</label>
                                    <input className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200" type="file" accept="image/*" onChange={(e) => {
                                        const f = e.target.files?.[0] || null;
                                        setSelectedQrFile(f);
                                        setQrPreviewUrl(f ? URL.createObjectURL(f) : '');
                                    }} />
                                    {qrPreviewUrl && (
                                        <img src={qrPreviewUrl} alt="QR preview" className="mt-2 h-[140px] w-[140px] rounded-lg border border-slate-200 object-contain" />
                                    )}
                                    <p className="mt-1 text-xs text-slate-500">Chọn ảnh QR từ máy. Hệ thống sẽ tự upload.</p>
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">Ghi chú</label>
                                    <input
                                        type="text"
                                        value={form.note}
                                        onChange={(e) => update('note', e.target.value)}
                                        placeholder="Ghi chú (tùy chọn)"
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-teal-200/80 focus:ring-2"
                                    />
                            </div>
                            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate('/manager/suppliers')}
                                >
                                    Hủy
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={loading}
                                >
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    {loading ? 'Đang lưu...' : 'Tạo nhà cung cấp'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                    </Card>
            </StaffPageShell>
        </ManagerPageFrame>
    );
}
