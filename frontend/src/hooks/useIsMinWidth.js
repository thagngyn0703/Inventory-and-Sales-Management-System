import { useState, useEffect } from 'react';

/**
 * true khi viewport >= px (breakpoint “desktop” cho sidebar cố định).
 */
export default function useIsMinWidth(px = 1024) {
  const breakpoint = Number(px);
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${breakpoint}px)`).matches : true
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);

  return matches;
}
