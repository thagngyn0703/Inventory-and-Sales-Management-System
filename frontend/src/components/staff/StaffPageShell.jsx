import React from 'react';
import { ShinyText } from '../ai/ShinyText';
import { cn } from '../../lib/utils';

const toneMap = {
  teal: 'border-teal-200/80 bg-teal-50/90 text-teal-900',
  sky: 'border-sky-200/80 bg-sky-50/90 text-sky-900',
  violet: 'border-violet-200/80 bg-violet-50/90 text-violet-900',
  amber: 'border-amber-200/80 bg-amber-50/90 text-amber-900',
  rose: 'border-rose-200/80 bg-rose-50/90 text-rose-900',
  slate: 'border-slate-200/80 bg-slate-50/90 text-slate-800',
};

/**
 * Khung trang thống nhất cho staff (bán hàng + kho): tiêu đề, mô tả, vùng thao tác.
 */
export function StaffPageShell({
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  eyebrowTone = 'teal',
  title,
  subtitle,
  headerActions,
  children,
  className,
  titleShiny = true,
}) {
  const tone = toneMap[eyebrowTone] || toneMap.teal;

  return (
    <div className={cn('mx-auto max-w-7xl space-y-6 pb-10', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div
              className={cn(
                'mb-1 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
                tone
              )}
            >
              {EyebrowIcon ? <EyebrowIcon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden /> : null}
              {eyebrow}
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {titleShiny ? (
              <ShinyText as="span" className="!block text-3xl font-bold tracking-tight">
                {title}
              </ShinyText>
            ) : (
              title
            )}
          </h1>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">{subtitle}</p> : null}
        </div>
        {headerActions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{headerActions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
