import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { logout } from '../../utils/auth';
import { cn } from '../../lib/utils';
import {
  ArrowLeftRight,
  Box,
  ClipboardCheck,
  ClipboardList,
  FileStack,
  LayoutGrid,
  ListOrdered,
  LogOut,
  PackageOpen,
  PlusCircle,
  Receipt,
  RotateCcw,
  Store,
  Users,
} from 'lucide-react';

const salesItems = [
  { to: '/staff/invoices/new', icon: PlusCircle, label: 'Tạo hóa đơn', end: true },
  { to: '/staff/invoices', icon: Receipt, label: 'Lịch sử bán lẻ', end: true },
  { to: '/staff/returns/new', icon: RotateCcw, label: 'Trả hàng', end: true },
  { to: '/staff/returns', icon: ArrowLeftRight, label: 'Hàng trả lại', end: true },
  { to: '/staff/customers', icon: Users, label: 'Khách hàng', end: true },
];

const warehouseItems = [
  { to: '/staff/products', icon: PackageOpen, label: 'Sản phẩm', end: true },
  { to: '/staff/receipts/new', icon: Box, label: 'Nhập hàng', end: true },
  { to: '/staff/receipts', icon: ListOrdered, label: 'Phiếu nhập kho', end: true },
  { to: '/staff/stocktakes', icon: ClipboardList, label: 'Danh sách kiểm kê', end: true },
  { to: '/staff/stocktakes/new', icon: ClipboardCheck, label: 'Tạo phiếu kiểm kê', end: true },
  { to: '/staff/product-requests', icon: FileStack, label: 'Phiếu đăng ký SP mới', end: true },
];

export default function SalesSidebar({ collapsed }) {
  const navigate = useNavigate();

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={cn(
        'sales-sidebar fixed left-0 top-0 z-[100] flex h-screen w-[250px] flex-col border-r border-slate-200/70 bg-gradient-to-b from-white via-slate-50/80 to-teal-50/30 shadow-[4px_0_24px_-8px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out',
        collapsed && '-translate-x-full'
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200/60 bg-white/60 px-5 py-5 backdrop-blur-sm">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-600 text-lg font-extrabold text-white shadow-md shadow-teal-600/25">
          <LayoutGrid className="h-5 w-5" strokeWidth={2.2} />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-300 ring-2 ring-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight text-slate-800">Quầy bán hàng</div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-semibold text-teal-700">
            <Store className="h-3 w-3 shrink-0 opacity-80" />
            <span className="truncate">{storeTitle}</span>
          </p>
        </div>
      </div>

      <nav className="sales-nav flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 py-3">
        <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Bán hàng</p>
        {salesItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-gradient-to-r from-teal-500/15 to-cyan-500/10 text-teal-800 shadow-sm ring-1 ring-teal-200/60'
                  : 'text-slate-600 hover:bg-white/80 hover:text-teal-800 hover:shadow-sm'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="staff-sidebar-indicator"
                    className="absolute inset-y-1 left-0 w-1 rounded-full bg-gradient-to-b from-teal-500 to-emerald-500 shadow-[0_0_12px_rgba(20,184,166,0.35)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <item.icon
                  className={cn(
                    'relative z-[1] h-[18px] w-[18px] shrink-0 transition-transform duration-200',
                    isActive ? 'text-teal-600' : 'text-slate-400 group-hover:scale-105 group-hover:text-teal-600'
                  )}
                  strokeWidth={2}
                />
                <span className="relative z-[1]">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Kho hàng</p>
        {warehouseItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-gradient-to-r from-violet-500/12 to-sky-500/10 text-violet-900 shadow-sm ring-1 ring-violet-200/50'
                  : 'text-slate-600 hover:bg-white/80 hover:text-violet-900 hover:shadow-sm'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="staff-sidebar-indicator"
                    className="absolute inset-y-1 left-0 w-1 rounded-full bg-gradient-to-b from-violet-500 to-amber-500 shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <item.icon
                  className={cn(
                    'relative z-[1] h-[18px] w-[18px] shrink-0 transition-transform duration-200',
                    isActive ? 'text-violet-600' : 'text-slate-400 group-hover:scale-105 group-hover:text-violet-600'
                  )}
                  strokeWidth={2}
                />
                <span className="relative z-[1]">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-200/60 bg-white/50 p-4 backdrop-blur-sm">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50/90 hover:text-rose-700"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
