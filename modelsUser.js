const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    displayName:{
        type: String,
        required: true
    },
    /*email: {
        type: String,
        required: true,
        unique: true
    },*/
    phone: {
        type: String,
        required: true,
        unique: true
    },
    publicKey: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'online'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});
module.exports = mongoose.model('User', UserSchema);
