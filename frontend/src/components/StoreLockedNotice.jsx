import React from 'react';

export default function StoreLockedNotice({ visible }) {
  if (!visible) return null;
  return (
    <div className="store-locked-notice">
      Cửa hàng của bạn đã tạm bị khóa, vui lòng liên hệ admin để giải quyết.
    </div>
  );
}

