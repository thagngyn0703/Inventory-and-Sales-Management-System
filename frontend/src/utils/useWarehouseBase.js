import { useLocation } from 'react-router-dom';

/**
 * Trả về base path của kho hàng dựa theo URL context hiện tại.
 * - Khi staff dùng từ /sales/* → trả về '/sales'
 * - Khi truy cập trực tiếp qua /warehouse/* → trả về '/warehouse'
 * Dùng trong các warehouse components để navigate() luôn đúng URL.
 */
export function useWarehouseBase() {
  const location = useLocation();
  return location.pathname.startsWith('/sales') ? '/sales' : '/warehouse';
}
