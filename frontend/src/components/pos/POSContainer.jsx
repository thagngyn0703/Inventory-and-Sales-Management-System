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
} from '../../services/invoicesApi';
import { getProducts, getProductUnits, scanProductByCode } from '../../services/productsApi';
import { getCustomers, createCustomer } from '../../services/customersApi';
import { getStoreTaxSettings, getStoreBankSettings, getStoreLoyaltySettings } from '../../services/adminApi';
import { sendLoyaltyUpdate } from '../../services/customerNotifyApi';
import PaymentWaitModal from '../payment/PaymentWaitModal';
import { Button } from '../ui/button';
import { useToast } from '../../contexts/ToastContext';
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
  const pollingRef = useRef(null);
  const searchWrapRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef(null);

  const isNew = id === 'new' || !id || id === 'undefined' || id === 'null';

  const activeTab = tabs.find((t) => t.tabId === activeTabId) || tabs[0];

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

  const updateActiveTab = (updates) => {
    setTabs((prev) => prev.map((t) => (t.tabId === activeTabId ? { ...t, ...updates } : t)));
  };

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
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const handlePrintInvoice = useCallback(
    (invoice, tab) => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      const isHKD = (storeTax.business_type || 'ho_kinh_doanh') === 'ho_kinh_doanh';
      const sellerLine = tab._sellerName
        ? `<strong>Người bán:</strong> ${tab._sellerName}${tab._sellerRole ? ` (${tab._sellerRole})` : ''}<br/>`
        : '';
      const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>In Hóa Đơn - ${invoice._id}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: ${isHKD ? '24px' : '20px'}; font-size: ${isHKD ? '15px' : '14px'}; color: #000; }
            h2 { text-align: center; margin-bottom: 5px; font-size: 20px; }
            .header-info { text-align: center; margin-bottom: 20px; font-size: 13px; color: #555; }
            .invoice-details { margin-bottom: 20px; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border-bottom: 1px dashed #ccc; padding: ${isHKD ? '10px 6px' : '8px 4px'}; text-align: left; }
            th { border-bottom: 2px solid #000; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; font-size: 16px; margin-top: 10px; }
            .footer { text-align: center; margin-top: 30px; font-style: italic; color: #555; }
            @media print {
              @page { margin: 0; }
              body { margin: 1cm; }
            }
          </style>
        </head>
        <body>
          <h2>${storeName.toUpperCase()}</h2>
          <div class="header-info">
            HÓA ĐƠN BÁN HÀNG<br/>
            Mã Đơn: ${invoice._id}<br/>
            Ngày: ${new Date().toLocaleString('vi-VN')}
          </div>
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
                <th>Tên hàng</th>
                <th class="text-right">SL</th>
                ${isHKD ? '' : '<th class="text-right">Đơn giá</th>'}
                <th class="text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${tab.items
                .map(
                  (item) => `
                <tr>
                  <td>${item.name || 'Sản phẩm'}</td>
                  <td class="text-right">${item.quantity}</td>
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
              return `<div class="text-right" style="margin-top:8px;">Tạm tính: ${Number(subtotal).toLocaleString('vi-VN')}₫</div>
              <div class="text-right" style="color:#64748b;">VAT (${rate}%): ${Number(tax).toLocaleString('vi-VN')}₫</div>`;
            }
            return `<div class="text-right">${isHKD ? 'Tổng tiền hàng (HKD):' : 'Tổng tiền hàng:'} ${Number(invoice.total_amount || 0).toLocaleString('vi-VN')}₫</div>`;
          })()}
          <div class="text-right total-row">
            TỔNG CỘNG: ${Number(invoice.total_amount || 0).toLocaleString('vi-VN')}₫
          </div>
          ${
            tab.payOldDebt
              ? `<div class="text-right" style="margin-top: 5px;">
              Nợ cũ đã trả: ${Number(tab.customerData?.debt_account || 0).toLocaleString('vi-VN')}₫
            </div>
            <div class="text-right total-row" style="color: #000; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px;">
              TỔNG THANH TOÁN: ${Number(
                (invoice.total_amount || 0) + (tab.customerData?.debt_account || 0)
              ).toLocaleString('vi-VN')}₫
            </div>`
              : ''
          }
          <div class="footer">Cảm ơn quý khách và hẹn gặp lại!</div>
          <script>
            window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 500); }
          </script>
        </body>
      </html>`;
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    },
    [storeName, storeTax.business_type]
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
      stopPolling();
      let attempts = 0;
      const MAX_ATTEMPTS = 120;
      pollingRef.current = setInterval(async () => {
        attempts++;
        try {
          const result = await getPaymentStatus(paymentRef);
          if (result.payment_status === 'paid') {
            stopPolling();
            setPendingPayment(null);
            handlePrintInvoice(invoiceData, tabSnapshot);
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
        }
      }, 5000);
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
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          discount: item.discount || 0,
          line_total: item.line_total || 0,
          stock_qty: item.product_id?.stock_qty,
        })),
        paymentMethod: data.payment_method || 'cash',
        recipientName: data.recipient_name || '',
        customerPaid: data.total_amount || '',
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
          newItems[existingIdx] = {
            ...it,
            quantity: newQty,
            line_total: Math.max(0, newQty * Number(it.unit_price || 0) - Number(it.discount || 0)),
          };
        } else {
          newItems.push({
            product_id: product._id,
            unit_id: chosenUnit?._id || null,
            unit_name: chosenUnit?.unit_name || product.base_unit || 'Cái',
            exchange_value: Number(chosenUnit?.exchange_value) || 1,
            name: product.name,
            sku: product.sku,
            quantity: 1,
            unit_price: Number(chosenUnit?.price ?? product.sale_price) || 0,
            discount: 0,
            line_total: Number(chosenUnit?.price ?? product.sale_price) || 0,
            stock_qty: product.stock_qty,
            available_units: unitOptionsByProduct[String(product._id)] || [],
          });
        }
        return { ...tab, items: newItems };
      })
    );
    setSearchTerm('');
    setShowSearchDropdown(false);
  };

  const handleScanSubmit = async (rawCode) => {
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
    updateActiveTab({ items: newItems });
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
    target.exchange_value = Number(selected.exchange_value) || 1;
    target.unit_price = Number(selected.price) || 0;
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

    updateActiveTab({ items: nextItems });
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
        exchange_value: item?.exchange_value || 1,
        price: item?.unit_price || 0,
      },
    ];
  };

  const removeLine = (idx) => {
    const newItems = activeTab.items.filter((_, i) => i !== idx);
    updateActiveTab({ items: newItems });
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

  const taxBreakdown = useMemo(
    () => calcTaxBreakdown(totalWithDebt, storeTax.tax_rate, storeTax.price_includes_tax),
    [totalWithDebt, storeTax]
  );

  const customerPaidNum = Number(activeTab.customerPaid) || 0;
  const changeAmount = Math.max(0, customerPaidNum - totalWithDebt);
  const missingAmount = Math.max(0, totalWithDebt - customerPaidNum);
  const customerDebt = activeTab.customerData?.debt_account || 0;
  const isDebtBlocked = customerDebt >= 100000 && !activeTab.payOldDebt;
  const canSubmit =
    !activeTab.saving &&
    activeTab.items.length > 0 &&
    !isDebtBlocked &&
    (activeTab.paymentMethod === 'debt' ||
      customerPaidNum >= totalWithDebt ||
      activeTab.paymentMethod === 'bank_transfer');

  const QUICK_PAID_VALUES = [10000, 20000, 50000, 100000, 200000, 500000];

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
        })),
        previous_debt_paid: activeTab.payOldDebt ? activeTab.customerData?.debt_account || 0 : 0,
        redeem_points_requested: loyaltyUsedPoints,
        promo_discount: 0,
        // Seller snapshot — gửi từ client để backend verify + lưu
        seller_name: staffDisplayName,
        seller_role: staffRoleLabel,
      };

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
      updateActiveTab({ error: e.message || 'Lỗi khi lưu hóa đơn', saving: false });
      notify(e.message || 'Lỗi khi lưu hóa đơn', 'error');
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
                    const cachedUnits = unitOptionsByProduct[String(p._id)] || [];
                    const fallbackUnit = {
                      _id: null,
                      unit_name: p.base_unit || 'Cái',
                      exchange_value: 1,
                      price: Number(p.sale_price) || 0,
                      is_base: true,
                    };
                    const displayUnits = cachedUnits.length > 0 ? cachedUnits : [fallbackUnit];
                    return (
                      <div
                        key={p._id}
                        className="pos-search-option"
                        onMouseEnter={() => loadUnitsForProduct(p._id)}
                      >
                        <div>
                          <div className="pos-search-option-name">{p.name}</div>
                          <div className="pos-search-option-meta">
                            {p.sku} - Tồn: {p.stock_qty || 0}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            {displayUnits.map((u) => (
                              <button
                                key={String(u._id || u.unit_name)}
                                type="button"
                                className="pos-quick-paid-btn"
                                style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const loaded = await loadUnitsForProduct(p._id);
                                  const selected =
                                    loaded.find((x) => String(x._id) === String(u._id || '')) ||
                                    loaded.find((x) => x.is_base) ||
                                    loaded[0] ||
                                    u;
                                  handleAddProduct(p, selected);
                                }}
                              >
                                {u.unit_name}: {formatMoney(u.price)}
                              </button>
                            ))}
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

        {/* Tab bar */}
        <div className="pos-tabs pos-tabs-inline" role="tablist" aria-label="Danh sách hóa đơn đang mở">
          {tabs.map((tab) => (
            <div
              key={tab.tabId}
              className={`pos-tab ${tab.tabId === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTabId(tab.tabId)}
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
            <Plus className="h-4 w-4" strokeWidth={2.25} />
          </Button>
        </div>

        {/* Seller badge */}
        {isNew && (
          <div className="pos-toolbar-user-badge" aria-label="Thông tin cửa hàng và người bán">
            <span className="pos-toolbar-user-avatar" aria-hidden>
              <i className="fa-solid fa-user" />
            </span>
            {storeName && (
              <span className="pos-toolbar-store-chip">
                <i className="fa-solid fa-store pos-toolbar-store-ico" aria-hidden />
                {storeName}
              </span>
            )}
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
            {activeTab.error && (
              <div
                className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800"
                role="alert"
              >
                {activeTab.error}
              </div>
            )}
            {activeTab.successMessage && (
              <div
                className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800"
                role="status"
              >
                {activeTab.successMessage}
              </div>
            )}

            <table className="pos-cart-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 80 }}>Mã hàng</th>
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
                    <td>{item.sku}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                          {item.name}
                        </span>
                        {item.unit_name ? (
                          <span style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>({item.unit_name})</span>
                        ) : null}
                        <span style={{ width: 50, flexShrink: 0 }} />
                        {(() => {
                          const resolvedUnits = getResolvedUnitsForItem(item);
                          const selectedValue = resolvedUnits.some(
                            (u) => String(u._id || '') === String(item.unit_id || '')
                          )
                            ? item.unit_id || ''
                            : resolvedUnits[0]?._id || '';
                          return (
                        <select
                          className="pos-qty-input"
                          style={{ width: 150, height: 32, textAlign: 'left', padding: '0 8px' }}
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
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          Tồn khả dụng: {(() => {
                            const stock = Number(item.stock_qty || 0);
                            const ratio = Number(item.exchange_value || 1);
                            const whole = Math.floor(stock / ratio);
                            const rem = stock - whole * ratio;
                            return `${whole} ${item.unit_name || 'đv'}${rem > 0 ? ` (dư ${rem})` : ''}`;
                          })()}
                        </span>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="pos-qty-input"
                        value={item.quantity}
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 1 })}
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
                    <td colSpan={7} className="pos-cart-empty-cell">
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
                    {!activeTab.customerId && loyaltySettings.enabled && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                        Chọn khách hàng để hóa đơn được tích điểm.
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
          <div className="pos-summary-section">
            <div className="pos-sidebar-panel pos-summary-panel">
              <div className="pos-sidebar-panel-head pos-sidebar-panel-head-cols">
                <span>Khoản mục</span>
                <span>Giá trị</span>
              </div>
              <div className="pos-summary-panel-lines">
                {storeTax.tax_rate > 0 ? (
                  <>
                    <div className="pos-summary-line">
                      <span>Tạm tính</span>
                      <span className="pos-summary-amount">{formatMoney(taxBreakdown.subtotal)}</span>
                    </div>
                    <div className="pos-summary-line">
                      <span>VAT ({storeTax.tax_rate}%)</span>
                      <span className="pos-summary-amount" style={{ color: '#64748b' }}>{formatMoney(taxBreakdown.tax)}</span>
                    </div>
                  </>
                ) : (
                  <div className="pos-summary-line">
                    <span>Tổng tiền hàng</span>
                    <span className="pos-summary-amount">{formatMoney(totalAmount)}</span>
                  </div>
                )}
                {loyaltyRedeemValue > 0 && (
                  <div className="pos-summary-line">
                    <span>Giảm từ điểm</span>
                    <span className="pos-summary-amount" style={{ color: '#0f766e' }}>- {formatMoney(loyaltyRedeemValue)}</span>
                  </div>
                )}
              </div>
              <div className="pos-total-banner">
                <span>{activeTab.payOldDebt ? 'Tổng thanh toán (+Nợ)' : 'Khách cần trả'}</span>
                <span className="pos-total-amount">{formatMoney(totalWithDebt)}</span>
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
                        type="number"
                        value={activeTab.customerPaid}
                        onChange={(e) => updateActiveTab({ customerPaid: e.target.value })}
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
                              onClick={() => updateActiveTab({ customerPaid: String(amount) })}
                              className="pos-quick-paid-btn"
                            >
                              {(amount / 1000).toLocaleString('vi-VN')}k
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => updateActiveTab({ customerPaid: totalWithDebt.toString() })}
                            className="pos-quick-paid-full"
                          >
                            Đủ tiền ({formatMoney(totalWithDebt)})
                          </button>
                        </div>
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
                className="pos-pay-button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                title={isDebtBlocked ? `Khách nợ ${formatMoney(customerDebt)} ≥ 100.000₫, phải trả nợ trước` : ''}
              >
                {activeTab.saving ? 'ĐANG XỬ LÝ...' : 'THANH TOÁN'}
              </button>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
