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

function getStoreOperationalLabel(store) {
  const approval = String(store?.approval_status || '');
  if (approval === 'draft_profile' || approval === 'pending_approval') {
    return { label: 'Chờ duyệt', className: 'admin-stores-pill--pending-ops' };
  }
  if (store?.status === 'active') {
    return { label: 'Hoạt động', className: 'admin-stores-pill--active' };
  }
  return { label: 'Ngừng hoạt động', className: 'admin-stores-pill--inactive' };
}

const BUSINESS_TYPE_LABELS = {
  ho_kinh_doanh: 'Hộ kinh doanh',
  doanh_nghiep: 'Doanh nghiệp',
};

function isStoreApproved(store) {
  return String(store?.approval_status || '') === 'approved';
}

export default function AdminStoresManage() {
  const { toast } = useToast();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [confirmStore, setConfirmStore] = useState(null);
  const [viewLegalStore, setViewLegalStore] = useState(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectingApproval, setRejectingApproval] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState('all');

  useEffect(() => {
    if (viewLegalStore) {
      setShowRejectForm(false);
      setRejectNote('');
    }
  }, [viewLegalStore?._id]);

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

  const closeViewModal = () => {
    setViewLegalStore(null);
    setShowRejectForm(false);
    setRejectNote('');
  };

  const onApproveStore = async (store, nextApproval) => {
    try {
      await setAdminStoreApproval(store._id, nextApproval, '');
      await load();
      toast(nextApproval === 'approved' ? 'Đã phê duyệt cửa hàng' : 'Đã chuyển trạng thái xét duyệt', 'success');
    } catch (err) {
      toast(err.message || 'Không thể cập nhật trạng thái phê duyệt', 'error');
      throw err;
    }
  };

  const onRejectStore = async () => {
    if (!viewLegalStore) return;
    const note = rejectNote.trim();
    if (!note) {
      toast('Vui lòng nhập ghi chú lý do từ chối.', 'error');
      return;
    }
    try {
      setRejectingApproval(true);
      await setAdminStoreApproval(viewLegalStore._id, 'rejected', note);
      await load();
      toast('Đã từ chối hồ sơ. Chủ cửa hàng sẽ thấy ghi chú trong phần Cài đặt.', 'success');
      closeViewModal();
    } catch (err) {
      toast(err.message || 'Không thể từ chối hồ sơ', 'error');
    } finally {
      setRejectingApproval(false);
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
                        <th>Ngày tạo</th>
                        <th>Trạng thái</th>
                        <th>Phê duyệt</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
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
                            <td className="tabular-nums">{s.createdAt ? new Date(s.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
                            <td>
                              {(() => {
                                const ops = getStoreOperationalLabel(s);
                                return (
                                  <span className={`admin-stores-pill ${ops.className}`}>
                                    {ops.label}
                                  </span>
                                );
                              })()}
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
                              <button
                                type="button"
                                className="manager-btn-icon"
                                onClick={() => setViewLegalStore(s)}
                                title="Xem hồ sơ pháp lý"
                              >
                                <i className="fa-solid fa-eye" />
                              </button>
                              {isStoreApproved(s) && (
                                <button
                                  type="button"
                                  className="manager-btn-icon"
                                  onClick={() => onToggleStatus(s)}
                                  title={s.status === 'active' ? 'Ngừng hoạt động' : 'Cho hoạt động lại'}
                                >
                                  <i className={`fa-solid ${s.status === 'active' ? 'fa-pause' : 'fa-play'}`} />
                                </button>
                              )}
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
      {viewLegalStore ? (
        <div
          className="fixed inset-0 z-[7000] flex items-center justify-center bg-slate-900/45 p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          onClick={closeViewModal}
        >
          <div
            className="flex max-h-[min(90vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Hồ sơ cửa hàng: {viewLegalStore.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Xem đầy đủ thông tin đăng ký và pháp lý trước khi phê duyệt hoặc từ chối.
                </p>
              </div>
              <button
                type="button"
                className="manager-btn-icon shrink-0"
                onClick={closeViewModal}
                title="Đóng"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Thông tin cửa hàng</h4>
              <div className="mb-6 grid grid-cols-1 gap-3 text-sm text-slate-800 sm:grid-cols-2">
                <p><span className="font-semibold text-slate-600">Chủ cửa hàng:</span>{' '}
                  {viewLegalStore.managerId?.fullName || viewLegalStore.managerId?.email || '—'}
                </p>
                <p><span className="font-semibold text-slate-600">SĐT:</span> {viewLegalStore.phone || '—'}</p>
                <p className="sm:col-span-2"><span className="font-semibold text-slate-600">Địa chỉ:</span> {viewLegalStore.address || '—'}</p>
                <p><span className="font-semibold text-slate-600">Loại hình:</span>{' '}
                  {BUSINESS_TYPE_LABELS[viewLegalStore.business_type] || viewLegalStore.business_type || '—'}
                </p>
                <p><span className="font-semibold text-slate-600">Ngày đăng ký:</span>{' '}
                  {viewLegalStore.createdAt ? new Date(viewLegalStore.createdAt).toLocaleString('vi-VN') : '—'}
                </p>
              </div>
              <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Hồ sơ pháp lý</h4>
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 sm:grid-cols-2">
                <p><span className="font-semibold text-slate-600">Mã số thuế:</span> {viewLegalStore.tax_code || '—'}</p>
                <p><span className="font-semibold text-slate-600">Số GPKD:</span> {viewLegalStore.business_license_number || '—'}</p>
                <p><span className="font-semibold text-slate-600">Đại diện pháp luật:</span> {viewLegalStore.legal_representative || '—'}</p>
                <p><span className="font-semibold text-slate-600">Email:</span> {viewLegalStore.billing_email || '—'}</p>
                <p><span className="font-semibold text-slate-600">Ngân hàng:</span> {viewLegalStore.bank_name || '—'}</p>
                <p><span className="font-semibold text-slate-600">Số tài khoản:</span> {viewLegalStore.bank_account_number || '—'}</p>
              </div>
              {viewLegalStore.rejection_reason ? (
                <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <span className="font-semibold">Lý do từ chối gần nhất:</span> {viewLegalStore.rejection_reason}
                </p>
              ) : null}
            </div>
            {showRejectForm && viewLegalStore.approval_status !== 'approved' ? (
              <div className="border-t border-rose-100 bg-rose-50/60 px-6 py-4">
                <label htmlFor="admin-store-reject-note" className="mb-2 block text-sm font-semibold text-slate-800">
                  Ghi chú từ chối <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="admin-store-reject-note"
                  rows={3}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Ví dụ: Mã số thuế không khớp hồ sơ, thông tin ngân hàng không hợp lệ, nghi ngờ spam..."
                  className="w-full resize-y rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-rose-200 focus:ring-2"
                />
                <p className="mt-2 text-xs text-slate-600">
                  Ghi chú này sẽ hiển thị cho chủ cửa hàng trong mục <strong>Cài đặt → Hồ sơ pháp lý</strong> để họ chỉnh sửa và gửi lại.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                className="manager-btn manager-btn-secondary"
                onClick={closeViewModal}
                disabled={rejectingApproval}
              >
                Đóng
              </button>
              {viewLegalStore.approval_status !== 'approved' ? (
                showRejectForm ? (
                  <>
                    <button
                      type="button"
                      className="manager-btn manager-btn-secondary"
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectNote('');
                      }}
                      disabled={rejectingApproval}
                    >
                      Hủy từ chối
                    </button>
                    <button
                      type="button"
                      className="manager-btn manager-btn-danger"
                      onClick={onRejectStore}
                      disabled={rejectingApproval || !rejectNote.trim()}
                    >
                      {rejectingApproval ? 'Đang gửi...' : 'Xác nhận từ chối'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="manager-btn manager-btn-danger-outline"
                      onClick={() => setShowRejectForm(true)}
                    >
                      Từ chối
                    </button>
                    <button
                      type="button"
                      className="manager-btn manager-btn-primary"
                      onClick={async () => {
                        try {
                          await onApproveStore(viewLegalStore, 'approved');
                          closeViewModal();
                        } catch {
                          /* toast handled in onApproveStore */
                        }
                      }}
                    >
                      Duyệt hồ sơ
                    </button>
                  </>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageFrame>
  );
}
