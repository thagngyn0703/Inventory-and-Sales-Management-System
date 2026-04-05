import React from 'react';
import { Link } from 'react-router-dom';
import ManagerPageFrame from '../../components/manager/ManagerPageFrame';
import { StaffPageShell } from '../../components/staff/StaffPageShell';
import { FolderTree, Settings, UsersRound, Bell, UserPlus, Receipt } from 'lucide-react';

const linkClass =
  'flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-teal-200 hover:bg-teal-50/40';

export default function ManagerSettings() {
  return (
    <ManagerPageFrame showNotificationBell>
      <StaffPageShell
        eyebrow="Quản lý cửa hàng"
        eyebrowIcon={Settings}
        title="Cài đặt & cấu hình"
        subtitle="Truy cập nhanh các mục thường dùng. Các thay đổi quan trọng vẫn nằm trong từng màn hình chi tiết."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/manager/categories" className={linkClass}>
            <span className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-teal-600" aria-hidden />
              Danh mục sản phẩm
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
          <Link to="/manager/notifications" className={linkClass}>
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-teal-600" aria-hidden />
              Thông báo
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
          <Link to="/manager/staff/manage" className={linkClass}>
            <span className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-teal-600" aria-hidden />
              Quản lý nhân viên
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
          <Link to="/manager/staff/new" className={linkClass}>
            <span className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-teal-600" aria-hidden />
              Tạo tài khoản nhân viên
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
          <Link to="/manager/invoices" className={linkClass}>
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-teal-600" aria-hidden />
              Hóa đơn / phiếu xuất
            </span>
            <span className="text-xs font-medium text-slate-400">→</span>
          </Link>
        </div>
      </StaffPageShell>
    </ManagerPageFrame>
  );
}
