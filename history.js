const mqtt = require("mqtt");
const CryptoJS = require("crypto-js");
const client = mqtt.connect("mqtt://localhost:1883");
const readline = require("readline");
const mongoose = require("mongoose");

const Message = require("./modelsMessage");
const User = require("./modelsUser");
const { getOrCreateChat } = require("./chatService");
const { stdin, stdout } = require("process");

const secretKey = "meim-super-sicheres-passwort-123";

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
});

async function main() {
  mongoose.connect("mongodb://localhost:27017/chat_app_db");
  console.log("Datenbank verbunden.");

  rl.question("Deine E-Mail/Telefon: ", async (kontakt) => {
    const ich = await User.findOne({
      $or: [{ mail: kontakt }, { phone: kontakt }],
    });

    rl.question("Partner Email/Telefon: ", async (kontaktPartner) => {
      const partner = await User.findOne({
        $or: [{ mail: kontaktPartner }, { phone: kontaktPartner }],
      });

      if (!ich || !partner) {
        console.log("Einer der Nutzer wurde nicht gefunden!");
        process.exit();
      }
      const chat = await getOrCreateChat(
        ich._id.toString(),
        partner._id.toString(),
      );

      console.log(`\n--- Verlauf für Chat: ${chat._id} ---`);

      // 4. Nur Nachrichten für diesen Chat laden
      const alleNachrichten = await Message.find({ chatId: chat._id }).sort({
        index: 1,
      });

      for (const msg of alleNachrichten) {
        const dynamicKey = secretKey + msg.senderId.toString() + msg.index;
        try {
          const bytes = CryptoJS.AES.decrypt(msg.content, dynamicKey);
          const klartext = bytes.toString(CryptoJS.enc.Utf8);

          if (klartext) {
            console.log(`[${msg.index}] ${msg.name}: ${klartext}`);
          } else {
            console.log(
              `[${msg.index}] ${msg.name}: (Entschlüsselung fehlgeschlagen)`,
            );
          }
        } catch (e) {
          console.log(`[${msg.index}] Fehler beim Lesen dieser Nachricht.`);
        }
      }

      console.log("--- Ende der Historie ---");
      mongoose.connection.close();
      process.exit();
    });
  });
}

main();
