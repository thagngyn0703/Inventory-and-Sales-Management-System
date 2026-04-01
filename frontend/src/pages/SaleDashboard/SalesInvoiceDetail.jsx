import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getInvoice, createInvoice, updateInvoice, getPaymentStatus } from '../../services/invoicesApi';
import { getProducts } from '../../services/productsApi';
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
  customerPaid: '',
  saving: false,
  error: '',
  successMessage: '',
  invoiceId: null // If loaded from existing
});

export default function SalesInvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
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
  
  // Tab Management State
  const [tabs, setTabs] = useState([createDefaultTab(1)]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].tabId);
  
  const [toastMessage, setToastMessage] = useState('');

  // Trạng thái chờ thanh toán chuyển khoản
  const [pendingPayment, setPendingPayment] = useState(null); // { paymentRef, totalAmount, invoice }
  const pollingRef = useRef(null);
  const searchWrapRef = useRef(null);

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
    const existingIdx = activeTab.items.findIndex(it => it.product_id === product._id);
    let newItems = [...activeTab.items];
    
    if (existingIdx >= 0) {
      const it = newItems[existingIdx];
      const newQty = it.quantity + 1;
      newItems[existingIdx] = { 
        ...it, 
        quantity: newQty, 
        line_total: newQty * it.unit_price - it.discount 
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
        stock_qty: product.stock_qty
      });
    }
    updateActiveTab({ items: newItems });
    setSearchTerm('');
    setShowSearchDropdown(false);
  };

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
  
  // Calculate change
  const customerPaidNum = Number(activeTab.customerPaid) || 0;
  const changeAmount = Math.max(0, customerPaidNum - totalAmount);
  // Missing amount if they haven't paid enough yet
  const missingAmount = Math.max(0, totalAmount - customerPaidNum);
  
  // Validation
  const isPaymentSufficient = activeTab.paymentMethod === 'bank_transfer' || customerPaidNum >= totalAmount;
  const canSubmit = !activeTab.saving && activeTab.items.length > 0 && 
    (activeTab.paymentMethod === 'debt' || isPaymentSufficient);

  const QUICK_PAID_VALUES = [10000, 20000, 50000, 100000, 200000, 500000];

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
            Tổng cộng: ${Number(invoice.total_amount || 0).toLocaleString('vi-VN')}₫
          </div>

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
    try {
      const payload = {
        payment_method: activeTab.paymentMethod,
        recipient_name: activeTab.recipientName,
        items: activeTab.items.map(it => ({
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount: it.discount
        }))
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
          speakPayment();
          handlePrintInvoice(created, activeTab);
          setToastMessage('Thanh toán thành công! ' + (changeAmount > 0 ? `Tiền thừa trả khách: ${formatMoney(changeAmount)}` : ''));
          setTimeout(() => setToastMessage(''), 3000);

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
        setToastMessage('Đã lưu thay đổi hóa đơn.');
        setTimeout(() => setToastMessage(''), 3000);
      }
    } catch (e) {
      updateActiveTab({ error: e.message || 'Lỗi khi lưu hóa đơn', saving: false });
    }
  };

  const handleSubmit = () => {
    if (activeTab.saving) return;
    
    // Check if empty
    if (activeTab.items.length === 0) {
      updateActiveTab({ error: 'Chưa có hàng hóa trong đơn.' });
      return;
    }

    if (!activeTab.recipientName || activeTab.recipientName.trim() === '') {
      updateActiveTab({ error: 'Tên khách hàng là bắt buộc.' });
      return;
    }

    if (!canSubmit) return;

    processCheckout();
  };

  if (loading) return <div className="pos-loading">Đang tải...</div>;

  return (
    <div className="pos-container">
      {/* Center Area: Active Order with Tabs */}
      <div className="pos-center-area">
        <div className="pos-search-toolbar">
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
            <Button type="button" variant="outline" className="my-1 h-8 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={handleAddTab}>
              <i className="fa-solid fa-plus" />
            </Button>
          </div>
        </div>
        
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
                  <td colSpan="7" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    Chưa có hàng hóa nào trong đơn
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pos-bottom-bar">
             <div style={{ flex: 1, display: 'flex', gap: 20 }}>
                  <div className="pos-mode-btn" onClick={() => navigate('/staff/invoices')}><i className="fa-solid fa-clock" /> Lịch sử Hóa đơn</div>
             </div>
             <div style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>
                Tổng số dòng: {activeTab.items.length}
             </div>
        </div>
      </div>

      {/* Right Sidebar: Summary */}
      <div className="pos-right-sidebar">
        <div className="pos-customer-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>Khách hàng</span>
            <i className="fa-solid fa-user-pen" style={{ color: '#0081ff', cursor: 'pointer' }} />
          </div>
          <div className="pos-customer-search">
             <input 
                type="text" 
                placeholder="Khách hàng"
                className="pos-search-input"
                value={activeTab.recipientName}
                onChange={(e) => updateActiveTab({ recipientName: e.target.value })}
             />
             <button className="warehouse-btn warehouse-btn-secondary" style={{ padding: '0 12px' }}>+</button>
          </div>
        </div>

        <div className="pos-summary-section">
          <div className="pos-summary-row">
            <span>Tổng tiền hàng</span>
            <span>{formatMoney(totalAmount)}</span>
          </div>
          <div className="pos-summary-row" style={{ marginBottom: 10 }}>
            <span>Giảm giá</span>
            <input 
               type="text" 
               placeholder="0" 
               style={{ width: 80, textAlign: 'right', border: 'none', borderBottom: '1px solid #cbd5e1', outline: 'none', fontWeight: 600, color: '#f59e0b' }}
            />
          </div>
          <div className="pos-total-row">
            <span>Khách cần trả</span>
            <span style={{ color: '#0081ff', fontSize: 20 }}>{formatMoney(totalAmount)}</span>
          </div>
          
          {/* Detailed Payment Inputs */}
          <div style={{ marginTop: 20, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>

              {/* Mixed payment toggles or summary */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button 
                     style={{ flex: 1, padding: '8px', borderRadius: 6, border: activeTab.paymentMethod === 'cash' ? '1px solid #0081ff' : '1px solid #cbd5e1', background: activeTab.paymentMethod === 'cash' ? '#eff6ff' : 'white', cursor: 'pointer', fontWeight: 600, color: activeTab.paymentMethod === 'cash' ? '#0081ff' : '#64748b' }}
                     onClick={() => updateActiveTab({ paymentMethod: 'cash' })}
                  >
                     <i className="fa-solid fa-money-bill" style={{ marginRight: 6 }}/> Tiền mặt
                  </button>
                  <button 
                     style={{ flex: 1, padding: '8px', borderRadius: 6, border: activeTab.paymentMethod === 'bank_transfer' ? '1px solid #0081ff' : '1px solid #cbd5e1', background: activeTab.paymentMethod === 'bank_transfer' ? '#eff6ff' : 'white', cursor: 'pointer', fontWeight: 600, color: activeTab.paymentMethod === 'bank_transfer' ? '#0081ff' : '#64748b' }}
                     onClick={() => updateActiveTab({ paymentMethod: 'bank_transfer' })}
                  >
                     <i className="fa-solid fa-building-columns" style={{ marginRight: 6 }}/> Chuyển khoản
                  </button>
              </div>

              {activeTab.paymentMethod === 'cash' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                     <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>Khách thanh toán</span>
                     <input 
                       type="number"
                       value={activeTab.customerPaid}
                       onChange={(e) => updateActiveTab({ customerPaid: e.target.value })}
                       placeholder="0"
                       className="pos-search-input"
                       style={{ width: 120, height: 32, textAlign: 'right', fontWeight: 600 }}
                     />
                  </div>
                  {activeTab.items.length > 0 && String(activeTab.customerPaid).length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 12 }}>
                       {missingAmount > 0 ? (
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
                  )}
                  {activeTab.items.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                      {QUICK_PAID_VALUES.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => updateActiveTab({ customerPaid: String(amount) })}
                          style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: 999,
                            background: '#fff',
                            color: '#334155',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '6px 8px',
                            cursor: 'pointer',
                          }}
                        >
                          {amount.toLocaleString('vi-VN')}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab.paymentMethod === 'bank_transfer' && totalAmount > 0 && (
                <div style={{ marginTop: 12, textAlign: 'center', background: 'white', padding: 12, borderRadius: 8, border: '1px solid #0081ff' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#0081ff', fontWeight: 600 }}>
                    Nhấn THANH TOÁN để tạo mã QR chính xác
                  </p>
                  <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>
                    <i className="fa-solid fa-qrcode" style={{ fontSize: 40, color: '#cbd5e1', display: 'block', marginBottom: 6 }} />
                    Mã QR sẽ hiển thị sau khi xác nhận đơn
                  </div>
                </div>
              )}
          </div>
          
          <div style={{ marginTop: 24 }}>
            <button 
              className="pos-pay-button" 
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{ opacity: canSubmit ? 1 : 0.7 }}
            >
              {activeTab.saving ? 'ĐANG XỬ LÝ...' : 'THANH TOÁN'}
            </button>
          </div>
        </div>

      </div>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 40, right: 40, background: '#10b981', color: 'white', padding: '16px 24px', 
          borderRadius: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 9999, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 12, animation: 'slideUp 0.3s ease-out'
        }}>
          <i className="fa-solid fa-circle-check" style={{ fontSize: 20 }} />
          {toastMessage}
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
