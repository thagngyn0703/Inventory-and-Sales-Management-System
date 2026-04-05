import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotificationUnreadCount } from '../services/notificationsApi';
import { cn } from '../lib/utils';

export default function ManagerNotificationBell({ variant = 'default' }) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const c = await getNotificationUnreadCount();
        if (!stop) setCount(c);
      } catch (_) {
        if (!stop) setCount(0);
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  const onDark = variant === 'onDark';

  return (
    <button
      type="button"
      className={cn(
        'manager-notification-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base transition',
        onDark
          ? 'border border-white/35 bg-white/10 text-white hover:bg-white/20'
          : 'manager-icon-btn border border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100'
      )}
      aria-label="Thông báo"
      onClick={() => navigate('/manager/notifications')}
    >
      <i className="fa-solid fa-bell" />
      {count > 0 && (
        <span
          className={cn(
            'manager-notification-badge absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none ring-2',
            onDark ? 'bg-red-500 text-white ring-teal-900/40' : 'bg-red-600 text-white ring-white'
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

