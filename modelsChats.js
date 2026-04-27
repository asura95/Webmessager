const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  type: { type: String, enum: ["private", "group"], required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Liste der Teilnehmer
  groupName: { type: String }, // Für Gruppenchats
  adminId: { type: mongoose.Schema.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model("Chat", ChatSchema);
