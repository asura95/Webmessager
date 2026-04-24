const mongoose = require('mongoose');

const dbURL = 'mongodb://localhost:27017/chat_app_db';

// Wir definieren die Funktion, rufen sie hier aber nicht mehr mit () auf
async function connectDB() {
    if (mongoose.connection.readyState === 0) { // Nur verbinden, wenn noch nicht geschehen
        try {
            await mongoose.connect(dbURL);
            console.log('MongoDB verbunden... ✅');
        } catch (err) {
            console.error('Verbindungsfehler: ❌', err.message);
        }
    }
}

// Wir exportieren die Funktion, damit andere Dateien sie starten können
module.exports = { connectDB, mongoose };