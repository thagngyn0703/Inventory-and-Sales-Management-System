import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './button';
import { cn } from '../../lib/utils';

/**
 * Modal xác nhận (thay window.confirm).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  onConfirm,
  loading = false,
  confirmVariant = 'default',
}) {
  const handleCancel = () => {
    if (loading) return;
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    await onConfirm?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[5500] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={handleCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className={cn(
              'relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl shadow-slate-900/10'
            )}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant={confirmVariant === 'destructive' ? 'warning' : 'default'}
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? 'Đang xử lý...' : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
