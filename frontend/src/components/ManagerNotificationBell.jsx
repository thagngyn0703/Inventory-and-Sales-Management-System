import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotificationUnreadCount } from '../services/notificationsApi';

export default function ManagerNotificationBell() {
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

  return (
    <button
      type="button"
      className="manager-icon-btn manager-notification-btn"
      aria-label="Thông báo"
      onClick={() => navigate('/manager/notifications')}
    >
      <i className="fa-solid fa-bell" />
      {count > 0 && <span className="manager-notification-badge">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

