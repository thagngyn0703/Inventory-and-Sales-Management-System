const { Schema, model } = require('mongoose');


const userSchema = new Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            enum: ['admin', 'manager', 'staff'],
            required: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        storeId: {
            type: Schema.Types.ObjectId,
            ref: 'Store',
            default: null,
            index: true,
        },
    },
    { timestamps: true }
);


module.exports = model('User', userSchema);
