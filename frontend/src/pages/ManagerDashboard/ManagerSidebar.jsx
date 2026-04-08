import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { logout } from '../../utils/auth';
import { cn } from '../../lib/utils';
import StoreLockedNotice from '../../components/StoreLockedNotice';
import {
  BarChart3,
  Bell,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileStack,
  FileText,
  Handshake,
  History,
  LifeBuoy,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  Store,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';

const overviewItems = [
  { label: 'Tổng quan', path: '/manager', icon: LayoutDashboard },
  { label: 'Trợ lý AI', path: '/manager/ai-assistant', icon: Sparkles },
  { label: 'Đơn hàng', path: '/manager/invoices', icon: FileText },
  { label: 'Sản phẩm', path: '/manager/products', icon: Package },
  { label: 'Yêu cầu tạo sản phẩm', path: '/manager/product-requests', icon: FileStack },
  { label: 'Hóa đơn', path: '/manager/invoices', icon: Receipt },
  { label: 'Công nợ NCC', path: '/manager/supplier-payables', icon: CreditCard },
  { label: 'Báo cáo chi tiền NCC', path: '/manager/supplier-payables/report', icon: BarChart3 },
  { label: 'Nhà cung cấp', path: '/manager/suppliers', icon: Handshake },
  { label: 'Thêm nhà cung cấp', path: '/manager/suppliers/new', icon: Plus },
  { label: 'Khách hàng', path: '/manager/customers', icon: Users },
  { label: 'Báo cáo', path: '/manager/reports', icon: BarChart3 },
  { label: 'Thông báo', path: '/manager/notifications', icon: Bell },
  { label: 'Phiếu hỗ trợ', path: '/manager/support', icon: LifeBuoy },
];

const manageItems = [
  { label: 'Kiểm kê chờ duyệt', path: '/manager/stocktakes/pending', icon: ClipboardCheck },
  { label: 'Phiếu nhập chờ duyệt', path: '/manager/receipts', icon: ClipboardList },
  { label: 'Lịch sử điều chỉnh', path: '/manager/adjustments', icon: History },
  { label: 'Tạo tài khoản nhân viên', path: '/manager/staff/new', icon: UserPlus },
  { label: 'Quản lý nhân viên', path: '/manager/staff/manage', icon: UsersRound },
  { label: 'Cài đặt', path: '/manager/settings', icon: Settings },
];

function getActivePath(pathname) {
  if (pathname === '/manager/suppliers/new') return '/manager/suppliers/new';
  if (pathname.startsWith('/manager/staff/manage')) return '/manager/staff/manage';
  if (pathname.startsWith('/manager/staff/new')) return '/manager/staff/new';
  if (pathname.startsWith('/manager/stocktakes/')) return '/manager/stocktakes/pending';
  if (pathname.startsWith('/manager/adjustments/')) return '/manager/adjustments';
  if (pathname.startsWith('/manager/notifications/')) return '/manager/notifications';
  if (pathname.startsWith('/manager/support')) return '/manager/support';
  if (pathname.startsWith('/manager/suppliers/')) return '/manager/suppliers';
  if (pathname.startsWith('/manager/categories')) return '/manager/categories';
  if (pathname.startsWith('/manager/settings')) return '/manager/settings';
  if (pathname.startsWith('/manager/customers')) return '/manager/customers';
  if (pathname.startsWith('/manager/invoices')) return '/manager/invoices';
  if (pathname.startsWith('/manager/supplier-payables/report')) return '/manager/supplier-payables/report';
  if (pathname.startsWith('/manager/supplier-payables')) return '/manager/supplier-payables';
  return pathname;
}

export default function ManagerSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    if (!token) return;
    fetch('http://localhost:8000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!data?.user) return;
        setCurrentUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {});
  }, []);

  const storeTitle =
    currentUser?.storeName ||
    (currentUser?.storeId ? `Store: ${String(currentUser.storeId).slice(-6)}` : 'Chưa có cửa hàng');

  const activePath = getActivePath(location.pathname);
  const isItemActive = (itemPath) => activePath === itemPath;

  const preventSameRouteNavigation = (e, itemPath) => {
    if (location.pathname === itemPath) e.preventDefault();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderNavBlock = (items) =>
    items.map((item) => {
      const Icon = item.icon;
      const active = isItemActive(item.path);
      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={(e) => preventSameRouteNavigation(e, item.path)}
          className={cn(
            'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
            active
              ? 'bg-gradient-to-r from-teal-500/18 to-sky-500/12 text-teal-900 shadow-sm ring-1 ring-teal-200/70'
              : 'text-slate-600 hover:bg-white/90 hover:text-teal-800 hover:shadow-sm'
          )}
        >
          {active && (
            <motion.span
              layoutId="manager-sidebar-indicator"
              className="absolute inset-y-1 left-0 w-1 rounded-full bg-gradient-to-b from-teal-500 via-sky-500 to-cyan-600 shadow-[0_0_12px_rgba(20,184,166,0.4)]"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
          <Icon
            className={cn(
              'relative z-[1] h-[18px] w-[18px] shrink-0 transition-transform duration-200',
              active ? 'text-teal-600' : 'text-slate-400 group-hover:scale-105 group-hover:text-teal-600'
            )}
            strokeWidth={2}
            aria-hidden
          />
          <span className="relative z-[1]">{item.label}</span>
        </Link>
      );
    });

  return (
    <>
      <StoreLockedNotice visible={currentUser?.storeStatus === 'inactive'} />
      <aside className="manager-sidebar fixed left-0 top-0 z-[100] flex h-screen w-[250px] flex-col border-r border-slate-200/70 bg-gradient-to-b from-white via-slate-50/90 to-sky-50/35 shadow-[4px_0_24px_-8px_rgba(15,23,42,0.12)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200/60 bg-white/60 px-5 py-5 backdrop-blur-sm">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0d9488_0%,#0ea5e9_55%,#0284c7_100%)] text-white shadow-md shadow-teal-600/30">
            <LayoutDashboard className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-300 ring-2 ring-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-slate-800">Quản lý cửa hàng</div>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-semibold text-teal-700">
              <Store className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
              <span className="truncate">{storeTitle}</span>
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 py-3">
          <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Vận hành</p>
          {renderNavBlock(overviewItems)}

          <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Quản lý</p>
          {renderNavBlock(manageItems)}
        </nav>

        <div className="shrink-0 border-t border-slate-200/60 bg-white/50 p-4 backdrop-blur-sm">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50/90 hover:text-rose-700"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
}
