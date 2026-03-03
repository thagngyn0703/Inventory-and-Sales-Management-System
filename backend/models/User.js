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
            enum: ['user', 'admin', 'manager', 'warehouse', 'sales'],
            default: 'user',
        },
    },
    { timestamps: true }
);


module.exports = model('User', userSchema);