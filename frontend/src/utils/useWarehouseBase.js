import { useLocation } from 'react-router-dom';

/**
 * Trả về base path của kho hàng dựa theo URL context hiện tại.
 * - Khi staff dùng từ /staff/* (hoặc link cũ /sales/*) → trả về '/staff'
 * - Khi truy cập trực tiếp qua route cũ /warehouse/* → vẫn trả '/staff' để hợp nhất URL
 * Dùng trong các warehouse components để navigate() luôn đúng URL.
 */
export function useWarehouseBase() {
  const location = useLocation();
  if (location.pathname.startsWith('/staff') || location.pathname.startsWith('/sales')) {
    return '/staff';
  }
  return '/staff';
}
