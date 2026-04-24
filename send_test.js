const mqtt = require('mqtt');
const CryptoJS = require('crypto-js');

const client = mqtt.connect('mqtt://localhost:1883');
const secretKey = "meim-super-sicheres-passwort-123";

client.on('connect', () => {

    const klartext = "Hallo B, das ist streng geheim!";

    const verschluesselt = CryptoJS.AES.encrypt(klartext, secretKey).toString();


    const testNachricht = {
        senderId: "507f1f77bcf86cd799439011", // Eine Beispiel-ID
        chatId: "507f191e810c19729de860ea",
        content: verschluesselt
    };

    client.publish('chats/507f191e810c19729de860ea/messages', JSON.stringify(testNachricht), () => {
        console.log("Verschlüsselte Nachricht wurde gesendet! 🚀");
        console.log("Gesendeter Inhalt: " + verschluesselt);
        client.end();
    });
});