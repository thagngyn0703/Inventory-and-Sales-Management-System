import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerSidebar from './ManagerSidebar';
import { getGoodsReceipts, setGoodsReceiptStatus } from '../../services/goodsReceiptsApi';
import './ManagerDashboard.css';

export default function ManagerReceiptList() {
    const navigate = useNavigate();
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filterStatus, setFilterStatus] = useState(''); 
    const [searchTerm, setSearchTerm] = useState('');
    const [sortByPrice, setSortByPrice] = useState(null); // 'asc' or 'desc'

    const fetchReceipts = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getGoodsReceipts(filterStatus);
            // Managers should not see 'draft' receipts
            const filtered = (data || []).filter(r => r.status !== 'draft');
            setReceipts(filtered);
        } catch (err) {
            setError(err.message || 'Không thể tải danh sách phiếu nhập kho');
        } finally {
            setLoading(false);
        }
    }, [filterStatus]);

    useEffect(() => {
        fetchReceipts();
    }, [fetchReceipts]);

    const handleApprove = async (id) => {
        if (!window.confirm('Bạn có chắc chắn muốn duyệt phiếu nhập này? Kho hàng sẽ được cập nhật số lượng.')) return;
        try {
            await setGoodsReceiptStatus(id, 'approved');
            alert('Đã duyệt phiếu nhập kho.');
            fetchReceipts();
        } catch (err) {
            alert(err.message || 'Lỗi khi duyệt');
        }
    };

    const handleReject = async (id) => {
        if (!window.confirm('Bạn có chắc chắn muốn từ chối phiếu nhập này?')) return;
        try {
            await setGoodsReceiptStatus(id, 'rejected');
            alert('Đã từ chối phiếu nhập kho.');
            fetchReceipts();
        } catch (err) {
            alert(err.message || 'Lỗi khi từ chối');
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleString('vi-VN');
    };

    const handleSortPrice = () => {
        if (sortByPrice === null) setSortByPrice('asc');
        else if (sortByPrice === 'asc') setSortByPrice('desc');
        else setSortByPrice(null);
    };

    const filteredAndSortedReceipts = React.useMemo(() => {
        let result = receipts.filter(r => {
            if (!searchTerm) return true;
            const term = searchTerm.toLowerCase();
            const code = r._id.substring(r._id.length - 6).toLowerCase();
            const supplier = (r.supplier_id?.name || '').toLowerCase();
            const creator = (r.received_by?.fullName || '').toLowerCase();
            return code.includes(term) || supplier.includes(term) || creator.includes(term);
        });

        result.sort((a, b) => {
            if (sortByPrice === 'asc') return Number(a.total_amount) - Number(b.total_amount);
            if (sortByPrice === 'desc') return Number(b.total_amount) - Number(a.total_amount);
            return new Date(b.created_at) - new Date(a.created_at);
        });

        return result;
    }, [receipts, searchTerm, sortByPrice]);

    return (
        <div className="manager-page-with-sidebar">
            <ManagerSidebar />
            <div className="manager-main">
                <header className="manager-topbar">
                    <div className="manager-topbar-actions" style={{ marginLeft: 'auto' }}>
                        <div className="manager-user-badge">
                            <i className="fa-solid fa-circle-user" />
                            <span>Quản lý</span>
                        </div>
                    </div>
                </header>
                <div className="manager-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Duyệt phiếu nhập kho</h1>
                    </div>

            {error && (
                <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: 12, borderRadius: 6, marginBottom: 16 }}>
                    {error}
                </div>
            )}

            <div style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ flex: 1, maxWidth: 300 }}>
                        <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Tìm kiếm</label>
                        <div style={{ position: 'relative' }}>
                            <i className="fa-solid fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}></i>
                            <input
                                type="text"
                                placeholder="Mã phiếu, NCC, Người tạo..."
                                style={{ width: '100%', padding: '8px 12px 8px 36px', border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div style={{ flex: 1, maxWidth: 200 }}>
                        <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Trạng thái</label>
                        <select
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }}
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="">Tất cả</option>
                            <option value="pending">Chờ duyệt</option>
                            <option value="approved">Đã duyệt</option>
                            <option value="rejected">Từ chối</option>
                        </select>
                    </div>
                    <div style={{ flex: 1, maxWidth: 200 }}>
                        <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Sắp xếp giá trị</label>
                        <button
                            type="button"
                            onClick={handleSortPrice}
                            style={{
                                width: '100%',
                                height: 38,
                                padding: '0 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: 6,
                                backgroundColor: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                color: '#111827',
                                fontSize: 14
                            }}
                            title="Nhấn để đổi chiều sắp xếp"
                        >
                            <span>
                                {sortByPrice === 'asc' ? 'Từ thấp đến cao' : sortByPrice === 'desc' ? 'Từ cao xuống thấp' : 'Mặc định (Mới nhất)'}
                            </span>
                            <i className={`fa-solid ${sortByPrice === 'asc' ? 'fa-arrow-up-1-9' : sortByPrice === 'desc' ? 'fa-arrow-down-9-1' : 'fa-sort'}`} style={{ color: '#6b7280' }}></i>
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ backgroundColor: 'white', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                {loading ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>Đang tải dữ liệu...</div>
                ) : filteredAndSortedReceipts.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
                        Không có phiếu nhập kho nào phù hợp.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                            <tr>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Mã phiếu</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Ngày tạo</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Nhà cung cấp</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Người tạo</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Tổng tiền</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Trạng thái</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 500, color: '#4b5563' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedReceipts.map(receipt => (
                                <tr key={receipt._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '16px', fontSize: 14 }}>
                                        <span 
                                            style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 500 }}
                                            onClick={() => navigate(`/manager/receipts/${receipt._id}`)}
                                        >
                                            {receipt._id.substring(receipt._id.length - 6).toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', fontSize: 14, color: '#4b5563' }}>{formatDate(receipt.created_at)}</td>
                                    <td style={{ padding: '16px', fontSize: 14 }}>{receipt.supplier_id?.name || '—'}</td>
                                    <td style={{ padding: '16px', fontSize: 14, color: '#4b5563' }}>{receipt.received_by?.fullName || '—'}</td>
                                    <td style={{ padding: '16px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>
                                        {Number(receipt.total_amount).toLocaleString()} đ
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                        <span style={{
                                            padding: '4px 10px',
                                            borderRadius: 9999,
                                            fontSize: 12,
                                            fontWeight: 500,
                                            backgroundColor: 
                                                receipt.status === 'pending' ? '#fef3c7' :
                                                receipt.status === 'approved' ? '#d1fae5' : '#fee2e2',
                                            color:
                                                receipt.status === 'pending' ? '#92400e' :
                                                receipt.status === 'approved' ? '#065f46' : '#991b1b',
                                        }}>
                                            {receipt.status === 'pending' ? 'Chờ duyệt' : 
                                             receipt.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button
                                            style={{ padding: '6px 12px', marginRight: 8, fontSize: 13, borderRadius: 4, cursor: 'pointer', backgroundColor: 'white', border: '1px solid #d1d5db' }}
                                            onClick={() => navigate(`/manager/receipts/${receipt._id}`)}
                                        >
                                            Chi tiết
                                        </button>
                                        {receipt.status === 'pending' && (
                                            <>
                                                <button
                                                    style={{ padding: '6px 12px', marginRight: 8, fontSize: 13, borderRadius: 4, cursor: 'pointer', backgroundColor: '#10b981', color: 'white', border: 'none' }}
                                                    onClick={() => handleApprove(receipt._id)}
                                                >
                                                    Duyệt
                                                </button>
                                                <button
                                                    style={{ padding: '6px 12px', fontSize: 13, borderRadius: 4, cursor: 'pointer', backgroundColor: '#ef4444', color: 'white', border: 'none' }}
                                                    onClick={() => handleReject(receipt._id)}
                                                >
                                                    Từ chối
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
      </div>
    </div>
    );
}
