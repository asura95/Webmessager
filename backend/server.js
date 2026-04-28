const mqtt = require("mqtt");
const CryptoJS = require("crypto-js");
const mongoose = require("mongoose");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const cors = require("cors");
app.use(cors());

const User = require("./modelsUser");
const Message = require("./modelsMessage");
const { getOrCreateChat } = require("./chatService");

const app = express();
app.use(express.json());

const jwtSecret = "mein-geheimer-ausweis-stempel-123";
const secretKey = "meim-super-sicheres-passwort-123";
const client = mqtt.connect("mqtt://localhost:1883");

// Datenbank und MQTT VERBINDUNG

mongoose.connect("mongodb://127.0.0.1:27017/chat_app_db")
    .then(() => console.log("MongoDB verbunden!"))
    .catch(err => console.error("DB Fehler:", err));

client.on("connect", () => {
    console.log("MQTT Broker verbunden!");
});



// ---- API ROUTEN ----

//LOGIN ROUTEN

app.post("/api/login", async (req, res) => {
    try {
        const { kontakt, password } = req.body;
        const ich = await User.findOne({$or: [{mail: kontakt}, {phone: kontakt}]});

        if(!ich){
            return res.status(404).json({success: false, message: "User nicht gefunden!"});
        }
        const passwordCorrect = await bcrypt.compare(password, ich.password);

        if(passwordCorrect){

            const token = jwt.sign(
                { userId: ich._id, displayName: ich.displayName },
                jwtSecret,
                {expiresIn: "7d"}
            );

            const { password, ...userWithoutPassword } = ich._doc;
            res.json({success: true, user: userWithoutPassword, token: token});
        }else {
            res.status(401).json({success: false, message: "Falsches Passwort!"});
        }
    }catch (err){
        res.status(500).json({error: err.message});
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

//SERVER STARTEN

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`WebMessenger Backend läuft.....`)
})

