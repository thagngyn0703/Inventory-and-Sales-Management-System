import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

const NOTICE_STYLES = {
  error: {
    container: 'border-rose-200/80 bg-rose-50/90 text-rose-900',
    icon: 'text-rose-600',
    iconNode: AlertCircle,
  },
  success: {
    container: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-900',
    icon: 'text-emerald-600',
    iconNode: CheckCircle2,
  },
  info: {
    container: 'border-sky-200/80 bg-sky-50/90 text-sky-900',
    icon: 'text-sky-600',
    iconNode: Info,
  },
};

export function InlineNotice({ message, type = 'info', className }) {
  if (!message) return null;
  const style = NOTICE_STYLES[type] || NOTICE_STYLES.info;
  const Icon = style.iconNode;
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-sm shadow-slate-900/5',
        style.container,
        className
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.icon)} />
      <span className="leading-snug">{message}</span>
    </div>
  );
}
