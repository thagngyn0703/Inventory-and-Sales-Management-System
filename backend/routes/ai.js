/**
 * /api/ai/insights  — GET  — thẻ gợi ý (JSON cache theo ngày)
 * /api/ai/chat      — POST — hỏi đáp (văn bản, throttle theo user)
 *
 * Pipeline:
 *   1. calendarHelper   – ngày lễ VN cố định + sự kiện âm lịch (tính sẵn theo năm)
 *   2. weatherHelper    – OpenWeatherMap 5-day forecast (free) theo tên tỉnh thành
 *   3. inventoryHelper  – low-stock + dead-stock + sắp hết hạn 30 ngày (khớp analytics)
 *   4. buildPrompt / buildContextBlock + CHAT_SYSTEM_RULES (chat)
 *   5. callLLM / callLLMChat — Gemini trước → OpenAI dự phòng; chat đa lượt + dữ liệu kho mỗi request
 *   6. cache (chỉ insights)
 *
 * LLM priority: Gemini → OpenAI dự phòng → (chat) buildChatFallback nếu cả hai lỗi
 */

const express = require('express');
const https = require('https');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const Product = require('../models/Product');
const Store = require('../models/Store');
const SalesInvoice = require('../models/SalesInvoice');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─── Chat throttle (chống spam API) ─────────────────────────────────────────
const chatLastAt = new Map(); // userId -> timestamp ms
const CHAT_MIN_INTERVAL_MS = 2500;

// ─── In-memory cache ────────────────────────────────────────────────────────
// key: `${storeId}_${YYYY-MM-DD}`  value: { data, expireAt }
const insightCache = new Map();

function getCacheKey(storeId, vnDateStr) {
  return `${storeId}_${vnDateStr}`;
}

function getFromCache(key) {
  const entry = insightCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expireAt) {
    insightCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // hết hạn lúc 23:59:59 hôm nay (theo máy server, giờ VN)
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  insightCache.set(key, { data, expireAt: endOfDay.getTime() });
}

// ─── Timezone helper ─────────────────────────────────────────────────────────
function getVNDateStr(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(d); // YYYY-MM-DD
}

function getVNDateParts(d = new Date()) {
  const str = getVNDateStr(d);
  const [y, m, day] = str.split('-').map(Number);
  return { y, m, day };
}

// ─── 1. Calendar Helper ───────────────────────────────────────────────────────
/**
 * Ngày lễ / sự kiện VN sắp tới trong 30 ngày.
 * Âm lịch → dương lịch được tính sẵn cho từng năm (bảng lookup),
 * tránh phụ thuộc thư viện âm lịch phức tạp.
 *
 * Bảng lunar: thêm mỗi năm, index theo năm DL.
 */
const LUNAR_EVENTS = {
  // 2025
  2025: [
    { date: '2025-04-06', name: 'Giỗ Tổ Hùng Vương (10/3 Âm lịch)' },
    { date: '2025-10-06', name: 'Tết Trung thu (15/8 Âm lịch)' },
    { date: '2025-01-29', name: 'Tết Nguyên Đán (Mùng 1 Tết)' },
  ],
  // 2026
  2026: [
    { date: '2026-04-26', name: 'Giỗ Tổ Hùng Vương (10/3 Âm lịch)' },
    { date: '2026-10-25', name: 'Tết Trung thu (15/8 Âm lịch)' },
    { date: '2026-02-17', name: 'Tết Nguyên Đán (Mùng 1 Tết)' },
  ],
  // 2027
  2027: [
    { date: '2027-04-16', name: 'Giỗ Tổ Hùng Vương (10/3 Âm lịch)' },
    { date: '2027-10-15', name: 'Tết Trung thu (15/8 Âm lịch)' },
    { date: '2027-02-06', name: 'Tết Nguyên Đán (Mùng 1 Tết)' },
  ],
};

/** Ngày lễ cố định (dương lịch). */
function getFixedHolidays(year) {
  return [
    { date: `${year}-01-01`, name: 'Tết Dương lịch' },
    { date: `${year}-04-30`, name: 'Ngày Giải phóng miền Nam (30/4)' },
    { date: `${year}-05-01`, name: 'Ngày Quốc tế Lao động (1/5)' },
    { date: `${year}-09-02`, name: 'Ngày Quốc khánh (2/9)' },
    { date: `${year}-09-05`, name: 'Ngày Khai giảng (5/9)' },
    { date: `${year}-11-20`, name: 'Ngày Nhà giáo Việt Nam (20/11)' },
    { date: `${year}-03-08`, name: 'Ngày Quốc tế Phụ nữ (8/3)' },
    { date: `${year}-10-20`, name: 'Ngày Phụ nữ Việt Nam (20/10)' },
    { date: `${year}-06-01`, name: 'Ngày Quốc tế Thiếu nhi (1/6)' },
    { date: `${year}-12-25`, name: 'Lễ Giáng sinh (25/12)' },
  ];
}

function getUpcomingEvents(daysAhead = 30) {
  const now = new Date();
  const { y } = getVNDateParts(now);
  const vnNow = new Date(getVNDateStr(now) + 'T00:00:00+07:00');
  const vnFuture = new Date(vnNow.getTime() + daysAhead * 86400000);

  const allEvents = [
    ...getFixedHolidays(y),
    ...getFixedHolidays(y + 1),
    ...(LUNAR_EVENTS[y] || []),
    ...(LUNAR_EVENTS[y + 1] || []),
  ];

  return allEvents
    .filter(ev => {
      const d = new Date(ev.date + 'T00:00:00+07:00');
      return d >= vnNow && d <= vnFuture;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);
}

/** Toàn bộ lễ/sự kiện đã biết trong năm DL hiện tại và năm sau (để LLM lọc theo tháng khi hỏi). */
function getAllYearEventsForContext() {
  const { y } = getVNDateParts();
  const raw = [
    ...getFixedHolidays(y),
    ...getFixedHolidays(y + 1),
    ...(LUNAR_EVENTS[y] || []),
    ...(LUNAR_EVENTS[y + 1] || []),
  ];
  const seen = new Set();
  const out = [];
  for (const ev of raw) {
    const k = `${ev.date}|${ev.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(ev);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Mùa vụ theo tháng (Miền Bắc & Miền Nam chung). */
function getSeasonContext(month) {
  if (month >= 4 && month <= 8) {
    return 'Mùa hè nắng nóng (tháng 4–8): nhu cầu cao với nước giải khát, kem, bia, đồ dùng giải nhiệt.';
  }
  if (month === 9 || month === 10) {
    return 'Đầu mùa mưa (tháng 9–10): nhu cầu tăng với ô, áo mưa, ủng; giảm nhu cầu với kem lạnh.';
  }
  if (month === 11 || month === 12 || month === 1) {
    return 'Mùa lạnh / cuối năm (tháng 11–1): nhu cầu cao với áo ấm, mũ, găng tay, đồ dùng sưởi ấm; giảm kem và nước giải khát.';
  }
  return 'Giao mùa (tháng 2–3): thời tiết ổn định, chuẩn bị hàng Tết, mùng lễ, văn phòng phẩm đầu năm.';
}

/** Tín hiệu tham khảo từ thị trường (không giới hạn SKU nội bộ). */
function getMarketSignalsByMonth(month) {
  if (month >= 4 && month <= 8) {
    return [
      'Nhu cầu cao theo mùa nóng: nước điện giải, chống nắng, sản phẩm làm mát cá nhân.',
      'Nhóm tiêu dùng nhanh theo xu hướng: đồ uống tiện lợi ít đường, snack gọn nhẹ cho du lịch ngắn ngày.',
    ];
  }
  if (month === 9 || month === 10) {
    return [
      'Mùa mưa: nhóm áo mưa, khăn giấy, đồ uống ấm đóng chai thường tăng nhu cầu.',
      'Mùa tựu trường: văn phòng phẩm, đồ ăn nhanh tiện lợi cho học sinh/sinh viên.',
    ];
  }
  if (month === 11 || month === 12 || month === 1) {
    return [
      'Cuối năm/lễ Tết: quà tặng tiêu dùng, bánh kẹo đóng hộp, đồ uống dùng trong tụ họp.',
      'Nhóm hàng mùa lạnh: đồ uống nóng hòa tan, sản phẩm chăm sóc sức khỏe gia đình.',
    ];
  }
  return [
    'Giao mùa: nhu cầu ổn định, phù hợp thử SKU mới số lượng nhỏ để đo phản hồi.',
    'Ưu tiên SKU quay vòng nhanh và biên lợi nhuận ổn định để giữ dòng tiền.',
  ];
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[|\]\]>/g, '');
}

function stripHtmlTags(text) {
  return decodeXmlEntities(text).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractRssItems(xml = '') {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const item = m[1];
    const title = (item.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const link = (item.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
    const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const cleanTitle = stripHtmlTags(title);
    const cleanLink = decodeXmlEntities(link).trim();
    if (!cleanTitle || !cleanLink) continue;
    items.push({ title: cleanTitle, link: cleanLink, pubDate: stripHtmlTags(pubDate) });
  }
  return items;
}

function fetchRss(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const req = https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          finish('');
          return;
        }
        finish(raw);
      });
    });
    req.on('error', () => finish(''));
    req.setTimeout(4500, () => {
      req.destroy();
      finish('');
    });
  });
}

async function fetchLiveMarketSignals({ city = 'Việt Nam', events = [] } = {}) {
  const queryParts = [
    'xu hướng tiêu dùng tạp hóa Việt Nam',
    `${city} bán lẻ hàng tiêu dùng`,
    ...events.slice(0, 2).map((e) => `nhu cầu mua sắm ${e.name} Việt Nam`),
  ];
  const unique = [];
  const seen = new Set();
  for (const q of queryParts) {
    const k = String(q || '').trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    unique.push(q);
  }

  const rssUrls = unique.map((q) => (
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=vi&gl=VN&ceid=VN:vi`
  ));

  const xmlList = await Promise.all(rssUrls.map((u) => fetchRss(u)));
  const collected = xmlList.flatMap((xml) => extractRssItems(xml));

  const out = [];
  const seenTitle = new Set();
  for (const item of collected) {
    const key = item.title.toLowerCase();
    if (seenTitle.has(key)) continue;
    seenTitle.add(key);
    out.push(`(Live) ${item.title} — nguồn: ${item.link}`);
    if (out.length >= 5) break;
  }
  return out;
}

// ─── 2. Weather Helper ────────────────────────────────────────────────────────
/**
 * Lấy dự báo thời tiết từ OpenWeatherMap (free tier).
 * Trả về chuỗi tóm tắt 3 ngày tới; fallback rỗng nếu không có API key.
 */
function fetchWeather(city) {
  return new Promise((resolve) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      resolve('');
      return;
    }

    const safeCity = encodeURIComponent(city || 'Ho Chi Minh City');
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${safeCity},VN&cnt=8&units=metric&lang=vi&appid=${apiKey}`;

    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.cod !== '200' && json.cod !== 200) { resolve(''); return; }

          const items = json.list || [];
          const temps = items.map(i => i.main?.temp).filter(Boolean);
          const maxTemp = temps.length ? Math.round(Math.max(...temps)) : null;
          const minTemp = temps.length ? Math.round(Math.min(...temps)) : null;
          const descriptions = [...new Set(items.map(i => i.weather?.[0]?.description).filter(Boolean))].slice(0, 2);

          const parts = [];
          if (maxTemp != null) parts.push(`Nhiệt độ cao nhất ~${maxTemp}°C, thấp nhất ~${minTemp}°C`);
          if (descriptions.length) parts.push(descriptions.join(', '));

          resolve(parts.length ? parts.join('. ') + ' (dự báo 24–48h tới).' : '');
        } catch {
          resolve('');
        }
      });
      res.on('error', () => resolve(''));
    }).on('error', () => resolve(''));

    // timeout 5s
    setTimeout(() => resolve(''), 5000);
  });
}

/** Trích tên tỉnh/thành phố từ địa chỉ store. */
function extractCityFromAddress(address) {
  if (!address) return 'Ho Chi Minh City';
  const lowerAddr = address.toLowerCase();

  const cityMap = [
    { keywords: ['hà nội', 'ha noi'], city: 'Hanoi' },
    { keywords: ['hồ chí minh', 'ho chi minh', 'tp.hcm', 'tphcm', 'sài gòn', 'sai gon'], city: 'Ho Chi Minh City' },
    { keywords: ['đà nẵng', 'da nang'], city: 'Da Nang' },
    { keywords: ['hải phòng', 'hai phong'], city: 'Hai Phong' },
    { keywords: ['cần thơ', 'can tho'], city: 'Can Tho' },
    { keywords: ['nha trang'], city: 'Nha Trang' },
    { keywords: ['đà lạt', 'da lat'], city: 'Da Lat' },
    { keywords: ['huế', 'hue'], city: 'Hue' },
    { keywords: ['vũng tàu', 'vung tau'], city: 'Vung Tau' },
    { keywords: ['bình dương', 'binh duong'], city: 'Thu Dau Mot' },
    { keywords: ['đồng nai', 'dong nai'], city: 'Bien Hoa' },
  ];

  for (const entry of cityMap) {
    if (entry.keywords.some(kw => lowerAddr.includes(kw))) {
      return entry.city;
    }
  }
  return 'Ho Chi Minh City';
}

// ─── 3. Inventory Helper (khớp logic snapshot analytics /inventory-snapshot) ─
async function getInventoryContext(storeId) {
  const baseMatch = storeId
    ? { storeId: new mongoose.Types.ObjectId(storeId), status: 'active' }
    : { status: 'active' };

  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

  const [lowStock, deadStock, expiringSoon] = await Promise.all([
    Product.find({
      ...baseMatch,
      stock_qty: { $gt: 0 },
      $expr: { $lte: ['$stock_qty', '$reorder_level'] },
    })
      .select('name sku stock_qty reorder_level')
      .sort({ stock_qty: 1 })
      .limit(5)
      .lean(),

    Product.find({ ...baseMatch, stock_qty: { $gt: 10 } })
      .select('name sku stock_qty cost_price')
      .sort({ stock_qty: -1 })
      .limit(5)
      .lean(),

    Product.find({
      ...baseMatch,
      expiry_date: { $gte: new Date(), $lte: thirtyDaysLater },
    })
      .select('name sku expiry_date stock_qty')
      .sort({ expiry_date: 1 })
      .limit(10)
      .lean(),
  ]);

  return { lowStock, deadStock, expiringSoon };
}

async function getBusinessConsultingContext(storeId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const baseMatch = {
    status: 'confirmed',
    invoice_at: { $gte: thirtyDaysAgo, $lte: now },
  };
  if (storeId) baseMatch.store_id = new mongoose.Types.ObjectId(storeId);

  const [topProfitProducts, peakHours, dailyRevenue7d, soldProductIds] = await Promise.all([
    SalesInvoice.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product_id',
          qty: { $sum: { $ifNull: ['$items.quantity', 0] } },
          revenue: { $sum: { $ifNull: ['$items.line_total', 0] } },
          profit: {
            $sum: {
              $ifNull: [
                '$items.line_profit',
                {
                  $subtract: [
                    { $ifNull: ['$items.line_total', 0] },
                    { $multiply: [{ $ifNull: ['$items.cost_price', 0] }, { $ifNull: ['$items.quantity', 0] }] },
                  ],
                },
              ],
            },
          },
        },
      },
      { $sort: { profit: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      {
        $project: {
          _id: 0,
          product_id: '$_id',
          name: { $ifNull: [{ $arrayElemAt: ['$product.name', 0] }, 'Sản phẩm không xác định'] },
          qty: 1,
          revenue: 1,
          profit: 1,
        },
      },
    ]),
    SalesInvoice.aggregate([
      { $match: baseMatch },
      {
        $project: {
          hour: { $hour: { date: '$invoice_at', timezone: 'Asia/Ho_Chi_Minh' } },
          total_amount: { $ifNull: ['$total_amount', 0] },
        },
      },
      {
        $group: {
          _id: '$hour',
          invoices: { $sum: 1 },
          revenue: { $sum: '$total_amount' },
        },
      },
      { $sort: { invoices: -1, revenue: -1 } },
      { $limit: 3 },
      {
        $project: {
          _id: 0,
          hour: '$_id',
          invoices: 1,
          revenue: 1,
        },
      },
    ]),
    SalesInvoice.aggregate([
      {
        $match: {
          ...baseMatch,
          invoice_at: { $gte: sevenDaysAgo, $lte: now },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$invoice_at', timezone: 'Asia/Ho_Chi_Minh' } },
          revenue: { $sum: { $ifNull: ['$total_amount', 0] } },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 7 },
    ]),
    SalesInvoice.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      { $group: { _id: '$items.product_id' } },
      { $project: { _id: 1 } },
    ]),
  ]);

  const soldIds = soldProductIds.map((x) => x._id).filter(Boolean);
  const productMatch = storeId
    ? { storeId: new mongoose.Types.ObjectId(storeId), status: 'active' }
    : { status: 'active' };
  const unsoldProducts30d = await Product.find({
    ...productMatch,
    _id: { $nin: soldIds.length ? soldIds : [] },
  })
    .select('name sku stock_qty')
    .sort({ stock_qty: -1 })
    .limit(8)
    .lean();

  return { topProfitProducts, peakHours, unsoldProducts30d, dailyRevenue7d };
}

/** Định dạng ngày YYYY-MM-DD theo lịch VN (hạn dùng). */
function formatVNDateYMD(d) {
  if (!d) return '—';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(d));
}

// ─── 4. Context block (dùng chung insights + chat) ───────────────────────────
function buildContextBlock({
  vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon, marketSignals = [], businessStats = {},
}) {
  const events30Text = events.length
    ? events.map(e => `- ${e.date} — ${e.name}`).join('\n')
    : '- Không có sự kiện lớn trong 30 ngày tới';

  const yearEventsText = yearEvents.length
    ? yearEvents.map(e => `- ${e.date} — ${e.name}`).join('\n')
    : '- (không có dữ liệu lễ trong bảng)';

  const lowStockText = lowStock.length
    ? lowStock.map(p => `- ${p.name} (SKU: ${p.sku}): tồn ${p.stock_qty}, mức tối thiểu ${p.reorder_level}`).join('\n')
    : '- Không có mặt hàng sắp hết (theo ngưỡng tồn ≤ mức tối thiểu)';

  const deadStockText = deadStock.length
    ? deadStock.map(p => `- ${p.name} (SKU: ${p.sku}): tồn ${p.stock_qty} ${p.cost_price ? `(vốn ~${(p.stock_qty * p.cost_price).toLocaleString('vi-VN')}đ)` : ''}`).join('\n')
    : '- Không có hàng tồn nhiều bất thường (top tồn cao)';

  const expiringText = expiringSoon.length
    ? expiringSoon.map(p => `- ${p.name} (SKU: ${p.sku}): hạn sử dụng ${formatVNDateYMD(p.expiry_date)}, tồn ${p.stock_qty}`).join('\n')
    : '- Không có mặt hàng nào có hạn sử dụng trong vòng 30 ngày tới';

  const weatherLine = weather ? `Thời tiết 24-48h tới: ${weather}` : '';
  const marketSignalsText = marketSignals.length
    ? marketSignals.map((s) => `- ${s}`).join('\n')
    : '- Chưa có tín hiệu thị trường mở rộng';
  const topProfitText = (businessStats.topProfitProducts || []).length
    ? businessStats.topProfitProducts
      .map((p) => `- ${p.name}: doanh thu ~${Math.round(p.revenue || 0).toLocaleString('vi-VN')}đ; lợi nhuận ~${Math.round(p.profit || 0).toLocaleString('vi-VN')}đ; SL bán ${Math.round(p.qty || 0)}`)
      .join('\n')
    : '- Chưa đủ dữ liệu để xác định top lợi nhuận tháng này';
  const peakHoursText = (businessStats.peakHours || []).length
    ? businessStats.peakHours
      .map((h) => `- ${String(h.hour).padStart(2, '0')}:00-${String((Number(h.hour) + 1) % 24).padStart(2, '0')}:00: ${h.invoices} hóa đơn, doanh thu ~${Math.round(h.revenue || 0).toLocaleString('vi-VN')}đ`)
      .join('\n')
    : '- Chưa đủ dữ liệu để xác định khung giờ cao điểm';
  const unsoldText = (businessStats.unsoldProducts30d || []).length
    ? businessStats.unsoldProducts30d
      .map((p) => `- ${p.name} (SKU: ${p.sku || 'N/A'}): tồn ${p.stock_qty}`)
      .join('\n')
    : '- Không có mặt hàng tồn kho chưa phát sinh đơn trong 30 ngày qua';
  const rev7dText = (businessStats.dailyRevenue7d || []).length
    ? businessStats.dailyRevenue7d.map((d) => `- ${d._id}: ~${Math.round(d.revenue || 0).toLocaleString('vi-VN')}đ`).join('\n')
    : '- Chưa có dữ liệu doanh thu 7 ngày gần đây';

  return `Ngày hôm nay: ${vnDateStr}
Bối cảnh mùa vụ (mô tả chung, không thay thế ngày lễ cụ thể): ${season}
${weatherLine}

Sự kiện / ngày lễ trong 30 ngày tới:
${events30Text}

LỊCH SỰ KIỆN ĐÃ BIẾT (năm dương lịch hiện tại và năm sau; mỗi dòng: YYYY-MM-DD — tên). Dùng bảng này khi cần liệt kê theo THÁNG cụ thể:
${yearEventsText}

Hàng sắp hết kho — tồn thấp so với mức tối thiểu (cần nhập):
${lowStockText}

Hàng sắp hết hạn SỬ DỤNG — hạn trong 30 ngày tới (khác với "sắp hết hàng"):
${expiringText}

Hàng tồn nhiều (rủi ro vốn đọng — top tồn cao):
${deadStockText}

Tín hiệu thị trường tham khảo (có thể bao gồm sản phẩm chưa có trong hệ thống):
${marketSignalsText}

Hiệu suất kinh doanh nội bộ (để tư vấn thực chiến):
Top mặt hàng lợi nhuận cao tháng này:
${topProfitText}

Khung giờ bận rộn:
${peakHoursText}

Mặt hàng chưa có đơn trong 30 ngày:
${unsoldText}

Doanh thu 7 ngày gần đây:
${rev7dText}`;
}

function buildPrompt({
  vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon, marketSignals = [], businessStats = {},
}) {
  const ctx = buildContextBlock({
    vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon, marketSignals, businessStats,
  });

  return `Bạn là chuyên gia tư vấn kho vận và kinh doanh cho tiệm tạp hóa tại Việt Nam.

${ctx}

NHIỆM VỤ: Dựa CHÍNH XÁC vào dữ liệu trên, đưa ra 3 lời khuyên thực tế cho chủ tiệm.
- Mỗi lời khuyên cần có số liệu cụ thể từ dữ liệu (tồn kho, ngưỡng nhập, ngày hết hạn, vốn tồn, mốc sự kiện...).
- Nội dung phải trả lời được "Vì sao làm ngay bây giờ?" và "Làm gì tiếp theo?".
- Mỗi lời khuyên tối đa 40 từ, ngắn gọn, hành động rõ ràng.
- Ít nhất 1 lời khuyên phải là tư duy liên kết (correlation): kết nối vốn đọng/tồn kho cao với nhu cầu nhập mới để tối ưu dòng tiền.
- Chỉ đề cập mặt hàng/SKU có trong dữ liệu trên. Nếu không có SKU cụ thể thì nói theo nhóm hàng phù hợp mùa/sự kiện.
- Type "tip": chỉ dành cho mẹo chiến lược tối ưu doanh thu/lợi nhuận (ví dụ cơ cấu hàng, biên lợi nhuận, nhịp bán).
- Type "warning": chỉ dành cho cảnh báo hàng tồn nhiều khó bán hoặc hàng sắp hết hạn trong 30 ngày tới.
- Type "opportunity": chỉ dành cho cơ hội theo thời tiết, ngày lễ/sự kiện và xu hướng thị trường.
- Không dùng type "urgent".
- Cho phép tối đa 1 khuyến nghị mở rộng thị trường cho sản phẩm CHƯA có trong hệ thống, nhưng phải ghi rõ đây là "đề xuất mở rộng danh mục" và không gán type "urgent".
- Ưu tiên sử dụng mục "Tín hiệu thị trường tham khảo" nếu có để tư vấn mặt hàng mới đang lên xu hướng; khi dùng phải nêu rõ nguồn tham khảo ngắn gọn trong source_note.
- Nếu mục "Hàng sắp hết hạn SỬ DỤNG" có dòng cụ thể, phải nhắc hết hạn dùng — không được báo "không có" khi danh sách không trống.
- type phải là một trong: "urgent" (nhập gấp), "warning" (cảnh báo vốn/hạn), "opportunity" (cơ hội kinh doanh), "tip" (lời khuyên chung).
- Mỗi lời khuyên PHẢI có source_note ngắn gọn để nêu nguồn dữ liệu tin cậy.

Trả về JSON hợp lệ, ĐÚNG CẤU TRÚC SAU, KHÔNG giải thích thêm:
{
  "seasonal_trend": "1 câu mô tả xu hướng mùa và sự kiện chính sắp tới",
  "recommendations": [
    {
      "type": "warning|opportunity|tip",
      "content": "Lời khuyên ngắn gọn có số liệu",
      "source_note": "Dựa trên dữ liệu bán/tồn kho ...",
      "action": { "label": "Xử lý ngay", "route": "/manager/quick-receipt|/manager/products|/manager/reports" }
    },
    {
      "type": "warning|opportunity|tip",
      "content": "Lời khuyên ngắn gọn có số liệu",
      "source_note": "Dựa trên dữ liệu bán/tồn kho ...",
      "action": { "label": "Xử lý ngay", "route": "/manager/quick-receipt|/manager/products|/manager/reports" }
    },
    {
      "type": "warning|opportunity|tip",
      "content": "Lời khuyên ngắn gọn có số liệu",
      "source_note": "Dựa trên dữ liệu bán/tồn kho ...",
      "action": { "label": "Xử lý ngay", "route": "/manager/quick-receipt|/manager/products|/manager/reports" }
    }
  ]
}`;
}

function sanitizeChatMessage(raw) {
  let s = String(raw || '').trim();
  if (s.length > 2000) s = s.slice(0, 2000);
  return s.replace(/«|»/g, '"');
}

function truncateChatText(s, max = 3500) {
  const t = String(s || '');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Chuẩn hóa lịch sử từ client: tối đa 24 tin, chỉ user|assistant, bỏ footer hệ thống. */
function normalizeChatHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(-24)) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
    if (!role) continue;
    let content = String(item.content || '').trim();
    if (!content) continue;
    content = content.replace(/\n\n\[Phản hồi dự phòng[^\]]*\][\s\S]*$/i, '').trim();
    if (!content) continue;
    out.push({ role, content: truncateChatText(content, 3500) });
  }
  return out;
}

/**
 * Hướng dẫn hành vi chat đa lượt: bám câu cuối, tham chiếu hội thoại, không lạc chủ đề.
 * Dữ liệu kho/lễ gửi riêng mỗi request (system hoặc tin nhắn đầu).
 */
const CHAT_SYSTEM_RULES = `Bạn là chuyên gia tư vấn kho vận và kinh doanh cho tiệm tạp hóa tại Việt Nam.

TRỌNG TÂM (đa lượt):
- Luôn trả lời trọn vẹn cho CÂU HỎI / YÊU CẦU MỚI NHẤT của user (tin nhắn user cuối cùng trong cuộc hội thoại).
- Các tin nhắn trước chỉ dùng để hiểu tham chiếu: "như vậy", "ý là", "mùa lạnh đó", "những sự kiện đó", "vào mùa lạnh"… phải bám chủ đề đã thống nhất ở các lượt trước.
- KHÔNG mở đầu lại "Xin chào" hay giới thiệu bản thân nếu đã có hội thoại trước đó.
- KHÔNG lặp lại nguyên văn toàn bộ dữ liệu kho; chỉ trích phần liên quan câu hỏi cuối.
- Mặc định trả lời NGẮN GỌN và ĐÚNG TRỌNG TÂM; chỉ tách nhiều mục khi user yêu cầu rõ.
- KHÔNG tự động tạo 2 phần "nội bộ / thị trường" nếu user không yêu cầu.

DỮ LIỆU:
- Mỗi lượt, khối «DỮ LIỆU NỀN» nằm ở đầu tin nhắn user mới nhất (do hệ thống ghép vào); đó là nguồn sự thật mới nhất về kho và lịch cho yêu cầu hiện tại.
- Khi tư vấn vận hành nội bộ (nhập hàng, tồn kho, hết hạn): chỉ dùng SKU có trong khối dữ liệu.
- Khi user hỏi mở rộng thị trường/xu hướng bên ngoài: được phép đề xuất mặt hàng chưa có trong hệ thống, nhưng phải ghi rõ đó là "đề xuất tham khảo thị trường" và tách riêng với phần nội bộ.
- Hết hạn SỬ DỤNG: chỉ theo mục "Hàng sắp hết hạn SỬ DỤNG". Nếu có dòng cụ thể thì không được nói "không có".

SỰ KIỆN THEO THÁNG (dương lịch):
- Trong ngày YYYY-MM-DD, hai số MM sau năm là THÁNG dương lịch. Ví dụ 2026-06-01 là tháng 6; 2026-07-15 là tháng 7. KHÔNG nhầm "1/6" (ngày tháng) với "tháng 6" khi user hỏi "tháng 7".
- Nếu user chỉ định khoảng tháng (vd. tháng 5–9): chỉ liệt kê sự kiện có MM trong khoảng đó; không thêm tháng ngoài khoảng (vd. không 30/4 nếu chỉ hỏi từ tháng 5).
- Nếu có khối [LỌC THEO CÂU HỎI] trong tin nhắn: đó là danh sách đã lọc đúng tháng — trả lời bám khối đó (kể cả khi rỗng: nói rõ không có sự kiện trong bảng cho tháng đó).
- Dùng bảng "LỊCH SỰ KIỆN ĐÃ BIẾT" để đối chiếu khi không có khối lọc.

MÙA / CHỦ ĐỀ:
- Nếu user đang hỏi về MÙA LẠNH (hoặc tháng 10–3, hoặc tiếp nối sau khi đã nói về mùa lạnh): ưu tiên hàng phù hợp mùa lạnh / lễ thu–đông (20/10, 20/11, Trung thu, Giáng sinh, Tết… nếu nằm trong phạm vi câu hỏi). KHÔNG chuyển sang khuyên nước giải khát mùa hè, kem, hay nhắc 30/4–1/5 trừ khi user hỏi rộng cả năm hoặc hỏi rõ tháng 4–5.
- Nếu user đang hỏi về MÙA NÓNG / hè: mới nhấn mạnh nước giải khát, kem…
- Nếu user hỏi theo thời tiết MƯA/mưa nhiều: ưu tiên nhóm hàng dùng khi mưa (áo mưa, ô/dù, khăn giấy, đồ uống ấm tiện lợi, đồ ăn nhanh tại nhà); KHÔNG lái sang tư vấn nắng nóng chỉ vì bối cảnh tháng.
- Dòng "Bối cảnh mùa vụ" trong dữ liệu chỉ là gợi ý khí hậu; không dùng để lấn át chủ đề user vừa chọn (vd. user nói "vào mùa lạnh" thì không trả lời như đang tư vấn hè).

NHẬP HÀNG / TỐI ƯU DOANH SỐ:
- Gợi ý nhóm hàng phù hợp sự kiện + mùa user đang hỏi.
- Nếu dữ liệu cho thấy tồn cao một SKU (hàng tồn nhiều), cảnh báo trùng lặp / vốn đọng; không khuyên nhập thêm đúng loại đó trừ khi user hỏi riêng.

THỜI TIẾT: chỉ dùng nếu có trong dữ liệu; không bịa số đo.

THỊ TRƯỜNG MỞ RỘNG:
- Nếu khối dữ liệu có "Tín hiệu thị trường tham khảo", bạn được phép tổng hợp thêm mặt hàng chưa có trong hệ thống.
- Luôn tách rõ "nội bộ" và "tham khảo thị trường" để manager biết cái nào dựa trên dữ liệu cửa hàng, cái nào là xu hướng bên ngoài.
- Khi nêu xu hướng bên ngoài, cố gắng nhắc nguồn ngắn gọn (ví dụ: Google News/RSS live) trong câu trả lời.

TRÌNH BÀY CHO CÂU HỎI VẬN HÀNH:
- Nếu user hỏi về lợi nhuận cao nhất, khung giờ bận nhất, hoặc mặt hàng chưa có đơn 30 ngày: trả lời theo dạng BẢNG tóm tắt (cột rõ ràng), sau đó mới đưa 2-3 gợi ý hành động.
- Nếu có dữ liệu doanh thu 7 ngày: thêm một dòng "Biểu đồ mini" dạng text để người dùng nhìn xu hướng nhanh.

Định dạng: tiếng Việt, rõ ràng, gạch đầu dòng khi liệt kê. Không bọc JSON hay markdown code fence.`;

/** Trích các tháng dương lịch user nhắc tới (vd. "tháng 7", "tháng 5 đến tháng 9"). */
function parseAskedMonthsFromQuestion(text) {
  const s = String(text || '').toLowerCase();
  const months = new Set();
  let m;
  const re1 = /tháng\s*(\d{1,2})\b/gi;
  while ((m = re1.exec(s)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) months.add(n);
  }
  const rangeRe = /tháng\s*(\d{1,2})\s*(?:đến|-|tới)\s*tháng\s*(\d{1,2})/gi;
  while ((m = rangeRe.exec(s)) !== null) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    if (a > b) [a, b] = [b, a];
    for (let i = a; i <= b; i += 1) {
      if (i >= 1 && i <= 12) months.add(i);
    }
  }
  return [...months].sort((a, b) => a - b);
}

function filterYearEventsByMonths(yearEvents, monthNums) {
  if (!monthNums.length) return [];
  return yearEvents.filter((e) => {
    const d = String(e.date || '');
    if (d.length < 7) return false;
    const mm = parseInt(d.slice(5, 7), 10);
    return monthNums.includes(mm);
  });
}

/** Gợi ý có sẵn cho LLM — tránh nhầm tháng (vd. liệt kê 1/6 khi hỏi tháng 7). */
function buildMonthFilteredEventsBlock(yearEvents, monthNums) {
  if (!monthNums.length) return '';
  const filtered = filterYearEventsByMonths(yearEvents, monthNums);
  const label =
    monthNums.length === 1
      ? `tháng ${monthNums[0]} (MM=${String(monthNums[0]).padStart(2, '0')} trong YYYY-MM-DD)`
      : `các tháng ${monthNums.join(', ')}`;
  const lines = filtered.length
    ? filtered.map((e) => `- ${e.date} — ${e.name}`).join('\n')
    : '- (Không có sự kiện nào trong bảng lễ cho phạm vi tháng này — trả lời đúng như vậy; không được thêm sự kiện tháng khác.)';
  return `\n\n[LỌC THEO CÂU HỎI — Sự kiện trong ${label}:]\n${lines}`;
}

function parseWeatherIntentFromQuestion(text) {
  const s = String(text || '').toLowerCase();
  const hasRain = /(mưa|mua|áo mưa|ao mua|ẩm|am uot|ẩm ướt|ngập|ngap|mưa nhiều|mua nhieu)/i.test(s);
  const hasCold = /(lạnh|lanh|rét|ret|mùa đông|mua dong|áo ấm|ao am)/i.test(s);
  const hasHot = /(nắng|nang|nóng|nong|oi bức|oi buc|mùa hè|mua he)/i.test(s);

  if (hasRain) return 'rainy';
  if (hasCold) return 'cold';
  if (hasHot) return 'hot';
  return 'neutral';
}

function buildWeatherFocusedGuidance(intent) {
  if (intent === 'rainy') {
    return `\n\n[ƯU TIÊN THEO CÂU HỎI — THỜI TIẾT MƯA]
- User đang hỏi theo ngữ cảnh mưa nhiều. ƯU TIÊN mặt hàng phù hợp mưa/ẩm và nhu cầu đi lại ngày mưa.
- KHÔNG để "Bối cảnh mùa vụ theo tháng" lấn át intent mưa.
- Nếu nêu phần tham khảo thị trường, ưu tiên nhóm như áo mưa, ô/dù, khăn giấy, đồ uống ấm tiện lợi, đồ ăn nhanh tại nhà.
- Với phần nội bộ, chỉ đề cập SKU có trong dữ liệu nền.`;
  }
  if (intent === 'cold') {
    return `\n\n[ƯU TIÊN THEO CÂU HỎI — THỜI TIẾT LẠNH]
- User đang hỏi theo ngữ cảnh lạnh. ƯU TIÊN sản phẩm dùng trong thời tiết lạnh.
- KHÔNG chuyển sang tư vấn mùa hè trừ khi user hỏi thêm.`;
  }
  if (intent === 'hot') {
    return `\n\n[ƯU TIÊN THEO CÂU HỎI — THỜI TIẾT NÓNG]
- User đang hỏi theo ngữ cảnh nóng. ƯU TIÊN sản phẩm giải nhiệt và tiêu dùng mùa nóng.`;
  }
  return '';
}

function detectAnswerFocusStyleFromQuestion(text) {
  const s = String(text || '').toLowerCase();
  const asksBoth = /(cả 2|ca 2|cả hai|ca hai|nội bộ.*thị trường|thi truong.*noi bo|so sánh nội bộ và thị trường|so sanh noi bo va thi truong)/i.test(s);
  const asksMarketOnly = /(xu hướng|xu huong|thị trường|thi truong|mở rộng danh mục|mo rong danh muc|tham khảo bên ngoài|tham khao ben ngoai|ngoài hệ thống|ngoai he thong)/i.test(s);
  const asksInternalOnly = /(nội bộ|noi bo|trong hệ thống|trong he thong|sku|tồn kho|ton kho|hết hạn|het han|nhập hàng|nhap hang|doanh thu|lợi nhuận|loi nhuan)/i.test(s);

  if (asksBoth) return 'both';
  if (asksInternalOnly && !asksMarketOnly) return 'internal_only';
  if (asksMarketOnly && !asksInternalOnly) return 'market_only';
  return 'focused';
}

function buildAnswerFocusGuidance(style) {
  if (style === 'both') {
    return `\n\n[YÊU CẦU TRẢ LỜI — GIỮ 2 PHẦN]
- Tách rõ 2 phần: (1) Theo dữ liệu nội bộ trong hệ thống, (2) Tham khảo xu hướng thị trường mở rộng.
- Với phần (2), được phép nêu mặt hàng chưa có trong hệ thống nhưng phải ghi nhãn "tham khảo thị trường".`;
  }
  if (style === 'internal_only') {
    return `\n\n[YÊU CẦU TRẢ LỜI — CHỈ NỘI BỘ]
- Chỉ trả lời theo dữ liệu nội bộ/SKU trong hệ thống.
- Không thêm mục "tham khảo thị trường" nếu user không hỏi.
- Trả lời ngắn gọn, đi thẳng vào mặt hàng/hành động liên quan câu hỏi.`;
  }
  if (style === 'market_only') {
    return `\n\n[YÊU CẦU TRẢ LỜI — CHỈ THỊ TRƯỜNG]
- Tập trung xu hướng thị trường và gợi ý mở rộng danh mục.
- Không liệt kê chi tiết tồn kho nội bộ nếu user không yêu cầu.
- Nếu cần nhắc nội bộ thì chỉ 1 câu cảnh báo ngắn, không mở thành mục riêng.`;
  }
  return `\n\n[YÊU CẦU TRẢ LỜI — ĐÚNG TRỌNG TÂM]
- Trả lời trực tiếp câu hỏi mới nhất, ưu tiên thông tin liên quan nhất.
- KHÔNG tự động chia mục (1) nội bộ/(2) thị trường nếu user không yêu cầu.
- Không dump danh sách dài; chỉ nêu các dòng thực sự cần cho quyết định.
- Ưu tiên câu ngắn, hành động rõ ràng.`;
}

function buildChatFallbackAnswer(userMessage, { lowStock, deadStock, expiringSoon, events, yearEvents, season }) {
  const q = sanitizeChatMessage(userMessage);
  const parts = [
    '(Hiện không gọi được dịch vụ AI; dưới đây là tóm tắt nhanh từ dữ liệu kho thật.)',
  ];
  if (lowStock.length) {
    parts.push(`• Hàng cần chú ý nhập: ${lowStock.map((p) => `${p.name} (tồn ${p.stock_qty})`).slice(0, 5).join('; ')}.`);
  } else {
    parts.push('• Trong danh sách rút gọn không có mặt hàng đang dưới ngưỡng tối thiểu.');
  }
  if (expiringSoon.length) {
    parts.push(
      `• Sắp hết hạn sử dụng (30 ngày): ${expiringSoon.map((p) => `${p.name} (hạn ${formatVNDateYMD(p.expiry_date)})`).join('; ')}.`
    );
  } else {
    parts.push('• Không có mặt hàng hết hạn sử dụng trong 30 ngày tới (theo dữ liệu).');
  }
  if (deadStock.length) {
    parts.push(`• Tồn lớn cần xem xét: ${deadStock.slice(0, 3).map((p) => p.name).join(', ')}.`);
  }
  if (events.length) {
    parts.push(`• Sự kiện 30 ngày tới: ${events.slice(0, 3).map((e) => `${e.name} (${e.date})`).join(' — ')}.`);
  }
  const askedMonths = parseAskedMonthsFromQuestion(q);
  if (askedMonths.length) {
    const fev = filterYearEventsByMonths(yearEvents || [], askedMonths);
    parts.push(
      fev.length
        ? `• Sự kiện theo tháng bạn hỏi (${askedMonths.join(', ')}): ${fev.map((e) => `${e.date} ${e.name}`).join('; ')}.`
        : `• Sự kiện theo tháng bạn hỏi (${askedMonths.join(', ')}): không có mục nào trong bảng lễ cho các tháng đó.`
    );
  } else if (yearEvents && yearEvents.length) {
    parts.push(
      `• Lễ trong năm (rút gọn): ${yearEvents.slice(0, 8).map((e) => `${e.date} ${e.name}`).join('; ')}${yearEvents.length > 8 ? '…' : '.'}`
    );
  }
  parts.push(`• Bối cảnh mùa: ${season}`);
  parts.push(`• Câu hỏi: «${q}» — bật GEMINI_API_KEY hoặc OPENAI_API_KEY để trả lời chi tiết theo tháng/lọc tự động.`);
  return parts.join('\n');
}

// ─── 5. LLM Callers ──────────────────────────────────────────────────────────

/**
 * Gemini 1.5 Flash — jsonMode: JSON cho insights, false = văn bản chat.
 */
async function callGemini(prompt, { jsonMode = true } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY chưa cấu hình');

  const genConfig = {
    temperature: jsonMode ? 0.4 : 0.55,
    maxOutputTokens: jsonMode ? 512 : 900,
  };
  if (jsonMode) genConfig.responseMimeType = 'application/json';

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: genConfig,
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text) throw new Error('Gemini trả về nội dung trống');
  return text;
}

/**
 * OpenAI gpt-4o-mini qua api.ai.cc.
 */
async function callOpenAI(prompt, { jsonMode = true } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY chưa cấu hình');

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.ai.cc/v1',
    timeout: 20000,
  });

  const params = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: jsonMode ? 0.4 : 0.55,
    max_tokens: jsonMode ? 512 : 900,
  };
  if (jsonMode) params.response_format = { type: 'json_object' };

  const completion = await client.chat.completions.create(params);

  const text = completion.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenAI trả về nội dung trống');
  return text;
}

/**
 * Gemini trước → OpenAI dự phòng. llmOptions: { jsonMode?: boolean }
 */
async function callLLM(prompt, llmOptions = {}) {
  const logTag = llmOptions.jsonMode === false ? '[AI Chat]' : '[AI Insights]';

  if (process.env.GEMINI_API_KEY) {
    try {
      console.log(`${logTag} Đang gọi Gemini...`);
      return await callGemini(prompt, llmOptions);
    } catch (geminiErr) {
      console.error(`${logTag} Gemini lỗi, chuyển sang OpenAI dự phòng:`, geminiErr.message);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    console.log(`${logTag} Đang gọi OpenAI (api.ai.cc)...`);
    return await callOpenAI(prompt, llmOptions);
  }

  throw new Error('Chưa cấu hình GEMINI_API_KEY hoặc OPENAI_API_KEY');
}

/**
 * Chat đa lượt — OpenAI Chat Completions.
 * @param {{ systemText: string, history: {role:string,content:string}[], userMessage: string }} opts
 */
async function callOpenAIChat({ systemText, history, userMessage }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY chưa cấu hình');

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.ai.cc/v1',
    timeout: 45000,
  });

  const messages = [
    { role: 'system', content: systemText },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.35,
    max_tokens: 1600,
  });

  const text = completion.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenAI trả về nội dung trống');
  return text;
}

/**
 * Chat đa lượt — Gemini: systemInstruction + startChat history (user/model).
 */
async function callGeminiChat({ systemText, history, userMessage }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY chưa cấu hình');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: systemText,
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 1600,
    },
  });

  const gemHistory = [];
  for (const h of history) {
    if (h.role === 'user') {
      gemHistory.push({ role: 'user', parts: [{ text: h.content }] });
    } else if (h.role === 'assistant') {
      gemHistory.push({ role: 'model', parts: [{ text: h.content }] });
    }
  }
  while (gemHistory.length > 0 && gemHistory[0].role !== 'user') {
    gemHistory.shift();
  }

  const chat = model.startChat({ history: gemHistory });
  const result = await chat.sendMessage(userMessage);
  const text = result.response.text();
  if (!text) throw new Error('Gemini trả về nội dung trống');
  return text;
}

const CHAT_LLM_TIMEOUT_MS = 70000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} quá thời gian (${Math.round(ms / 1000)}s)`)), ms);
    }),
  ]);
}

async function callLLMChat(opts) {
  const logTag = '[AI Chat]';

  if (process.env.GEMINI_API_KEY) {
    try {
      console.log(`${logTag} Đang gọi Gemini (đa lượt)...`);
      return await withTimeout(callGeminiChat(opts), CHAT_LLM_TIMEOUT_MS, 'Gemini');
    } catch (geminiErr) {
      console.error(`${logTag} Gemini lỗi, chuyển sang OpenAI dự phòng:`, geminiErr.message);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    console.log(`${logTag} Đang gọi OpenAI (api.ai.cc, đa lượt)...`);
    return await withTimeout(callOpenAIChat(opts), CHAT_LLM_TIMEOUT_MS, 'OpenAI');
  }

  throw new Error('Chưa cấu hình GEMINI_API_KEY hoặc OPENAI_API_KEY');
}

/** Parse và validate JSON từ LLM. Fallback sang rule-based nếu parse lỗi. */
function parseLLMResponse(text, fallbackData) {
  try {
    // Strip markdown code fence nếu có
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    const validTypes = ['warning', 'opportunity', 'tip'];
    const validRoutes = new Set(['/manager/quick-receipt', '/manager/products', '/manager/reports']);

    return {
      seasonal_trend: typeof parsed.seasonal_trend === 'string' ? parsed.seasonal_trend : fallbackData.seasonal_trend,
      recommendations: recs
        .filter(r => r && typeof r.content === 'string')
        .map(r => ({
          type: (r.type === 'urgent' ? 'warning' : (validTypes.includes(r.type) ? r.type : 'tip')),
          content: r.content.slice(0, 200),
          source_note: typeof r.source_note === 'string' ? r.source_note.slice(0, 140) : '',
          action: (r.action && typeof r.action === 'object' && validRoutes.has(String(r.action.route || '')))
            ? {
              label: typeof r.action.label === 'string' ? r.action.label.slice(0, 30) : 'Xử lý ngay',
              route: String(r.action.route),
            }
            : undefined,
        }))
        .map((r) => refineRecommendationByInventory(r, fallbackData.lowStock || []))
        .slice(0, 5),
    };
  } catch {
    return null;
  }
}

function uniqByContent(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const c = String(it?.content || '').trim();
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: ['urgent', 'warning', 'opportunity', 'tip'].includes(it?.type) ? it.type : 'tip',
      content: c.slice(0, 220),
      source_note: typeof it?.source_note === 'string' ? it.source_note.slice(0, 140) : '',
      action: (it?.action && typeof it.action === 'object' && typeof it.action.route === 'string')
        ? {
          label: typeof it.action.label === 'string' ? it.action.label.slice(0, 30) : 'Xử lý ngay',
          route: it.action.route,
        }
        : undefined,
    });
  }
  return out;
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const now = new Date();
  const target = new Date(dateValue);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / 86400000);
}

function normalizeSkuToken(raw) {
  return String(raw || '').trim().toUpperCase();
}

function buildCriticalLowSkuSet(lowStock = []) {
  const critical = new Set();
  for (const p of lowStock) {
    const reorder = Number(p?.reorder_level || 0);
    const stock = Number(p?.stock_qty || 0);
    const sku = normalizeSkuToken(p?.sku);
    if (!sku) continue;
    const criticalThreshold = Math.max(10, Math.floor(reorder * 0.25));
    if (stock <= criticalThreshold) critical.add(sku);
  }
  return critical;
}

function extractSkusFromText(text) {
  const out = new Set();
  const s = String(text || '');
  const re = /SKU[:\s-]*([A-Za-z0-9_-]+)/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.add(normalizeSkuToken(m[1]));
  }
  return [...out];
}

function refineRecommendationByInventory(rec, lowStock = []) {
  if (!rec || rec.type !== 'urgent') return rec;
  const criticalSkus = buildCriticalLowSkuSet(lowStock);
  if (!criticalSkus.size) return { ...rec, type: 'tip' };
  const mentioned = extractSkusFromText(rec.content);
  if (!mentioned.length) return { ...rec, type: 'tip' };
  const hasCriticalMention = mentioned.some((sku) => criticalSkus.has(sku));
  if (!hasCriticalMention) return { ...rec, type: 'tip' };
  return rec;
}

function buildRestockDetails(lowStock = []) {
  return lowStock.slice(0, 5).map((p) => {
    const reorder = Number(p.reorder_level || 0);
    const stock = Number(p.stock_qty || 0);
    const suggested = Math.max(reorder * 2 - stock, reorder - stock, 1);
    const criticalThreshold = Math.max(10, Math.floor(reorder * 0.25));
    const isUrgent = stock <= criticalThreshold;
    return {
      type: 'warning',
      content: [
        `SKU ${p.sku || 'N/A'} - ${p.name}`,
        `Ton hien tai: ${stock}; nguong toi thieu: ${reorder}.`,
        `${isUrgent ? 'Can bo sung sớm' : 'Nen theo doi va lap ke hoach nhap'}: ~${suggested} don vi de dat muc an toan.`,
      ].join('\n'),
      source_note: `Dua tren ton kho hien tai, nguong toi thieu va nguong gap <= ${criticalThreshold}.`,
      action: {
        label: 'Xem sản phẩm',
        route: '/manager/products',
      },
    };
  });
}

function buildExpiryDetails(expiringSoon = []) {
  return expiringSoon.slice(0, 5).map((p) => {
    const d = daysUntil(p.expiry_date);
    return {
      type: 'warning',
      content: [
        `SKU ${p.sku || 'N/A'} - ${p.name}`,
        `Han su dung: ${formatVNDateYMD(p.expiry_date)} (${d != null ? `con ~${d} ngay` : 'sap den han'}).`,
        `Hanh dong: giam nhap, uu tien ban nhanh, co the gom combo/xa hang.`,
      ].join('\n'),
      source_note: 'Dua tren du lieu han su dung trong 30 ngay toi.',
      action: { label: 'Xem sản phẩm', route: '/manager/products' },
    };
  });
}

function buildDeadStockDetails(deadStock = []) {
  return deadStock.slice(0, 4).map((p) => {
    const capital = p.cost_price ? Math.round(Number(p.cost_price) * Number(p.stock_qty || 0)) : null;
    return {
      type: 'warning',
      content: [
        `SKU ${p.sku || 'N/A'} - ${p.name}`,
        `Ton cao: ${p.stock_qty}${capital ? `; von ton uoc tinh: ${capital.toLocaleString('vi-VN')}d` : ''}.`,
        'Hanh dong: dat muc khuyen mai theo tuan, han che nhap bo sung SKU nay.',
      ].join('\n'),
      source_note: 'Dua tren top SKU ton cao va gia von hien co.',
      action: { label: 'Xem báo cáo', route: '/manager/reports' },
    };
  });
}

function buildCashflowCorrelation(lowStock = [], deadStock = [], events = []) {
  if (!lowStock.length || !deadStock.length) return [];
  const urgent = lowStock[0];
  const blocked = deadStock[0];
  const blockedCapital = blocked.cost_price
    ? Math.round(Number(blocked.cost_price) * Number(blocked.stock_qty || 0))
    : null;
  const event = events[0];
  const eventText = event ? `truoc dip ${event.name} (${event.date})` : 'trong 7 ngay toi';

  return [{
    type: 'warning',
    content: [
      `Dong tien dang dong o ${blocked.name} (SKU ${blocked.sku}, ton ${blocked.stock_qty}${blockedCapital ? `, von ~${blockedCapital.toLocaleString('vi-VN')}d` : ''}).`,
      `Nen xa nhom nay de uu tien von nhap ${urgent.name} (SKU ${urgent.sku}) ${eventText}.`,
    ].join(' '),
    source_note: 'Tong hop tu ton cao + SKU can nhap gap + su kien sap toi.',
    action: { label: 'Xem báo cáo', route: '/manager/reports' },
  }];
}

function buildEventDetails(events = [], deadStock = [], expiringSoon = []) {
  const expiringSku = new Set(expiringSoon.map((p) => String(p.sku || '')));
  const promotable = deadStock.filter((p) => !expiringSku.has(String(p.sku || ''))).slice(0, 3);

  return events.slice(0, 3).map((e) => {
    const picked = promotable.slice(0, 2);
    const pickedText = picked.length
      ? picked.map((p) => `${p.name} (SKU ${p.sku}, ton ${p.stock_qty})`).join('; ')
      : 'Chua co SKU ton cao phu hop de day trong dip nay';
    const whyText = picked.length
      ? picked.map((p) => `${p.name}: ton kho dang cao, can tang toc do ban`).join(' | ')
      : 'Uu tien chon san pham co ton cao nhung chua sat han su dung';

    return {
      type: 'opportunity',
      content: [
        `Su kien: ${e.name} (${e.date})`,
        `Goi y tap trung: ${pickedText}.`,
        `Vi sao chon: ${whyText}.`,
        'Phuong an khac: neu da du ton nhom nay, chuyen sang SKU co ton cao tiep theo va giu nguyen nguyen tac chon.',
      ].join('\n'),
      source_note: 'Dua tren lich su kien va nhom SKU ton cao co the day ban.',
      action: { label: 'Xem báo cáo', route: '/manager/reports' },
    };
  });
}

/**
 * Chuẩn hóa dữ liệu insights thành nhiều "góc nhìn" để frontend hiển thị dạng tab.
 */
function composeInsightViews(baseData, context = {}) {
  const seasonalTrend = String(baseData?.seasonal_trend || context.season || '').trim();
  const baseRecs = uniqByContent(baseData?.recommendations || []);
  const { lowStock = [], deadStock = [], expiringSoon = [], events = [] } = context;
  const correlationRecs = buildCashflowCorrelation(lowStock, deadStock, events);

  const riskRecs = uniqByContent([
    ...correlationRecs,
    ...buildExpiryDetails(expiringSoon),
    ...buildDeadStockDetails(deadStock),
    ...baseRecs.filter((r) => r.type === 'warning').slice(0, 2),
  ]).slice(0, 4);

  const eventRecs = uniqByContent([
    ...buildEventDetails(events, deadStock, expiringSoon),
    ...baseRecs.filter((r) => r.type === 'opportunity' || r.type === 'tip').slice(0, 3),
  ]).slice(0, 4);

  const restockRecs = uniqByContent([
    ...buildRestockDetails(lowStock),
    ...baseRecs.filter((r) => r.type === 'warning').slice(0, 3),
  ]).slice(0, 4);

  const views = [
    {
      id: 'overview',
      title: 'Tổng quan AI',
      description: 'Bức tranh chung theo mùa vụ, tồn kho và cơ hội ngắn hạn',
      recommendations: uniqByContent([...correlationRecs, ...baseRecs]).slice(0, 5),
    },
    {
      id: 'restock',
      title: 'Kế hoạch nhập hàng',
      description: 'Nhóm mặt hàng có nguy cơ thiếu và cần bổ sung sớm',
      recommendations: restockRecs.length ? restockRecs : [{ type: 'tip', content: 'Hiện chưa có SKU dưới ngưỡng nhập lại.' }],
    },
    {
      id: 'risk',
      title: 'Rủi ro tồn kho / hạn dùng',
      description: 'Theo dõi vốn đọng và sản phẩm gần hết hạn sử dụng',
      recommendations: riskRecs.length ? riskRecs : [{ type: 'tip', content: 'Chưa ghi nhận rủi ro lớn về hạn dùng hoặc tồn đọng.' }],
    },
    {
      id: 'event',
      title: 'Cơ hội theo sự kiện',
      description: 'Gợi ý bán hàng theo dịp lễ và nhu cầu mùa',
      recommendations: eventRecs.length ? eventRecs : [{ type: 'tip', content: 'Không có sự kiện lớn trong 30 ngày tới.' }],
    },
  ];

  return {
    seasonal_trend: seasonalTrend,
    recommendations: baseRecs.slice(0, 5),
    analysis_views: views,
  };
}

/** Fallback rule-based nếu LLM lỗi hoàn toàn. */
function buildFallback({
  season, events, lowStock, deadStock, expiringSoon, marketSignals = [], businessStats = {},
}) {
  const recs = [];

  if (lowStock.length > 0) {
    recs.push({
      type: 'warning',
      content: `Kiểm tra và nhập thêm: ${lowStock.slice(0, 2).map(p => p.name).join(', ')} đang gần hết hàng.`,
      source_note: 'Dựa trên tồn kho hiện tại và ngưỡng nhập lại.',
      action: { label: 'Tạo phiếu nhập', route: '/manager/quick-receipt' },
    });
  }
  if (expiringSoon && expiringSoon.length > 0) {
    recs.push({
      type: 'warning',
      content: `Sắp hết hạn dùng: ${expiringSoon.slice(0, 2).map(p => `${p.name} (${formatVNDateYMD(p.expiry_date)})`).join(', ')} — ưu tiên bán hoặc giảm nhập.`,
      source_note: 'Dựa trên dữ liệu hạn sử dụng trong 30 ngày tới.',
      action: { label: 'Xem sản phẩm', route: '/manager/products' },
    });
  }
  if (deadStock.length > 0) {
    recs.push({
      type: 'warning',
      content: `Xem xét xả hàng: ${deadStock.slice(0, 2).map(p => p.name).join(', ')} đang tồn kho nhiều.`,
      source_note: 'Dựa trên danh sách SKU tồn kho cao.',
      action: { label: 'Xem báo cáo', route: '/manager/reports' },
    });
  }
  if (events.length > 0) {
    recs.push({
      type: 'opportunity',
      content: `Sắp có ${events[0].name} — chuẩn bị hàng phù hợp để đón dịp này.`,
      source_note: 'Dựa trên lịch sự kiện 30 ngày tới.',
      action: { label: 'Xem báo cáo', route: '/manager/reports' },
    });
  }

  while (recs.length < 3) {
    recs.push({
      type: 'tip',
      content: 'Kiểm tra tồn kho định kỳ để tối ưu vốn và tránh cháy hàng.',
      source_note: 'Dựa trên dữ liệu tồn kho hiện tại.',
      action: { label: 'Xem sản phẩm', route: '/manager/products' },
    });
  }

  const data = {
    seasonal_trend: season,
    recommendations: recs.slice(0, 3),
  };
  return composeInsightViews(data, {
    season, events, lowStock, deadStock, expiringSoon, marketSignals, businessStats,
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────
/**
 * GET /api/ai/insights
 * Query: ?refresh=1  → bỏ qua cache
 */
router.get(
  '/insights',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const storeId = req.user?.storeId ? String(req.user.storeId) : 'admin';
      const vnDateStr = getVNDateStr();
      const cacheKey = getCacheKey(storeId, vnDateStr);
      const forceRefresh = req.query.refresh === '1';

      // Trả cache nếu có và không force refresh
      if (!forceRefresh) {
        const cached = getFromCache(cacheKey);
        if (cached) {
          return res.json({
            status: 'success',
            cached: true,
            data: composeInsightViews(cached),
            generatedAt: vnDateStr,
          });
        }
      }

      // ── Build context ──
      const { m } = getVNDateParts();
      const events = getUpcomingEvents(30);
      const yearEvents = getAllYearEventsForContext();
      const season = getSeasonContext(m);

      // Lấy địa chỉ cửa hàng để dự báo thời tiết
      let city = 'Ho Chi Minh City';
      if (storeId !== 'admin' && mongoose.isValidObjectId(storeId)) {
        const store = await Store.findById(storeId).select('address').lean();
        if (store?.address) city = extractCityFromAddress(store.address);
      }

      // Parallel: thời tiết + tồn kho + tín hiệu thị trường live + dữ liệu vận hành
      const [weather, { lowStock, deadStock, expiringSoon }, liveMarketSignals, businessStats] = await Promise.all([
        fetchWeather(city),
        getInventoryContext(storeId === 'admin' ? null : storeId),
        fetchLiveMarketSignals({ city, events }),
        getBusinessConsultingContext(storeId === 'admin' ? null : storeId),
      ]);
      const marketSignals = [...getMarketSignalsByMonth(m), ...liveMarketSignals].slice(0, 8);

      const fallbackContext = {
        season, events, lowStock, deadStock, expiringSoon, marketSignals, businessStats,
      };
      const prompt = buildPrompt({
        vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon, marketSignals, businessStats,
      });

      // ── Gọi LLM ──
      let insightData;
      try {
        const llmText = await callLLM(prompt);
        insightData = parseLLMResponse(llmText, { seasonal_trend: season, lowStock });

        // Nếu parse lỗi hoặc trả về thiếu recommendations → fallback
        if (!insightData || insightData.recommendations.length === 0) {
          insightData = buildFallback(fallbackContext);
        }
      } catch (llmErr) {
        console.error('[AI Insights] LLM error:', llmErr.message);
        insightData = buildFallback(fallbackContext);
      }

      insightData = composeInsightViews(insightData, fallbackContext);

      // Cache kết quả
      setCache(cacheKey, insightData);

      return res.json({ status: 'success', cached: false, data: insightData, generatedAt: vnDateStr });
    } catch (err) {
      console.error('[AI Insights] Error:', err);
      return res.status(500).json({ status: 'error', message: err.message || 'Lỗi server' });
    }
  }
);

function stripOuterCodeFence(text) {
  let s = String(text || '').trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[\w]*\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  return s.slice(0, 4000);
}

/**
 * POST /api/ai/chat
 * Body: { "message": "...", "history": [{ "role": "user"|"assistant", "content": "..." }] }
 * history = các lượt trước tin user hiện tại (tối đa ~24 tin, server chuẩn hóa).
 * Trả về: { status, reply, source: "llm" | "fallback" }
 */
router.post(
  '/chat',
  requireAuth,
  requireRole(['manager', 'admin']),
  async (req, res) => {
    try {
      const uid = req.user?.id || 'anon';
      const now = Date.now();
      const last = chatLastAt.get(uid) || 0;
      if (now - last < CHAT_MIN_INTERVAL_MS) {
        return res.status(429).json({
          status: 'error',
          message: 'Bạn gửi quá nhanh, vui lòng đợi vài giây rồi thử lại.',
        });
      }
      chatLastAt.set(uid, now);

      const message = sanitizeChatMessage(req.body?.message);
      if (!message) {
        return res.status(400).json({ status: 'error', message: 'Vui lòng nhập nội dung câu hỏi.' });
      }

      const history = normalizeChatHistory(req.body?.history);

      const storeId = req.user?.storeId ? String(req.user.storeId) : 'admin';
      const vnDateStr = getVNDateStr();
      const { m } = getVNDateParts();
      const events = getUpcomingEvents(30);
      const yearEvents = getAllYearEventsForContext();
      const season = getSeasonContext(m);
      const marketSignalsBase = getMarketSignalsByMonth(m);

      let city = 'Ho Chi Minh City';
      if (storeId !== 'admin' && mongoose.isValidObjectId(storeId)) {
        const store = await Store.findById(storeId).select('address').lean();
        if (store?.address) city = extractCityFromAddress(store.address);
      }

      const [weather, { lowStock, deadStock, expiringSoon }, liveMarketSignals, businessStats] = await Promise.all([
        fetchWeather(city),
        getInventoryContext(storeId === 'admin' ? null : storeId),
        fetchLiveMarketSignals({ city, events }),
        getBusinessConsultingContext(storeId === 'admin' ? null : storeId),
      ]);
      const marketSignals = [...marketSignalsBase, ...liveMarketSignals].slice(0, 8);

      const ctxParams = {
        vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon, marketSignals, businessStats,
      };
      const ctx = buildContextBlock(ctxParams);
      const askedMonths = parseAskedMonthsFromQuestion(message);
      const monthBlock = buildMonthFilteredEventsBlock(yearEvents, askedMonths);
      const weatherIntent = parseWeatherIntentFromQuestion(message);
      const weatherFocusBlock = buildWeatherFocusedGuidance(weatherIntent);
      const answerFocusStyle = detectAnswerFocusStyleFromQuestion(message);
      const answerFocusBlock = buildAnswerFocusGuidance(answerFocusStyle);
      const augmentedUserMessage = `[DỮ LIỆU NỀN — cập nhật cho yêu cầu này]\n${ctx}${monthBlock}\n\nYÊU CẦU TRÌNH BÀY:
\n${answerFocusBlock}
\n${weatherFocusBlock}
\n---\nCÂU HỎI / YÊU CẦU CỦA CHỦ TIỆM:\n${message}`;

      let reply;
      let source = 'llm';
      try {
        const raw = await callLLMChat({
          systemText: CHAT_SYSTEM_RULES,
          history,
          userMessage: augmentedUserMessage,
        });
        reply = stripOuterCodeFence(raw);
        if (!reply) throw new Error('Phản hồi trống');
      } catch (chatErr) {
        console.error('[AI Chat] LLM error:', chatErr.message);
        reply = buildChatFallbackAnswer(message, {
          lowStock, deadStock, expiringSoon, events, yearEvents, season,
        });
        source = 'fallback';
      }

      return res.json({ status: 'success', reply, source });
    } catch (err) {
      console.error('[AI Chat] Error:', err);
      return res.status(500).json({ status: 'error', message: err.message || 'Lỗi server' });
    }
  }
);

module.exports = router;
