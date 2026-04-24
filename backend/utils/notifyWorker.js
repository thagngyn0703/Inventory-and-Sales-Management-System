/**
 * notifyWorker.js
 * Xử lý hàng đợi CustomerOutboxMessage: lấy tin queued, gửi qua provider, cập nhật status.
 * Được gọi inline sau khi tạo job (không cần cron riêng cho V1).
 */

const CustomerOutboxMessage = require('../models/CustomerOutboxMessage');
const Customer = require('../models/Customer');
const { dispatchMessage } = require('./notifyProviders');
const { renderMessageText } = require('./notifyTemplates');

/**
 * Xử lý 1 job cụ thể.
 * @param {string|ObjectId} jobId
 * @returns {{ success: boolean, channel?: string, error?: string }}
 */
async function processJob(jobId) {
    const job = await CustomerOutboxMessage.findById(jobId).lean();
    if (!job) return { success: false, error: 'Job not found' };
    if (job.status === 'sent') return { success: true, channel: job.sent_channel, alreadySent: true };
    if (job.attempt >= job.max_attempts) {
        await CustomerOutboxMessage.updateOne({ _id: jobId }, { $set: { status: 'failed', error_message: 'Max attempts exceeded' } });
        return { success: false, error: 'Max attempts exceeded' };
    }

    // Lấy SĐT khách
    const customer = await Customer.findById(job.customer_id).select('phone full_name').lean();
    if (!customer?.phone) {
        await CustomerOutboxMessage.updateOne({ _id: jobId }, { $set: { status: 'skipped', error_message: 'No phone number' } });
        return { success: false, error: 'Customer has no phone number' };
    }

    // Render nội dung nếu chưa có
    const messageText = job.message_text || renderMessageText(job.type, job.payload || {});

    // Đánh dấu processing
    await CustomerOutboxMessage.updateOne(
        { _id: jobId },
        { $set: { status: 'processing' }, $inc: { attempt: 1 } }
    );

    const result = await dispatchMessage({
        phone: customer.phone,
        message: messageText,
        channels: job.channels || ['ZALO', 'SMS'],
    });

    if (result.success) {
        await CustomerOutboxMessage.updateOne(
            { _id: jobId },
            {
                $set: {
                    status: 'sent',
                    sent_channel: result.channel,
                    sent_at: new Date(),
                    provider_response: result,
                    error_message: '',
                },
            }
        );
        return { success: true, channel: result.channel };
    } else {
        const isFinal = (job.attempt + 1) >= job.max_attempts;
        await CustomerOutboxMessage.updateOne(
            { _id: jobId },
            {
                $set: {
                    status: isFinal ? 'failed' : 'queued',
                    error_message: result.error || 'Unknown error',
                    provider_response: result,
                },
            }
        );
        return { success: false, error: result.error };
    }
}

/**
 * Tạo job mới + gửi ngay.
 * @param {object} opts
 * @returns {{ job: object, sendResult: object }}
 */
async function createAndSend({ storeId, customerId, type, payload, channels, messageText, referenceModel, referenceId, createdBy, idempotencyKey }) {
    // Kiểm tra spam guard (24h)
    if (idempotencyKey) {
        const existing = await CustomerOutboxMessage.findOne({ idempotency_key: idempotencyKey }).lean();
        if (existing) {
            return {
                job: existing,
                sendResult: { success: existing.status === 'sent', alreadySent: true, channel: existing.sent_channel },
            };
        }
    }

    const builtText = messageText || renderMessageText(type, payload || {});

    const job = await CustomerOutboxMessage.create({
        store_id: storeId,
        customer_id: customerId,
        type,
        channels: channels || ['ZALO', 'SMS'],
        payload: payload || {},
        message_text: builtText,
        status: 'queued',
        idempotency_key: idempotencyKey || '',
        reference_model: referenceModel || '',
        reference_id: referenceId || null,
        created_by: createdBy || null,
    });

    const sendResult = await processJob(job._id);
    return { job, sendResult };
}

module.exports = { processJob, createAndSend };
