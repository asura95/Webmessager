require("dotenv").config();
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  const chats = await db.collection("chats").find({}).toArray();

  for (const chat of chats) {
    if (chat.members.length === 0 || chat.members[0]?.user) {
      console.log(`Chat ${chat._id} bereits migriert, übersprungen.`);
      continue;
    }

    const neueMitglieder = chat.members.map((id) => ({
      user: id,
      joinedAt: chat.joinedAt || new Date(),
      leftAt: chat.leftAt || null,
      clearedAt: chat.clearedAt || null,
    }));

    await db
      .collection("chats")
      .updateOne({ _id: chat._id }, { $set: { members: neueMitglieder } });
    console.log(`✅ Chat ${chat._id} migriert`);
  }

  console.log("✅ Migration abgeschlossen!");
  process.exit(0);

  const chatsOhneRollen = await db
    .collection("chats")
    .find({
      type: "group",
      "members.role": { $exists: false },
    })
    .toArray();

  for (const chat of chatsOhneRollen) {
    const neueMitglieder = chat.members.map((m, index) => ({
      ...m,
      // Erster Eintrag wird Gründer, alle anderen Member
      role: index === 0 ? "founder" : "member",
    }));

    await db
      .collection("chats")
      .updateOne({ _id: chat._id }, { $set: { members: neueMitglieder } });
    console.log(`✅ Rollen für Gruppe ${chat._id} gesetzt`);
  }
});
