import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { logout } from '../../utils/auth';
import { cn } from '../../lib/utils';
import StoreLockedNotice from '../../components/StoreLockedNotice';
import {
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Drill,
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
  RotateCcw,
  Settings,
  Sparkles,
  Store,
  UserPlus,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';

const overviewItems = [
  { type: 'item', label: 'Tổng quan', path: '/manager', icon: LayoutDashboard },
  { type: 'item', label: 'Trợ lý AI', path: '/manager/ai-assistant', icon: Sparkles },
  { type: 'item', label: 'Sản phẩm', path: '/manager/products', icon: Package },
  { type: 'item', label: 'Hóa đơn', path: '/manager/invoices', icon: Receipt },
  {
    type: 'group',
    key: 'overview-supplier',
    label: 'Nhà cung cấp',
    icon: Handshake,
    items: [
      { label: 'Nhà cung cấp', path: '/manager/suppliers', icon: Handshake },
      { label: 'Thêm nhà cung cấp', path: '/manager/suppliers/new', icon: Plus },
      { label: 'Công nợ NCC', path: '/manager/supplier-payables', icon: CreditCard },
      { label: 'Báo cáo chi tiền NCC', path: '/manager/supplier-payables/report', icon: BarChart3 },
    ],
  },
  { type: 'item', label: 'Khách hàng', path: '/manager/customers', icon: Users },
  { type: 'item', label: 'Thông báo', path: '/manager/notifications', icon: Bell },
  { type: 'item', label: 'Phiếu hỗ trợ', path: '/manager/support', icon: LifeBuoy },
];

const manageItems = [
  { type: 'item', label: 'Nhập hàng', path: '/manager/quick-receipt', icon: Zap },
  {
    type: 'group',
    key: 'manage-stocktake',
    label: 'Kiểm kê kho',
    icon: ClipboardList,
    items: [
      { label: 'Danh sách kiểm kê', path: '/manager/stocktakes', icon: ClipboardList },
      { label: 'Tạo phiếu kiểm kê', path: '/manager/stocktakes/new', icon: ClipboardCheck },
      { label: 'Kiểm kê chờ duyệt', path: '/manager/stocktakes/pending', icon: ClipboardCheck },
    ],
  },
  {
    type: 'group',
    key: 'manage-return',
    label: 'Trả hàng',
    icon: RotateCcw,
    items: [
      { label: 'Danh sách trả hàng', path: '/manager/returns', icon: RotateCcw },
      { label: 'Tạo trả hàng', path: '/manager/returns/new', icon: RotateCcw },
    ],
  },
  { type: 'item', label: 'Phiếu nhập chờ duyệt', path: '/manager/receipts', icon: ClipboardList },
  { type: 'item', label: 'Yêu cầu tạo sản phẩm', path: '/manager/product-requests', icon: FileStack },
  { type: 'item', label: 'Lịch sử điều chỉnh', path: '/manager/adjustments', icon: History },
  { type: 'item', label: 'Bán hàng trực tiếp', path: '/manager/pos', icon: Drill },
  {
    type: 'group',
    key: 'manage-staff',
    label: 'Nhân viên',
    icon: UsersRound,
    items: [
      { label: 'Tạo tài khoản nhân viên', path: '/manager/staff/new', icon: UserPlus },
      { label: 'Quản lý nhân viên', path: '/manager/staff/manage', icon: UsersRound },
    ],
  },
  { type: 'item', label: 'Cài đặt', path: '/manager/settings', icon: Settings },
];

function getActivePath(pathname) {
  if (pathname === '/manager/suppliers/new') return '/manager/suppliers/new';
  if (pathname.startsWith('/manager/staff/manage')) return '/manager/staff/manage';
  if (pathname.startsWith('/manager/staff/new')) return '/manager/staff/new';
  if (pathname.startsWith('/manager/returns/new')) return '/manager/returns/new';
  if (pathname.startsWith('/manager/returns')) return '/manager/returns';
  if (pathname === '/manager/stocktakes/new') return '/manager/stocktakes/new';
  if (pathname === '/manager/stocktakes') return '/manager/stocktakes';
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
  if (pathname.startsWith('/manager/pos')) return '/manager/pos';
  return pathname;
}

export default function ManagerSidebar({ collapsed = false, ...restProps }) {
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
  const groupConfig = useMemo(
    () => [...overviewItems, ...manageItems].filter((item) => item.type === 'group'),
    []
  );
  const [expandedGroups, setExpandedGroups] = useState(() =>
    groupConfig.reduce((acc, group) => {
      acc[group.key] = false;
      return acc;
    }, {})
  );

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      groupConfig.forEach((group) => {
        if (group.items.some((item) => isItemActive(item.path))) {
          next[group.key] = true;
        }
      });
      return next;
    });
  }, [activePath, groupConfig]);

  const preventSameRouteNavigation = (e, itemPath) => {
    if (location.pathname === itemPath) e.preventDefault();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderNavItem = (item, nested = false) => {
      const Icon = item.icon;
      const active = isItemActive(item.path);
      return (
        <Link
          key={item.path}
          to={item.path}
          onClick={(e) => preventSameRouteNavigation(e, item.path)}
          className={cn(
            'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
            nested && 'ml-3',
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
    };

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const renderNavBlock = (items) =>
    items.map((item) => {
      if (item.type === 'item') return renderNavItem(item);

      const isExpanded = !!expandedGroups[item.key];
      const Icon = item.icon;
      const hasActiveChild = item.items.some((child) => isItemActive(child.path));

      return (
        <div key={item.key}>
          <button
            type="button"
            onClick={() => toggleGroup(item.key)}
            className={cn(
              'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
              hasActiveChild
                ? 'bg-gradient-to-r from-teal-500/12 to-sky-500/8 text-teal-900 ring-1 ring-teal-200/60'
                : 'text-slate-600 hover:bg-white/90 hover:text-teal-800 hover:shadow-sm'
            )}
          >
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-transform duration-200',
                hasActiveChild ? 'text-teal-600' : 'text-slate-400 group-hover:text-teal-600'
              )}
              strokeWidth={2}
              aria-hidden
            />
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:text-teal-600'
              )}
              aria-hidden
            />
          </button>
          {isExpanded && <div className="mt-0.5 space-y-0.5">{item.items.map((child) => renderNavItem(child, true))}</div>}
        </div>
      );
    });

  return (
    <>
      <StoreLockedNotice visible={currentUser?.storeStatus === 'inactive'} />
      <aside
        className={cn(
          'manager-sidebar fixed left-0 top-0 z-[100] flex h-screen w-[250px] flex-col border-r border-slate-200/70 bg-gradient-to-b from-white via-slate-50/90 to-sky-50/35 shadow-[4px_0_24px_-8px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out',
          collapsed && '-translate-x-full'
        )}
        {...restProps}
      >
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
