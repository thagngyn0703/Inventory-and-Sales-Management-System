import React, { useEffect, useState, useCallback } from 'react';
import AdminPageFrame from '../../components/admin/AdminPageFrame';
import AdminSoftSelect from '../../components/admin/AdminSoftSelect';
import { getAdminStores, setAdminStoreStatus, setAdminStoreApproval } from '../../services/adminApi';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { useToast } from '../../contexts/ToastContext';
import '../ManagerDashboard/ManagerDashboard.css';
import '../ManagerDashboard/ManagerProducts.css';
import './AdminUserList.css';
import './AdminDashBoard.css';

const PAGE_SIZE = 10;

export default function AdminStoresManage() {
  const { toast } = useToast();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [confirmStore, setConfirmStore] = useState(null);
  const [confirmApproval, setConfirmApproval] = useState(null);
  const [viewLegalStore, setViewLegalStore] = useState(null);
  const [viewedLegalStoreIds, setViewedLegalStoreIds] = useState([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const storeData = await getAdminStores({
        page,
        limit: PAGE_SIZE,
        status: 'all',
        approval_status: approvalFilter,
      });
      setStores(storeData.stores || []);
      setTotal(Number(storeData.total) || 0);
      setTotalPages(Math.max(1, Number(storeData.totalPages) || 1));
    } catch (e) {
      setError(e.message || 'Không thể tải dữ liệu');
      setStores([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, approvalFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (totalPages >= 1 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const onToggleStatus = (s) => {
    setConfirmStore(s);
  };

  const onConfirmToggleStatus = async () => {
    if (!confirmStore) return;
    try {
      setUpdatingStatus(true);
      const status = confirmStore.status === 'active' ? 'inactive' : 'active';
      await setAdminStoreStatus(confirmStore._id, status);
      await load();
      toast(
        status === 'inactive'
          ? 'Đã ngừng hoạt động cửa hàng thành công'
          : 'Đã cho cửa hàng hoạt động lại thành công',
        'success'
      );
      setConfirmStore(null);
    } catch (err) {
      toast(err.message || 'Không thể cập nhật trạng thái', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const onApproveStore = async (store, nextApproval) => {
    try {
      await setAdminStoreApproval(store._id, nextApproval, '');
      await load();
      toast(nextApproval === 'approved' ? 'Đã phê duyệt cửa hàng' : 'Đã chuyển trạng thái xét duyệt', 'success');
    } catch (err) {
      toast(err.message || 'Không thể cập nhật trạng thái phê duyệt', 'error');
    }
  };

  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  return (
    <AdminPageFrame>
          <div className="manager-products-header">
            <div>
              <h1 className="manager-page-title">Quản lý cửa hàng</h1>
              <p className="manager-page-subtitle">
                Quản lý hồ sơ đăng ký cửa hàng, phê duyệt pháp lý và trạng thái hoạt động.
              </p>
            </div>
            <div>
              <AdminSoftSelect
                value={approvalFilter}
                onChange={(next) => {
                  setPage(1);
                  setApprovalFilter(next);
                }}
                className="admin-topbar-select"
                options={[
                  { value: 'all', label: 'Tất cả hồ sơ' },
                  { value: 'draft_profile', label: 'Chưa hoàn thiện hồ sơ' },
                  { value: 'pending_approval', label: 'Chờ duyệt' },
                  { value: 'approved', label: 'Đã duyệt' },
                  { value: 'rejected', label: 'Từ chối' },
                  { value: 'suspended', label: 'Tạm ngưng' },
                ]}
              />
            </div>
          </div>
          {error && <div className="manager-products-error">{error}</div>}

          <p className="admin-users-count-hint" style={{ marginBottom: 12 }}>
            {loading
              ? 'Đang tải…'
              : total === 0
                ? 'Không có cửa hàng'
                : `Hiển thị ${startItem}-${endItem} / ${total} cửa hàng`}
          </p>

          <div className="manager-panel-card manager-products-card admin-users-table-card">
            {loading ? (
              <p className="manager-products-loading">Đang tải...</p>
            ) : (
              <>
                <div className="manager-products-table-wrap">
                  <table className="manager-products-table admin-stores-table">
                    <thead>
                      <tr>
                        <th>Tên cửa hàng</th>
                        <th>Chủ cửa hàng</th>
                        <th>SĐT</th>
                        <th>Địa chỉ</th>
                        <th>Hồ sơ pháp lý</th>
                        <th>Ngày tạo</th>
                        <th>Trạng thái</th>
                        <th>Phê duyệt</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                            Chưa có cửa hàng nào trong hệ thống.
                          </td>
                        </tr>
                      ) : (
                        stores.map((s) => (
                          <tr key={s._id}>
                            <td className="admin-stores-table__name">{s.name}</td>
                            <td>{s.managerId?.fullName || s.managerId?.email || '—'}</td>
                            <td className="tabular-nums">{s.phone || '—'}</td>
                            <td className="admin-stores-table__address">{s.address || '—'}</td>
                            <td style={{ minWidth: 220 }}>
                              <div className="admin-stores-legal">
                                <div><b>MST:</b> {s.tax_code || '—'}</div>
                                <div><b>STK:</b> {s.bank_account_number || '—'}</div>
                                <div><b>ĐDPL:</b> {s.legal_representative || '—'}</div>
                                <div><b>GPKD:</b> {s.business_license_number || '—'}</div>
                              </div>
                            </td>
                            <td className="tabular-nums">{s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
                            <td>
                              <span className={`admin-stores-pill ${s.status === 'inactive' ? 'admin-stores-pill--inactive' : 'admin-stores-pill--active'}`}>
                                {s.status === 'inactive' ? 'Ngừng hoạt động' : 'Hoạt động'}
                              </span>
                            </td>
                            <td>
                              <span className={`admin-stores-pill admin-stores-pill--approval ${
                                s.approval_status === 'approved'
                                  ? 'admin-stores-pill--approved'
                                  : s.approval_status === 'rejected'
                                    ? 'admin-stores-pill--rejected'
                                    : 'admin-stores-pill--pending'
                              }`}>
                                {s.approval_status === 'draft_profile' ? 'Chưa hoàn thiện hồ sơ'
                                : s.approval_status === 'pending_approval' ? 'Chờ duyệt'
                                : s.approval_status === 'approved' ? 'Đã duyệt'
                                  : s.approval_status === 'rejected' ? 'Từ chối'
                                    : s.approval_status === 'suspended' ? 'Tạm ngưng' : '—'}
                              </span>
                              {s.rejection_reason ? (
                                <div className="admin-stores-reject-note">
                                  Lý do: {s.rejection_reason}
                                </div>
                              ) : null}
                            </td>
                            <td className="admin-stores-table__actions">
                              {s.approval_status !== 'approved' && (
                                <button
                                  type="button"
                                  className="manager-btn-icon"
                                  disabled={!viewedLegalStoreIds.includes(String(s._id))}
                                  onClick={() => onApproveStore(s, 'approved')}
                                  title={
                                    viewedLegalStoreIds.includes(String(s._id))
                                      ? 'Phê duyệt hồ sơ'
                                      : 'Vui lòng xem hồ sơ pháp lý trước khi duyệt'
                                  }
                                >
                                  <i className="fa-solid fa-check" />
                                </button>
                              )}
                              <button
                                type="button"
                                className="manager-btn-icon"
                                onClick={() => {
                                  setViewLegalStore(s);
                                  setViewedLegalStoreIds((prev) =>
                                    prev.includes(String(s._id)) ? prev : [...prev, String(s._id)]
                                  );
                                }}
                                title="Xem hồ sơ pháp lý"
                              >
                                <i className="fa-solid fa-eye" />
                              </button>
                              <button
                                type="button"
                                className="manager-btn-icon"
                                onClick={() => onToggleStatus(s)}
                                title={s.status === 'active' ? 'Ngừng hoạt động' : 'Cho hoạt động lại'}
                              >
                                <i className={`fa-solid ${s.status === 'active' ? 'fa-pause' : 'fa-play'}`} />
                              </button>
                              <button
                                type="button"
                                className="manager-btn-icon"
                                onClick={() => setConfirmApproval(s)}
                                title="Từ chối hồ sơ"
                              >
                                <i className="fa-solid fa-xmark" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {total > 0 && (
                  <div className="admin-users-pagination">
                    <div className="admin-users-pagination-text">
                      Trang <strong>{page}</strong> / <strong>{totalPages}</strong>
                    </div>
                    <div className="admin-users-pagination-controls">
                      <button
                        type="button"
                        className="au-page-btn"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="Trang trước"
                      >
                        <i className="fas fa-chevron-left" />
                      </button>
                      <button
                        type="button"
                        className="au-page-btn"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        aria-label="Trang sau"
                      >
                        <i className="fas fa-chevron-right" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
      <ConfirmDialog
        open={Boolean(confirmStore)}
        onOpenChange={(open) => {
          if (!open) setConfirmStore(null);
        }}
        title="Xác nhận thao tác"
        description={
          confirmStore
            ? confirmStore.status === 'active'
              ? `Bạn có chắc muốn ngừng hoạt động cửa hàng "${confirmStore.name}"?`
              : `Bạn có chắc muốn cho hoạt động lại cửa hàng "${confirmStore.name}"?`
            : ''
        }
        confirmLabel={confirmStore?.status === 'active' ? 'Ngừng hoạt động' : 'Cho hoạt động lại'}
        cancelLabel="Hủy"
        onConfirm={onConfirmToggleStatus}
        loading={updatingStatus}
        confirmVariant={confirmStore?.status === 'active' ? 'destructive' : 'default'}
      />
      <ConfirmDialog
        open={Boolean(confirmApproval)}
        onOpenChange={(open) => {
          if (!open) setConfirmApproval(null);
        }}
        title="Từ chối hồ sơ cửa hàng"
        description={
          confirmApproval
            ? `Bạn có chắc muốn từ chối hồ sơ cửa hàng "${confirmApproval.name}"?`
            : ''
        }
        confirmLabel="Từ chối"
        cancelLabel="Hủy"
        onConfirm={async () => {
          if (!confirmApproval) return;
          await setAdminStoreApproval(
            confirmApproval._id,
            'rejected',
            'Vui lòng xem lại thông tin pháp lý để điền chính xác.'
          );
          await load();
          toast('Đã từ chối hồ sơ và gửi yêu cầu bổ sung pháp lý', 'success');
          setConfirmApproval(null);
        }}
        confirmVariant="destructive"
      />
      {viewLegalStore ? (
        <div
          className="fixed inset-0 z-[7000] flex items-center justify-center bg-slate-900/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Hồ sơ pháp lý: {viewLegalStore.name}
              </h3>
              <button
                type="button"
                className="manager-btn-icon"
                onClick={() => setViewLegalStore(null)}
                title="Đóng"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p><b>Mã số thuế:</b> {viewLegalStore.tax_code || '—'}</p>
              <p><b>Số tài khoản:</b> {viewLegalStore.bank_account_number || '—'}</p>
              <p><b>Ngân hàng:</b> {viewLegalStore.bank_name || '—'}</p>
              <p><b>Email hóa đơn:</b> {viewLegalStore.billing_email || '—'}</p>
              <p><b>Đại diện pháp luật:</b> {viewLegalStore.legal_representative || '—'}</p>
              <p><b>Số GPKD:</b> {viewLegalStore.business_license_number || '—'}</p>
            </div>
            {viewLegalStore.rejection_reason ? (
              <p className="mt-3 text-xs text-rose-700">
                Lý do từ chối gần nhất: {viewLegalStore.rejection_reason}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="manager-btn manager-btn-secondary"
                onClick={() => setViewLegalStore(null)}
              >
                Đóng
              </button>
              {viewLegalStore.approval_status !== 'approved' ? (
                <button
                  type="button"
                  className="manager-btn manager-btn-primary"
                  disabled={!viewedLegalStoreIds.includes(String(viewLegalStore._id))}
                  title={
                    viewedLegalStoreIds.includes(String(viewLegalStore._id))
                      ? 'Duyệt hồ sơ'
                      : 'Vui lòng xem hồ sơ pháp lý trước khi duyệt'
                  }
                  onClick={async () => {
                    await onApproveStore(viewLegalStore, 'approved');
                    setViewLegalStore(null);
                  }}
                >
                  Duyệt hồ sơ
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageFrame>
  );
}
