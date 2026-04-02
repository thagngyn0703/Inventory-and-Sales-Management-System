import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { getInvoice, createInvoice, updateInvoice, getPaymentStatus } from '../../services/invoicesApi';
import { getProducts } from '../../services/productsApi';
import { getCustomers, createCustomer } from '../../services/customersApi';
import PaymentWaitModal from '../../components/payment/PaymentWaitModal';
import { Button } from '../../components/ui/button';
import './SalesPOS.css';

function formatMoney(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('vi-VN') + '₫';
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
  saving: false,
  error: '',
  successMessage: '',
  invoiceId: null, // If loaded from existing
  payOldDebt: false
});

export default function SalesInvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};
  const toggleSidebar = outletContext.toggleSidebar;
  const sidebarCollapsed = Boolean(outletContext.sidebarCollapsed);
  const isNew = id === 'new' || !id || id === 'undefined' || id === 'null';

 
  const rawBankAccountConfig = String(process.env.REACT_APP_BANK_ACCOUNT || 'MB-0000000000').trim();
  const [configuredBankCode, configuredAccountNumber] = rawBankAccountConfig.includes('-')
    ? rawBankAccountConfig.split('-', 2)
    : ['MB', rawBankAccountConfig];
  const bankCode = String(configuredBankCode || 'MB').toUpperCase();
  const bankAccountNumber = String(configuredAccountNumber || '0000000000');
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  
  // Tab Management State
  const [tabs, setTabs] = useState([createDefaultTab(1)]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].tabId);
  const [tabCounter, setTabCounter] = useState(2); // to name new tabs Hóa đơn 2, 3...
  
  const [toastMessage, setToastMessage] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' }); // { message, type: 'success' | 'error' }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 4000);
  };

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerList, setCustomerList] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debounceRef = React.useRef(null);

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ full_name: '', phone: '' });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerModalError, setCustomerModalError] = useState('');

  const handleCreateCustomer = async () => {
    if (!newCustomer.full_name || !newCustomer.phone) {
      setCustomerModalError('Vui lòng nhập đầy đủ Tên và Số điện thoại.');
      return;
    }
    const cleanPhone = newCustomer.phone.trim().replace(/\\s/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      setCustomerModalError('Số điện thoại hợp lệ phải có 10 hoặc 11 chữ số.');
      return;
    }
    setCreatingCustomer(true);
    setCustomerModalError('');
    try {
      const created = await createCustomer({ ...newCustomer, status: 'active', is_regular: true });
      updateActiveTab({ customerId: created._id, customerData: created, recipientName: created.full_name, paymentMethod: 'cash' });
      setCustomerSearch('');
      setShowCreateCustomer(false);
      setNewCustomer({ full_name: '', phone: '' });
      showToast('Thêm khách hàng thành công!', 'success');
    } catch (e) {
      setCustomerModalError(e.message || 'Lỗi khi thêm khách hàng mới');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const searchCustomers = (val) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setCustomerList([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await getCustomers(val);
        setCustomerList(res.customers || []);
        setShowCustomerDropdown(true);
      } catch (e) { console.error(e); }
    }, 300);
  };

  // Trạng thái chờ thanh toán chuyển khoản
  const [pendingPayment, setPendingPayment] = useState(null); // { paymentRef, totalAmount, invoice }
  const pollingRef = useRef(null);
  const searchWrapRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef(null);

  const activeTab = tabs.find(t => t.tabId === activeTabId) || tabs[0];
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
    setTabs(prev => prev.map(t => t.tabId === activeTabId ? { ...t, ...updates } : t));
  };

  const loadProducts = useCallback(async () => {
    try {
      const { products: data = [] } = await getProducts(1, 1000);
      setProducts(data);
    } catch (e) { console.error(e); }
  }, []);

  // Loa thông báo thanh toán thành công (Web Speech API)
  const speakPayment = useCallback(() => {
    if (!window.speechSynthesis) return;
    const msg = new SpeechSynthesisUtterance('success');
    msg.lang = 'vi-VN';
    msg.rate = 0.95;
    msg.pitch = 1;
    // Ưu tiên giọng tiếng Việt nếu có
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang === 'vi-VN' || v.lang.startsWith('vi'));
    if (viVoice) msg.voice = viVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(msg);
  }, []);

  // Polling kiểm tra trạng thái thanh toán chuyển khoản
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback((paymentRef, invoiceData, tabSnapshot) => {
    stopPolling();
    let attempts = 0;
    const MAX_ATTEMPTS = 120; // 10 phút (mỗi 5 giây)

    pollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const result = await getPaymentStatus(paymentRef);
        if (result.payment_status === 'paid') {
          stopPolling();
          setPendingPayment(null);

          // Phát loa
          speakPayment();

          // In hóa đơn
          handlePrintInvoice(invoiceData, tabSnapshot);

          // Toast
          setToastMessage('Thanh toán chuyển khoản thành công!');
          setTimeout(() => setToastMessage(''), 4000);

          // Reset tab
          setTabs(prev => {
            const filtered = prev.filter(t => t.tabId !== tabSnapshot.tabId);
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
        setPendingPayment(null);
        setToastMessage('Hết thời gian chờ thanh toán. Vui lòng kiểm tra lại.');
        setTimeout(() => setToastMessage(''), 5000);
      }
    }, 5000);
  }, [stopPolling, speakPayment, loadProducts]);

  // Dọn dẹp polling khi unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (!searchWrapRef.current) return;
      if (!searchWrapRef.current.contains(event.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => () => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
  }, []);

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
        saving: false, error: '', successMessage: '',
        invoiceId: data._id
      };
      setTabs([loadedTab]);
      setActiveTabId(loadedTab.tabId);
    } catch (e) {
      console.error(e);
      updateActiveTab({ error: e.message || 'Không thể tải hóa đơn' });
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return products.slice(0, 50);
    return products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.sku.toLowerCase().includes(term) ||
      (p.barcode && p.barcode.includes(term))
    ).slice(0, 50);
  }, [products, searchTerm]);

  // Tab Actions
  const handleAddTab = () => {
    const nextNumber = getNextTabNumber(tabs);
    const newTab = createDefaultTab(nextNumber);
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.tabId);
  };

  const handleCloseTab = (tabIdToClose, e) => {
    e.stopPropagation();
    if (tabs.length === 1) {
       // if it's the last tab, just reset it
       const newTab = createDefaultTab(1);
       setTabs([newTab]);
       setActiveTabId(newTab.tabId);
       if (!isNew) navigate('/staff/invoices/new'); // escape edit mode if closing the only tab
       return;
    }
    const newTabs = tabs.filter(t => t.tabId !== tabIdToClose);
    if (activeTabId === tabIdToClose) {
       // find index of closed tab
       const idx = tabs.findIndex(t => t.tabId === tabIdToClose);
       // activate previous tab or first
       const nextActive = newTabs[idx - 1] || newTabs[0];
       setActiveTabId(nextActive.tabId);
    }
    setTabs(newTabs);
  };

  // Cart Actions (affecting active tab)
  const handleAddProduct = (product) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.tabId !== activeTabId) return tab;
        const existingIdx = tab.items.findIndex((it) => it.product_id === product._id);
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
            name: product.name,
            sku: product.sku,
            quantity: 1,
            unit_price: product.sale_price || 0,
            discount: 0,
            line_total: product.sale_price || 0,
            stock_qty: product.stock_qty,
          });
        }
        return { ...tab, items: newItems };
      })
    );
    setSearchTerm('');
    setShowSearchDropdown(false);
  };

  const handleScanSubmit = (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return;
    const normalized = code.toLowerCase();
    const found = products.find((p) => (
      String(p.barcode || '').toLowerCase() === normalized ||
      String(p.sku || '').toLowerCase() === normalized
    ));
    if (!found) {
      setToastMessage(`Không tìm thấy sản phẩm với mã: ${code}`);
      setTimeout(() => setToastMessage(''), 2500);
      return;
    }
    handleAddProduct(found);
    setToastMessage(`Đã thêm: ${found.name}`);
    setTimeout(() => setToastMessage(''), 1800);
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
  }, [scanMode, products, activeTabId]);

  const updateLine = (idx, changes) => {
    const newItems = [...activeTab.items];
    newItems[idx] = { ...newItems[idx], ...changes };
    const qty = Number(newItems[idx].quantity) || 0;
    const price = Number(newItems[idx].unit_price) || 0;
    const discount = Number(newItems[idx].discount) || 0;
    newItems[idx].line_total = Math.max(0, qty * price - discount);
    updateActiveTab({ items: newItems });
  };

  const removeLine = (idx) => {
    const newItems = activeTab.items.filter((_, i) => i !== idx);
    updateActiveTab({ items: newItems });
  };

  const totalAmount = useMemo(() => activeTab.items.reduce((s, it) => s + (it.line_total || 0), 0), [activeTab.items]);
  const totalWithDebt = useMemo(() => {
    return totalAmount + (activeTab.payOldDebt ? (activeTab.customerData?.debt_account || 0) : 0);
  }, [totalAmount, activeTab.payOldDebt, activeTab.customerData]);
  
  // Calculate change
  // Calculate change based on total with debt if selected
  const customerPaidNum = Number(activeTab.customerPaid) || 0;
  const changeAmount = Math.max(0, customerPaidNum - totalWithDebt);
  // Missing amount if they haven't paid enough yet
  const missingAmount = Math.max(0, totalWithDebt - customerPaidNum);
  
  // Validation
  const isPaymentSufficient = activeTab.paymentMethod === 'bank_transfer' || customerPaidNum >= totalAmount;
  const canSubmit = !activeTab.saving && activeTab.items.length > 0 && 
    (activeTab.paymentMethod === 'debt' || customerPaidNum >= totalWithDebt || activeTab.paymentMethod === 'bank_transfer');

  const QUICK_PAID_VALUES = [10000, 20000, 50000, 100000, 200000, 500000];
  const hasItems = activeTab.items.length > 0;

  const handlePrintInvoice = (invoice, tab) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>In Hóa Đơn - ${invoice._id}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; font-size: 14px; color: #000; }
            h2 { text-align: center; margin-bottom: 5px; font-size: 20px; }
            .header-info { text-align: center; margin-bottom: 20px; font-size: 13px; color: #555; }
            .invoice-details { margin-bottom: 20px; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border-bottom: 1px dashed #ccc; padding: 8px 4px; text-align: left; }
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
          <h2>CỬA HÀNG VẬT TƯ</h2>
          <div class="header-info">
            HÓA ĐƠN BÁN HÀNG<br/>
            Mã Đơn: ${invoice._id}<br/>
            Ngày: ${new Date().toLocaleString('vi-VN')}
          </div>
          
          <div class="invoice-details">
            <strong>Khách hàng:</strong> ${tab.recipientName || 'Khách lẻ'}<br/>
            <strong>Thanh toán:</strong> ${tab.paymentMethod === 'cash' ? 'Tiền mặt' : tab.paymentMethod === 'bank_transfer' ? 'Chuyển khoản' : tab.paymentMethod}
          </div>

          <table>
            <thead>
              <tr>
                <th>Tên hàng</th>
                <th class="text-right">SL</th>
                <th class="text-right">Đơn giá</th>
                <th class="text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${tab.items.map(item => `
                <tr>
                  <td>${item.name || 'Sản phẩm'}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">${Number(item.unit_price || 0).toLocaleString('vi-VN')}₫</td>
                  <td class="text-right">${Number(item.line_total || 0).toLocaleString('vi-VN')}₫</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="text-right total-row">
            Tổng tiền hàng: ${Number(invoice.total_amount || 0).toLocaleString('vi-VN')}₫
          </div>

          ${tab.payOldDebt ? `
            <div class="text-right" style="margin-top: 5px;">
              Nợ cũ đã trả: ${Number(tab.customerData?.debt_account || 0).toLocaleString('vi-VN')}₫
            </div>
            <div class="text-right total-row" style="color: #000; border-top: 1px solid #000; padding-top: 5px; margin-top: 5px;">
              TỔNG THANH TOÁN: ${Number((invoice.total_amount || 0) + (tab.customerData?.debt_account || 0)).toLocaleString('vi-VN')}₫
            </div>
          ` : ''}

          <div class="footer">
            Cảm ơn quý khách và hẹn gặp lại!
          </div>
          
          <script>
            window.onload = function() { 
              setTimeout(function() {
                window.print(); 
                window.close();
              }, 500);
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const processCheckout = async () => {
    updateActiveTab({ saving: true, error: '', successMessage: '' });

    let customerId = activeTab.customerId;
    let recipientName = activeTab.recipientName || 'Khách lẻ';

    // Auto-create customer from inline inputs before processing
    if (showCreateCustomer && newCustomer.full_name.trim()) {
      const cleanPhone = newCustomer.phone.trim().replace(/\\s/g, '');
      if (cleanPhone && (cleanPhone.length < 10 || cleanPhone.length > 11)) {
        updateActiveTab({ error: 'Số điện thoại phải có 10 hoặc 11 chữ số.', saving: false });
        return;
      }
      try {
        const created = await createCustomer({ full_name: newCustomer.full_name.trim(), phone: cleanPhone, status: 'active', is_regular: true });
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
        items: activeTab.items.map(it => ({
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount: it.discount
        })),
        previous_debt_paid: activeTab.payOldDebt ? (activeTab.customerData?.debt_account || 0) : 0
      };

      if (!activeTab.invoiceId) {
        const { invoice: created, payment_ref } = await createInvoice({ ...payload, status: 'confirmed' });

        if (activeTab.paymentMethod === 'bank_transfer' && payment_ref) {
          // Chuyển khoản: hiện màn hình QR chờ, bắt đầu polling
          const tabSnapshot = { ...activeTab, items: [...activeTab.items] };
          setPendingPayment({ paymentRef: payment_ref, totalAmount: totalAmount, invoice: created });
          startPolling(payment_ref, created, tabSnapshot);
          updateActiveTab({ saving: false });
        } else {
          // Tiền mặt: hoàn tất ngay
          if (activeTab.paymentMethod !== 'debt') {
             handlePrintInvoice(created, activeTab);
          }
          speakPayment();
          showToast('Thanh toán thành công! ' + (changeAmount > 0 ? `Tiền thừa trả khách: ${formatMoney(changeAmount)}` : ''), 'success');

          if (tabs.length === 1) {
            const nextNumber = getNextTabNumber(tabs);
            const newTab = createDefaultTab(nextNumber);
            setTabs([newTab]);
            setActiveTabId(newTab.tabId);
          } else {
            const newTabs = tabs.filter(t => t.tabId !== activeTabId);
            setTabs(newTabs);
            setActiveTabId(newTabs[0].tabId);
          }
          loadProducts();
        }
      } else {
        await updateInvoice(activeTab.invoiceId, payload);
        updateActiveTab({ successMessage: 'Đã lưu thay đổi.', saving: false });
        showToast('Đã lưu thay đổi hóa đơn.', 'success');
      }
    } catch (e) {
      updateActiveTab({ error: e.message || 'Lỗi khi lưu hóa đơn', saving: false });
      showToast(e.message || 'Lỗi khi lưu hóa đơn', 'error');
    }
  };

  const handleSubmit = () => {
    if (activeTab.saving) return;
    
    // Check if empty
    if (activeTab.items.length === 0) {
      updateActiveTab({ error: 'Chưa có hàng hóa trong đơn.' });
      return;
    }

    if (!canSubmit) return;

    processCheckout();
  };

  if (loading) return <div className="pos-loading">Đang tải...</div>;

  return (
    <div className="pos-container">
      <div className="pos-search-toolbar">
          <button
            type="button"
            className="pos-sidebar-toggle-btn"
            title={sidebarCollapsed ? 'Mở menu' : 'Thu nhỏ menu'}
            onClick={() => typeof toggleSidebar === 'function' && toggleSidebar()}
          >
            <i className="fa-solid fa-bars" />
          </button>
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
                      const isAdded = activeTab.items.some((it) => it.product_id === p._id);
                      return (
                        <button
                          type="button"
                          key={p._id}
                          className="pos-search-option"
                          onClick={() => !isAdded && handleAddProduct(p)}
                          disabled={isAdded}
                        >
                          <div>
                            <div className="pos-search-option-name">{p.name}</div>
                            <div className="pos-search-option-meta">{p.sku} - Tồn: {p.stock_qty || 0}</div>
                          </div>
                          <div className="pos-search-option-price">{Number(p.sale_price || 0).toLocaleString('vi-VN')}</div>
                        </button>
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
              <i className="fa-solid fa-barcode" />
            </button>
            {scanMode && <span className="pos-scan-mode-tag">Đang quét mã</span>}
          </div>

          <div className="pos-tabs pos-tabs-inline">
            {tabs.map(tab => (
              <div
                key={tab.tabId}
                className={`pos-tab ${tab.tabId === activeTabId ? 'active' : ''}`}
                onClick={() => setActiveTabId(tab.tabId)}
              >
                {tab.name}
                <i
                  className="fa-solid fa-xmark"
                  style={{ fontSize: 12, marginLeft: 8, cursor: 'pointer', padding: 2 }}
                  onClick={(e) => handleCloseTab(tab.tabId, e)}
                />
              </div>
            ))}
            <Button type="button" variant="outline" className="pos-add-tab-btn" onClick={handleAddTab}>
              <i className="fa-solid fa-plus" />
            </Button>
          </div>
      </div>

      <div className="pos-body">
      {/* Center Area: Active Order with Tabs */}
      <div className="pos-center-area">
        <div className="pos-cart-container">
          {activeTab.error && <div className="warehouse-alert warehouse-alert-error">{activeTab.error}</div>}
          {activeTab.successMessage && <div className="warehouse-alert warehouse-alert-success">{activeTab.successMessage}</div>}
          
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
                  <td>{item.name}</td>
                  <td>
                    <input 
                      type="number" 
                      className="pos-qty-input" 
                      value={item.quantity}
                      onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 1 })}
                    />
                  </td>
                  <td>{Number(item.unit_price).toLocaleString('vi-VN')}</td>
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
                  <td colSpan="7" className="pos-cart-empty-cell">
                    Chưa có hàng hóa nào trong đơn
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pos-bottom-bar">
             <div className="pos-bottom-left">
                  <div className="pos-mode-btn" onClick={() => navigate('/staff/invoices')}><i className="fa-solid fa-clock" /> Lịch sử Hóa đơn</div>
             </div>
             <div className="pos-bottom-meta">
                Tổng số dòng: {activeTab.items.length}
             </div>
        </div>
      </div>

      {/* Right Sidebar: Summary */}
      <div className="pos-right-sidebar">
        <div className="pos-customer-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>Khách hàng</span>
          </div>

          {showCreateCustomer ? (
            /* Inline create customer mode */
            <div>
              <input
                type="text"
                placeholder="Tên khách hàng *"
                value={newCustomer.full_name}
                onChange={e => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                className="pos-search-input"
                style={{ marginBottom: 6 }}
                autoFocus
              />
              <input
                type="text"
                placeholder="Số điện thoại *"
                value={newCustomer.phone}
                onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                className="pos-search-input"
                style={{ marginBottom: 6 }}
              />
              {customerModalError && (
                <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 6 }}>{customerModalError}</div>
              )}
              <button
                className="warehouse-btn warehouse-btn-secondary"
                style={{ width: '100%', padding: '6px', fontSize: 13, marginTop: 2 }}
                onClick={() => { setShowCreateCustomer(false); setNewCustomer({ full_name: '', phone: '' }); setCustomerModalError(''); }}
              >
                <i className="fa-solid fa-xmark" style={{ marginRight: 6 }} /> Hủy thêm khách hàng
              </button>
            </div>
          ) : (
            /* Normal search mode */
            <div className="pos-customer-search" style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={activeTab.customerId ? activeTab.customerData?.full_name : "Khách lẻ (mặc định) (Tên/SĐT)"}
                className="pos-search-input"
                value={customerSearch !== '' ? customerSearch : (activeTab.customerId ? activeTab.recipientName : activeTab.recipientName)}
                onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    updateActiveTab({ recipientName: e.target.value, customerId: null, customerData: null });
                    searchCustomers(e.target.value);
                }}
                onFocus={() => { if(customerList.length > 0) setShowCustomerDropdown(true); }}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
              />
              {activeTab.customerId && (
                <i className="fa-solid fa-xmark" style={{ position: 'absolute', right: 40, top: 10, cursor: 'pointer', color: '#94a3b8' }}
                  onClick={() => {
                    updateActiveTab({ customerId: null, customerData: null, recipientName: '', paymentMethod: 'cash', payOldDebt: false });
                    setCustomerSearch('');
                  }} />
              )}
              <button className="warehouse-btn warehouse-btn-secondary" style={{ padding: '0 12px' }} onClick={() => setShowCreateCustomer(true)}>+</button>

              {/* Dropdown */}
              {showCustomerDropdown && customerList.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: 6, zIndex: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginTop: 4 }}>
                  {customerList.map(c => (
                    <div key={c._id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                      onClick={() => {
                        updateActiveTab({ customerId: c._id, customerData: c, recipientName: c.full_name });
                        setCustomerSearch('');
                        setShowCustomerDropdown(false);
                      }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{c.full_name}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{c.phone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pos-summary-section">
          <div className="pos-summary-row">
            <span>Tổng tiền hàng</span>
            <span>{formatMoney(totalAmount)}</span>
          </div>
          <div className="pos-summary-row pos-discount-row">
            <span>Giảm giá</span>
            <input 
               type="text" 
               placeholder="0" 
               className="pos-discount-input"
            />
          </div>
          <div className="pos-total-row">
            <span>{activeTab.payOldDebt ? 'Tổng thanh toán (+Nợ)' : 'Khách cần trả'}</span>
            <span style={{ color: '#0081ff', fontSize: 20 }}>{formatMoney(totalWithDebt)}</span>
          </div>
          
          {/* Detailed Payment Inputs */}
          <div className="pos-payment-box">

              {/* Mixed payment toggles or summary */}
              <div className="pos-payment-methods">
                  <button 
                     className={`pos-method-btn ${activeTab.paymentMethod === 'cash' ? 'active' : ''}`}
                     onClick={() => updateActiveTab({ paymentMethod: 'cash' })}
                  >
                     <i className="fa-solid fa-money-bill" style={{ marginRight: 6 }}/> Tiền mặt
                  </button>
                  <button 
                     className={`pos-method-btn ${activeTab.paymentMethod === 'bank_transfer' ? 'active' : ''}`}
                     onClick={() => updateActiveTab({ paymentMethod: 'bank_transfer' })}
                  >
                     <i className="fa-solid fa-building-columns" style={{ marginRight: 6 }}/> Chuyển khoản
                  </button>
                  {activeTab.customerId && !activeTab.payOldDebt && (
                      <button 
                         style={{ flex: 1, padding: '8px', borderRadius: 6, border: activeTab.paymentMethod === 'debt' ? '1px solid #0081ff' : '1px solid #cbd5e1', background: activeTab.paymentMethod === 'debt' ? '#eff6ff' : 'white', cursor: 'pointer', fontWeight: 600, color: activeTab.paymentMethod === 'debt' ? '#0081ff' : '#64748b' }}
                         onClick={() => updateActiveTab({ paymentMethod: 'debt' })}
                      >
                         <i className="fa-solid fa-book" style={{ marginRight: 6 }}/> Ghi nợ
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
                          style={{
                            gridColumn: 'span 3',
                            padding: '6px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#0f172a',
                            cursor: 'pointer',
                          }}
                        >
                          Đủ tiền ({formatMoney(totalWithDebt)})
                        </button>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 12 }}>
                        {missingAmount > 0 && String(activeTab.customerPaid).length > 0 ? (
                          <>
                            <span style={{ color: '#ef4444' }}>Còn thiếu</span>
                            <span style={{ fontWeight: 600, color: '#ef4444' }}>{formatMoney(missingAmount)}</span>
                          </>
                        ) : (
                          <>
                            <span style={{ color: '#64748b' }}>Tiền thừa trả khách</span>
                            <span style={{ fontWeight: 600 }}>{formatMoney(changeAmount)}</span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {activeTab.paymentMethod === 'bank_transfer' && totalAmount > 0 && (
                <div className="pos-bank-note">
                  <p className="pos-bank-note-title">
                    Nhấn THANH TOÁN để tạo mã QR chính xác
                  </p>
                  <div className="pos-bank-note-body">
                    <i className="fa-solid fa-qrcode" />
                    Mã QR sẽ hiển thị sau khi xác nhận đơn
                  </div>
                </div>
              )}
          </div>

          {/* Debt Notification Alert */}
          {activeTab.customerData?.debt_account > 0 && (
              <div style={{ 
                 marginTop: 16, 
                 padding: '16px', 
                 background: '#fff7ed', 
                 border: '1px solid #fed7aa', 
                 borderRadius: 12,
                 boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
              }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ background: '#ffedd5', color: '#ea580c', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', flexShrink: 0, justifyContent: 'center' }}>
                          <i className="fa-solid fa-triangle-exclamation" />
                      </div>
                      <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#9a3412', fontWeight: 700, marginBottom: 4 }}>THÔNG BÁO NỢ CŨ</div>
                          <div style={{ fontSize: 13, color: '#c2410c' }}>
                              Khách hàng đang còn nợ: <span style={{ fontWeight: 800 }}>{formatMoney(activeTab.customerData.debt_account)}</span>
                          </div>
                          
                          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', padding: '8px 12px', borderRadius: 8, border: '1px solid #fdba74' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#9a3412' }}>Thanh toán cùng đơn này?</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <button 
                                     onClick={() => {
                                        const nextPayOld = !activeTab.payOldDebt;
                                        const updates = { payOldDebt: nextPayOld };
                                        if (nextPayOld && activeTab.paymentMethod === 'debt') {
                                           updates.paymentMethod = 'cash';
                                        }
                                        updateActiveTab(updates);
                                     }}
                                     style={{ 
                                         background: activeTab.payOldDebt ? '#ea580c' : '#f1f5f9',
                                         color: activeTab.payOldDebt ? 'white' : '#64748b',
                                         border: 'none', padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                                     }}
                                  >
                                     {activeTab.payOldDebt ? 'TRẢ LUÔN' : 'CHƯA TRẢ'}
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}
          
          <div className="pos-submit-wrap">
            <button 
              className="pos-pay-button" 
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {activeTab.saving ? 'ĐANG XỬ LÝ...' : 'THANH TOÁN'}
            </button>
          </div>
        </div>

      </div>
      </div>
      
      {/* Toast Notification */}
      {toast.message && (
        <div style={{
          position: 'fixed', bottom: 40, right: 40, 
          background: toast.type === 'error' ? '#ef4444' : '#10b981', 
          color: 'white', padding: '16px 24px', 
          borderRadius: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 9999, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 12, animation: 'slideUp 0.3s ease-out'
        }}>
          <i className={toast.type === 'error' ? "fa-solid fa-circle-xmark" : "fa-solid fa-circle-check"} style={{ fontSize: 20 }} />
          {toast.message}
        </div>
      )}

      <PaymentWaitModal
        pendingPayment={pendingPayment}
        bankCode={bankCode}
        bankAccountNumber={bankAccountNumber}
        storeName={process.env.REACT_APP_STORE_NAME || 'Cua hang IMS'}
        onCancel={() => {
          stopPolling();
          setPendingPayment(null);
        }}
      />

    </div>
  );
}
