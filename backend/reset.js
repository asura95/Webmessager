const Message = require("./modelsMessage");
const mongoose = require("mongoose");

mongoose.connect("mongodb://localhost:27017/chat_app_db");

async function resetDatabase() {
  try {
    await Message.deleteMany({});
    console.log("Datenbank erfolgreich gelöscht!");
  } catch (error) {
    console.error("Fehler beim Löschen: ", error);
  } finally {
    mongoose.connection.close();
    process.exit();
  }
}

resetDatabase();
