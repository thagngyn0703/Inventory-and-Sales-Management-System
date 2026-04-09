import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-teal-600 to-sky-600 text-white shadow-md shadow-teal-600/20 hover:from-teal-500 hover:to-sky-500',
        auth: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
        outline: 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
        ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
        warning: 'bg-amber-500 text-white hover:bg-amber-600',
        premium:
          'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 text-white shadow-md shadow-violet-500/30 hover:from-violet-500 hover:via-fuchsia-500 hover:to-violet-500',
      },
      size: {
        default: 'h-10 px-4 py-2',
        lg: 'h-11 px-6 text-base',
        pill: 'h-12 rounded-full px-10 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export function Button({ className, variant, size, ...props }) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
