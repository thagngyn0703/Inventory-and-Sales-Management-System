import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCustomers, createCustomer, updateCustomer, payCustomerDebt } from '../../services/customersApi';
import { getInvoices } from '../../services/invoicesApi';
import { useToast } from '../../contexts/ToastContext';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { Button } from '../../components/ui/button';
import { Users } from 'lucide-react';

export default function SalesCustomerPage({ managerMode = false }) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchKey, setSearchKey] = useState('');
    const [error, setError] = useState('');

    // Modal state
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ full_name: '', phone: '' });
    const [creatingCustomer, setCreatingCustomer] = useState(false);
    const [customerModalError, setCustomerModalError] = useState('');
    // Debt Payment Modal state
    const [payDebtModal, setPayDebtModal] = useState({ show: false, customer: null, amount: '', paymentMethod: 'cash' });
    const [isPayingDebt, setIsPayingDebt] = useState(false);
    
    // Edit Customer Modal
    const [editCustomerModal, setEditCustomerModal] = useState({ 
        show: false, 
        customer: { full_name: '', phone: '', email: '', address: '', debt_account: 0 }, 
        saving: false, 
        error: '' 
    });
    
    // History Modal
    const [historyModal, setHistoryModal] = useState({ show: false, customer: null, invoices: [], loading: false });

    const fetchDebtHistory = async (customer) => {
        setHistoryModal({ show: true, customer, invoices: [], loading: true });
        try {
            const data = await getInvoices({ 
                customer_id: customer._id, 
                payment_method: 'debt',
                limit: 100 
            });
            setHistoryModal(prev => ({ ...prev, invoices: data.invoices || [], loading: false }));
        } catch (e) {
            console.error(e);
            setHistoryModal(prev => ({ ...prev, loading: false }));
        }
    };

    const handlePrintDebtReceipt = (customer, payAmount, paymentMethod) => {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) return;

        const previousDebt = customer.debt_account || 0;
        const newDebt = Math.max(0, previousDebt - payAmount);

        const html = `
          <html>
            <head>
              <title>Biên lai thu nợ</title>
              <style>
                body { font-family: 'Arial', sans-serif; padding: 40px; line-height: 1.6; color: #333; }
                .header { text-align: center; margin-bottom: 30px; border-bottom: 1px dashed #ccc; padding-bottom: 20px; }
                .header h1 { margin: 0; font-size: 28px; text-transform: uppercase; color: #1e293b; }
                .info { margin-bottom: 30px; }
                .info div { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 16px; }
                .info b { color: #64748b; }
                .total-section { border-top: 2px solid #0081ff; padding-top: 20px; margin-top: 20px; }
                .total-row { display: flex; justify-content: space-between; font-size: 22px; font-weight: bold; color: #0f172a; }
                .footer { text-align: center; margin-top: 60px; font-style: italic; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
                .amount-highlight { font-weight: bold; color: #ff4757; }
              </style>
            </head>
            <body onload="window.print(); window.close();">
              <div class="header">
                <h1>BIÊN LAI THU NỢ</h1>
                <p>Mã GD: ${Date.now()}</p>
                <p>Thời gian: ${new Date().toLocaleString('vi-VN')}</p>
              </div>
              <div class="info">
                <div><b>Tên khách hàng:</b> <span>${customer.full_name}</span></div>
                <div><b>Số điện thoại:</b> <span>${customer.phone || '—'}</span></div>
                <div><b>Phương thức:</b> <span>${paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</span></div>
              </div>
              <div class="total-section">
                <div class="info">
                  <div><b>Số dư nợ cũ:</b> <span>${Number(previousDebt).toLocaleString('vi-VN')}₫</span></div>
                  <div><b>Số tiền thanh toán:</b> <span class="amount-highlight">${Number(payAmount).toLocaleString('vi-VN')}₫</span></div>
                </div>
                <div class="total-row">
                  <span>DƯ NỢ CÒN LẠI:</span>
                  <span style="color: #0081ff;">${Number(newDebt).toLocaleString('vi-VN')}₫</span>
                </div>
              </div>
              <div class="footer">
                <p>Cảm ơn quý khách đã tin tưởng!</p>
                <p>Vui lòng giữ lại biên lai để đối chiếu nếu cần.</p>
              </div>
            </body>
          </html>
        `;
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    };

    // Real-time phone check for New Customer
    useEffect(() => {
        const tel = newCustomer.phone.trim().replace(/\s/g, '');
        if (tel.length >= 10 && tel.length <= 11) {
            const timer = setTimeout(async () => {
                try {
                    const { customers: list } = await getCustomers(tel);
                    const exists = list.find(c => c.phone === tel);
                    if (exists) {
                        setCustomerModalError('Số điện thoại này đã tồn tại trong hệ thống.');
                    } else {
                        setCustomerModalError('');
                    }
                } catch (e) {
                    console.error('Phone check error:', e);
                }
            }, 500);
            return () => clearTimeout(timer);
        } else if (tel.length > 0) {
            setCustomerModalError('Số điện thoại phải có 10 hoặc 11 chữ số.');
        } else {
            setCustomerModalError('');
        }
    }, [newCustomer.phone]);

    // Real-time phone check for Edit Customer
    useEffect(() => {
        if (!editCustomerModal.show || !editCustomerModal.customer) return;
        const tel = editCustomerModal.customer.phone ? editCustomerModal.customer.phone.trim().replace(/\s/g, '') : '';
        if (tel.length >= 10 && tel.length <= 11) {
            const timer = setTimeout(async () => {
                try {
                    const { customers: list } = await getCustomers(tel);
                    // Filter out the current customer being edited
                    const exists = list.find(c => c.phone === tel && c._id !== editCustomerModal.customer._id);
                    if (exists) {
                        setEditCustomerModal(prev => ({ ...prev, error: 'Số điện thoại này đã tồn tại trong hệ thống.' }));
                    } else {
                        setEditCustomerModal(prev => ({ ...prev, error: '' }));
                    }
                } catch (e) {
                    console.error('Phone check error:', e);
                }
            }, 500);
            return () => clearTimeout(timer);
        } else if (tel.length > 0) {
            setEditCustomerModal(prev => ({ ...prev, error: 'Số điện thoại phải có 10 hoặc 11 chữ số.' }));
        } else {
            setEditCustomerModal(prev => ({ ...prev, error: '' }));
        }
    }, [editCustomerModal.customer?.phone, editCustomerModal.show]);

    const fetchCustomers = async (search = '') => {
        setLoading(true);
        setError('');
        try {
            const data = await getCustomers(search);
            setCustomers(data.customers || []);
        } catch (err) {
            setError(err.message || 'Lỗi khi lấy danh sách khách hàng');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchCustomers(searchKey);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchKey]);

    const handleCreateCustomer = async () => {
        if (!newCustomer.full_name || !newCustomer.phone) {
            setCustomerModalError('Vui lòng nhập đầy đủ Tên và Số điện thoại.');
            return;
        }
        const cleanPhone = newCustomer.phone.trim().replace(/\s/g, '');
        if (cleanPhone.length < 10 || cleanPhone.length > 11) {
            setCustomerModalError('Số điện thoại phải có 10 hoặc 11 chữ số.');
            return;
        }
        setCreatingCustomer(true);
        setCustomerModalError('');
        try {
            await createCustomer({ ...newCustomer, status: 'active', is_regular: true });
            setShowCreateCustomer(false);
            setNewCustomer({ full_name: '', phone: '' });
            toast('Thêm khách hàng thành công!', 'success');
            fetchCustomers(searchKey);
        } catch (e) {
            setCustomerModalError(e.message || 'Lỗi khi thêm khách hàng mới');
        } finally {
            setCreatingCustomer(false);
        }
    };

    const handlePayDebt = async () => {
        if (!payDebtModal.amount || Number(payDebtModal.amount) < 0) {
            toast('Vui lòng nhập số tiền hợp lệ', 'error');
            return;
        }
        setIsPayingDebt(true);
        try {
            await payCustomerDebt(payDebtModal.customer._id, Number(payDebtModal.amount), payDebtModal.paymentMethod);
            
            // Print Receipt
            handlePrintDebtReceipt(payDebtModal.customer, Number(payDebtModal.amount), payDebtModal.paymentMethod);
            
            toast('Thanh toán nợ thành công!', 'success');
            setPayDebtModal({ show: false, customer: null, amount: '', paymentMethod: 'cash' });
            fetchCustomers(searchKey);
        } catch (e) {
            toast(e.message || 'Lỗi khi thanh toán nợ', 'error');
        } finally {
            setIsPayingDebt(false);
        }
    };

    return (
        <StaffPageShell
            eyebrow={managerMode ? 'Quản lý cửa hàng' : 'Bán hàng'}
            eyebrowIcon={Users}
            title="Quản lý khách hàng"
            subtitle="Theo dõi khách hàng, công nợ và lịch sử thanh toán."
            headerActions={
                <Button type="button" className="gap-2" onClick={() => setShowCreateCustomer(true)}>
                    <i className="fa-solid fa-plus" /> Thêm khách hàng
                </Button>
            }
        >
            <div className="flex min-h-0 flex-1 flex-col">
            <main className="flex-1">
                    {error && <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: 16 }}>{error}</div>}

                    <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', padding: 20 }}>
                        <div style={{ marginBottom: 20 }}>
                            <input 
                                type="text" 
                                placeholder="Tìm khách hàng theo Tên, SĐT..." 
                                value={searchKey}
                                onChange={(e) => setSearchKey(e.target.value)}
                                style={{ width: 300, padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none' }}
                            />
                        </div>

                        {loading ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Đang tải dữ liệu...</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontSize: 13, width: 60 }}>STT</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontSize: 13 }}>Tên khách hàng</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontSize: 13 }}>Số điện thoại</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#475569', fontSize: 13, width: 120 }}>Dư nợ (VNĐ)</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontSize: 13, width: 100 }}>Ngày tạo</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontSize: 13, width: 180 }}>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customers.length === 0 ? (
                                        <tr><td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Chưa có khách hàng nào</td></tr>
                                    ) : (
                                        customers.map((c, idx) => (
                                            <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '16px', color: '#64748b' }}>{idx + 1}</td>
                                                <td style={{ padding: '16px', fontWeight: 600, color: '#0f172a' }}>{c.full_name}</td>
                                                <td style={{ padding: '16px', color: '#334155' }}>{c.phone || '-'}</td>
                                                <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: (c.debt_account > 0) ? '#ef4444' : '#10b981' }}>
                                                    {Number(c.debt_account || 0).toLocaleString('vi-VN')}
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                                                    {new Date(c.created_at).toLocaleDateString('vi-VN')}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <button 
                                                        onClick={() => fetchDebtHistory(c)}
                                                        style={{ background: '#eff6ff', color: '#0081ff', border: '1px solid #dbeafe', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, marginRight: 4 }}
                                                    >
                                                        Lịch sử nợ
                                                    </button>
                                                    <button 
                                                        onClick={() => setEditCustomerModal({ 
                                                            show: true, 
                                                            customer: { 
                                                                ...c, 
                                                                email: c.email || '', 
                                                                address: c.address || '',
                                                                debt_account: c.debt_account || 0
                                                            }, 
                                                            saving: false, 
                                                            error: '' 
                                                        })}
                                                        style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, marginRight: 4 }}
                                                    >
                                                        Sửa
                                                    </button>
                                                    {c.debt_account > 0 && (
                                                        <button 
                                                            onClick={() => setPayDebtModal({ show: true, customer: c, amount: c.debt_account, paymentMethod: 'cash' })}
                                                            style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fee2e2', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                                                        >
                                                            Thu nợ
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </main>

            {/* Create Customer Modal */}
            {showCreateCustomer && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'white', padding: '24px', borderRadius: '8px',
                        width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', color: '#1e293b' }}>Thêm Khách hàng Mới</h3>
                        {customerModalError && <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: '16px', color: '#ef4444', fontSize: 14 }}>{customerModalError}</div>}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Tên khách hàng <span style={{ color: '#ef4444' }}>*</span></label>
                            <input 
                                type="text" 
                                value={newCustomer.full_name}
                                onChange={e => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="Nhập tên khách hàng"
                            />
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Số điện thoại <span style={{ color: '#ef4444' }}>*</span></label>
                            <input 
                                type="text" 
                                value={newCustomer.phone}
                                onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="Nhập số điện thoại"
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button 
                                style={{ padding: '8px 16px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={() => { setShowCreateCustomer(false); setCustomerModalError(''); }}
                            >
                                Hủy
                            </button>
                            <button 
                                style={{ padding: '8px 16px', border: 'none', background: '#0081ff', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={handleCreateCustomer}
                                disabled={creatingCustomer || !!customerModalError}
                            >
                                {creatingCustomer ? 'Đang lưu...' : 'Lưu khách hàng'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pay Debt Modal */}
            {payDebtModal.show && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'white', padding: '24px', borderRadius: '8px',
                        width: '400px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', color: '#1e293b' }}>Thu nợ: {payDebtModal.customer?.full_name}</h3>
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fee2e2' }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#991b1b' }}>Số nợ hiện tại:</span>
                                <span style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>{Number(payDebtModal.customer?.debt_account).toLocaleString('vi-VN')} VNĐ</span>
                            </div>
                        </div>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Số tiền trả <span style={{ color: '#ef4444' }}>*</span></label>
                            <input 
                                type="number" 
                                value={payDebtModal.amount}
                                onChange={e => setPayDebtModal({ ...payDebtModal, amount: e.target.value })}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontWeight: 700, fontSize: 16 }}
                                placeholder="Nhập số tiền trả nợ"
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Hình thức thanh toán</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button 
                                    style={{ 
                                        flex: 1, padding: '10px', borderRadius: 6, border: payDebtModal.paymentMethod === 'cash' ? '2px solid #10b981' : '1px solid #cbd5e1',
                                        background: payDebtModal.paymentMethod === 'cash' ? '#f0fdf4' : 'white', cursor: 'pointer', fontWeight: 600, color: payDebtModal.paymentMethod === 'cash' ? '#10b981' : '#64748b'
                                    }}
                                    onClick={() => setPayDebtModal({ ...payDebtModal, paymentMethod: 'cash' })}
                                >
                                    <i className="fa-solid fa-money-bill" style={{ marginRight: 6 }} /> Tiền mặt
                                </button>
                                <button 
                                    style={{ 
                                        flex: 1, padding: '10px', borderRadius: 6, border: payDebtModal.paymentMethod === 'bank_transfer' ? '2px solid #0081ff' : '1px solid #cbd5e1',
                                        background: payDebtModal.paymentMethod === 'bank_transfer' ? '#eff6ff' : 'white', cursor: 'pointer', fontWeight: 600, color: payDebtModal.paymentMethod === 'bank_transfer' ? '#0081ff' : '#64748b'
                                    }}
                                    onClick={() => setPayDebtModal({ ...payDebtModal, paymentMethod: 'bank_transfer' })}
                                >
                                    <i className="fa-solid fa-building-columns" style={{ marginRight: 6 }} /> Chuyển khoản
                                </button>
                            </div>
                        </div>

                        {payDebtModal.paymentMethod === 'bank_transfer' && Number(payDebtModal.amount) > 0 && (
                            <div style={{ marginBottom: 20, textAlign: 'center', background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                <p style={{ margin: '0 0 10px', fontSize: 13, color: '#0081ff', fontWeight: 600 }}>Quét mã để thu nợ</p>
                                <img 
                                    src={`https://img.vietqr.io/image/vcb-1122334455-compact2.png?amount=${payDebtModal.amount}&addInfo=Thu no khach hang ${payDebtModal.customer?.full_name}`} 
                                    alt="QR Code" 
                                    style={{ width: 140, height: 140, mixBlendMode: 'multiply' }} 
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button 
                                style={{ padding: '8px 16px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={() => setPayDebtModal({ show: false, customer: null, amount: '', paymentMethod: 'cash' })}
                            >
                                Hủy
                            </button>
                            <button 
                                style={{ padding: '10px 20px', border: 'none', background: '#10b981', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                                onClick={handlePayDebt}
                                disabled={isPayingDebt}
                            >
                                {isPayingDebt ? 'Đang lưu...' : 'XÁC NHẬN THU NỢ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Customer Modal */}
            {editCustomerModal.show && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'white', padding: '24px', borderRadius: '12px',
                        width: '450px', maxWidth: '95%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', color: '#1e293b', fontWeight: 800 }}>Cập nhật thông tin: {editCustomerModal.customer?.full_name}</h3>
                        
                        {editCustomerModal.error && <div className="warehouse-alert warehouse-alert-error" style={{ marginBottom: 16 }}>{editCustomerModal.error}</div>}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Tên khách hàng</label>
                                <input 
                                    type="text" 
                                    value={editCustomerModal.customer?.full_name || ''}
                                    onChange={e => setEditCustomerModal({ ...editCustomerModal, customer: { ...editCustomerModal.customer, full_name: e.target.value } })}
                                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Số điện thoại</label>
                                <input 
                                    type="text" 
                                    value={editCustomerModal.customer?.phone || ''}
                                    onChange={e => setEditCustomerModal({ ...editCustomerModal, customer: { ...editCustomerModal.customer, phone: e.target.value } })}
                                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button 
                                style={{ padding: '10px 20px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                                onClick={() => setEditCustomerModal({ show: false, customer: null, saving: false })}
                            >
                                Hủy
                            </button>
                            <button 
                                style={{ padding: '10px 20px', border: 'none', background: '#0081ff', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                                onClick={async () => {
                                    const cleanPhone = editCustomerModal.customer.phone ? editCustomerModal.customer.phone.trim().replace(/\s/g, '') : '';
                                    if (cleanPhone && (cleanPhone.length < 10 || cleanPhone.length > 11)) {
                                        setEditCustomerModal({ ...editCustomerModal, error: 'Số điện thoại phải có 10 hoặc 11 chữ số.' });
                                        return;
                                    }
                                    setEditCustomerModal({ ...editCustomerModal, saving: true, error: '' });
                                    try {
                                        await updateCustomer(editCustomerModal.customer._id, {
                                            full_name: editCustomerModal.customer.full_name,
                                            phone: cleanPhone
                                        });
                                        toast('Cập nhật khách hàng thành công!', 'success');
                                        setEditCustomerModal({ show: false, customer: null, saving: false, error: '' });
                                        fetchCustomers(searchKey);
                                    } catch (e) {
                                        setEditCustomerModal({ ...editCustomerModal, saving: false, error: e.message || 'Lỗi khi cập nhật khách hàng' });
                                    }
                                }}
                                disabled={editCustomerModal.saving}
                            >
                                {editCustomerModal.saving ? 'Đang lưu...' : 'LƯU THAY ĐỔI'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Debt History Modal */}
            {historyModal.show && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'white', padding: '24px', borderRadius: '12px',
                        width: '700px', maxWidth: '95%', maxHeight: '80vh', overflowY: 'auto',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontSize: '20px', color: '#1e293b', fontWeight: 800 }}>
                                Lịch sử ghi nợ: {historyModal.customer?.full_name}
                            </h3>
                            <button 
                                onClick={() => setHistoryModal({ ...historyModal, show: false })}
                                style={{ border: 'none', background: 'none', fontSize: 24, cursor: 'pointer', color: '#94a3b8' }}
                            >
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>
                        
                        {historyModal.loading ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>Đang tải lịch sử...</div>
                        ) : historyModal.invoices.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Khách hàng này chưa có hóa đơn ghi nợ nào.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                                    <tr>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: 12, color: '#64748b' }}>Mã đơn</th>
                                        <th style={{ padding: '12px', textAlign: 'left', fontSize: 12, color: '#64748b' }}>Ngày tạo</th>
                                        <th style={{ padding: '12px', textAlign: 'right', fontSize: 12, color: '#64748b' }}>Tổng đơn</th>
                                        <th style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>Trạng thái nợ</th>
                                        <th style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyModal.invoices.map(inv => (
                                        <tr key={inv._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px', fontSize: 13, fontWeight: 500 }}>#{inv._id.slice(-8).toUpperCase()}</td>
                                            <td style={{ padding: '12px', fontSize: 13 }}>{new Date(inv.created_at).toLocaleString('vi-VN')}</td>
                                            <td style={{ padding: '12px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                                                {inv.total_amount?.toLocaleString('vi-VN')}₫
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <span style={{ 
                                                    padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                                                    background: inv.status === 'pending' ? '#fef3c7' : '#d1fae5',
                                                    color: inv.status === 'pending' ? '#92400e' : '#065f46',
                                                    border: `1px solid ${inv.status === 'pending' ? '#fde68a' : '#6ee7b7'}`
                                                }}>
                                                    {inv.status === 'pending' ? 'Nợ' : 'Đã thanh toán'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <button 
                                                    onClick={() => navigate(`/staff/invoices/${inv._id}`)}
                                                    style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#475569' }}
                                                >
                                                    Chi tiết
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        
                        <div style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600, color: '#475569' }}>Tổng dư nợ hiện tại:</span>
                            <span style={{ fontWeight: 800, color: '#ef4444', fontSize: 18 }}>
                                {historyModal.customer?.debt_account?.toLocaleString('vi-VN')}₫
                            </span>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </StaffPageShell>
    );
}
