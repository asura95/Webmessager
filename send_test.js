const mqtt = require("mqtt");
const CryptoJS = require("crypto-js");
const client = mqtt.connect("mqtt://localhost:1883");

const User = require("./modelsUser");
const Message = require("./modelsMessage");
const mongoose = require("mongoose");

const secretKey = "meim-super-sicheres-passwort-123";
const readline = require("readline");

const { getOrCreateChat } = require("./chatService");
const { resolve } = require("dns");

const aliceID = "507f1f77bcf86cd799439011";
const bobID = "507f191e810c19729de860ea";

let msgCounter = 1;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

//const neueID = new mongoose.Types.ObjectID();

let aktuellerName = "";
let aktuelleSID = "";
let aktuelleChatID = "";

client.on("connect", async () => {
  console.log("Verbunden mit dem Broker!");

  await mongoose.connect("mongodb://127.0.0.1:27017/chat_app_db");

  client.on("message", (topic, message) => {
    const daten = JSON.parse(message.toString());
    const neueMsg = daten.messages[0];

    if (neueMsg.index >= msgCounter) {
      msgCounter = neueMsg.index + 1;
    }
    if (neueMsg.senderId != aktuelleSID) {
      const dynamischerKey =
        secretKey + neueMsg.senderId.toString() + neueMsg.index;
      try {
        const bytes = CryptoJS.AES.decrypt(neueMsg.content, dynamischerKey);
        const klartext = bytes.toString(CryptoJS.enc.Utf8);

        if (klartext) {
          console.log(`\n[Neu] ${neueMsg.name}: ${klartext}`);
        } else {
          throw new Error("Leerer Klartext");
        }
      } catch (e) {
        console.log(
          `\n[Neu] ${neueMsg.name}: (Entschlüsselung fehlgeschlagen - Index: ${neueMsg.index})`,
        );
      }
    }
  });
  login();
});
async function chatSchleife() {
  rl.question("Deine Nachricht: ", async (textAnwort) => {
    const dynamischerKey = secretKey + aktuelleSID + msgCounter;
    const verschluesselt = CryptoJS.AES.encrypt(
      textAnwort,
      dynamischerKey,
    ).toString();

    const livePaket = JSON.stringify({
      messages: [
        {
          senderId: aktuelleSID,
          name: aktuellerName,
          content: verschluesselt,
          index: msgCounter,
        },
      ],
    });
    const topic = `chats/${aktuelleChatID}/messages`;
    client.publish(topic, livePaket);

    const neueNachrichtDB = new Message({
      senderId: aktuelleSID,
      name: aktuellerName,
      chatId: aktuelleChatID,
      content: verschluesselt,
      index: msgCounter,
    });
    await neueNachrichtDB.save();
    console.log("Nachricht in DB gespeichert!");

    msgCounter++;
    chatSchleife();
  });
}
async function ladeHistory(chatId) {
    console.log("\n--- Lade Chat-Verlauf ---");
    const verlauf = await Message.findOne({chatId: chatId}).sort({index: 1});

    verlauf.forEach((msg) => {
        const dynamicKey = secretKey + msg.senderId.toString() + msg.index;
        try {
            const bytes = CryptoJS.AES.decrypt(msg.content, dynamicKey);
            const klartext = bytes.toString(CryptoJS.enc.Utf8);

            if(klartext){
                console.log(`[Historie] ${msg.name}: ${klartext}`);
            }
        }catch(e){
            console.log(`[Historie] ${msg.name}: (Nachricht konnte nicht entschlüsselt werden)`);
        }
    });
    console.log("--- Ende der Historie ---\n");
}
function login() {
  rl.question(
    "Bitte geben Sie Ihre Email oder Telefonnummer ein: ",
    async (kontakt) => {
      let ich = await User.findOne({
        $or: [{ mail: kontakt }, { phone: kontakt }],
      });
      if (ich) {
        aktuellerName = ich.displayName;
        aktuelleSID = ich._id.toString();
        console.log(`Willcome zurück, ${aktuellerName}!`);
      } else {
        console.log("Kontakt nicht gefunden. Lass uns ein Profil erstellen.");
        const nameAntwort = await new Promise((resolve) =>
          rl.question("Wie heißen Sie?", resolve),
        );
        ich = new User({
          displayName: nameAntwort,
          mail: kontakt.includes("@") ? kontakt : `temp_${Date.now()}@test.de`,
          phone: !kontakt.includes("@") ? kontakt : `0000${Date.now()}`,
          publicKey: "BEISPIEL_KEY_123",
        });
        await ich.save();
        aktuellerName = ich.displayName;
        aktuelleSID = ich._id.toString();
        console.log(`Profil für ${aktuellerName} erstellt!`);
      }
      rl.question(
        "\nMit wem möchten Sie schreiben? (E-Mail oder Telefonnumemr des Partners): ",
        async (partnerKontakt) => {
          let partner = await User.findOne({
            $or: [{ mail: partnerKontakt }, { phone: partnerKontakt }],
          });
          if (!partner) {
            console.log(
              "Partner nicht gefunden. Er muss sich erst registrieren.",
            );
            return login();
          }
          const partnerID = partner._id.toString();
          const chat = await getOrCreateChat(aktuelleSID, partnerID);
          aktuelleChatID = chat._id;

          const letzteNachricht = await Message.findOne({
            chatId: aktuelleChatID,
          }).sort({ index: -1 });
          msgCounter = letzteNachricht ? letzteNachricht.index + 1 : 1;
          client.subscribe(`chats/${aktuelleChatID}/messages`);
          console.log(`\nChat-Raum bereit: ${aktuelleChatID}`);
          console.log(`Du schreibst jetzt mit ${partner.displayName}`);
          await ladeHistory(aktuelleChatID);

          chatSchleife();
        },
      );
    },
  );
}

/*const klartext = "Hallo B, das ist streng geheim!";
    const secondtext = "Hey! Wie gehts dir?"
    const index1 = 1;
    const index2 = 2;

    const senderId = "507f1f77bcf86cd799439011";// Eine Beispiel-ID
    const chatId = "507f191e810c19729de860ea";// Eine Beispiel-ID

    const key1 = secretKey + index1;
    const verschluesselt = 

    const key2 = secretKey + index2;
    const geheimKey = CryptoJS.AES.encrypt(secondtext, key2).toString();

    const testNachricht1 = {senderId, chatId, content: verschluesselt, index: index1}; 
    const testNachricht2 =  {senderId, chatId, content: geheimKey, index: index2}; 

    const paket = {messages: [testNachricht1, testNachricht2]};
    Andere Beispiel wie man Code effizienter schreibt
    const paket = {
    senderId: "507f1f77bcf86cd799439011",
    chatId: "507f191e810c19729de860ea",
    messages: [
        { content: verschluesselt },
        { content: geheimKey }
    ]
};

    client.publish('chats/507f191e810c19729de860ea/messages', JSON.stringify(paket), () => {
        console.log("Verschlüsselte Nachricht wurde gesendet!");
        console.log("Nachricht Nr. " + testNachricht1.index + ": " + verschluesselt);
        console.log("Nachricht Nr. " + testNachricht2.index + ": " + geheimKey);
        client.end();
    });
    client.publish('chats/507f191e810c19729de860ea/messages', JSON.stringify(testNachricht2), () => {
        console.log("Zweite verschlüsselte Nachricht wurde gesendet!");
        console.log("Geséndeter zweiter Inhalt: " + geheimKey);
        client.end();
    });*/

/*const messagesToSend = [
        "Erste Nachricht",
        "Zweite Nachricht",
        "Dritte Nachricht",
        "Vierte Nachricht",
        "Fünfte Nachricht"
    ];*/

//const paket = {messages: []};

/*messagesToSend.forEach((text, i) => {
        const currentIndex = i + 1;

        const sID = (i % 2 === 0) ? aliceID : bobID;

        const dynamischerKey = secretKey + sID + currentIndex;
        const verschluesselt = CryptoJS.AES.encrypt(text, dynamischerKey).toString();

        if (i % 2 == 0) {
            paket.messages.push({
                senderId: aliceID,
                chatId: "507f191e810c19729de860ea",
                content: verschluesselt,
                index: currentIndex,
                name: "Alice"
        });
        } else {
            paket.messages.push({
                senderId: bobID,
                chatId: "507f191e810c19729de860ea",
                content: verschluesselt,
                index: currentIndex,
                name: "Bob"
            });
        }

        const letzteNachricht = await Message.findOne({
        chatId: aktuelleChatID
    }).sort({index: -1});
        
    });*/

/*client.publish('chats/507f191e810c19729de860ea/messages', JSON.stringify(paket), () => {
        console.log(messagesToSend.length + " Nachrichten automatisch verschüsselt und gesendet!");
        console.log("Nachrichten wurden gesendet!");

        if(letzteNachricht){
        msgCounter = letzteNachricht.index + 1;
        console.log(`Fortsetzen bei Index: ${msgCounter}`);
    }else{
        msgCounter = 1;
        console.log("Keine alten Nachrichten gefunden. Starte bei Index 1.");
    }

    rl.question("Wie heißt du? ", async (nameAntwort) => {
    aktuellerName = nameAntwort;
    aktuelleSID = new mongoose.Types.ObjectId().toString();

    const partnerID = "507f191e810c19729de860ea";

    const chat = await getOrCreateChat(aktuelleSID, partnerID);
    aktuelleChatID = chat._id;

    const letzteNachricht = await Message.findOne({
      chatId: aktuelleChatID,
    }).sort({ index: -1 });

    if (letzteNachricht) {
      msgCounter = letzteNachricht.index + 1;
      console.log(
        `Fortsetzen im Chat ${aktuelleChatID} bei Index ${msgCounter}`,
      );
    } else {
      msgCounter = 1;
      console.log("Neuer Chat. Starten bei Index 1");
    }
    const topic = `chats/${aktuelleChatID}/messages`;
    client.subscribe(topic);

    console.log(`Verbunden mit Chat: ${aktuelleChatID}`);
    console.log(`Wellcome ${aktuellerName}!`);
    chatSchleife();
  });
    })*/
