const { Schema, model } = require('mongoose');

const backupRestoreJobSchema = new Schema(
    {
        created_by: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        job_type: {
            type: String,
            required: true,
            enum: ['backup', 'restore'],
        },
        status: {
            type: String,
            required: true,
            enum: ['pending', 'in_progress', 'completed', 'failed'],
            default: 'pending',
        },
        storage_path: {
            type: String,
        },
        created_at: {
            type: Date,
            default: Date.now,
        },
        finished_at: {
            type: Date,
        },
    },
    {
        timestamps: false,
    }
);

module.exports = model('BackupRestoreJob', backupRestoreJobSchema);
