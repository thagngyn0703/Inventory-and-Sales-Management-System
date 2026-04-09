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
function buildContextBlock({ vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon }) {
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
${deadStockText}`;
}

function buildPrompt({ vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon }) {
  const ctx = buildContextBlock({ vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon });

  return `Bạn là chuyên gia tư vấn kho vận và kinh doanh cho tiệm tạp hóa tại Việt Nam.

${ctx}

NHIỆM VỤ: Dựa CHÍNH XÁC vào dữ liệu trên, đưa ra 3 lời khuyên thực tế cho chủ tiệm.
- Mỗi lời khuyên tối đa 25 từ, ngắn gọn, hành động rõ ràng.
- Chỉ đề cập mặt hàng/SKU có trong dữ liệu trên. Nếu không có SKU cụ thể thì nói theo nhóm hàng phù hợp mùa/sự kiện.
- Nếu mục "Hàng sắp hết hạn SỬ DỤNG" có dòng cụ thể, phải nhắc hết hạn dùng — không được báo "không có" khi danh sách không trống.
- type phải là một trong: "urgent" (nhập gấp), "warning" (cảnh báo vốn/hạn), "opportunity" (cơ hội kinh doanh), "tip" (lời khuyên chung).

Trả về JSON hợp lệ, ĐÚNG CẤU TRÚC SAU, KHÔNG giải thích thêm:
{
  "seasonal_trend": "1 câu mô tả xu hướng mùa và sự kiện chính sắp tới",
  "recommendations": [
    { "type": "urgent|warning|opportunity|tip", "content": "Lời khuyên ngắn gọn" },
    { "type": "urgent|warning|opportunity|tip", "content": "Lời khuyên ngắn gọn" },
    { "type": "urgent|warning|opportunity|tip", "content": "Lời khuyên ngắn gọn" }
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

DỮ LIỆU:
- Mỗi lượt, khối «DỮ LIỆU NỀN» nằm ở đầu tin nhắn user mới nhất (do hệ thống ghép vào); đó là nguồn sự thật mới nhất về kho và lịch cho yêu cầu hiện tại.
- Chỉ khẳng định tên sản phẩm/SKU có trong khối đó. Không bịa mặt hàng.
- Hết hạn SỬ DỤNG: chỉ theo mục "Hàng sắp hết hạn SỬ DỤNG". Nếu có dòng cụ thể thì không được nói "không có".

SỰ KIỆN THEO THÁNG (dương lịch):
- Trong ngày YYYY-MM-DD, hai số MM sau năm là THÁNG dương lịch. Ví dụ 2026-06-01 là tháng 6; 2026-07-15 là tháng 7. KHÔNG nhầm "1/6" (ngày tháng) với "tháng 6" khi user hỏi "tháng 7".
- Nếu user chỉ định khoảng tháng (vd. tháng 5–9): chỉ liệt kê sự kiện có MM trong khoảng đó; không thêm tháng ngoài khoảng (vd. không 30/4 nếu chỉ hỏi từ tháng 5).
- Nếu có khối [LỌC THEO CÂU HỎI] trong tin nhắn: đó là danh sách đã lọc đúng tháng — trả lời bám khối đó (kể cả khi rỗng: nói rõ không có sự kiện trong bảng cho tháng đó).
- Dùng bảng "LỊCH SỰ KIỆN ĐÃ BIẾT" để đối chiếu khi không có khối lọc.

MÙA / CHỦ ĐỀ:
- Nếu user đang hỏi về MÙA LẠNH (hoặc tháng 10–3, hoặc tiếp nối sau khi đã nói về mùa lạnh): ưu tiên hàng phù hợp mùa lạnh / lễ thu–đông (20/10, 20/11, Trung thu, Giáng sinh, Tết… nếu nằm trong phạm vi câu hỏi). KHÔNG chuyển sang khuyên nước giải khát mùa hè, kem, hay nhắc 30/4–1/5 trừ khi user hỏi rộng cả năm hoặc hỏi rõ tháng 4–5.
- Nếu user đang hỏi về MÙA NÓNG / hè: mới nhấn mạnh nước giải khát, kem…
- Dòng "Bối cảnh mùa vụ" trong dữ liệu chỉ là gợi ý khí hậu; không dùng để lấn át chủ đề user vừa chọn (vd. user nói "vào mùa lạnh" thì không trả lời như đang tư vấn hè).

NHẬP HÀNG / TỐI ƯU DOANH SỐ:
- Gợi ý nhóm hàng phù hợp sự kiện + mùa user đang hỏi.
- Nếu dữ liệu cho thấy tồn cao một SKU (hàng tồn nhiều), cảnh báo trùng lặp / vốn đọng; không khuyên nhập thêm đúng loại đó trừ khi user hỏi riêng.

THỜI TIẾT: chỉ dùng nếu có trong dữ liệu; không bịa số đo.

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
    const validTypes = ['urgent', 'warning', 'opportunity', 'tip'];

    return {
      seasonal_trend: typeof parsed.seasonal_trend === 'string' ? parsed.seasonal_trend : fallbackData.seasonal_trend,
      recommendations: recs
        .filter(r => r && typeof r.content === 'string')
        .map(r => ({
          type: validTypes.includes(r.type) ? r.type : 'tip',
          content: r.content.slice(0, 200),
        }))
        .slice(0, 5),
    };
  } catch {
    return null;
  }
}

/** Fallback rule-based nếu LLM lỗi hoàn toàn. */
function buildFallback({ season, events, lowStock, deadStock, expiringSoon }) {
  const recs = [];

  if (lowStock.length > 0) {
    recs.push({
      type: 'urgent',
      content: `Kiểm tra và nhập thêm: ${lowStock.slice(0, 2).map(p => p.name).join(', ')} đang gần hết hàng.`,
    });
  }
  if (expiringSoon && expiringSoon.length > 0) {
    recs.push({
      type: 'warning',
      content: `Sắp hết hạn dùng: ${expiringSoon.slice(0, 2).map(p => `${p.name} (${formatVNDateYMD(p.expiry_date)})`).join(', ')} — ưu tiên bán hoặc giảm nhập.`,
    });
  }
  if (deadStock.length > 0) {
    recs.push({
      type: 'warning',
      content: `Xem xét xả hàng: ${deadStock.slice(0, 2).map(p => p.name).join(', ')} đang tồn kho nhiều.`,
    });
  }
  if (events.length > 0) {
    recs.push({
      type: 'opportunity',
      content: `Sắp có ${events[0].name} — chuẩn bị hàng phù hợp để đón dịp này.`,
    });
  }

  while (recs.length < 3) {
    recs.push({ type: 'tip', content: 'Kiểm tra tồn kho định kỳ để tối ưu vốn và tránh cháy hàng.' });
  }

  return {
    seasonal_trend: season,
    recommendations: recs.slice(0, 3),
  };
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
          return res.json({ status: 'success', cached: true, data: cached, generatedAt: vnDateStr });
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

      // Parallel: thời tiết + tồn kho
      const [weather, { lowStock, deadStock, expiringSoon }] = await Promise.all([
        fetchWeather(city),
        getInventoryContext(storeId === 'admin' ? null : storeId),
      ]);

      const fallbackContext = { season, events, lowStock, deadStock, expiringSoon };
      const prompt = buildPrompt({
        vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon,
      });

      // ── Gọi LLM ──
      let insightData;
      try {
        const llmText = await callLLM(prompt);
        insightData = parseLLMResponse(llmText, { seasonal_trend: season });

        // Nếu parse lỗi hoặc trả về thiếu recommendations → fallback
        if (!insightData || insightData.recommendations.length === 0) {
          insightData = buildFallback(fallbackContext);
        }
      } catch (llmErr) {
        console.error('[AI Insights] LLM error:', llmErr.message);
        insightData = buildFallback(fallbackContext);
      }

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

      let city = 'Ho Chi Minh City';
      if (storeId !== 'admin' && mongoose.isValidObjectId(storeId)) {
        const store = await Store.findById(storeId).select('address').lean();
        if (store?.address) city = extractCityFromAddress(store.address);
      }

      const [weather, { lowStock, deadStock, expiringSoon }] = await Promise.all([
        fetchWeather(city),
        getInventoryContext(storeId === 'admin' ? null : storeId),
      ]);

      const ctxParams = {
        vnDateStr, events, yearEvents, season, weather, lowStock, deadStock, expiringSoon,
      };
      const ctx = buildContextBlock(ctxParams);
      const askedMonths = parseAskedMonthsFromQuestion(message);
      const monthBlock = buildMonthFilteredEventsBlock(yearEvents, askedMonths);
      const augmentedUserMessage = `[DỮ LIỆU NỀN — cập nhật cho yêu cầu này; chỉ dùng SKU có liệt kê, không bịa tên]\n${ctx}${monthBlock}\n\n---\nCÂU HỎI / YÊU CẦU CỦA CHỦ TIỆM:\n${message}`;

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
