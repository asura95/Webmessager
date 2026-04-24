const mqtt = require('mqtt');
const {connectDB } = require('./database'); // Importiert deine Datenbank-Verbindung
const Message = require('./modelsMessage');

connectDB();

const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
    console.log('Backend ist bereit und mit dem Broker verbunden! 📡');
    client.subscribe('chats/+/messages');
});

client.on('message', async (topic, payload) => {
    try {
        const data = JSON.parse(payload.toString());
        
        const newMessage = new Message({
            senderId: data.senderId,
            chatId: data.chatId,
            content: data.content
        });

        await newMessage.save();
        console.log(`✅ Nachricht für Chat ${data.chatId} in MongoDB gespeichert!`);
    } catch (err) {
        console.error('❌ Fehler beim Speichern:', err.message);
    }
});
