const mqtt = require("mqtt");
const CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
const Message = require("./modelsMessage");

mongoose.connect("mongodb://localhost:27017/chat_app_db");

const client = mqtt.connect("mqtt://localhost:1883");
const secretKey = "meim-super-sicheres-passwort-123";

client.subscribe("chats/507f191e810c19729de860ea/messages");

client.on("message", async (topic, message) => {
  const paket = JSON.parse(message.toString());

  for (const msg of paket.messages) {
    const senderVonNachricht = msg.senderId;
    const indexVonNachricht = msg.index;

    const dynamicKey = secretKey + senderVonNachricht + indexVonNachricht;
    const bytes = CryptoJS.AES.decrypt(msg.content, dynamicKey);
    const klartext = bytes.toString(CryptoJS.enc.Utf8);

    console.log(`Empfangen & entschlüsselt (Index ${msg.index}): ${klartext}`);

    const neueNachricht = new Message(msg);
    await neueNachricht.save();
    console.log(`Nachricht ${msg.index} wurde in MongoDB gespeichert.`);
  }

  /*const liste = paket.messages;
    liste.forEach((msg) => {
        const geheimnis = msg.content;
        const index = msg.index;

        const dynamischerKey = secretKey + index;

        const bytes = CryptoJS.AES.decrypt(geheimnis, dynamischerKey);
        const klartext = bytes.toString(CryptoJS.enc.Utf8);

        console.log("Nachricht Nr. " + index + " (mit Key-Index " + index + "): " + klartext);
    }); */
});
