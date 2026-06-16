const mongoose = require('mongoose');
const User = require('./modelsUser');
const { error } = require('node:console');

async function testCreateUser() {
    try {
        await mongoose.connect('mongodb://localhost:27017/chat_app_db');
        console.log("Verbunden für User-Test... ");

        const newUser = new User ({
            displayName: "Tobias",
            phone: "+49123456789",
            publicKey: "base64-beispiel-schlüssel-123"
        });

        const savedUser = await newUser.save();
        console.log("User erfolgreich gespeichert! ID: ", savedUser._id);
    } catch (error) {
        console.error("Fehler beim Erstellen: ", error.message);
    } finally {
        await mongoose.connection.close();
    }
}
testCreateUser();
