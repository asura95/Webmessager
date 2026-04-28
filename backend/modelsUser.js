const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  displayName: {type: String, required: true,},
  mail: {type: String,sparse: true,unique: true,},
  phone: {type: String,sparse: true,unique: true,},
  password: {type: String, required: true},
  publicKey: {type: String,required: true,},
  status: {type: String,default: "online",},
  createdAt: {type: Date,default: Date.now,},
});
module.exports = mongoose.model("User", UserSchema);
