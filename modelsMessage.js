const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    chatId:  {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Chat', 
        required: true
    },
    senderId:{
        type:mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true
    },
    content: {
        type: String, 
        required: true
    }, // Verschüsselte Content
    timestamp: {
        type: Date, 
        default: Date.now
    }
});
module.exports = mongoose.model('Message', MessageSchema);
