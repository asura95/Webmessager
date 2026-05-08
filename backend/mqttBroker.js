const aedesLib = require('aedes');
const aedes = (typeof aedesLib === 'function')
    ? aedesLib()
    : (aedesLib.Aedes ? new aedesLib.Aedes() : aedesLib.createBroker());
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');
const { connectDB } = require('./database');
const Message = require('./modelsMessage');

connectDB();

server.listen(1883, function() {
    console.log('MQTT Broker läuft auf Port 1883 (TCP)');
});

ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(9001, function(){
    console.log('MQTT Broker läuft auf Port 9001 (WebSocket)');
});

aedes.on('publish', async function (packet, client) {
    if(packet.topic === 'chat/main') {
        try{
            const data = JSON.parse(packet.paylod.toString());

            const newMessage = new Message ({
                senderId: data.sender,
                content: data.content,
                chatId: "main_room"
            });

            await newMessage.save();
            console.log(`Nachricht gespeichert ${data.content}`);
        }catch (err){

        }
    }
})