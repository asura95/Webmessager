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
    client.subscribe("chat/main", (err) => {
        if (err) {
            console.error("❌ Fehler beim Abonnieren von chat/main:", err);
        } else {
            console.log("📡 Backend lauscht erfolgreich auf 'chat/main' für automatische DB-Speicherung!");
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
app.get("/api/messages", authenticateToken, async (req, res) => {
    try {
        console.log("🔍 History-Anfrage erhalten von User:", req.user.displayName);
        
        // 1. Wir holen uns denselben "main" Chatraum wie beim Speichern der Nachrichten
        const chat = await getOrCreateChat(null, null, "main");
        const chatId = chat._id;

        // 2. Wir suchen gezielt nach allen Nachrichten für diesen Chatraum
        const echteNachrichten = await Message.find({ chatId: chatId })
            .sort({ timestamp: 1 }) 
            .limit(100);
        
        console.log(`✉️ Sende ${echteNachrichten.length} Nachrichten für Chatraum 'main' (${chatId}) an das Frontend zurück.`);
        res.json(echteNachrichten);
    } catch (err) {
        console.error("❌ Fehler bei /api/messages:", err);
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



//HISTORY ROUTEN

app.get("/api/history/:chatId", async(req, res) => {
    const { chatId } = req.params;
    try{
        const verlauf = (await Message.find({chatId: chatId})).sort({ index: 1});

        res.json(verlauf);
    } catch (err){
        res.status(500).json({error: err.message});
    }
});
// MQTT-Client lauscht auf Chat-Nachrichten und speichert sie live in MongoDB
client.on("message", async (topic, message) => {
    if (topic === "chat/main") {
        try {
            const data = JSON.parse(message.toString());
            console.log("📩 MQTT-Nachricht empfangen:", data);

            // 1. Absender in der DB suchen
            const absender = await User.findOne({ displayName: data.sender });
            
            let senderId;
            if (absender) {
                senderId = absender._id;
            } else {
                // Fallback, falls der User (z.B. bei schnellen Tests) nicht existiert
                const irgendeinUser = await User.findOne();
                senderId = irgendeinUser ? irgendeinUser._id : new mongoose.Types.ObjectId();
            }

            // 2. Chatraum ermitteln (Globaler Raum "main")
            const chat = await getOrCreateChat(null, null, "main");
            const chatId = chat._id;

            // 3. Fortlaufenden Index berechnen
            const nextIndex = data.index || (await Message.countDocuments({ chatId : chatId}) + 1);

            // Zeitstempel flexibel auslesen (großes oder kleines S)
            const rawTime = data.timeStamp || data.timestamp || new Date().getTime();

            // In die MongoDB schreiben
            const neueNachricht = new Message({
                chatId: chatId,
                senderId: senderId,
                sender: data.sender || "System",  // <-- WICHTIG: 'sender' hinzufügen für das Frontend!
                name: data.sender || "System",    // Beibehalten fürs Datenbankschema
                content: data.content,
                index: nextIndex,
                timestamp: new Date(rawTime)
            });

            await neueNachricht.save();
            console.log(`💾 Erfolgreich in DB gespeichert! Index: ${nextIndex} | Absender: ${data.sender}`);
        } catch (err) {
            console.error("❌ Kritischer Fehler beim Speichern der MQTT-Nachricht in der DB:", err);
        }
    }
});

//SERVER STARTEN

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`WebMessenger Backend läuft.....`)
})

