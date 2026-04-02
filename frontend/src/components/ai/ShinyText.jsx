import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Chữ gradient chạy sáng — phong cách tương tự ShinyText (React Bits),
 * dùng Tailwind animation `animate-shimmer`.
 */
export function ShinyText({ children, className, as: Comp = 'span' }) {
  return (
    <Comp
      className={cn(
        'bg-[length:200%_auto] bg-clip-text text-transparent animate-shimmer',
        'bg-[linear-gradient(105deg,#c4b5fd_0%,#f0abfc_20%,#ffffff_40%,#5eead4_60%,#a78bfa_80%,#c4b5fd_100%)]',
        className
      )}
    >
      {children}
    </Comp>
  );
}
