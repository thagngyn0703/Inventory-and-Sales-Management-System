/**
 * POSContainer — Shared POS engine dùng chung cho cả Staff và Manager.
 *
 * Props:
 *   layoutMode: 'staff' | 'manager'  — ảnh hưởng đến quyền sửa giá, back URL, seller info
 *   storeName:  string               — tên cửa hàng hiển thị trên màn và hóa đơn in
 *   staffDisplayName: string         — tên người dùng hiện tại
 *   staffRoleLabel:   string         — nhãn vai trò ('Nhân viên' | 'Quản lý')
 *   sidebarCollapsed: boolean
 *   toggleSidebar:    function
 */
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getInvoice,
  createInvoice,
  updateInvoice,
  getPaymentStatus,
  cancelUnpaidBankTransferInvoice,
  previewInvoiceTax,
} from '../../services/invoicesApi';
import { closeShift, getCurrentShift, openShift } from '../../services/shiftsApi';
import { getPosRegisters } from '../../services/posRegistersApi';
import { getProduct, getProducts, getProductUnits, scanProductByCode } from '../../services/productsApi';
import { getCustomers, createCustomer } from '../../services/customersApi';
import { getStoreTaxSettings, getStoreBankSettings, getStoreLoyaltySettings } from '../../services/adminApi';
import { sendLoyaltyUpdate } from '../../services/customerNotifyApi';
import PaymentWaitModal from '../payment/PaymentWaitModal';
import { Button } from '../ui/button';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrencyInput, parseCurrencyInput, toCurrencyInputFromNumber } from '../../utils/currencyInput';
import { Barcode, Loader2, Menu, Plus, Receipt, X } from 'lucide-react';
import '../../pages/SaleDashboard/SalesPOS.css';

/** Tính subtotal và tax từ grand_total — mirror công thức backend. */
function calcTaxBreakdown(grandTotal, taxRate, priceIncludesTax) {
  const total = Number(grandTotal) || 0;
  const rate = Number(taxRate) || 0;
  if (rate === 0) return { subtotal: total, tax: 0 };
  if (priceIncludesTax) {
    const subtotal = Math.round(total / (1 + rate / 100));
    return { subtotal, tax: total - subtotal };
  }
  const tax = Math.round(total * (rate / 100));
  return { subtotal: total, tax };
}

function formatMoney(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

function resolveMediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `${window.location.protocol}${raw}`;

  const apiBase = String(process.env.REACT_APP_API_URL || 'http://localhost:8000/api').replace(/\/+$/, '');
  const apiOrigin = apiBase.replace(/\/api$/i, '');
  const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
  return `${apiOrigin}${normalizedPath}`;
}

function getProductImageUrl(productLike) {
  if (!productLike) return '';
  const list = Array.isArray(productLike.image_urls) ? productLike.image_urls : [];
  const candidates = [
    ...list.map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') return entry.url || entry.secure_url || entry.src || '';
      return '';
    }),
    productLike.image_url || '',
    productLike.image || '',
    productLike.thumbnail || '',
    productLike.photo || '',
  ];
  const first = candidates.find((u) => String(u || '').trim());
  return first ? resolveMediaUrl(first) : '';
}

async function copyText(text) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return true;
}

function buildLoyaltyCustomerMessage({ customerName, earnedPoints, currentPoints, nextNudge, storeName }) {
  const name = customerName || 'Anh/Chị';
  const earned = Number(earnedPoints || 0);
  const current = Number(currentPoints || 0);
  const nextLine = nextNudge?.points_needed
    ? `Hiện còn ${nextNudge.points_needed} điểm để đạt mốc quà ${formatMoney(nextNudge.reward_value_vnd)}.`
    : 'Anh/Chị đã đạt mốc thưởng cao nhất hiện tại.';
  return `Xin chào ${name}, ${storeName} thông báo đơn hàng vừa hoàn tất đã được cộng ${earned} điểm loyalty. Tổng điểm hiện tại của Anh/Chị là ${current} điểm. ${nextLine} Cảm ơn Anh/Chị đã ủng hộ cửa hàng!`;
}

const POS_REGISTER_LS_KEY = 'pos_register_id';

const generateTabId = () => Date.now() + Math.random().toString(36).substring(2, 9);

const createDefaultTab = (index = 1) => ({
  tabId: generateTabId(),
  name: `Hóa đơn ${index}`,
  items: [],
  paymentMethod: 'cash',
  recipientName: '',
  customerId: null,
  customerData: null,
  customerPaid: '',
  loyaltyApplyPoints: 0,
  saving: false,
  error: '',
  successMessage: '',
  invoiceId: null,
  payOldDebt: false,
});

export default function POSContainer({
  layoutMode = 'staff',
  storeName = 'Cửa hàng',
  staffDisplayName = '',
  staffRoleLabel = '',
  sidebarCollapsed = false,
  toggleSidebar,
}) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast: notify } = useToast();

  const isManager = layoutMode === 'manager';
  const currentUserId = useMemo(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('user') || 'null');
      return String(raw?._id || raw?.id || '');
    } catch {
      return '';
    }
  }, []);
  const backToListPath = isManager ? '/manager/pos/list' : '/staff/invoices';

  const rawBankAccountConfig = String(process.env.REACT_APP_BANK_ACCOUNT || 'MB-0000000000').trim();
  const [envBankCode, envBankAccountNumber] = rawBankAccountConfig.includes('-')
    ? rawBankAccountConfig.split('-', 2)
    : ['MB', rawBankAccountConfig];
  const [storeBank, setStoreBank] = useState({
    bank_id: '',
    bank_account: '',
  });
  // Ưu tiên cấu hình theo store-settings/bank; fallback env để không gãy luồng cũ.
  const bankCode = String(storeBank.bank_id || envBankCode || 'MB').toUpperCase();
  const bankAccountNumber = String(storeBank.bank_account || envBankAccountNumber || '0000000000');

  const [storeTax, setStoreTax] = useState({ business_type: 'ho_kinh_doanh', tax_rate: 0, price_includes_tax: true });
  const [loyaltySettings, setLoyaltySettings] = useState({
    enabled: false,
    earn: { spend_amount_vnd: 20000, points: 1, min_invoice_amount_vnd: 20000 },
    redeem: { point_value_vnd: 500, min_points: 10, max_percent_per_invoice: 50, allow_with_promotion: false },
    milestones: [],
  });
  const [products, setProducts] = useState([]);
  const [unitOptionsByProduct, setUnitOptionsByProduct] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [scanMode, setScanMode] = useState(false);

  const [tabs, setTabs] = useState([createDefaultTab(1)]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].tabId);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerList, setCustomerList] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debounceRef = useRef(null);

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ full_name: '', phone: '' });
  const [customerModalError, setCustomerModalError] = useState('');

  const [pendingPayment, setPendingPayment] = useState(null);
  const [productInfoModal, setProductInfoModal] = useState({ open: false, loading: false, product: null, error: '' });
  const pollingRef = useRef(null);
  const pollingSessionRef = useRef(0);
  const searchWrapRef = useRef(null);
  const tabsListRef = useRef(null);
  const summaryScrollRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef(null);
  const prevItemCountRef = useRef(0);

  const isNew = id === 'new' || !id || id === 'undefined' || id === 'null';

  const activeTab = tabs.find((t) => t.tabId === activeTabId) || tabs[0];

  const [shiftLoading, setShiftLoading] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);
  const [openShiftCash, setOpenShiftCash] = useState('');
  const [closeShiftCash, setCloseShiftCash] = useState('');
  const [closeShiftModalOpen, setCloseShiftModalOpen] = useState(false);
  const [closeShiftSaving, setCloseShiftSaving] = useState(false);
  const [openShiftBusy, setOpenShiftBusy] = useState(false);
  /** Modal mở ca chỉ hiện khi người dùng bấm nút (không chặn màn ngay khi vào POS). */
  const [shiftOpenModalOpen, setShiftOpenModalOpen] = useState(false);
  const [posTaxPreview, setPosTaxPreview] = useState(null);
  const [posTaxPreviewLoading, setPosTaxPreviewLoading] = useState(false);
  const [posTaxPreviewErr, setPosTaxPreviewErr] = useState(false);
  const [posRegisters, setPosRegisters] = useState([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState(() => {
    try {
      return localStorage.getItem(POS_REGISTER_LS_KEY) || '';
    } catch {
      return '';
    }
  });

  const getNextTabNumber = useCallback((tabList) => {
    const used = new Set(
      (tabList || [])
        .map((t) => {
          const m = /^Hóa đơn\s+(\d+)$/.exec(String(t.name || '').trim());
          return m ? Number(m[1]) : null;
        })
        .filter((n) => Number.isInteger(n) && n > 0)
    );
    let next = 1;
    while (used.has(next)) next += 1;
    return next;
  }, []);

  const scrollTabsToEnd = useCallback(() => {
    if (!tabsListRef.current) return;
    tabsListRef.current.scrollTo({
      left: tabsListRef.current.scrollWidth,
      behavior: 'smooth',
    });
  }, []);

  const updateActiveTab = (updates) => {
    setTabs((prev) => prev.map((t) => (t.tabId === activeTabId ? { ...t, ...updates } : t)));
  };

  const openProductInfoModal = useCallback(async (item) => {
    const productId = String(item?.product_id || '').trim();
    if (!productId) {
      notify('Không tìm thấy mã sản phẩm để xem chi tiết.', 'error');
      return;
    }
    setProductInfoModal({ open: true, loading: true, product: null, error: '' });
    try {
      const product = await getProduct(productId);
      setProductInfoModal({ open: true, loading: false, product, error: '' });
    } catch (e) {
      setProductInfoModal({
        open: true,
        loading: false,
        product: null,
        error: e?.message || 'Không thể tải thông tin sản phẩm.',
      });
    }
  }, [notify]);

  const closeProductInfoModal = useCallback(() => {
    setProductInfoModal({ open: false, loading: false, product: null, error: '' });
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const { products: data = [] } = await getProducts(1, 1000);
      setProducts(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadUnitsForProduct = useCallback(
    async (productId) => {
      const pid = String(productId || '');
      if (!pid) return [];
      if (unitOptionsByProduct[pid]) return unitOptionsByProduct[pid];
      try {
        const units = await getProductUnits(pid);
        const normalized = (units || []).sort(
          (a, b) => Number(a.exchange_value || 0) - Number(b.exchange_value || 0)
        );
        setUnitOptionsByProduct((prev) => ({ ...prev, [pid]: normalized }));
        setTabs((prevTabs) =>
          prevTabs.map((tab) => ({
            ...tab,
            items: (tab.items || []).map((it) => {
              if (String(it.product_id) !== pid) return it;
              const next = { ...it, available_units: normalized };
              const hasCurrentUnit = normalized.some((u) => String(u._id) === String(it.unit_id || ''));
              if (!hasCurrentUnit && normalized.length > 0) {
                const fallback = normalized.find((u) => u.is_base) || normalized[0];
                next.unit_id = fallback._id;
                next.unit_name = fallback.unit_name;
                next.exchange_value = Number(fallback.exchange_value) || 1;
                next.unit_price = Number(fallback.price) || 0;
                next.line_total = Math.max(
                  0,
                  (Number(next.quantity) || 0) * (Number(next.unit_price) || 0) - (Number(next.discount) || 0)
                );
              }
              return next;
            }),
          }))
        );
        return normalized;
      } catch (e) {
        return [];
      }
    },
    [unitOptionsByProduct]
  );

  const searchCustomers = (val) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setCustomerList([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await getCustomers({ searchKey: val });
        setCustomerList(res.customers || []);
        setShowCustomerDropdown(true);
      } catch (e) {
        console.error(e);
      }
    }, 300);
  };

  const stopPolling = useCallback(() => {
    pollingSessionRef.current += 1;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handlePrintInvoice = useCallback(
    (invoice, tab, options = {}) => {
      const { requireUserConfirm = false } = options;
      if (requireUserConfirm) {
        notify('Đã xác nhận tiền chuyển khoản thành công. Đang in hóa đơn...', 'success');
      }
      const displayCode = invoice?.display_code || invoice?._id || '';
      const isHKD = (storeTax.business_type || 'ho_kinh_doanh') === 'ho_kinh_doanh';
      const sellerLine = tab._sellerName
        ? `<strong>Người bán:</strong> ${tab._sellerName}${tab._sellerRole ? ` (${tab._sellerRole})` : ''}<br/>`
        : '';
      const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>In Hóa Đơn - ${displayCode}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            html, body {
              width: 80mm;
              margin: 0;
              padding: 0;
              background: #fff;
            }
            body {
              box-sizing: border-box;
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              font-size: 12px;
              line-height: 1.4;
              color: #000;
              padding: 5mm 0;
            }
            .receipt {
              width: 72mm; /* vùng in an toàn cho hầu hết máy 80mm */
              margin: 0 auto;
            }
            h2 {
              text-align: center;
              margin: 0 0 5px;
              font-size: 16px;
              font-weight: 700;
              word-break: break-word;
            }
            .header-info {
              text-align: center;
              margin-bottom: 9px;
              font-size: 11px;
              color: #111;
              line-height: 1.4;
            }
            .invoice-details {
              margin-bottom: 8px;
              line-height: 1.45;
              font-size: 11px;
            }
            .divider {
              border-top: 1px dashed #666;
              margin: 7px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 8px;
              table-layout: fixed;
            }
            .col-item { width: 48%; }
            .col-qty { width: 12%; }
            .col-price { width: 20%; }
            .col-total { width: 20%; }
            th, td {
              border-bottom: 1px dashed #9ca3af;
              padding: 4px 2px;
              text-align: left;
              font-size: 11px;
              vertical-align: top;
              word-break: break-word;
            }
            th {
              border-bottom: 1px solid #111;
              font-weight: 700;
            }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .total-row {
              font-weight: 700;
              font-size: 14px;
              margin-top: 6px;
            }
            .footer {
              text-align: center;
              margin-top: 10px;
              font-style: italic;
              color: #333;
              font-size: 11px;
            }
            @media print {
              html, body {
                width: 80mm;
              }
              .receipt {
                width: 72mm;
              }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <h2>${storeName.toUpperCase()}</h2>
            <div class="header-info">
              HÓA ĐƠN BÁN HÀNG<br/>
              Mã Đơn: ${displayCode}<br/>
              Ngày: ${new Date().toLocaleString('vi-VN')}
            </div>
            <div class="divider"></div>
            <div class="invoice-details">
              <strong>Khách hàng:</strong> ${tab.recipientName || 'Khách lẻ'}<br/>
              ${sellerLine}
              <strong>Thanh toán:</strong> ${
                tab.paymentMethod === 'cash'
                  ? 'Tiền mặt'
                  : tab.paymentMethod === 'bank_transfer'
                    ? 'Chuyển khoản'
                    : tab.paymentMethod
              }
            </div>
            <table>
              <thead>
                <tr>
                  <th class="col-item">Tên hàng</th>
                  <th class="col-qty text-center">SL</th>
                  ${isHKD ? '' : '<th class="col-price text-right">Đơn giá</th>'}
                  <th class="col-total text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                ${tab.items
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.name || 'Sản phẩm'}</td>
                    <td class="text-center">${item.quantity}</td>
                    ${isHKD ? '' : `<td class="text-right">${Number(item.unit_price || 0).toLocaleString('vi-VN')}₫</td>`}
                    <td class="text-right">${Number(item.line_total || 0).toLocaleString('vi-VN')}₫</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
            ${(() => {
              const rate = invoice.tax_rate_snapshot || 0;
              const tax = invoice.tax_amount || 0;
              const subtotal = invoice.subtotal_amount || invoice.total_amount || 0;
              if (!isHKD && rate > 0) {
                return `<div class="text-right" style="margin-top:6px;">Tạm tính: ${Number(subtotal).toLocaleString('vi-VN')}₫</div>
                <div class="text-right" style="color:#475569;">VAT (${rate}%): ${Number(tax).toLocaleString('vi-VN')}₫</div>`;
              }
              return `<div class="text-right">${isHKD ? 'Tổng tiền hàng (HKD):' : 'Tổng tiền hàng:'} ${Number(invoice.total_amount || 0).toLocaleString('vi-VN')}₫</div>`;
            })()}
            <div class="text-right total-row">
              TỔNG CỘNG: ${Number(invoice.total_amount || 0).toLocaleString('vi-VN')}₫
            </div>
            ${
              tab.payOldDebt
                ? `<div class="text-right" style="margin-top: 4px;">
                Nợ cũ đã trả: ${Number(tab.customerData?.debt_account || 0).toLocaleString('vi-VN')}₫
              </div>
              <div class="text-right total-row" style="color: #000; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
                TỔNG THANH TOÁN: ${Number(
                  (invoice.total_amount || 0) + (tab.customerData?.debt_account || 0)
                ).toLocaleString('vi-VN')}₫
              </div>`
                : ''
            }
            <div class="divider"></div>
            <div class="footer">Cảm ơn quý khách và hẹn gặp lại!</div>
          </div>
        </body>
      </html>`;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc || !iframe.contentWindow) {
        document.body.removeChild(iframe);
        return;
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
        }, 1000);
      }, 350);
    },
    [notify, storeName, storeTax.business_type]
  );

  const notifyCustomerLoyaltyMessage = useCallback(
    async (customer, loyaltySummary, invoiceId) => {
      if (!customer || !loyaltySummary) return;
      const earned = Number(loyaltySummary.earned_points || 0);
      const used = Number(loyaltySummary.used_points || 0);
      if (earned <= 0 && used <= 0) return;
      if (!customer._id && !customer.id) return;
      const customerId = String(customer._id || customer.id);

      try {
        const result = await sendLoyaltyUpdate({
          customer_id: customerId,
          invoice_id: invoiceId || undefined,
          earned_points: earned,
          redeemed_points: used,
        });
        if (result.success) {
          return;
        } else if (result.already_sent) {
          // Im lặng — không spam
        } else {
          // Thất bại khi gửi: fallback sang copy/paste
          const msg = buildLoyaltyCustomerMessage({
            customerName: customer.full_name || customer.name || 'Anh/Chị',
            earnedPoints: earned,
            currentPoints: Number(loyaltySummary.current_points || 0),
            nextNudge: loyaltySummary.next_nudge || null,
            storeName,
          });
          await copyText(msg).catch(() => {});
        }
      } catch (e) {
        // Lỗi API: fallback copy
        const msg = buildLoyaltyCustomerMessage({
          customerName: customer.full_name || customer.name || 'Anh/Chị',
          earnedPoints: earned,
          currentPoints: Number(loyaltySummary.current_points || 0),
          nextNudge: loyaltySummary.next_nudge || null,
          storeName,
        });
        await copyText(msg).catch(() => {});
      }
    },
    [storeName]
  );

  const startPolling = useCallback(
    (paymentRef, invoiceData, tabSnapshot) => {
      const isPaymentSettled = (status) => {
        const normalized = String(status || '').trim().toLowerCase();
        return normalized === 'paid' || normalized === 'success' || normalized === 'completed';
      };

      stopPolling();
      const sessionId = pollingSessionRef.current;
      let attempts = 0;
      const MAX_ATTEMPTS = 160;
      const getNextDelayMs = (nextAttempt) => {
        if (nextAttempt <= 10) return 1200; // 12s đầu kiểm tra rất nhanh
        if (nextAttempt <= 25) return 2000;
        if (nextAttempt <= 55) return 3000;
        return 5000;
      };

      const pollOnce = async () => {
        if (sessionId !== pollingSessionRef.current) return;
        attempts++;
        try {
          const result = await getPaymentStatus(paymentRef);
          if (isPaymentSettled(result?.payment_status)) {
            stopPolling();
            setPendingPayment(null);
            handlePrintInvoice(invoiceData, tabSnapshot, { requireUserConfirm: true });
            await notifyCustomerLoyaltyMessage(tabSnapshot?.customerData, {
              earned_points: Number(result?.loyalty?.earned_points || 0),
              used_points: 0,
              current_points: Number(result?.loyalty?.current_points || 0),
              next_nudge: result?.loyalty?.next_nudge || null,
            }, tabSnapshot?.invoiceId || invoiceData?._id);
            notify('Thanh toán chuyển khoản thành công!', 'success');
            setTabs((prev) => {
              const filtered = prev.filter((t) => t.tabId !== tabSnapshot.tabId);
              if (filtered.length === 0) {
                const newTab = createDefaultTab(1);
                setActiveTabId(newTab.tabId);
                return [newTab];
              }
              setActiveTabId(filtered[0].tabId);
              return filtered;
            });
            loadProducts();
            return;
          }
        } catch (e) {
          console.warn('[Polling] Error:', e.message);
        }
        if (attempts >= MAX_ATTEMPTS) {
          stopPolling();
          setPendingPayment((prev) => {
            if (prev?.invoice?._id) {
              cancelUnpaidBankTransferInvoice(prev.invoice._id).then(() => loadProducts());
            }
            return null;
          });
          notify('Hết thời gian chờ thanh toán. Giao dịch đã bị hủy.', 'error');
          return;
        }
        const delay = getNextDelayMs(attempts + 1);
        pollingRef.current = setTimeout(pollOnce, delay);
      };

      // Gọi lần đầu ngay lập tức để giảm độ trễ cảm nhận tại quầy.
      pollOnce();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopPolling, handlePrintInvoice, loadProducts, notify, notifyCustomerLoyaltyMessage]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(event.target)) setShowSearchDropdown(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(
    () => () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const currentCount = Number(activeTab?.items?.length || 0);
    const prevCount = Number(prevItemCountRef.current || 0);
    prevItemCountRef.current = currentCount;
    if (currentCount <= prevCount) return;
    const scroller = summaryScrollRef.current;
    if (!scroller) return;
    requestAnimationFrame(() => {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [activeTab?.items?.length, activeTabId]);

  const loadInvoice = useCallback(async () => {
    if (!id || isNew) return;
    setLoading(true);
    try {
      const data = await getInvoice(id);
      const loadedTab = {
        tabId: generateTabId(),
        name: `Hóa đơn: ${data._id.slice(-6)}`,
        items: (data.items || []).map((item) => ({
          product_id: item.product_id?._id ?? item.product_id,
          unit_id: item.unit_id?._id ?? item.unit_id ?? null,
          unit_name: item.unit_name || '',
          exchange_value: Number(item.exchange_value) || 1,
          name: item.product_id?.name ?? '',
          sku: item.product_id?.sku ?? '',
          image_url: getProductImageUrl(item.product_id),
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          discount: item.discount || 0,
          line_total: item.line_total || 0,
          stock_qty: item.product_id?.stock_qty,
          tax_category: item.tax_category_snapshot || 'DEFAULT',
          tax_profile: item.tax_category_snapshot || 'default',
          vat_rate: Number(item.vat_rate_snapshot ?? 0),
          excise_rate: Number(item.excise_rate_snapshot ?? 0),
          price_includes_tax: item.price_includes_tax_snapshot ?? null,
          tax_override_reason: item.tax_override_reason_snapshot || '',
        })),
        paymentMethod: data.payment_method || 'cash',
        recipientName: data.recipient_name || '',
        customerPaid: toCurrencyInputFromNumber(data.total_amount || 0),
        loyaltyApplyPoints: data.loyalty_redeem_points || 0,
        saving: false,
        error: '',
        successMessage: '',
        invoiceId: data._id,
      };
      setTabs([loadedTab]);
      setActiveTabId(loadedTab.tabId);
    } catch (e) {
      console.error(e);
      updateActiveTab({ error: e.message || 'Không thể tải hóa đơn' });
    } finally {
      setLoading(false);
    }
  }, [id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getStoreTaxSettings()
      .then((data) =>
        setStoreTax({
          business_type: data.business_type || 'ho_kinh_doanh',
          tax_rate: data.tax_rate ?? 0,
          price_includes_tax: data.price_includes_tax !== false,
        })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    getStoreBankSettings()
      .then((data) =>
        setStoreBank({
          bank_id: String(data?.bank_id || '').trim(),
          bank_account: String(data?.bank_account || '').trim(),
        })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    getStoreLoyaltySettings()
      .then((data) => setLoyaltySettings(data?.loyalty_settings || loyaltySettings))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);
  useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getPosRegisters();
        if (cancelled) return;
        setPosRegisters(Array.isArray(list) ? list : []);
        const ids = (Array.isArray(list) ? list : []).map((r) => String(r._id || '')).filter(Boolean);
        setSelectedRegisterId((prev) => {
          const p = String(prev || '');
          if (p && ids.includes(p)) return p;
          const first = ids[0] || '';
          try {
            if (first) localStorage.setItem(POS_REGISTER_LS_KEY, first);
          } catch {
            /* ignore */
          }
          return first;
        });
      } catch {
        if (!cancelled) setPosRegisters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadShift = useCallback(async () => {
    if (!selectedRegisterId) {
      setCurrentShift(null);
      return;
    }
    try {
      setShiftLoading(true);
      const shift = await getCurrentShift({ registerId: selectedRegisterId });
      setCurrentShift(shift);
    } catch (e) {
      setCurrentShift(null);
      if (e?.code === 'REGISTER_REQUIRED') {
        notify('Vui lòng chọn quầy thanh toán.', 'error');
      }
    } finally {
      setShiftLoading(false);
    }
  }, [selectedRegisterId, notify]);

  useEffect(() => {
    loadShift();
  }, [loadShift]);

  useEffect(() => {
    function syncRegisterPinFromLs() {
      try {
        const next = localStorage.getItem(POS_REGISTER_LS_KEY) || '';
        setSelectedRegisterId((prev) => (next !== prev ? next : prev));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pos-register-changed', syncRegisterPinFromLs);
    return () => window.removeEventListener('pos-register-changed', syncRegisterPinFromLs);
  }, []);

  useEffect(() => {
    if (!currentShift) setCloseShiftModalOpen(false);
  }, [currentShift]);

  useEffect(() => {
    if (currentShift) setShiftOpenModalOpen(false);
  }, [currentShift]);

  const submitOpenGateShift = useCallback(async () => {
    if (!selectedRegisterId) {
      notify('Chưa chọn quầy thanh toán.', 'error');
      return;
    }
    try {
      setOpenShiftBusy(true);
      const opening_cash = parseCurrencyInput(openShiftCash);
      await openShift({ opening_cash, register_id: selectedRegisterId });
      notify('Đã mở ca.', 'success');
      setOpenShiftCash('');
      await loadShift();
    } catch (err) {
      if (err?.code === 'SHIFT_ALREADY_OPEN') {
        const openerName =
          err?.payload?.open_shift?.opened_by?.fullName
          || err?.payload?.open_shift?.opened_by?.email
          || 'một tài khoản khác';
        const openedAtRaw = err?.payload?.open_shift?.opened_at;
        const openedAtText = openedAtRaw ? new Date(openedAtRaw).toLocaleString('vi-VN') : 'không xác định';
        const deskName = err?.payload?.open_shift?.register_id?.name || '';
        notify(
          `${deskName ? `${deskName}: ` : ''}Ca đã được mở bởi ${openerName} lúc ${openedAtText}. Đóng ca trên quầy này trước khi mở lại, hoặc chọn quầy khác.`,
          'error'
        );
      } else {
        notify(err.message || 'Không thể mở ca', 'error');
      }
    } finally {
      setOpenShiftBusy(false);
    }
  }, [selectedRegisterId, openShiftCash, notify, loadShift]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return products.slice(0, 50);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.barcode && p.barcode.includes(term))
      )
      .slice(0, 50);
  }, [products, searchTerm]);

  const handleAddTab = () => {
    const nextNumber = getNextTabNumber(tabs);
    const newTab = createDefaultTab(nextNumber);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.tabId);
    requestAnimationFrame(() => scrollTabsToEnd());
  };

  const handleCloseTab = (tabIdToClose, e) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      const newTab = createDefaultTab(1);
      setTabs([newTab]);
      setActiveTabId(newTab.tabId);
      if (!isNew) navigate(isManager ? '/manager/pos' : '/staff/invoices/new');
      return;
    }
    const newTabs = tabs.filter((t) => t.tabId !== tabIdToClose);
    if (activeTabId === tabIdToClose) {
      const idx = tabs.findIndex((t) => t.tabId === tabIdToClose);
      const nextActive = newTabs[idx - 1] || newTabs[0];
      setActiveTabId(nextActive.tabId);
    }
    setTabs(newTabs);
  };

  const handleAddProduct = (product, unitOverride = null) => {
    if (isNew && !selectedRegisterId) {
      notify('Đang tải quầy thanh toán hoặc chưa có quầy được chọn.', 'error');
      return;
    }
    if (isNew && !hasOpenShift) {
      notify('Bạn cần mở ca trước khi bán hàng.', 'error');
      return;
    }
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.tabId !== activeTabId) return tab;
        const chosenUnit = unitOverride || {
          _id: null,
          unit_name: product.base_unit || 'Cái',
          exchange_value: 1,
          price: product.sale_price || 0,
        };
        const unitKey = String(chosenUnit?._id || '');
        const existingIdx = tab.items.findIndex(
          (it) => it.product_id === product._id && String(it.unit_id || '') === unitKey
        );
        const newItems = [...tab.items];
        if (existingIdx >= 0) {
          const it = newItems[existingIdx];
          const newQty = Number(it.quantity || 0) + 1;
          const maxQty = Math.floor((Number(it.stock_qty || 0) || 0) / (Number(it.exchange_value || 1) || 1));
          if (maxQty >= 0 && newQty > maxQty) {
            notify(`Không đủ tồn kho. Tối đa ${maxQty} ${it.unit_name || 'đơn vị'}.`, 'error');
            return tab;
          }
          const updatedItem = {
            ...it,
            image_url: getProductImageUrl(product) || it.image_url || '',
            quantity: newQty,
            unit_barcode: chosenUnit?.barcode || it.unit_barcode || '',
            line_total: Math.max(0, newQty * Number(it.unit_price || 0) - Number(it.discount || 0)),
          };
          // UX bán hàng: mặt hàng vừa thêm sẽ nổi lên đầu danh sách.
          newItems.splice(existingIdx, 1);
          newItems.unshift(updatedItem);
        } else {
          newItems.unshift({
            product_id: product._id,
            unit_id: chosenUnit?._id || null,
            unit_name: chosenUnit?.unit_name || product.base_unit || 'Cái',
              image_url: getProductImageUrl(product),
            unit_barcode: chosenUnit?.barcode || '',
            exchange_value: Number(chosenUnit?.exchange_value) || 1,
            name: product.name,
            sku: product.sku,
            quantity: 1,
            unit_price: Number(chosenUnit?.price ?? product.sale_price) || 0,
            discount: 0,
            line_total: Number(chosenUnit?.price ?? product.sale_price) || 0,
            stock_qty: product.stock_qty,
            available_units: unitOptionsByProduct[String(product._id)] || [],
            tax_category: product.tax_category || product.tax_profile || 'DEFAULT',
            tax_profile: product.tax_profile || 'default',
            vat_rate: Number(product.vat_rate ?? storeTax.tax_rate ?? 0),
            excise_rate: Number(product.excise_rate ?? 0),
            price_includes_tax: product.price_includes_tax ?? null,
            tax_override_reason: product.tax_override_reason || '',
          });
        }
        return { ...tab, items: newItems, customerPaid: '' };
      })
    );
    setSearchTerm('');
    setShowSearchDropdown(false);
  };

  const handleScanSubmit = async (rawCode) => {
    if (isNew && !selectedRegisterId) {
      notify('Đang tải quầy thanh toán hoặc chưa có quầy được chọn.', 'error');
      return;
    }
    if (isNew && !hasOpenShift) {
      notify('Bạn cần mở ca trước khi bán hàng.', 'error');
      return;
    }
    const code = String(rawCode || '').trim();
    if (!code) return;
    try {
      const found = await scanProductByCode(code);
      await loadUnitsForProduct(found?.product?._id);
      handleAddProduct(found.product, found.unit);
      const unitText = found?.unit?.unit_name ? ` (${found.unit.unit_name})` : '';
      notify(`Đã thêm: ${found.product.name}${unitText}`, 'success');
    } catch (e) {
      notify(e.message || `Không tìm thấy sản phẩm với mã: ${code}`, 'error');
    }
  };

  useEffect(() => {
    if (!scanMode) return;
    const onKeyDown = (e) => {
      if (['Shift', 'Alt', 'Control', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const code = scanBufferRef.current;
        scanBufferRef.current = '';
        if (scanTimerRef.current) {
          clearTimeout(scanTimerRef.current);
          scanTimerRef.current = null;
        }
        handleScanSubmit(code);
        return;
      }
      if (e.key.length === 1) {
        scanBufferRef.current += e.key;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => {
          scanBufferRef.current = '';
          scanTimerRef.current = null;
        }, 600);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [scanMode, products, activeTabId, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateLine = (idx, changes) => {
    const newItems = [...activeTab.items];
    newItems[idx] = { ...newItems[idx], ...changes };
    const qty = Number(newItems[idx].quantity) || 0;
    const price = Number(newItems[idx].unit_price) || 0;
    const discount = Number(newItems[idx].discount) || 0;
    newItems[idx].line_total = Math.max(0, qty * price - discount);
    updateActiveTab({ items: newItems, customerPaid: '' });
  };

  const autoSwitchUnitByQuantity = async (idx, nextQtyRaw) => {
    const line = activeTab.items[idx];
    if (!line) return;
    const nextQty = Number(nextQtyRaw);
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      updateLine(idx, { quantity: 1 });
      return;
    }

    const pid = String(line.product_id || '');
    if (!pid) {
      updateLine(idx, { quantity: nextQty });
      return;
    }

    const currentRatio = Number(line.exchange_value || 1) || 1;
    const maxByCurrentUnit = Math.floor((Number(line.stock_qty || 0) || 0) / currentRatio);
    if (Number.isFinite(maxByCurrentUnit) && nextQty > maxByCurrentUnit) {
      notify(`Không đủ tồn kho. Tối đa ${maxByCurrentUnit} ${line.unit_name || 'đơn vị'}.`, 'error');
      updateLine(idx, { quantity: Math.max(0, maxByCurrentUnit) });
      return;
    }

    const units = await loadUnitsForProduct(pid);
    if (!Array.isArray(units) || units.length === 0) {
      updateLine(idx, { quantity: nextQty });
      return;
    }

    const qtyInBase = nextQty * currentRatio;
    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) {
      updateLine(idx, { quantity: nextQty });
      return;
    }

    const exactCandidates = units
      .filter((u) => Number(u.exchange_value || 0) > 0)
      .filter((u) => qtyInBase % Number(u.exchange_value) === 0)
      .sort((a, b) => Number(b.exchange_value || 0) - Number(a.exchange_value || 0));

    if (exactCandidates.length === 0) {
      updateLine(idx, { quantity: nextQty });
      return;
    }

    const targetUnit = exactCandidates[0];
    const targetRatio = Number(targetUnit.exchange_value || 1) || 1;
    const targetQty = qtyInBase / targetRatio;
    const discount = Number(line.discount || 0) || 0;
    const unitPrice = Number(targetUnit.price) || 0;

    updateLine(idx, {
      quantity: targetQty,
      unit_id: targetUnit._id,
      unit_name: targetUnit.unit_name,
      unit_barcode: targetUnit.barcode || '',
      exchange_value: targetRatio,
      unit_price: unitPrice,
      line_total: Math.max(0, targetQty * unitPrice - discount),
    });
  };

  const updateItemUnit = async (idx, unitId) => {
    const line = activeTab.items[idx];
    if (!line) return;
    const pid = String(line.product_id || '');
    if (!pid) return;
    const units = await loadUnitsForProduct(pid);
    const selected = units.find((u) => String(u._id) === String(unitId || ''));
    if (!selected) return;

    const nextItems = [...activeTab.items];
    const target = { ...nextItems[idx] };
    target.unit_id = selected._id;
    target.unit_name = selected.unit_name;
    target.unit_barcode = selected.barcode || '';
    target.exchange_value = Number(selected.exchange_value) || 1;
    target.unit_price = Number(selected.price) || 0;
    const maxBySelectedUnit = Math.floor(
      (Number(target.stock_qty || 0) || 0) / (Number(target.exchange_value || 1) || 1)
    );
    if (Number.isFinite(maxBySelectedUnit) && Number(target.quantity || 0) > maxBySelectedUnit) {
      notify(`Không đủ tồn kho. Tối đa ${maxBySelectedUnit} ${target.unit_name || 'đơn vị'}.`, 'error');
      target.quantity = Math.max(0, maxBySelectedUnit);
    }
    target.line_total = Math.max(
      0,
      (Number(target.quantity) || 0) * (Number(target.unit_price) || 0) - (Number(target.discount) || 0)
    );
    nextItems[idx] = target;

    const duplicateIdx = nextItems.findIndex(
      (it, i) =>
        i !== idx &&
        String(it.product_id) === String(target.product_id) &&
        String(it.unit_id || '') === String(target.unit_id || '')
    );
    if (duplicateIdx >= 0) {
      const shouldMerge = window.confirm(
        'Đơn vị này đã tồn tại ở dòng khác. Bạn có muốn gộp 2 dòng thành 1 không?'
      );
      if (shouldMerge) {
        const merged = { ...nextItems[duplicateIdx] };
        const newQty = Number(merged.quantity || 0) + Number(target.quantity || 0);
        merged.quantity = newQty;
        merged.line_total = Math.max(
          0,
          newQty * (Number(merged.unit_price) || 0) - (Number(merged.discount) || 0)
        );
        nextItems[duplicateIdx] = merged;
        nextItems.splice(idx, 1);
      }
    }

    updateActiveTab({ items: nextItems, customerPaid: '' });
  };

  const getResolvedUnitsForItem = (item) => {
    if (item?.available_units && item.available_units.length > 0) return item.available_units;
    if (unitOptionsByProduct[String(item?.product_id)]?.length > 0) {
      return unitOptionsByProduct[String(item.product_id)];
    }
    return [
      {
        _id: item?.unit_id || '',
        unit_name: item?.unit_name || 'Cái',
        barcode: item?.unit_barcode || '',
        exchange_value: item?.exchange_value || 1,
        price: item?.unit_price || 0,
      },
    ];
  };

  const removeLine = (idx) => {
    const newItems = activeTab.items.filter((_, i) => i !== idx);
    updateActiveTab({ items: newItems, customerPaid: '' });
  };

  const totalAmount = useMemo(
    () => activeTab.items.reduce((s, it) => s + (it.line_total || 0), 0),
    [activeTab.items]
  );
  const loyaltyPointValue = Number(loyaltySettings?.redeem?.point_value_vnd || 500);
  const earnSpendAmount = Number(loyaltySettings?.earn?.spend_amount_vnd || 20000);
  const earnPointsPerCycle = Number(loyaltySettings?.earn?.points || 1);
  const loyaltyMinInvoiceAmount = Number(loyaltySettings?.earn?.min_invoice_amount_vnd || 20000);
  const hasItems = activeTab.items.length > 0;
  const loyaltyMaxRedeemValue = Math.floor(
    (totalAmount * Number(loyaltySettings?.redeem?.max_percent_per_invoice || 50)) / 100
  );
  const loyaltyAvailablePoints = Math.max(0, Math.floor(Number(activeTab.customerData?.loyalty_points || 0)));
  const loyaltyUsedPoints = Math.max(
    0,
    Math.min(
      Math.floor(Number(activeTab.loyaltyApplyPoints || 0)),
      loyaltyAvailablePoints,
      Math.floor(loyaltyMaxRedeemValue / loyaltyPointValue)
    )
  );
  const loyaltyRedeemValue = loyaltyUsedPoints * loyaltyPointValue;
  const netItemsAmount = Math.max(0, totalAmount - loyaltyRedeemValue);

  const taxPreviewKey = useMemo(
    () =>
      `${activeTabId}|${loyaltyRedeemValue}|${JSON.stringify(
        (activeTab?.items || []).map((i) => [
          i.product_id,
          i.unit_id,
          i.quantity,
          i.line_total,
          i.tax_category,
          i.price_includes_tax,
        ])
      )}`,
    [activeTabId, activeTab?.items, loyaltyRedeemValue]
  );

  useEffect(() => {
    if (!isNew) {
      setPosTaxPreview(null);
      setPosTaxPreviewLoading(false);
      setPosTaxPreviewErr(false);
      return undefined;
    }

    let cancelled = false;
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      if (!activeTab?.items?.length) {
        setPosTaxPreview({
          subtotal_amount: 0,
          tax_amount: 0,
          tax_rate_snapshot: 0,
          tax_is_mixed: false,
          tax_breakdown_by_category: [],
        });
        setPosTaxPreviewLoading(false);
        setPosTaxPreviewErr(false);
        return;
      }

      setPosTaxPreviewLoading(true);
      setPosTaxPreviewErr(false);
      try {
        const data = await previewInvoiceTax(
          {
            items: activeTab.items.map((it) => ({
              product_id: it.product_id,
              line_total: it.line_total,
              tax_category: it.tax_category,
              price_includes_tax: it.price_includes_tax,
              tax_override_reason: it.tax_override_reason,
              quantity: it.quantity,
            })),
            invoice_level_discount: loyaltyRedeemValue,
          },
          { signal: ac.signal }
        );
        if (!cancelled) {
          setPosTaxPreview(data);
          setPosTaxPreviewErr(false);
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
        if (!cancelled) {
          setPosTaxPreview(null);
          setPosTaxPreviewErr(true);
        }
      } finally {
        if (!cancelled) setPosTaxPreviewLoading(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(timer);
    };
  }, [isNew, taxPreviewKey, activeTab.items]);

  const loyaltyPredictedEarnPoints =
    loyaltySettings?.enabled &&
    earnSpendAmount > 0 &&
    netItemsAmount >= loyaltyMinInvoiceAmount
      ? Math.max(0, Math.floor(netItemsAmount / earnSpendAmount) * earnPointsPerCycle)
      : 0;
  const loyaltyEarnBadge = useMemo(() => {
    if (!hasItems) return null;
    if (!loyaltySettings?.enabled) {
      return { tone: 'muted', text: 'Không cộng điểm: chương trình loyalty đang tắt.' };
    }
    if (!activeTab.customerId) {
      return { tone: 'warn', text: 'Không cộng điểm: chưa chọn khách hàng.' };
    }
    if (netItemsAmount < loyaltyMinInvoiceAmount) {
      return {
        tone: 'warn',
        text: `Không cộng điểm: đơn dưới mức tối thiểu ${formatMoney(loyaltyMinInvoiceAmount)}.`,
      };
    }
    if (loyaltyPredictedEarnPoints <= 0) {
      return { tone: 'warn', text: 'Không cộng điểm: đơn chưa đạt mốc tích điểm.' };
    }
    if (activeTab.paymentMethod === 'debt') {
      return {
        tone: 'ok',
        text: `Đơn này sẽ cộng +${loyaltyPredictedEarnPoints} điểm sau khi khách thanh toán nợ.`,
      };
    }
    if (activeTab.paymentMethod === 'bank_transfer') {
      return {
        tone: 'ok',
        text: `Đơn này sẽ cộng +${loyaltyPredictedEarnPoints} điểm sau khi chuyển khoản được xác nhận.`,
      };
    }
    return { tone: 'ok', text: `Đơn này sẽ cộng +${loyaltyPredictedEarnPoints} điểm.` };
  }, [
    hasItems,
    loyaltySettings?.enabled,
    activeTab.customerId,
    netItemsAmount,
    loyaltyMinInvoiceAmount,
    loyaltyPredictedEarnPoints,
    activeTab.paymentMethod,
  ]);
  const remainingToNextPoint = loyaltySettings?.enabled && earnSpendAmount > 0
    ? (earnSpendAmount - (Math.max(0, netItemsAmount) % earnSpendAmount)) % earnSpendAmount
    : 0;
  const totalWithDebt = useMemo(
    () => netItemsAmount + (activeTab.payOldDebt ? activeTab.customerData?.debt_account || 0 : 0),
    [netItemsAmount, activeTab.payOldDebt, activeTab.customerData]
  );

  const legacyTaxBreakdown = useMemo(
    () => calcTaxBreakdown(netItemsAmount, storeTax.tax_rate, storeTax.price_includes_tax),
    [netItemsAmount, storeTax]
  );

  const taxPreviewOk = Boolean(isNew && hasItems && posTaxPreview && !posTaxPreviewErr);

  const hasExciseInPreview =
    (taxPreviewOk &&
      Boolean(posTaxPreview.tax_breakdown_by_category?.some((e) => Number(e.excise_amount) > 0))) ||
    activeTab.items.some((it) => Number(it.excise_rate || 0) > 0);

  const previewShowSplit =
    taxPreviewOk &&
    ((Number(posTaxPreview.tax_amount) || 0) > 0 ||
      Boolean(posTaxPreview.tax_is_mixed) ||
      (posTaxPreview.tax_breakdown_by_category || []).length > 1 ||
      hasExciseInPreview);

  const legacyTaxSplit = !taxPreviewOk && storeTax.tax_rate > 0;
  const summaryShowTaxSplit = previewShowSplit || legacyTaxSplit;

  let posTaxPrimaryLabel = `VAT (${storeTax.tax_rate}%)`;
  if (previewShowSplit) {
    if (posTaxPreview.tax_is_mixed) posTaxPrimaryLabel = 'Thuế (ước tính)';
    else if (hasExciseInPreview) posTaxPrimaryLabel = 'Thuế (VAT & TTĐB)';
    else posTaxPrimaryLabel = `VAT (${Number(posTaxPreview.tax_rate_snapshot) || 0}%)`;
  }

  const summaryGoodsAmount = previewShowSplit
    ? Number(posTaxPreview.subtotal_amount) || 0
    : legacyTaxSplit
      ? legacyTaxBreakdown.subtotal
      : taxPreviewOk && !previewShowSplit
        ? Number(posTaxPreview.subtotal_amount) || 0
        : netItemsAmount;

  const summaryTaxAmount = previewShowSplit
    ? Number(posTaxPreview.tax_amount) || 0
    : legacyTaxSplit
      ? legacyTaxBreakdown.tax
      : 0;

  const customerPaidNum = parseCurrencyInput(activeTab.customerPaid);
  const changeAmount = Math.max(0, customerPaidNum - totalWithDebt);
  const missingAmount = Math.max(0, totalWithDebt - customerPaidNum);
  const customerDebt = activeTab.customerData?.debt_account || 0;
  const isDebtBlocked = customerDebt >= 100000 && !activeTab.payOldDebt;
  const shiftOpenedBy = String(currentShift?.opened_by?._id || currentShift?.opened_by || '');
  const isShiftOwner = Boolean(currentUserId && shiftOpenedBy && currentUserId === shiftOpenedBy);
  const canCloseShift = Boolean(currentShift && (isShiftOwner || isManager));
  const hasOpenShift = Boolean(currentShift);
  const shiftGateVisible = isNew && !currentShift && shiftOpenModalOpen;
  const canSubmit =
    !activeTab.saving &&
    activeTab.items.length > 0 &&
    Boolean(selectedRegisterId) &&
    hasOpenShift &&
    !isDebtBlocked &&
    (activeTab.paymentMethod === 'debt' ||
      customerPaidNum >= totalWithDebt ||
      activeTab.paymentMethod === 'bank_transfer');

  const activeRegisterLabel = useMemo(() => {
    const fromShift = currentShift?.register_id?.name;
    if (fromShift) return fromShift;
    const r = (posRegisters || []).find((x) => String(x._id) === String(selectedRegisterId));
    return r?.name?.trim() || 'Quầy';
  }, [currentShift, posRegisters, selectedRegisterId]);

  const QUICK_PAID_VALUES = [10000, 20000, 50000, 100000, 200000, 500000];

  const submitCloseShiftFromModal = useCallback(async () => {
    if (!currentShift?._id) return;
    const actual_cash = parseCurrencyInput(closeShiftCash);
    if (actual_cash <= 0) {
      notify('Vui lòng nhập tổng tiền mặt kiểm đếm trước khi đóng ca.', 'error');
      return;
    }
    const openedBy = String(currentShift?.opened_by?._id || currentShift?.opened_by || '');
    const shiftOwnerHere = Boolean(currentUserId && openedBy && currentUserId === openedBy);
    const override_close = Boolean(isManager && !shiftOwnerHere);
    try {
      setCloseShiftSaving(true);
      const closedShift = await closeShift(currentShift._id, { actual_cash, override_close });
      const handover = Number(closedShift?.cash_to_handover || 0);
      const keep = Number(closedShift?.cash_to_keep || 0);
      const discrepancy = Number(closedShift?.discrepancy_cash || 0);
      const targetFloat = Number(closedShift?.target_float_cash || 1000000);
      notify(
        `Đóng ca thành công. Bàn giao: ${formatMoney(handover)} | Để lại ca sau: ${formatMoney(keep)}${
          keep < targetFloat ? ` | Thiếu quỹ để lại: ${formatMoney(targetFloat - keep)}` : ''
        }${discrepancy !== 0 ? ` | Chênh lệch: ${formatMoney(discrepancy)}` : ''}`,
        discrepancy !== 0 || keep < targetFloat ? 'warning' : 'success'
      );
      setCloseShiftCash('');
      setCloseShiftModalOpen(false);
      await loadShift();
    } catch (err) {
      notify(err.message || 'Không thể đóng ca', 'error');
    } finally {
      setCloseShiftSaving(false);
    }
  }, [closeShiftCash, currentShift, currentUserId, isManager, loadShift, notify]);

  const processCheckout = async () => {
    updateActiveTab({ saving: true, error: '', successMessage: '' });

    let customerId = activeTab.customerId;
    let recipientName = activeTab.recipientName || 'Khách lẻ';

    if (showCreateCustomer && newCustomer.full_name.trim()) {
      const cleanPhone = newCustomer.phone.trim().replace(/\s/g, '');
      if (cleanPhone && (cleanPhone.length < 10 || cleanPhone.length > 11)) {
        updateActiveTab({ error: 'Số điện thoại phải có 10 hoặc 11 chữ số.', saving: false });
        return;
      }
      try {
        const created = await createCustomer({
          full_name: newCustomer.full_name.trim(),
          phone: cleanPhone,
          status: 'active',
          is_regular: true,
        });
        customerId = created._id;
        recipientName = created.full_name;
        updateActiveTab({ customerId: created._id, customerData: created, recipientName: created.full_name });
        setShowCreateCustomer(false);
        setNewCustomer({ full_name: '', phone: '' });
      } catch (e) {
        updateActiveTab({ error: e.message || 'Lỗi khi thêm khách hàng mới', saving: false });
        return;
      }
    }

    try {
      const payload = {
        payment_method: activeTab.paymentMethod,
        recipient_name: recipientName,
        customer_id: customerId || null,
        items: activeTab.items.map((it) => ({
          product_id: it.product_id,
          unit_id: it.unit_id || null,
          unit_name: it.unit_name || undefined,
          exchange_value: Number(it.exchange_value) || 1,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount: it.discount,
          tax_category: it.tax_category || it.tax_profile || 'DEFAULT',
          tax_profile: it.tax_profile || 'default',
          tax_override_reason: it.tax_override_reason || '',
          price_includes_tax: it.price_includes_tax,
        })),
        previous_debt_paid: activeTab.payOldDebt ? activeTab.customerData?.debt_account || 0 : 0,
        redeem_points_requested: loyaltyUsedPoints,
        promo_discount: 0,
        // Seller snapshot — gửi từ client để backend verify + lưu
        seller_name: staffDisplayName,
        seller_role: staffRoleLabel,
      };

      if (selectedRegisterId) {
        payload.register_id = selectedRegisterId;
      }

      if (!activeTab.invoiceId) {
        const { invoice: created, payment_ref, loyalty_summary } = await createInvoice({ ...payload, status: 'confirmed' });

        // Đính kèm seller info vào tab snapshot để in hóa đơn
        const tabSnapshot = {
          ...activeTab,
          items: [...activeTab.items],
          _sellerName: staffDisplayName,
          _sellerRole: staffRoleLabel,
        };

        if (activeTab.paymentMethod === 'bank_transfer' && payment_ref) {
          setPendingPayment({ paymentRef: payment_ref, totalAmount: totalWithDebt, invoice: created });
          startPolling(payment_ref, created, tabSnapshot);
          updateActiveTab({ saving: false });
        } else {
          if (activeTab.paymentMethod !== 'debt') {
            handlePrintInvoice(created, tabSnapshot);
          }
          if (loyalty_summary?.earned_points || loyalty_summary?.used_points) {
            await notifyCustomerLoyaltyMessage(activeTab?.customerData, loyalty_summary, created?._id || created?.id);
          }
          notify(
            'Thanh toán thành công! ' +
              (changeAmount > 0 ? `Tiền thừa trả khách: ${formatMoney(changeAmount)}` : ''),
            'success'
          );

          if (tabs.length === 1) {
            const nextNumber = getNextTabNumber(tabs);
            const newTab = createDefaultTab(nextNumber);
            setTabs([newTab]);
            setActiveTabId(newTab.tabId);
          } else {
            const newTabs = tabs.filter((t) => t.tabId !== activeTabId);
            setTabs(newTabs);
            setActiveTabId(newTabs[0].tabId);
          }
          loadProducts();
        }
      } else {
        await updateInvoice(activeTab.invoiceId, payload);
        updateActiveTab({ successMessage: 'Đã lưu thay đổi.', saving: false });
        notify('Đã lưu thay đổi hóa đơn.', 'success');
      }
    } catch (e) {
      const code = e?.code || e?.payload?.code;
      if (code === 'SHIFT_REQUIRED') {
        notify('Bạn cần mở ca cho quầy đang chọn trước khi bán hàng.', 'error');
        await loadShift();
      } else if (code === 'REGISTER_REQUIRED') {
        notify(e.message || 'Vui lòng chọn quầy thanh toán và đồng bộ với ca đang mở.', 'error');
      }
      updateActiveTab({ error: e.message || 'Lỗi khi lưu hóa đơn', saving: false });
      if (!['SHIFT_REQUIRED', 'REGISTER_REQUIRED'].includes(code)) {
        notify(e.message || 'Lỗi khi lưu hóa đơn', 'error');
      }
    }
  };

  const handleSubmit = () => {
    if (activeTab.saving) return;
    if (activeTab.items.length === 0) {
      updateActiveTab({ error: 'Chưa có hàng hóa trong đơn.' });
      return;
    }
    if (!canSubmit) return;
    processCheckout();
  };

  if (loading) {
    return (
      <div className="pos-loading">
        <Loader2 className="h-10 w-10 animate-spin text-teal-500" aria-hidden />
        <span>Đang tải dữ liệu quầy...</span>
      </div>
    );
  }

  return (
    <div className="pos-container">
      {/* ── Toolbar ── */}
      <div className="pos-search-toolbar">
        <button
          type="button"
          className="pos-sidebar-toggle-btn"
          title={sidebarCollapsed ? 'Mở menu' : 'Thu nhỏ menu'}
          onClick={() => typeof toggleSidebar === 'function' && toggleSidebar()}
        >
          <Menu className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
        </button>

        {isNew && (
          <div
            className="hidden shrink-0 select-none items-center gap-1.5 rounded-full border border-white/35 bg-white/15 px-3 py-1 text-xs font-bold tracking-tight text-white shadow-sm backdrop-blur-sm sm:flex"
            title="Quầy bán lẻ"
          >
            <Receipt className="h-3.5 w-3.5 opacity-95" aria-hidden />
            {isManager ? 'Bán hàng (Quản lý)' : 'Tạo hóa đơn'}
          </div>
        )}

        <div className="pos-toolbar-main-cluster">
        <div className="pos-toolbar-left">
          <div className="pos-search-dropdown-wrap" ref={searchWrapRef}>
            <input
              type="text"
              placeholder="Tìm hàng hóa theo tên / SKU"
              className="pos-search-input"
              value={searchTerm}
              onFocus={() => setShowSearchDropdown(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSearchDropdown(true);
              }}
            />
            {showSearchDropdown && (
              <div className="pos-search-dropdown">
                {filteredProducts.length === 0 ? (
                  <div className="pos-search-empty">Không tìm thấy sản phẩm</div>
                ) : (
                  filteredProducts.map((p) => {
                    const fallbackUnit = {
                      _id: null,
                      unit_name: p.base_unit || 'Cái',
                      exchange_value: 1,
                      price: Number(p.sale_price) || 0,
                      is_base: true,
                    };
                    return (
                      <div
                        key={p._id}
                        className="pos-search-option"
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() => loadUnitsForProduct(p._id)}
                        onClick={async () => {
                          const loaded = await loadUnitsForProduct(p._id);
                          const selected = loaded.find((x) => x.is_base) || loaded[0] || fallbackUnit;
                          handleAddProduct(p, selected);
                        }}
                        onKeyDown={async (e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          const loaded = await loadUnitsForProduct(p._id);
                          const selected = loaded.find((x) => x.is_base) || loaded[0] || fallbackUnit;
                          handleAddProduct(p, selected);
                        }}
                      >
                        <div>
                          <div className="pos-search-option-name">{p.name}</div>
                          <div className="pos-search-option-meta">
                            {p.sku} - Tồn: {p.stock_qty || 0}
                          </div>
                        </div>
                        <div className="pos-search-option-price">
                          {Number(p.sale_price || 0).toLocaleString('vi-VN')}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`pos-scan-btn${scanMode ? ' active' : ''}`}
            title={scanMode ? 'Tắt chế độ quét mã' : 'Bật chế độ quét mã'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setScanMode((v) => !v);
              scanBufferRef.current = '';
              if (scanTimerRef.current) {
                clearTimeout(scanTimerRef.current);
                scanTimerRef.current = null;
              }
            }}
          >
            <Barcode className="mx-auto h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
          </button>
          {scanMode && <span className="pos-scan-mode-tag">Đang quét mã</span>}
        </div>

        <div className="pos-tabs pos-tabs-inline" ref={tabsListRef} role="tablist" aria-label="Danh sách hóa đơn đang mở">
          {tabs.map((tab) => (
            <div
              key={tab.tabId}
              className={`pos-tab ${tab.tabId === activeTabId ? 'active' : ''}`}
              onClick={(e) => {
                setActiveTabId(tab.tabId);
                e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
              }}
              role="tab"
              aria-selected={tab.tabId === activeTabId}
              title={tab.name}
            >
              <span className="pos-tab-label">{tab.name}</span>
              <button
                type="button"
                className="pos-tab-close-btn"
                aria-label={`Đóng ${tab.name}`}
                onClick={(e) => handleCloseTab(tab.tabId, e)}
              >
                <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="pos-add-tab-btn"
            onClick={handleAddTab}
            aria-label="Thêm hóa đơn"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.65} aria-hidden />
          </Button>
        </div>
        </div>

        {isNew && (
          <div
            className="pos-toolbar-shift-strip"
            role="region"
            aria-label={currentShift ? 'Ca đang mở' : 'Ca chưa mở'}
          >
            {!currentShift ? (
              <>
                <span className="pos-toolbar-shift-warn" title="Thanh toán cần mở ca; vẫn có thể tìm hàng và lên đơn">
                  <i className="fa-solid fa-clock" aria-hidden />
                  Ca chưa mở
                </span>
                <button type="button" className="pos-toolbar-shift-open-btn" onClick={() => setShiftOpenModalOpen(true)}>
                  Mở ca
                </button>
              </>
            ) : (
              <>
                <span className="pos-toolbar-shift-live" aria-hidden />
                <span
                  className="pos-toolbar-shift-ok"
                  title={`${activeRegisterLabel} · Mở lúc ${new Date(currentShift.opened_at || currentShift.openedAt || Date.now()).toLocaleString('vi-VN')} · Đầu ca ${formatMoney(currentShift.opening_cash || 0)}`}
                >
                  <strong>Đang mở ca</strong>
                  <span className="pos-toolbar-shift-sub">
                    Đầu ca {formatMoney(currentShift.opening_cash || 0)}
                  </span>
                </span>
                {canCloseShift && (
                  <button
                    type="button"
                    className="pos-toolbar-shift-close-mini"
                    onClick={() => setCloseShiftModalOpen(true)}
                  >
                    Đóng ca
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Seller badge */}
        {isNew && (
          <div
            className="pos-toolbar-user-badge"
            aria-label={selectedRegisterId ? `Quầy ${activeRegisterLabel}, ${staffDisplayName}` : `Người bán ${staffDisplayName}`}
          >
            <span className="pos-toolbar-user-avatar" aria-hidden>
              <i className="fa-solid fa-user" />
            </span>
            <span
              className="pos-toolbar-register-chip pos-toolbar-store-chip"
              title={storeName ? `Quầy gắn máy POS · cửa hàng: ${storeName}` : 'Quầy gắn máy POS'}
            >
              <i className="fa-solid fa-cash-register pos-toolbar-register-ico" aria-hidden />
              {selectedRegisterId ? activeRegisterLabel : 'Chưa gán quầy'}
            </span>
            <span className="pos-toolbar-staff-line">
              <span className="pos-toolbar-staff-name">{staffDisplayName}</span>
              <span className="pos-toolbar-staff-role"> ({staffRoleLabel})</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="pos-body">
        {/* Cart */}
        <div className="pos-center-area">
          <div className="pos-cart-container">
            <table className="pos-cart-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 72 }}>Ảnh</th>
                  <th style={{ width: 220 }}>Mã hàng</th>
                  <th>Tên hàng</th>
                  <th style={{ width: 100 }}>Số lượng</th>
                  <th style={{ width: 120 }}>Đơn giá</th>
                  <th style={{ width: 120 }}>Thành tiền</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {activeTab.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name || 'Ảnh sản phẩm'}
                          className="pos-product-thumb"
                          loading="lazy"
                        />
                      ) : (
                        <div className="pos-product-thumb-placeholder" aria-label="Không có ảnh">
                          <i className="fa-regular fa-image" />
                        </div>
                      )}
                    </td>
                    <td className="pos-sku-cell" title={item.sku}>
                      <button
                        type="button"
                        className="pos-sku-link"
                        title="Xem thông tin sản phẩm"
                        onClick={() => openProductInfoModal(item)}
                      >
                        {item.sku}
                      </button>
                    </td>
                    <td>
                      <div className="pos-item-name-cell">
                        <div className="pos-item-main-info">
                          <span className="pos-item-name-text">
                            <button
                              type="button"
                              className="pos-item-name-link"
                              title="Xem thông tin sản phẩm"
                              onClick={() => openProductInfoModal(item)}
                            >
                              {item.name}
                            </button>
                          </span>
                          {item.unit_name ? (
                            <span className="pos-item-unit-text">({item.unit_name})</span>
                          ) : null}
                        </div>
                        <div className="pos-item-subline">
                          {(() => {
                            const resolvedUnits = getResolvedUnitsForItem(item);
                            const selectedValue = resolvedUnits.some(
                              (u) => String(u._id || '') === String(item.unit_id || '')
                            )
                              ? item.unit_id || ''
                              : resolvedUnits[0]?._id || '';
                            return (
                              <select
                                className="pos-item-unit-select"
                                value={selectedValue}
                                onFocus={() => loadUnitsForProduct(item.product_id)}
                                onChange={(e) => updateItemUnit(idx, e.target.value)}
                              >
                                {resolvedUnits.map((u) => (
                                  <option key={String(u._id || u.unit_name)} value={u._id || ''}>
                                    {u.unit_name} - {formatMoney(u.price)}
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                          <span className="pos-item-stock-text">
                            Tồn khả dụng: {(() => {
                              const stock = Number(item.stock_qty || 0);
                              const ratio = Number(item.exchange_value || 1);
                              const whole = Math.floor(stock / ratio);
                              const rem = stock - whole * ratio;
                              return `${whole} ${item.unit_name || 'đv'}${rem > 0 ? ` (dư ${rem})` : ''}`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="pos-qty-input"
                        value={item.quantity}
                        onChange={(e) => autoSwitchUnitByQuantity(idx, e.target.value)}
                      />
                    </td>
                    <td>
                      <span className="pos-money-cell">{formatMoney(item.unit_price)}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(item.line_total)}</td>
                    <td>
                      <i
                        className="fa-solid fa-trash-can"
                        style={{ color: '#ef4444', cursor: 'pointer' }}
                        onClick={() => removeLine(idx)}
                      />
                    </td>
                  </tr>
                ))}
                {activeTab.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="pos-cart-empty-cell">
                      Chưa có hàng hóa nào trong đơn
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pos-bottom-bar">
            <div className="pos-bottom-left">
              <div className="pos-mode-btn" onClick={() => navigate(backToListPath)}>
                <i className="fa-solid fa-clock" /> Lịch sử Hóa đơn
              </div>
            </div>
            {loyaltySettings?.enabled && hasItems && remainingToNextPoint > 0 && (
              <div className="text-xs font-semibold text-amber-700">
                Mua thêm {formatMoney(remainingToNextPoint)} nữa để nhận {earnPointsPerCycle} điểm thưởng.
              </div>
            )}
            <div className="pos-bottom-meta">Tổng số dòng: {activeTab.items.length}</div>
          </div>
        </div>

        {/* Right sidebar: summary + payment */}
        <div className="pos-right-sidebar">
          {/* Customer */}
          <div className="pos-customer-section">
            <div className="pos-sidebar-panel pos-sidebar-panel--customer">
              <div className="pos-sidebar-panel-head">Khách hàng</div>
              <div className="pos-sidebar-panel-body pos-sidebar-panel-body-pad">
                {showCreateCustomer ? (
                  <div className="pos-customer-create-fields">
                    <input
                      type="text"
                      placeholder="Tên khách hàng *"
                      value={newCustomer.full_name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                      className="pos-search-input"
                      style={{ marginBottom: 6 }}
                      autoFocus
                    />
                    <input
                      type="text"
                      placeholder="Số điện thoại *"
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      className="pos-search-input"
                      style={{ marginBottom: 6 }}
                    />
                    {customerModalError && (
                      <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 6 }}>
                        {customerModalError}
                      </div>
                    )}
                    <button
                      type="button"
                      className="pos-sidebar-text-btn"
                      onClick={() => {
                        setShowCreateCustomer(false);
                        setNewCustomer({ full_name: '', phone: '' });
                        setCustomerModalError('');
                      }}
                    >
                      <i className="fa-solid fa-xmark" style={{ marginRight: 6 }} /> Hủy thêm khách hàng
                    </button>
                  </div>
                ) : (
                  <div className="pos-customer-search">
                    <div
                      className={`pos-customer-search-field${activeTab.customerId ? ' pos-customer-search-field--has-clear' : ''}`}
                    >
                      <input
                        type="text"
                        placeholder={
                          activeTab.customerId
                            ? activeTab.customerData?.full_name
                            : 'Khách lẻ (mặc định) (Tên/SĐT)'
                        }
                        title={
                          loyaltySettings?.enabled && !activeTab.customerId
                            ? 'Tùy chọn: chọn khách có tài khoản để được tích điểm khi có chương trình loyalty.'
                            : undefined
                        }
                        className="pos-search-input"
                        value={
                          customerSearch !== ''
                            ? customerSearch
                            : activeTab.customerId
                              ? activeTab.recipientName
                              : activeTab.recipientName
                        }
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          updateActiveTab({ recipientName: e.target.value, customerId: null, customerData: null });
                          searchCustomers(e.target.value);
                        }}
                        onFocus={() => {
                          if (customerList.length > 0) setShowCustomerDropdown(true);
                        }}
                        onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      />
                      {activeTab.customerId && (
                        <button
                          type="button"
                          className="pos-customer-clear"
                          aria-label="Bỏ chọn khách"
                          onClick={() => {
                            updateActiveTab({
                              customerId: null,
                              customerData: null,
                              recipientName: '',
                              paymentMethod: 'cash',
                              payOldDebt: false,
                              loyaltyApplyPoints: 0,
                            });
                            setCustomerSearch('');
                          }}
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="pos-customer-add-btn"
                      onClick={() => setShowCreateCustomer(true)}
                      aria-label="Thêm khách hàng"
                    >
                      <i className="fa-solid fa-plus" />
                    </button>
                    {showCustomerDropdown && customerList.length > 0 && (
                      <div className="pos-customer-dropdown">
                        {customerList.map((c) => (
                          <div
                            key={c._id}
                            className="pos-customer-dropdown-item"
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              updateActiveTab({ customerId: c._id, customerData: c, recipientName: c.full_name, loyaltyApplyPoints: 0 });
                              setCustomerSearch('');
                              setShowCustomerDropdown(false);
                            }}
                          >
                            <div className="pos-customer-dropdown-name">{c.full_name}</div>
                            <div className="pos-customer-dropdown-phone">
                              {c.phone} {` • ${Number(c.loyalty_points || 0).toLocaleString('vi-VN')} điểm`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeTab.customerId && loyaltySettings.enabled && (
                      <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#334155', marginBottom: 6 }}>
                          Điểm hiện tại: <b>{loyaltyAvailablePoints}</b>
                          {' • '}Có thể giảm: <b>{formatMoney(Math.min(loyaltyAvailablePoints * loyaltyPointValue, loyaltyMaxRedeemValue))}</b>
                        </div>
                        {loyaltyAvailablePoints >= Number(loyaltySettings?.redeem?.min_points || 10) ? (
                          <button
                            type="button"
                            className="pos-quick-paid-full"
                            onClick={() => {
                              const autoPoints = Math.floor(
                                Math.min(loyaltyAvailablePoints * loyaltyPointValue, loyaltyMaxRedeemValue) / loyaltyPointValue
                              );
                              updateActiveTab({
                                loyaltyApplyPoints: activeTab.loyaltyApplyPoints > 0 ? 0 : autoPoints,
                              });
                            }}
                          >
                            {activeTab.loyaltyApplyPoints > 0
                              ? `Bỏ dùng điểm (${activeTab.loyaltyApplyPoints} điểm)`
                              : `Dùng điểm giảm ${formatMoney(Math.min(loyaltyAvailablePoints * loyaltyPointValue, loyaltyMaxRedeemValue))}`}
                          </button>
                        ) : (
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            Cần tối thiểu {Number(loyaltySettings?.redeem?.min_points || 10)} điểm để dùng.
                          </div>
                        )}
                      </div>
                    )}
                    {activeTab.customerId && !loyaltySettings.enabled && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                        Chương trình tích điểm đang tắt trong cấu hình cửa hàng.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Summary + Payment */}
          <div className="pos-summary-section" ref={summaryScrollRef}>
            <div className="pos-sidebar-panel pos-summary-panel">
              <div className="pos-checkout-summary-bundle">
                <div className="pos-checkout-summary-bundle-head">Tổng đơn</div>
                <div className="pos-summary-panel-lines pos-checkout-summary-lines">
                  {summaryShowTaxSplit ? (
                    <>
                      <div className="pos-summary-line">
                        <span>Tiền hàng</span>
                        <span className="pos-summary-amount">
                          {formatMoney(summaryGoodsAmount)}
                          {posTaxPreviewLoading ? (
                            <span className="pos-tax-preview-spinner" aria-hidden>
                              {' '}
                              …
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="pos-summary-line">
                        <span className="pos-summary-inline-label">
                          {posTaxPrimaryLabel}
                          <button
                            type="button"
                            className="pos-tax-info-tip"
                            title={
                              previewShowSplit
                                ? 'Tách thuế theo cùng engine với khi xuất hóa đơn (theo nhóm/chính sách cửa hàng).'
                                : 'Đang dùng tạm tính theo mức VAT cấu hình cửa hàng. Kết nối xem trước không khả dụng thì chỉ có giá trị này.'
                            }
                            aria-label="Ghi chú về thuế tại POS"
                          >
                            <i className="fa-regular fa-circle-question" aria-hidden />
                          </button>
                        </span>
                        <span className="pos-summary-amount pos-summary-amount-muted">
                          {formatMoney(summaryTaxAmount)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="pos-summary-line">
                      <span>Tổng tiền hàng</span>
                      <span className="pos-summary-amount">{formatMoney(summaryGoodsAmount)}</span>
                    </div>
                  )}
                  {posTaxPreviewErr && isNew && hasItems && (
                    <div className="pos-summary-line pos-summary-line--wrap">
                      <span style={{ fontSize: 12, color: '#b45309' }}>
                        Không tải xem trước thuế; đang hiển thị tạm tính theo cấu hình cửa hàng.
                      </span>
                    </div>
                  )}
                  {loyaltyRedeemValue > 0 && !taxPreviewOk && (
                    <div className="pos-summary-line">
                      <span>Giảm từ điểm</span>
                      <span className="pos-summary-amount" style={{ color: '#0f766e' }}>- {formatMoney(loyaltyRedeemValue)}</span>
                    </div>
                  )}
                  {activeTab.items.some(
                    (it) =>
                      Number(it.excise_rate || 0) > 0
                      || /BEER|ALCOHOL|TOBACCO|VAT_EXCISE/i.test(String(it.tax_category || ''))
                  ) && (
                    <div className="pos-summary-line pos-summary-line--wrap">
                      <span style={{ fontSize: 12, color: '#92400e' }}>
                        Có mặt hàng chịu TTĐB, hệ thống sẽ tính TTĐB trước rồi mới tính VAT.
                      </span>
                    </div>
                  )}
                </div>
                <div className="pos-total-banner">
                  <span>{activeTab.payOldDebt ? 'Tổng thanh toán (+Nợ)' : 'Tổng'}</span>
                  <span className="pos-total-amount">{formatMoney(totalWithDebt)}</span>
                </div>
              </div>
            </div>

            <div className="pos-sidebar-panel pos-payment-panel">
              <div className="pos-sidebar-panel-head">Phương thức thanh toán</div>
              <div className="pos-payment-panel-body">
                <div className="pos-payment-methods">
                  <button
                    type="button"
                    className={`pos-method-btn ${activeTab.paymentMethod === 'cash' ? 'active' : ''}`}
                    onClick={() => updateActiveTab({ paymentMethod: 'cash' })}
                  >
                    <i className="fa-solid fa-money-bill" style={{ marginRight: 6 }} /> Tiền mặt
                  </button>
                  <button
                    type="button"
                    className={`pos-method-btn ${activeTab.paymentMethod === 'bank_transfer' ? 'active' : ''}`}
                    onClick={() => updateActiveTab({ paymentMethod: 'bank_transfer' })}
                  >
                    <i className="fa-solid fa-building-columns" style={{ marginRight: 6 }} /> Chuyển khoản
                  </button>
                  {activeTab.customerId && !activeTab.payOldDebt && (
                    <button
                      type="button"
                      className={`pos-method-btn ${activeTab.paymentMethod === 'debt' ? 'active' : ''}`}
                      onClick={() => updateActiveTab({ paymentMethod: 'debt' })}
                    >
                      <i className="fa-solid fa-book" style={{ marginRight: 6 }} /> Ghi nợ
                    </button>
                  )}
                </div>

                {activeTab.paymentMethod === 'cash' && (
                  <>
                    <div className="pos-customer-pay-row">
                      <span>Khách thanh toán</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={activeTab.customerPaid}
                        onChange={(e) => updateActiveTab({ customerPaid: formatCurrencyInput(e.target.value) })}
                        placeholder="0"
                        className="pos-customer-pay-input"
                      />
                    </div>
                    {hasItems && String(activeTab.customerPaid).length > 0 && (
                      <div className="pos-money-state-row">
                        {missingAmount > 0 ? (
                          <>
                            <span className="missing">Còn thiếu</span>
                            <span className="missing">{formatMoney(missingAmount)}</span>
                          </>
                        ) : (
                          <>
                            <span>Tiền thừa trả khách</span>
                            <span className="change">{formatMoney(changeAmount)}</span>
                          </>
                        )}
                      </div>
                    )}
                    {hasItems && (
                      <>
                        <div className="pos-quick-paid-grid">
                          {QUICK_PAID_VALUES.map((amount) => (
                            <button
                              key={amount}
                              type="button"
                              onClick={() => updateActiveTab({ customerPaid: toCurrencyInputFromNumber(amount) })}
                              className="pos-quick-paid-btn"
                            >
                              {(amount / 1000).toLocaleString('vi-VN')}k
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateActiveTab({ customerPaid: toCurrencyInputFromNumber(totalWithDebt) })}
                          className="pos-quick-paid-full pos-quick-paid-full-standalone"
                        >
                          Đủ tiền ({formatMoney(totalWithDebt)})
                        </button>
                      </>
                    )}
                  </>
                )}

                {activeTab.paymentMethod === 'bank_transfer' && totalAmount > 0 && (
                  <div className="pos-bank-note">
                    <p className="pos-bank-note-title">Nhấn THANH TOÁN để tạo mã QR chính xác</p>
                    <div className="pos-bank-note-body">
                      <i className="fa-solid fa-qrcode" />
                      Mã QR sẽ hiển thị sau khi xác nhận đơn
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Debt alert */}
            {activeTab.customerData?.debt_account > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: '16px',
                  background: isDebtBlocked ? '#fef2f2' : '#fff7ed',
                  border: isDebtBlocked ? '1px solid #fca5a5' : '1px solid #fed7aa',
                  borderRadius: 12,
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      background: isDebtBlocked ? '#fee2e2' : '#ffedd5',
                      color: isDebtBlocked ? '#dc2626' : '#ea580c',
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                      justifyContent: 'center',
                    }}
                  >
                    <i className={isDebtBlocked ? 'fa-solid fa-ban' : 'fa-solid fa-triangle-exclamation'} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: isDebtBlocked ? '#991b1b' : '#9a3412',
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      {isDebtBlocked ? 'BẮT BUỘC THANH TOÁN NỢ TRƯỚC' : 'THÔNG BÁO NỢ CŨ'}
                    </div>
                    <div style={{ fontSize: 13, color: isDebtBlocked ? '#dc2626' : '#c2410c' }}>
                      Khách hàng đang còn nợ:{' '}
                      <span style={{ fontWeight: 800 }}>{formatMoney(activeTab.customerData.debt_account)}</span>
                    </div>
                    {isDebtBlocked && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          color: '#991b1b',
                          background: '#fee2e2',
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid #fca5a5',
                        }}
                      >
                        Số nợ ≥ 100.000₫ — khách phải thanh toán toàn bộ nợ cũ trước khi mua hàng mới. Chọn{' '}
                        <strong>Trả luôn</strong> để tiếp tục.
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        background: 'white',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: `1px solid ${isDebtBlocked ? '#fca5a5' : '#fdba74'}`,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: isDebtBlocked ? '#991b1b' : '#9a3412' }}>
                        Thanh toán cùng đơn này?
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!isDebtBlocked && (
                          <button
                            type="button"
                            onClick={() => updateActiveTab({ payOldDebt: false })}
                            style={{
                              background: !activeTab.payOldDebt ? '#ea580c' : '#f1f5f9',
                              color: !activeTab.payOldDebt ? 'white' : '#64748b',
                              border: 'none',
                              padding: '6px 14px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Chưa trả
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const updates = { payOldDebt: true };
                            if (activeTab.paymentMethod === 'debt') updates.paymentMethod = 'cash';
                            updateActiveTab(updates);
                          }}
                          style={{
                            background: activeTab.payOldDebt
                              ? '#ea580c'
                              : isDebtBlocked
                                ? '#dc2626'
                                : '#f1f5f9',
                            color: activeTab.payOldDebt || isDebtBlocked ? 'white' : '#64748b',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Trả luôn
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="pos-submit-wrap">
              {loyaltyEarnBadge && (
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 12,
                    textAlign: 'center',
                    fontWeight: 600,
                    borderRadius: 8,
                    padding: '7px 10px',
                    background:
                      loyaltyEarnBadge.tone === 'ok' ? '#ecfeff' : loyaltyEarnBadge.tone === 'warn' ? '#fff7ed' : '#f1f5f9',
                    color:
                      loyaltyEarnBadge.tone === 'ok' ? '#0f766e' : loyaltyEarnBadge.tone === 'warn' ? '#c2410c' : '#475569',
                    border:
                      loyaltyEarnBadge.tone === 'ok'
                        ? '1px solid #99f6e4'
                        : loyaltyEarnBadge.tone === 'warn'
                          ? '1px solid #fdba74'
                          : '1px solid #cbd5e1',
                  }}
                >
                  {loyaltyEarnBadge.text}
                </div>
              )}
              {isDebtBlocked && (
                <div
                  style={{ marginBottom: 8, fontSize: 12, color: '#dc2626', textAlign: 'center', fontWeight: 600 }}
                >
                  <i className="fa-solid fa-lock" style={{ marginRight: 4 }} />
                  Chọn "Trả luôn" để mở khóa thanh toán
                </div>
              )}
              <button
                className={`pos-pay-button${canSubmit ? ' pos-pay-button--ready' : ''}`}
                onClick={handleSubmit}
                disabled={!canSubmit}
                title={
                  !hasOpenShift
                    ? 'Bạn cần mở ca trước khi bán hàng'
                    : isDebtBlocked
                      ? `Khách nợ ${formatMoney(customerDebt)} ≥ 100.000₫, phải trả nợ trước`
                      : ''
                }
              >
                {activeTab.saving ? 'ĐANG XỬ LÝ...' : 'THANH TOÁN'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {shiftGateVisible && (
        <div
          className="pos-shift-gate-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !openShiftBusy) setShiftOpenModalOpen(false);
          }}
        >
          <div
            className="pos-shift-gate-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-shift-gate-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="pos-shift-gate-dialog-head">
              <div className="pos-shift-gate-icon" aria-hidden>
                <i className="fa-solid fa-store" />
              </div>
              <div className="pos-shift-gate-head-text">
                <h2 id="pos-shift-gate-title" className="pos-shift-gate-title">
                  Mở ca để bán hàng
                </h2>
                <p className="pos-shift-gate-subtitle">
                  Quầy bán được gắn với máy/trình duyệt này (xem Cài đặt cửa hàng khi có nhiều quầy). Mỗi quầy một ca và
                  một quỹ riêng — chỉ nhập tiền mặt đầu ca.
                </p>
              </div>
            </div>
            {shiftLoading ? (
              <p className="pos-shift-gate-loading">Đang kiểm tra ca trên quầy đã chọn…</p>
            ) : (posRegisters || []).length === 0 ? (
              <p className="pos-shift-gate-error">Chưa có quầy thanh toán. Liên hệ quản lý để được cấu hình.</p>
            ) : !selectedRegisterId ? (
              <p className="pos-shift-gate-error">
                Chưa gắn quầy cho máy này. Liên quản lý vào{' '}
                <strong>Cài đặt cửa hàng → Điểm bán POS trên máy này</strong>.
              </p>
            ) : (
              <>
                <div className="pos-shift-gate-register-chip" role="note">
                  <span className="pos-shift-gate-register-chip-label">Quầy trên máy này</span>
                  <strong className="pos-shift-gate-register-chip-value">{activeRegisterLabel}</strong>
                  {(posRegisters || []).length > 1 ? (
                    <span className="pos-shift-gate-register-chip-hint">
                      Nếu sai quầy, quản lý chỉnh tại “Cài đặt cửa hàng”.
                    </span>
                  ) : null}
                </div>
                <label className="pos-shift-field pos-shift-field--gate">
                  <span>Tiền đầu ca</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ví dụ: 1.000.000"
                    className="pos-shift-input"
                    value={openShiftCash}
                    onChange={(e) => setOpenShiftCash(formatCurrencyInput(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="pos-shift-gate-primary"
                  disabled={!selectedRegisterId || openShiftBusy}
                  onClick={() => submitOpenGateShift()}
                >
                  {openShiftBusy ? 'Đang mở ca…' : 'Mở ca và vào quầy'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {closeShiftModalOpen && currentShift && (
        <div
          className="pos-shift-gate-overlay pos-shift-close-dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !closeShiftSaving) setCloseShiftModalOpen(false);
          }}
        >
          <div className="pos-shift-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-shift-close-title">
            <div className="pos-shift-gate-dialog-head">
              <div className="pos-shift-gate-icon pos-shift-gate-icon--close" aria-hidden>
                <i className="fa-solid fa-lock-open" />
              </div>
              <div className="pos-shift-gate-head-text">
                <h2 id="pos-shift-close-title" className="pos-shift-gate-title">
                  Đóng ca
                </h2>
                <p className="pos-shift-gate-subtitle">
                  {(currentShift.register_id?.name || activeRegisterLabel) && (
                    <>
                      Quầy <strong>{currentShift.register_id?.name || activeRegisterLabel}</strong>
                      {' · '}
                    </>
                  )}
                  Đầu ca {formatMoney(currentShift.opening_cash || 0)}
                </p>
              </div>
            </div>
            {isManager && !isShiftOwner && (
              <div className="pos-shift-note pos-shift-note--compact">
                Bạn đang đóng ca thay nhân viên đã mở ca. Thao tác này được ghi nhận trong hệ thống.
              </div>
            )}
            <label className="pos-shift-field pos-shift-field--gate">
              <span>Tiền mặt kiểm đếm (thực tế trong ngăn kéo)</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Nhập tổng tiền mặt kiểm đếm"
                className="pos-shift-input"
                value={closeShiftCash}
                onChange={(e) => setCloseShiftCash(formatCurrencyInput(e.target.value))}
              />
            </label>
            <p className="pos-shift-close-hint">
              Tiền bàn giao = Kiểm đếm − mức để lại chuẩn (thường 1.000.000đ). Hệ thống báo chi tiết sau khi đóng.
            </p>
            <div className="pos-shift-close-actions">
              <button
                type="button"
                className="pos-shift-close-cancel"
                disabled={closeShiftSaving}
                onClick={() => setCloseShiftModalOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="pos-shift-gate-primary"
                disabled={closeShiftSaving}
                onClick={() => submitCloseShiftFromModal()}
              >
                {closeShiftSaving ? 'Đang xử lý…' : 'Xác nhận đóng ca'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PaymentWaitModal
        pendingPayment={pendingPayment}
        bankCode={bankCode}
        bankAccountNumber={bankAccountNumber}
        storeName={storeName}
        onCancel={async () => {
          stopPolling();
          if (pendingPayment?.invoice?._id) {
            await cancelUnpaidBankTransferInvoice(pendingPayment.invoice._id);
            loadProducts();
          }
          setPendingPayment(null);
          notify('Đã hủy giao dịch chuyển khoản.', 'error');
        }}
      />

      {productInfoModal.open && (
        <div className="pos-product-modal-backdrop" onClick={closeProductInfoModal}>
          <div className="pos-product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-product-modal-head">
              <h3>Thông tin sản phẩm</h3>
              <button type="button" className="pos-product-modal-close" onClick={closeProductInfoModal}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="pos-product-modal-body">
              {productInfoModal.loading && <p>Đang tải thông tin sản phẩm...</p>}
              {!productInfoModal.loading && productInfoModal.error && (
                <p className="pos-product-modal-error">{productInfoModal.error}</p>
              )}
              {!productInfoModal.loading && !productInfoModal.error && productInfoModal.product && (
                <>
                  {getProductImageUrl(productInfoModal.product) ? (
                    <img
                      src={getProductImageUrl(productInfoModal.product)}
                      alt={productInfoModal.product.name || 'Ảnh sản phẩm'}
                      className="pos-product-modal-image"
                    />
                  ) : (
                    <div className="pos-product-modal-image-placeholder">
                      <i className="fa-regular fa-image" />
                    </div>
                  )}
                  <div className="pos-product-modal-grid">
                    <div><b>Tên:</b> {productInfoModal.product.name || '—'}</div>
                    <div><b>SKU:</b> {productInfoModal.product.sku || '—'}</div>
                    <div><b>Barcode:</b> {productInfoModal.product.barcode || '—'}</div>
                    <div><b>Giá bán:</b> {formatMoney(productInfoModal.product.sale_price || 0)}</div>
                    <div><b>Giá vốn:</b> {formatMoney(productInfoModal.product.cost_price || 0)}</div>
                    <div><b>Tồn kho:</b> {Number(productInfoModal.product.stock_qty || 0).toLocaleString('vi-VN')}</div>
                    <div><b>Đơn vị gốc:</b> {productInfoModal.product.base_unit || 'Cái'}</div>
                    <div><b>Trạng thái:</b> {String(productInfoModal.product.status || 'active') === 'inactive' ? 'Ngừng bán' : 'Đang bán'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
