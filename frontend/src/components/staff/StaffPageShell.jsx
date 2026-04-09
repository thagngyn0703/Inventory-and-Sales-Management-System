import React from 'react';
import { cn } from '../../lib/utils';

/** Giống thanh công cụ trang tạo hóa đơn (gradient teal → sky → cyan). */
const STAFF_HEADER_GRADIENT =
  'bg-[linear-gradient(120deg,#0d9488_0%,#0ea5e9_48%,#0284c7_100%)]';

/**
 * Khung trang thống nhất cho staff (bán hàng + kho): band gradient + vùng mô tả/thao tác.
 * Màu đồng bộ với quầy POS (/staff/invoices/new).
 */
export function StaffPageShell({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  title,
  subtitle,
  headerActions,
  children,
  className,
}) {
  const showMeta = Boolean(subtitle || headerActions);

  return (
    <div className={cn('mx-auto max-w-7xl space-y-6 pb-10', className)}>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08)]">
        <div
          className={cn(
            STAFF_HEADER_GRADIENT,
            'px-5 py-4 shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.12)] sm:px-6 sm:py-5'
          )}
        >
          {eyebrow ? (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3 py-1 text-xs font-bold tracking-tight text-white backdrop-blur-[2px]">
              {EyebrowIcon ? (
                <EyebrowIcon className="h-3.5 w-3.5 shrink-0 text-white/95" aria-hidden />
              ) : null}
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-sm sm:text-3xl">{title}</h1>
        </div>
        {showMeta ? (
          <div className="flex flex-col gap-3 border-t border-slate-200/70 bg-slate-50/90 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0 flex-1">
              {subtitle ? (
                <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{subtitle}</p>
              ) : null}
            </div>
            {headerActions ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{headerActions}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
