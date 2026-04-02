/**
 * /api/ai/insights  — GET  — thẻ gợi ý (JSON cache theo ngày)
 * /api/ai/chat      — POST — hỏi đáp (văn bản, throttle theo user)
 *
 * Pipeline:
 *   1. calendarHelper   – ngày lễ VN cố định + sự kiện âm lịch (tính sẵn theo năm)
 *   2. weatherHelper    – OpenWeatherMap 5-day forecast (free) theo tên tỉnh thành
 *   3. inventoryHelper  – Top 5 low-stock + Top 5 dead-stock từ MongoDB
 *   4. buildPrompt / buildChatPrompt
 *   5. callLLM          – Gemini trước → OpenAI (api.ai.cc) fallback; insights=jsonMode, chat=text
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

// ─── 3. Inventory Helper ─────────────────────────────────────────────────────
async function getInventoryContext(storeId) {
  const storeFilter = storeId ? { storeId: new mongoose.Types.ObjectId(storeId) } : {};

  const [lowStock, deadStock] = await Promise.all([
    // Sắp hết hàng: tồn <= reorder_level và đang active
    Product.find({ ...storeFilter, status: 'active', $expr: { $lte: ['$stock_qty', '$reorder_level'] }, reorder_level: { $gt: 0 } })
      .select('name sku stock_qty reorder_level')
      .sort({ stock_qty: 1 })
      .limit(5)
      .lean(),

    // Vốn đọng: tồn cao, không có bán (dùng stock_qty cao + cost_price)
    Product.find({ ...storeFilter, status: 'active', stock_qty: { $gt: 10 } })
      .select('name sku stock_qty cost_price')
      .sort({ stock_qty: -1 })
      .limit(5)
      .lean(),
  ]);

  return { lowStock, deadStock };
}

// ─── 4. Context block (dùng chung insights + chat) ───────────────────────────
function buildContextBlock({ vnDateStr, events, season, weather, lowStock, deadStock }) {
  const eventsText = events.length
    ? events.map(e => `- ${e.name} (${e.date})`).join('\n')
    : '- Không có sự kiện lớn trong 30 ngày tới';

  const lowStockText = lowStock.length
    ? lowStock.map(p => `- ${p.name} (SKU: ${p.sku}): tồn ${p.stock_qty}, mức tối thiểu ${p.reorder_level}`).join('\n')
    : '- Không có mặt hàng sắp hết';

  const deadStockText = deadStock.length
    ? deadStock.map(p => `- ${p.name} (SKU: ${p.sku}): tồn ${p.stock_qty} ${p.cost_price ? `(vốn ~${(p.stock_qty * p.cost_price).toLocaleString('vi-VN')}đ)` : ''}`).join('\n')
    : '- Không có hàng tồn nhiều bất thường';

  const weatherLine = weather ? `Thời tiết 24-48h tới: ${weather}` : '';

  return `Ngày hôm nay: ${vnDateStr}
Bối cảnh mùa vụ: ${season}
${weatherLine}

Sự kiện / ngày lễ sắp tới (30 ngày):
${eventsText}

Hàng sắp hết kho (cần nhập gấp):
${lowStockText}

Hàng tồn nhiều (rủi ro vốn đọng):
${deadStockText}`;
}

function buildPrompt({ vnDateStr, events, season, weather, lowStock, deadStock }) {
  const ctx = buildContextBlock({ vnDateStr, events, season, weather, lowStock, deadStock });

  return `Bạn là chuyên gia tư vấn kho vận và kinh doanh cho tiệm tạp hóa tại Việt Nam.

${ctx}

NHIỆM VỤ: Dựa CHÍNH XÁC vào dữ liệu trên, đưa ra 3 lời khuyên thực tế cho chủ tiệm.
- Mỗi lời khuyên tối đa 25 từ, ngắn gọn, hành động rõ ràng.
- Chỉ đề cập mặt hàng/SKU có trong dữ liệu trên. Nếu không có SKU cụ thể thì nói theo nhóm hàng phù hợp mùa/sự kiện.
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

function buildChatPrompt(ctxParams, userMessage) {
  const ctx = buildContextBlock(ctxParams);
  const q = sanitizeChatMessage(userMessage);
  return `Bạn là chuyên gia tư vấn kho vận và kinh doanh cho tiệm tạp hóa tại Việt Nam.

DỮ LIỆU NỀN (nguồn sự thật — chỉ được dùng số liệu kho/SKU có trong danh sách dưới đây, không được bịa tên sản phẩm không có):
${ctx}

CÂU HỎI CỦA CHỦ TIỆM:
«${q}»

YÊU CẦU TRẢ LỜI:
- Viết bằng tiếng Việt, rõ ràng, tối đa khoảng 8–12 câu (hoặc gạch đầu dòng).
- Ưu tiên trả lời đúng trọng tâm câu hỏi, kết hợp dữ liệu kho và sự kiện/mùa vụ nếu liên quan.
- Không bịa nhiệt độ hay số liệu ngoài phần "Thời tiết" đã cho (nếu trống thì nói chung về mùa).
- Nếu câu hỏi không liên quan nhập hàng / kho / bán lẻ tạp hóa, từ chối lịch sự và nhắc lại vai trò của bạn.
- Chỉ trả về nội dung trả lời thuần văn bản, KHÔNG bọc JSON, KHÔNG bọc markdown code fence.`;
}

function buildChatFallbackAnswer(userMessage, { lowStock, deadStock, events, season }) {
  const q = sanitizeChatMessage(userMessage);
  const parts = [
    '(Hiện không gọi được dịch vụ AI; dưới đây là tóm tắt nhanh từ dữ liệu kho thật.)',
  ];
  if (lowStock.length) {
    parts.push(`• Hàng cần chú ý nhập: ${lowStock.map((p) => `${p.name} (tồn ${p.stock_qty})`).slice(0, 5).join('; ')}.`);
  } else {
    parts.push('• Trong danh sách rút gọn không có mặt hàng đang dưới ngưỡng tối thiểu.');
  }
  if (deadStock.length) {
    parts.push(`• Tồn lớn cần xem xét: ${deadStock.slice(0, 3).map((p) => p.name).join(', ')}.`);
  }
  if (events.length) {
    parts.push(`• Sự kiện sắp tới: ${events.slice(0, 2).map((e) => `${e.name} (${e.date})`).join(' — ')}.`);
  }
  parts.push(`• Bối cảnh mùa: ${season}`);
  parts.push(`• Câu hỏi của bạn: «${q}» — để được trả lời chi tiết theo ý hỏi, hãy bật GEMINI_API_KEY hoặc OPENAI_API_KEY trên server.`);
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
function buildFallback({ season, events, lowStock, deadStock }) {
  const recs = [];

  if (lowStock.length > 0) {
    recs.push({
      type: 'urgent',
      content: `Kiểm tra và nhập thêm: ${lowStock.slice(0, 2).map(p => p.name).join(', ')} đang gần hết hàng.`,
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
      const season = getSeasonContext(m);

      // Lấy địa chỉ cửa hàng để dự báo thời tiết
      let city = 'Ho Chi Minh City';
      if (storeId !== 'admin' && mongoose.isValidObjectId(storeId)) {
        const store = await Store.findById(storeId).select('address').lean();
        if (store?.address) city = extractCityFromAddress(store.address);
      }

      // Parallel: thời tiết + tồn kho
      const [weather, { lowStock, deadStock }] = await Promise.all([
        fetchWeather(city),
        getInventoryContext(storeId === 'admin' ? null : storeId),
      ]);

      const fallbackContext = { season, events, lowStock, deadStock };
      const prompt = buildPrompt({ vnDateStr, events, season, weather, lowStock, deadStock });

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
 * Body: { "message": "..." }
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

      const storeId = req.user?.storeId ? String(req.user.storeId) : 'admin';
      const vnDateStr = getVNDateStr();
      const { m } = getVNDateParts();
      const events = getUpcomingEvents(30);
      const season = getSeasonContext(m);

      let city = 'Ho Chi Minh City';
      if (storeId !== 'admin' && mongoose.isValidObjectId(storeId)) {
        const store = await Store.findById(storeId).select('address').lean();
        if (store?.address) city = extractCityFromAddress(store.address);
      }

      const [weather, { lowStock, deadStock }] = await Promise.all([
        fetchWeather(city),
        getInventoryContext(storeId === 'admin' ? null : storeId),
      ]);

      const ctxParams = { vnDateStr, events, season, weather, lowStock, deadStock };
      const prompt = buildChatPrompt(ctxParams, message);

      let reply;
      let source = 'llm';
      try {
        const raw = await callLLM(prompt, { jsonMode: false });
        reply = stripOuterCodeFence(raw);
        if (!reply) throw new Error('Phản hồi trống');
      } catch (chatErr) {
        console.error('[AI Chat] LLM error:', chatErr.message);
        reply = buildChatFallbackAnswer(message, { lowStock, deadStock, events, season });
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
