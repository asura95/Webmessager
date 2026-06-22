require("dotenv").config();

const mqtt = require("mqtt");
const mongoose = require("mongoose");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const User = require("./models/modelsUser");
const Message = require("./models/modelsMessage");
const Chat = require("./models/modelsChats");

app.use(cors({
  origin: ["https://webmessenger-nine.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

app.get('/favico.ico', (req, res) => res.status(204).end());

const jwtSecret = process.env.JWT_SECRET;
const client = mqtt.connect(
  process.env.MQTT_BROKER_URL || "mqtt://localhost:1883",
  {
    username: process.env.MQTT_USER,
    password:process.env.MQTT_PASSWORD,
  },
);

// ── DB & MQTT Verbindung ─────────────────────────────────────────

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB verbunden!"))
  .catch((err) => console.error("❌ DB Fehler:", err));

client.on("connect", () => {
  console.log("✅ MQTT Broker verbunden!");
  client.subscribe("chat/rooms/+", (err) => {
    if (err) console.error("❌ MQTT Subscribe Fehler:", err);
    else console.log("📡 Backend lauscht auf 'chat/rooms/+'");
  });
});

client.on("error", (err) => {
  console.error("MQTT Verbindungsfehler:", err.message);
});

// ── Middleware: Token prüfen ─────────────────────────────────────

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ── Token erneuern ───────────────────────────────────────────────

app.get("/api/refresh-token", authenticateToken, (req, res) => {
  const newToken = jwt.sign(
    { userId: req.user.userId, displayName: req.user.displayName },
    jwtSecret,
    { expiresIn: "7d" },
  );
  res.json({ success: true, token: newToken });
});

// ── Login ────────────────────────────────────────────────────────

app.post("/api/login", async (req, res) => {
  try {
    const { kontakt, password } = req.body;
    const suchTyp = kontakt.includes("@") ? "email" : "phone";
    const ich =
      suchTyp === "email"
        ? await User.findOne({ mail: kontakt })
        : await User.findOne({ phone: kontakt });

    if (!ich) {
      return res.status(404).json({
        success: false,
        message:
          suchTyp === "email"
            ? "Diese E-Mail-Adresse ist nicht registriert!"
            : "Diese Telefonnummer ist nicht registriert!",
      });
    }

    const passwordCorrect = await bcrypt.compare(password, ich.password);
    if (!passwordCorrect) {
      return res
        .status(401)
        .json({ success: false, message: "Das Passwort ist falsch!" });
    }

    const token = jwt.sign(
      { userId: ich._id, displayName: ich.displayName },
      jwtSecret,
      { expiresIn: "7d" },
    );

    const { password: _, ...userWithoutPassword } = ich._doc;
    res.json({ success: true, user: userWithoutPassword, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Registrieren ─────────────────────────────────────────────────

app.post("/api/register", async (req, res) => {
  try {
    const { displayName, mail, phone, password, publicKey } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      displayName,
      mail,
      phone,
      password: hashedPassword,
      publicKey,
    });
    await newUser.save();
    res.json({ success: true, message: "User erfolgreich registriert" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Kontaktsuche ─────────────────────────────────────────────────

app.get("/api/users/search", authenticateToken, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: "Suchbegriff fehlt" });

    const user = await User.findOne({
      $and: [
        { _id: { $ne: req.user.userId } },
        {
          $or: [
            { mail: { $regex: new RegExp("^" + query + "$", "i") } },
            { phone: query },
            { displayName: { $regex: new RegExp(query, "i") } },
          ],
        },
      ],
    }).select("displayName mail phone _id");

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Keinen passenden Nutzer gefunden." });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Privaten Chat starten oder reaktivieren ──────────────────────

app.post("/api/chats/get-or-create", authenticateToken, async (req, res) => {
  try {
    const { partnerId } = req.body;
    const meinId = req.user.userId;
    if (!partnerId) return res.status(400).json({ error: "Partner-ID fehlt" });

    let chat = await Chat.findOne({
      type: "private",
      "members.user": { $all: [meinId, partnerId] },
    });

    if (!chat) {
      chat = new Chat({
        type: "private",
        members: [{ user: meinId }, { user: partnerId }],
      });
      await chat.save();
    } else {
      // Falls einer den Chat gelöscht hatte: clearedAt zurücksetzen
      const meinEintrag = chat.members.find(
        (m) => m.user.toString() === meinId.toString(),
      );
      if (meinEintrag && meinEintrag.clearedAt) {
        meinEintrag.clearedAt = null;
        await chat.save();
      }
    }

    res.json({ success: true, chatId: chat._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alle eigenen Chats auflisten ─────────────────────────────────

app.get("/api/chats", authenticateToken, async (req, res) => {
  try {
    const meinId = req.user.userId;

    const chats = await Chat.find({ "members.user": meinId })
      .populate("members.user", "displayName mail phone")
      .sort({ createdAt: -1 });

    const result = await Promise.all(
      chats.map(async (chat) => {
        const meinEintrag = chat.members.find(
          (m) => m.user._id.toString() === meinId.toString(),
        );
        if (!meinEintrag) return null;

        // Wenn clearedAt gesetzt: nur anzeigen wenn neue Nachrichten DANACH existieren
        if (meinEintrag.clearedAt) {
          const neueNachrichten = await Message.countDocuments({
            chatId: chat._id,
            timestamp: { $gt: meinEintrag.clearedAt },
          });
          if (neueNachrichten === 0) return null;

          // NEU: clearedAt und leftAt zurücksetzen damit Person wieder mitmachen kann
          meinEintrag.clearedAt = null;
          meinEintrag.leftAt = null;
          await chat.save();
        }

        return {
          ...chat.toObject(),
          ichBinAusgetreten: !!meinEintrag.leftAt,
        };
      }),
    );

    res.json(result.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Gruppeninfo: Mitgliederliste mit Rollen ──────────────────────

app.get("/api/chats/:chatId/members", authenticateToken, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId).populate(
      "members.user",
      "displayName mail phone",
    );
    if (!chat) return res.status(404).json({ error: "Chat nicht gefunden" });

    const mitglieder = chat.members
      .filter((m) => !m.leftAt)
      .map((m) => ({
        userId: m.user._id,
        name: m.user.displayName,
        mail: m.user.mail || null,
        phone: m.user.phone || null,
        role: m.role || "member",
        mutedUntil: m.mutedUntil || null,
      }));

    res.json({ success: true, members: mitglieder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Mitglied hinzufügen ──────────────────────────────────────────

app.post(
  "/api/chats/:chatId/members/add",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId } = req.body;
      const meinId = req.user.userId;

      const chat = await Chat.findById(req.params.chatId);
      if (!chat) return res.status(404).json({ error: "Chat nicht gefunden" });

      const ichSelbst = chat.members.find(
        (m) => m.user.toString() === meinId.toString(),
      );
      if (!ichSelbst) return res.status(403).json({ error: "Kein Zugriff" });

      // Nur founder, admin darf Leute hinzufügen
      if (!["founder", "admin"].includes(ichSelbst.role)) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      // Bereits Mitglied?
      const bereitsIn = chat.members.find((m) => m.user.toString() === userId);
      if (bereitsIn && !bereitsIn.leftAt) {
        return res
          .status(400)
          .json({ error: "Person ist bereits in der Gruppe" });
      }

      if (bereitsIn && bereitsIn.leftAt) {
        // Wieder hinzufügen (leftAt + clearedAt zurücksetzen)
        bereitsIn.leftAt = null;
        bereitsIn.clearedAt = null;
      } else {
        chat.members.push({ user: userId, role: "member" });
      }

      await chat.save();

      // Neues Mitglied benachrichtigen
      const neuerUser = await User.findById(userId);
      if (neuerUser) {
        client.publish(
          `chat/updates/${neuerUser.displayName}`,
          JSON.stringify({ action: "refresh_chats" }),
        );
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Mitglied entfernen ───────────────────────────────────────────

app.post(
  "/api/chats/:chatId/members/remove",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId } = req.body;
      const meinId = req.user.userId;

      const chat = await Chat.findById(req.params.chatId).populate(
        "members.user",
        "displayName",
      );
      if (!chat) return res.status(404).json({ error: "Chat nicht gefunden" });

      const ichSelbst = chat.members.find(
        (m) => m.user._id.toString() === meinId.toString(),
      );
      const ziel = chat.members.find((m) => m.user._id.toString() === userId);

      if (!ichSelbst || !ziel)
        return res.status(404).json({ error: "Mitglied nicht gefunden" });

      // Berechtigungslogik
      const rangOrdnung = { founder: 4, admin: 3, moderator: 2, member: 1 };
      if (rangOrdnung[ichSelbst.role] <= rangOrdnung[ziel.role]) {
        return res
          .status(403)
          .json({ error: "Keine Berechtigung, diese Person zu entfernen" });
      }
      // Nur founder und admin dürfen entfernen
      if (!["founder", "admin"].includes(ichSelbst.role)) {
        return res.status(403).json({ error: "Keine Berechtigung" });
      }

      ziel.leftAt = new Date();
      ziel.clearedAt = new Date();
      await chat.save();

      client.publish(
        `chat/updates/${ziel.user.displayName}`,
        JSON.stringify({ action: "refresh_chats" }),
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Rolle vergeben ───────────────────────────────────────────────

app.post(
  "/api/chats/:chatId/members/role",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId, newRole } = req.body;
      const meinId = req.user.userId;

      const chat = await Chat.findById(req.params.chatId);
      if (!chat) return res.status(404).json({ error: "Chat nicht gefunden" });

      const ichSelbst = chat.members.find(
        (m) => m.user.toString() === meinId.toString(),
      );
      const ziel = chat.members.find((m) => m.user.toString() === userId);

      if (!ichSelbst || !ziel)
        return res.status(404).json({ error: "Mitglied nicht gefunden" });

      // Berechtigungsmatrix
      // founder  → kann alles vergeben (admin, moderator, member)
      // admin    → kann nur moderator vergeben
      // moderator/member → nichts
      const darfVergeben = {
        founder: ["admin", "moderator", "member"],
        admin: ["moderator", "member"],
        moderator: [],
        member: [],
      };

      if (!darfVergeben[ichSelbst.role].includes(newRole)) {
        return res
          .status(403)
          .json({ error: "Keine Berechtigung für diese Rolle" });
      }

      // Founder-Rolle kann niemand vergeben oder wegnehmen (außer sich selbst)
      if (ziel.role === "founder" || newRole === "founder") {
        return res
          .status(403)
          .json({ error: "Founder-Rolle ist unveränderbar" });
      }

      ziel.role = newRole;
      await chat.save();

      res.json({ success: true, newRole });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Mitglied muten ───────────────────────────────────────────────

app.post(
  "/api/chats/:chatId/members/mute",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId, minutes } = req.body; // minutes: 5, 15, 30, 60
      const meinId = req.user.userId;

      const chat = await Chat.findById(req.params.chatId).populate(
        "members.user",
        "displayName",
      );
      if (!chat) return res.status(404).json({ error: "Chat nicht gefunden" });

      const ichSelbst = chat.members.find(
        (m) => m.user._id.toString() === meinId.toString(),
      );
      const ziel = chat.members.find((m) => m.user._id.toString() === userId);

      if (!ichSelbst || !ziel)
        return res.status(404).json({ error: "Mitglied nicht gefunden" });

      const rangOrdnung = { founder: 4, admin: 3, moderator: 2, member: 1 };

      // Nur muten wenn eigener Rang höher als Ziel
      if (rangOrdnung[ichSelbst.role] <= rangOrdnung[ziel.role]) {
        return res
          .status(403)
          .json({ error: "Keine Berechtigung, diese Person zu muten" });
      }
      // Moderatoren dürfen nur members muten
      if (ichSelbst.role === "moderator" && ziel.role !== "member") {
        return res
          .status(403)
          .json({ error: "Moderatoren können nur normale Mitglieder muten" });
      }

      const mutedUntil = new Date(Date.now() + minutes * 60 * 1000);
      ziel.mutedUntil = mutedUntil;
      await chat.save();

      client.publish(
        `chat/updates/${ziel.user.displayName}`,
        JSON.stringify({ action: "muted", chatId: chat._id, mutedUntil }),
      );

      res.json({ success: true, mutedUntil });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Chat-Verlauf laden ───────────────────────────────────────────

app.get("/api/history/:chatId", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const meinId = req.user.userId;

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat nicht gefunden" });

    const meinEintrag = chat.members.find(
      (m) => m.user.toString() === meinId.toString(),
    );

    const filter = { chatId };

    // Nur Nachrichten nach dem letzten clearedAt anzeigen
    if (meinEintrag?.clearedAt) {
      filter.timestamp = { $gt: meinEintrag.clearedAt };
    }

    const verlauf = await Message.find(filter).sort({ index: 1 });
    res.json(verlauf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Chat verlassen oder löschen ──────────────────────────────────

app.delete("/api/chats/:chatId", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { action } = req.query;
    const meinId = req.user.userId;

    const chat = await Chat.findById(chatId).populate(
      "members.user",
      "displayName",
    );
    if (!chat) return res.status(404).json({ error: "Chat nicht gefunden" });

    const meinEintrag = chat.members.find(
      (m) => m.user._id.toString() === meinId.toString(),
    );
    if (!meinEintrag) return res.status(403).json({ error: "Kein Zugriff" });

    if (chat.type === "private") {
      // Privat: Verlauf ausblenden, taucht wieder auf bei neuer Nachricht
      meinEintrag.clearedAt = new Date();
    } else {
      if (action === "leave") {
        // Verlassen: Verlauf bleibt sichtbar, keine neuen Nachrichten mehr
        meinEintrag.leftAt = new Date();
      } else if (action === "delete") {
        // Löschen: Verlauf ausblenden + austreten
        // Taucht wieder auf sobald jemand schreibt
        meinEintrag.leftAt = meinEintrag.leftAt || new Date();
        meinEintrag.clearedAt = new Date();
      } else {
        return res.status(400).json({ error: "Ungültige Aktion." });
      }
    }

    await chat.save();

    // MQTT-Signal an alle Mitglieder
    chat.members.forEach((member) => {
      client.publish(
        `chat/updates/${member.user.displayName}`,
        JSON.stringify({ action: "refresh_chats" }),
      );
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Gruppe erstellen ─────────────────────────────────────────────

app.post("/api/chats/create-group", authenticateToken, async (req, res) => {
  try {
    const { groupName, memberIds } = req.body;
    const meinId = req.user.userId;

    if (!groupName || !memberIds || memberIds.length === 0) {
      return res
        .status(400)
        .json({ error: "Gruppenname und Mitglieder fehlen!" });
    }

    const alleIds = [...new Set([...memberIds, meinId.toString()])];

    const neueGruppe = new Chat({
      type: "group",
      groupName: groupName,
      adminId: meinId,
      members: alleIds.map((id) => ({
        user: id,
        role: id.toString() === meinId.toString() ? "founder" : "member",
      })),
    });

    await neueGruppe.save();

    // Alle Mitglieder per MQTT benachrichtigen
    const mitglieder = await User.find({ _id: { $in: alleIds } });
    mitglieder.forEach((user) => {
      client.publish(
        `chat/updates/${user.displayName}`,
        JSON.stringify({ action: "refresh_chats" }),
      );
    });

    res.json({
      success: true,
      chatId: neueGruppe._id,
      groupName: neueGruppe.groupName,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MQTT: Nachrichten empfangen und in DB speichern ──────────────

client.on("message", async (topic, message) => {
  if (!topic.startsWith("chat/rooms/")) return;

  try {
    const chatId = topic.split("/")[2];
    const data = JSON.parse(message.toString());

    console.log(`📩 MQTT-Nachricht für Chat-ID [${chatId}] empfangen:`, data);

    const absender = await User.findOne({ displayName: data.sender });
    const senderId = absender ? absender._id : new mongoose.Types.ObjectId();

    // Mute-Check NACH dem Laden des Absenders
    const chatDoc = await Chat.findById(chatId);
    if (chatDoc && absender) {
      const absenderEintrag = chatDoc.members.find(
        (m) => m.user.toString() === absender._id.toString(),
      );
      if (
        absenderEintrag?.mutedUntil &&
        absenderEintrag.mutedUntil > new Date()
      ) {
        console.log(`🔇 ${data.sender} ist gemutet, Nachricht verworfen!`);
        return;
      }
    }

    const nextIndex =
      data.index || (await Message.countDocuments({ chatId })) + 1;
    const rawTime = data.timeStamp || data.timestamp || Date.now();

    const neueNachricht = new Message({
      chatId: new mongoose.Types.ObjectId(chatId),
      senderId,
      name: data.sender || "System",
      content: data.content,
      index: nextIndex,
      timestamp: new Date(rawTime),
    });

    await neueNachricht.save();

    // ── NEU: Alle Mitglieder mit clearedAt benachrichtigen ───
    // Damit der Chat bei ihnen wieder auftaucht
    const chat = await Chat.findById(chatId).populate(
      "members.user",
      "displayName",
    );
    if (chat) {
      chat.members.forEach((member) => {
        client.publish(
          `chat/updates/${member.user.displayName}`,
          JSON.stringify({ action: "refresh_chats" }),
        );
      });
    }
  } catch (err) {
    console.error("❌ Fehler beim Speichern der Nachricht:", err);
  }
});

// ── Server starten ───────────────────────────────────────────────

app.listen(3000, () => console.log("✅ Server läuft auf Port 3000"));