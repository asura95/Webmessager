require('dotenv').config();

const mqtt = require("mqtt");
const CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

const cors = require("cors");
app.use(cors());

const User = require("./modelsUser");
const Message = require("./modelsMessage");
const Chat = require("./modelsChats")
const { getOrCreateChat } = require("./chatService");


app.use(express.json());

const jwtSecret = process.env.JWT_SECRET;
const secretKey = "meim-super-sicheres-passwort-123";
const client = mqtt.connect(process.env.MQTT_BROKER_URL || "mqtt://localhost:1883");




// Datenbank und MQTT VERBINDUNG

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB verbunden!"))
    .catch(err => console.error("DB Fehler:", err));

client.on("connect", () => {
    console.log("MQTT Broker verbunden!");
    
    // HIER ABONNIERT DAS BACKEND NUN DAS TOPIC:
    client.subscribe("chat/rooms/+", (err) => {
        if (err) {
            console.error("❌ Fehler beim Abonnieren von chat/main:", err);
        } else {
            console.log("📡 Backend lauscht erfolgreich auf 'chat/rooms/+' für automatische DB-Speicherung!");
        }
    });
});



// ---- API ROUTEN ----

// Prüfen ob der User ein gültiges Token hat

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if(!token) return res.sendStatus(401);

    jwt.verify(token, jwtSecret, (err, user) => {
        if(err) return res.sendStatus(403);
        req.user = user;
        next();
    })
}

// ROUTEN FÜR TOKEN-REFRESH

app.get("/api/refresh-token", authenticateToken, (req, res) => {
    //wenn user hier ist, war sein altes Token noch gültig
    //wird neues ausgestellt
    const newToken = jwt.sign(
        { userId: req.user.userId, displayName: req.user.displayName },
        jwtSecret,
        {expiresIn: "7d" }
    );
    res.json({success: true, token: newToken});
});

//LOGIN ROUTEN
// LOGIN ROUTE (Erweitert um genaue Fehlerprüfung)
// LOGIN ROUTE (Präzise Fehlercodes für das Frontend)
app.post("/api/login", async (req, res) => {
    try {
        const { kontakt, password } = req.body;

        let ich = null;
        let suchTyp = kontakt.includes("@") ? "email" : "phone";

        if (suchTyp === "email") {
            ich = await User.findOne({ mail: kontakt });
        } else {
            ich = await User.findOne({ phone: kontakt });
        }

        // 1. Kontakt existiert gar nicht
        if (!ich) {
            return res.status(404).json({ 
                success: false, 
                message: suchTyp === "email" 
                    ? "Diese E-Mail-Adresse ist nicht registriert!" 
                    : "Diese Telefonnummer ist nicht registriert!" 
            });
        }

        // 2. Kontakt existiert, aber Passwort ist falsch
        const passwordCorrect = await bcrypt.compare(password, ich.password);

        if (!passwordCorrect) {
            return res.status(401).json({ 
                success: false, 
                message: "Das Passwort ist falsch!" 
            });
        }

        // 3. Login erfolgreich
        const token = jwt.sign(
            { userId: ich._id, displayName: ich.displayName },
            jwtSecret,
            { expiresIn: "7d" }
        );

        const { password: _, ...userWithoutPassword } = ich._doc;
        res.json({ success: true, user: userWithoutPassword, token: token });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ECHTE MESSAGE-HISTORY AUS DER MONGO-DB LADEN
// Echte Nachrichten-Historie für einen spezifischen Raum laden
app.get("/api/messages/:roomName", authenticateToken, async (req, res) => {
    try {
        const { roomName } = req.params;
        
        // 1. Hole oder erstelle den Chatraum anhand des Namens
        const chat = await getOrCreateChat(null, null, roomName);
        const chatId = chat._id;

        // 2. Suche Nachrichten für diesen spezifischen Raum
        const echteNachrichten = await Message.find({ chatId: chatId })
            .sort({ timestamp: 1 }) 
            .limit(100);
        
        res.json({ chatId: chatId, messages: echteNachrichten });
    } catch (err) {
        console.error(`❌ Fehler bei /api/messages/${req.params.roomName}:`, err);
        res.status(500).json({ error: err.message });
    }
});

//ROUTEN REGISTRIEREN

app.post("/api/register", async (req, res) => {
    try {
        const { displayName, mail, phone, password } = req.body;

        const saltRound = 10;
        const hashedPassword = await bcrypt.hash(password, saltRound);

        const newUser = new User ({
            displayName,
            mail,
            phone,
            password: hashedPassword,
            publicKey: "BEISPIEL_KEY_123"
        });

        await newUser.save();
        res.json({success: true, message: "User erfolgreich registriert"});
    }catch (err){
        res.status(500).json({success: false, error: err.message});
    }
})

// =================================================================
// 1. KONTAKTSUCHE (Nach E-Mail oder Telefonnummer)
// =================================================================
app.get("/api/users/search", authenticateToken, async (req, res) => {
    try {
        const { query } = req.query; // z.B. /api/users/search?query=test@test.de
        if (!query) return res.status(400).json({ error: "Suchbegriff fehlt" });

        // Suche nach E-Mail oder Telefonnummer (case-insensitive bei E-Mail)
        const user = await User.findOne({
            $and: [
                { _id: { $ne: req.user.userId } }, // Sich selbst nicht in der Suche finden
                {
                    $or: [
                        { mail: { $regex: new RegExp("^" + query + "$", "i") } },
                        { phone: query }
                    ]
                }
            ]
        }).select("displayName mail phone _id");

        if (!user) {
            return res.status(404).json({ success: false, message: "User nicht gefunden." });
        }

        res.json({ success: true, user });
    } catch (err) {
        console.error("❌ Fehler bei der Nutzersuche:", err);
        res.status(500).json({ error: err.message });
    }
});

// =================================================================
// 2. PRIVATEN CHAT STARTEN ODER REAKTIVIEREN
// =================================================================
app.post("/api/chats/get-or-create", authenticateToken, async (req, res) => {
    try {
        const { partnerId } = req.body;
        const meinId = req.user.userId;

        if (!partnerId) return res.status(400).json({ error: "Partner-ID fehlt" });

        // Prüfen, ob bereits ein 1-zu-1 Chat zwischen diesen beiden existiert
        let chat = await Chat.findOne({
            type: "private",
            members: { $all: [meinId, partnerId], $size: 2 }
        });

        // Falls kein Chat existiert, erstellen wir einen neuen privaten Chat
        if (!chat) {
            chat = new Chat({
                type: "private",
                members: [meinId, partnerId]
            });
            await chat.save();
            console.log(`🆕 Neuer privater Chat erstellt zwischen ${meinId} und ${partnerId}`);
        }

        res.json({ success: true, chatId: chat._id });
    } catch (err) {
        console.error("❌ Fehler beim Chat-Erstellen:", err);
        res.status(500).json({ error: err.message });
    }
});

// =================================================================
// 3. ALLE EIGENEN CHATS AUFLISTEN (Für die Chat-Liste links)
// =================================================================
app.get("/api/chats", authenticateToken, async (req, res) => {
    try {
        const meinId = req.user.userId;

        // Finde alle Chats, in denen ich Mitglied bin, und lade die Userdetails der anderen Teilnehmer mit
        const chats = await Chat.find({ members: meinId })
            .populate("members", "displayName mail phone status")
            .sort({ createdAt: -1 });

        res.json(chats);
    } catch (err) {
        console.error("❌ Fehler beim Laden der Chat-Liste:", err);
        res.status(500).json({ error: err.message });
    }
});

//HISTORY ROUTEN

app.get("/api/history/:chatId", authenticateToken, async (req, res) => {
    const { chatId } = req.params;
    try {
        // Findet alle Nachrichten zur chatId und sortiert sie aufsteigend nach dem Index
        const verlauf = await Message.find({ chatId: chatId }).sort({ index: 1 });
        res.json(verlauf);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// MQTT-Client lauscht auf Chat-Nachrichten und speichert sie live in MongoDB
// MQTT-Client lauscht auf Chat-Nachrichten und speichert sie live in MongoDB
client.on("message", async (topic, message) => {
    if (topic.startsWith("chat/rooms/")) {
        try {
            // Extrahiere die echte Chat-ID aus dem Topic-Pfad
            const chatId = topic.split("/")[2]; 
            
            const data = JSON.parse(message.toString());
            console.log(`📩 MQTT-Nachricht für Chat-ID [${chatId}] empfangen:`, data);

            // 1. Absender in der DB suchen, um die senderId zu ermitteln
            const absender = await User.findOne({ displayName: data.sender });
            let senderId = absender ? absender._id : new mongoose.Types.ObjectId();

            // 2. Fortlaufenden Index berechnen (entweder der mitgesendete oder hochgezählt)
            const nextIndex = data.index || (await Message.countDocuments({ chatId: chatId }) + 1);
            const rawTime = data.timeStamp || data.timestamp || new Date().getTime();

            // 3. In die MongoDB schreiben
            const neueNachricht = new Message({
                chatId: new mongoose.Types.ObjectId(chatId), // Als echte ObjectId speichern!
                senderId: senderId,
                name: data.sender || "System",
                content: data.content, // Der verschlüsselte Text
                index: nextIndex,
                timestamp: new Date(rawTime)
            });

            await neueNachricht.save();
            console.log(`💾 Nachricht erfolgreich gespeichert für Chat [${chatId}] | Index: ${nextIndex}`);
        } catch (err) {
            console.error("❌ Fehler beim Speichern der Raum-Nachricht:", err);
        }
    }
});

//SERVER STARTEN

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`WebMessenger Backend läuft.....`)
})

