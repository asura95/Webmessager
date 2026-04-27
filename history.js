const mqtt = require("mqtt");
const CryptoJS = require("crypto-js");
const client = mqtt.connect("mqtt://localhost:1883");

const Message = require("./modelsMessage");
const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/chat_app_db");

const secretKey = "meim-super-sicheres-passwort-123";

client.on("connect", async () => {
  const alleNachrichten = await Message.find({
    chatId: "507f191e810c19729de860ea",
  }).sort({ index: 1 });
  for (const msg of alleNachrichten) {
    try {
      const senderVonNachricht = msg.senderId;
      const indexVonNachricht = msg.index;

      const dynamicKey =
        secretKey + senderVonNachricht.toString() + indexVonNachricht;
      const bytes = CryptoJS.AES.decrypt(msg.content, dynamicKey);
      const klartext = bytes.toString(CryptoJS.enc.Utf8);

      let name = msg.name;
      if (!klartext) {
        console.log(
          `[Index ${indexVonNachricht}] Fehler: Nachricht konnte nicht gelesen werden! (falscher Key?).`,
        );
      } else {
        console.log(`[Index ${indexVonNachricht}] ${name}: ${klartext}`);
      }
    } catch (error) {
      console.log("Error! Fehler beim entschlüsseln!", error);
    }
  }
  console.log("--- Ende der Historie ---");
  mongoose.connection.close();
  process.exit();
});
