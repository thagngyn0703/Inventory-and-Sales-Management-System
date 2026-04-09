import React from 'react';

export default function StoreLockedNotice({ visible }) {
  if (!visible) return null;
  return (
    <div
      className="fixed left-[calc(250px+1rem)] top-2.5 z-[2000] max-w-[420px] rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-800 shadow-lg shadow-red-900/10"
      role="alert"
    >
      Cửa hàng của bạn đã tạm bị khóa, vui lòng liên hệ admin để giải quyết.
    </div>
  );
}
