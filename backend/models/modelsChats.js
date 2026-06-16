const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
    user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role:      { type: String, enum: ["founder", "admin", "moderator", "member"], default: "member" },
    joinedAt:  { type: Date, default: Date.now },
    leftAt:    { type: Date, default: null },
    clearedAt: { type: Date, default: null },
    mutedUntil:{ type: Date, default: null }
}, { _id: false });

const ChatSchema = new mongoose.Schema({
    type:      { type: String, enum: ["private", "group"], required: true },
    members:   [memberSchema],
    groupName: { type: String },
    adminId:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Chat", ChatSchema);