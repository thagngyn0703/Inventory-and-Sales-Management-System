import { useState, useEffect, useCallback } from 'react';
import useIsMinWidth from './useIsMinWidth';

/**
 * Sidebar dạng drawer trên mobile, luôn mở trên desktop (>=breakpoint).
 */
export function useNavDrawer(breakpointPx = 1024) {
  const isDesktop = useIsMinWidth(breakpointPx);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isDesktop) setOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (isDesktop || !open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  const collapsed = !isDesktop && !open;

  return { isDesktop, navOpen: open, setNavOpen: setOpen, toggle, close, collapsed };
}
