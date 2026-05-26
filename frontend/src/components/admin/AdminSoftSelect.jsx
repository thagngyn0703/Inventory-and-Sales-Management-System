import React, { useEffect, useMemo, useRef, useState } from 'react';

export default function AdminSoftSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Chọn',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = useMemo(
    () => options.find((opt) => String(opt.value) === String(value)),
    [options, value]
  );

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  return (
    <div ref={rootRef} className={`admin-soft-dropdown ${className}`}>
      <button
        type="button"
        className={`admin-soft-dropdown__trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected?.label || placeholder}</span>
        <i className={`fa-solid fa-chevron-down admin-soft-dropdown__chev ${open ? 'is-open' : ''}`} />
      </button>
      {open && (
        <div className="admin-soft-dropdown__menu" role="listbox">
          {options.map((opt) => {
            const active = String(opt.value) === String(value);
            return (
              <button
                key={`${opt.value}`}
                type="button"
                className={`admin-soft-dropdown__option ${active ? 'is-active' : ''}`}
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
