/**
 * notifyProviders.js
 * Adapter gửi SMS / Zalo theo provider thật.
 *
 * Env vars cần thêm vào .env:
 *   ESMS_API_KEY=...          (từ esms.vn)
 *   ESMS_SECRET_KEY=...
 *   ESMS_BRAND_NAME=...       (tên thương hiệu đã đăng ký)
 *   ZALO_OA_ACCESS_TOKEN=...  (từ Zalo OA → Thiết lập → Quản lý access token)
 *   NOTIFY_DRY_RUN=true       (đặt true khi dev/test để không gửi thật)
 */

const DRY_RUN = String(process.env.NOTIFY_DRY_RUN || '').toLowerCase() === 'true';

// ─── Normalize số điện thoại VN ─────────────────────────────────────────────
function normalizeVN(phone) {
    const raw = String(phone || '').replace(/\D/g, '');
    if (raw.startsWith('84') && raw.length === 11) return raw; // 849xxxxxxxx
    if (raw.startsWith('0') && (raw.length === 10 || raw.length === 11)) {
        return '84' + raw.slice(1);
    }
    return raw;
}

function isValidVNPhone(phone) {
    const n = normalizeVN(phone);
    return /^84[3-9]\d{8}$/.test(n);
}

// ─── eSMS adapter ────────────────────────────────────────────────────────────
async function sendSMS({ phone, message }) {
    const normalized = normalizeVN(phone);
    if (!isValidVNPhone(normalized)) {
        return { success: false, error: `Số điện thoại không hợp lệ: ${phone}` };
    }

    if (DRY_RUN) {
        console.log(`[NOTIFY DRY-RUN] SMS → ${normalized}: ${message.slice(0, 80)}...`);
        return { success: true, provider: 'esms', provider_message_id: `dry-${Date.now()}` };
    }

    const apiKey = process.env.ESMS_API_KEY || '';
    const secretKey = process.env.ESMS_SECRET_KEY || '';
    const brandName = process.env.ESMS_BRAND_NAME || '';

    if (!apiKey || !secretKey) {
        return { success: false, error: 'Chưa cấu hình ESMS_API_KEY / ESMS_SECRET_KEY trong .env' };
    }

    try {
        // SmsType '2' = Brandname (cần đăng ký tên thương hiệu)
        // SmsType '4' = Đầu số cố định (một số tài khoản không hỗ trợ)
        // SmsType '8' = Đầu số ngẫu nhiên (hầu hết tài khoản đều dùng được, rẻ nhất)
        // Ưu tiên: nếu có brandname → type 2, không → type 8 (fallback phổ quát nhất)
        const hasBrandname = Boolean(brandName);
        // Cho phép override qua env ESMS_SMS_TYPE nếu cần
        const smsType = process.env.ESMS_SMS_TYPE || (hasBrandname ? '2' : '8');
        const body = {
            ApiKey: apiKey,
            SecretKey: secretKey,
            Phone: normalized,
            Content: message,
            SmsType: smsType,
            ...(hasBrandname ? { Brandname: brandName } : {}),
            IsUnicode: '0',
        };
        const res = await fetch('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        console.log(`[eSMS] Phone=${normalized} SmsType=${body.SmsType} CodeResult=${data?.CodeResult} SMSID=${data?.SMSID} Balance=${data?.Balance} Err=${data?.ErrorMessage}`);
        if (data?.CodeResult === '100') {
            return { success: true, provider: 'esms', provider_message_id: String(data?.SMSID || '') };
        }
        return { success: false, error: data?.ErrorMessage || `eSMS lỗi mã ${data?.CodeResult}` };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ─── Zalo OA adapter ─────────────────────────────────────────────────────────
// Dùng Zalo OA API gửi tin nhắn qua phone (yêu cầu khách đã nhắn tin OA ít nhất 1 lần trước).
// Nếu chưa follow OA: trả not_followed, frontend sẽ fallback sang SMS.
async function sendZaloOA({ phone, message }) {
    const normalized = normalizeVN(phone);
    if (!isValidVNPhone(normalized)) {
        return { success: false, error: `Số điện thoại không hợp lệ: ${phone}` };
    }

    const accessToken = process.env.ZALO_OA_ACCESS_TOKEN || '';
    if (!accessToken) {
        return { success: false, error: 'Chưa cấu hình ZALO_OA_ACCESS_TOKEN trong .env' };
    }

    if (DRY_RUN) {
        console.log(`[NOTIFY DRY-RUN] Zalo OA → ${normalized}: ${message.slice(0, 80)}...`);
        return { success: true, provider: 'zalo_oa', provider_message_id: `dry-${Date.now()}` };
    }

    try {
        // Bước 1: lấy user_id Zalo từ số điện thoại
        const lookupRes = await fetch(
            `https://openapi.zalo.me/v2.0/oa/getprofile?access_token=${accessToken}&phone=${normalized}`,
            { method: 'GET' }
        );
        const lookupData = await lookupRes.json();
        if (lookupData?.error !== 0) {
            return {
                success: false,
                error: 'not_followed',
                detail: lookupData?.message || 'Khách chưa quan tâm Zalo OA',
            };
        }
        const zaloUserId = lookupData?.data?.user_id;
        if (!zaloUserId) {
            return { success: false, error: 'not_followed', detail: 'Không tìm thấy user_id Zalo' };
        }

        // Bước 2: gửi tin nhắn văn bản
        const sendRes = await fetch('https://openapi.zalo.me/v2.0/oa/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                access_token: accessToken,
            },
            body: JSON.stringify({
                recipient: { user_id: zaloUserId },
                message: { text: message },
            }),
        });
        const sendData = await sendRes.json();
        if (sendData?.error === 0) {
            return {
                success: true,
                provider: 'zalo_oa',
                provider_message_id: String(sendData?.data?.message_id || ''),
            };
        }
        return { success: false, error: sendData?.message || `Zalo OA error: ${sendData?.error}` };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ─── Dispatcher: thử Zalo trước, fallback SMS ────────────────────────────────
async function dispatchMessage({ phone, message, channels = ['ZALO', 'SMS'] }) {
    let lastResult = null;

    for (const channel of channels) {
        if (channel === 'ZALO') {
            const r = await sendZaloOA({ phone, message });
            if (r.success) return { ...r, channel: 'ZALO' };
            // not_followed hoặc lỗi cấu hình → fallback sang SMS
            lastResult = { ...r, channel: 'ZALO' };
            console.warn(`[NOTIFY] Zalo failed (${r.error}), trying next channel...`);
        } else if (channel === 'SMS') {
            const r = await sendSMS({ phone, message });
            if (r.success) return { ...r, channel: 'SMS' };
            lastResult = { ...r, channel: 'SMS' };
            console.warn(`[NOTIFY] SMS failed (${r.error})`);
        }
    }

    return lastResult || { success: false, error: 'No channel available', channel: null };
}

module.exports = {
    normalizeVN,
    isValidVNPhone,
    sendSMS,
    sendZaloOA,
    dispatchMessage,
};
