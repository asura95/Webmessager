const API_BASE_URL = "https://webmessager-backend.onrender.com";
const MQTT_BROKER_URL = "wss://38252c9da2304460b2201e73eeae4fac.s1.eu.hivemq.cloud:8884/mqtt";

const GROUP_SECRET ="meim-super-sicheres-passwort-123";
let msgCounter = 1;

const appDiv = document.getElementById("app");
let mqttClient;

const meineClientID = "user_" + Math.floor(Math.random() * 1000000);

let aktuellerChatId = null;
let chatPartnerName = ""; // Wird vom Server geliefert

function encryptMsg(text, senderName, index) {
  const key = GROUP_SECRET + senderName + index; // + nicht ,
  return CryptoJS.AES.encrypt(text, key).toString();
}

function decryptMsg(encrypted, senderName, index) {
  try {
    const key = GROUP_SECRET + senderName + index;
    const bytes = CryptoJS.AES.decrypt(encrypted, key);
    const klartext = bytes.toString(CryptoJS.enc.Utf8);
    return klartext || "[Entschlüsselung fehlgeschlagen]";
  } catch (e) {
    return "[Entschlüsselung fehlgeschlagen]";
  }
}

function showLoginScreen() {
  appDiv.innerHTML = `
        <div class="form-container" id="login-container">
            <h2>Messenger Login</h2>
            
            <div id="login-error" class="error-box"></div>

            <div class="form-group">
                <input type="text" id="kontakt" placeholder="E-Mail oder Telefonnummer">
            </div>
            <div class="form-group">
                <input type="password" id="password" placeholder="Passwort">
            </div>
            <button id="login-btn" class="btn-primary">Log in</button>
            
            <p class="switch-text">
                Möchtest Sie sich registrieren? <span onclick="showRegisterScreen()">Registrieren</span>
            </p>
        </div>
    `;
  document.getElementById("login-btn").addEventListener("click", handleLogin);
}

function showRegisterScreen() {
  appDiv.innerHTML = `
        <div class="form-container" id="register-container">
            <h2>Messenger Registrierung</h2>

            <div id="register-error" class="error-box"></div>

            <div class="form-group">
                <input type="text" id="reg-name" placeholder="Name">
            </div>
            <div class="form-group">
                <input type="email" id="reg-email" placeholder="E-Mail-Adresse">
            </div>
            <div class="form-group">
                <input type="text" id="reg-phone" placeholder="Telefonnummer">
            </div>
            <div class="form-group">
                <input type="password" id="reg-password" placeholder="Passwort">
            </div>
            
            <button id="register-btn" class="btn-primary">Registrieren</button>
            <button id="back-to-login-btn" class="btn-secondary">Zurück zum Login</button>
        </div>
    `;

  document
    .getElementById("register-btn")
    .addEventListener("click", handleRegister);
  document
    .getElementById("back-to-login-btn")
    .addEventListener("click", showLoginScreen);
}

function showChatScreen() {
  appDiv.innerHTML = ` 
        <div id="chat-layout">
            <aside id="sidebar">
                <div class="sidebar-header">
                    <h3>Meine Chats</h3>
                    <button id="logout-btn">Abmelden</button>
                </div>
                
                <div class="search-area">
                    <input type="text" id="contact-search-input" placeholder="E-Mail oder Tel. suchen...">
                    <button id="contact-search-btn">🔍</button>
                </div>
                <div id="search-result-box" style="display: none;"></div>

                <ul id="room-list">
                    </ul>
                
                <button id="create-group-btn" class="btn-primary" style="padding: 8px; margin-top: auto; font-size: 13px;">
                    + Neue Gruppe erstellen
                </button>
            </aside>

                // In der Funktion showChatScreen()
                <header>
                    <h3 id="current-room-title">Wähle einen Chat aus, um zu schreiben</h3>
                    <div id="chat-header-actions" class="current-chat-options" style="display:none;">
                        <button id="header-info-btn" class="header-action-btn" title="Gruppeninfo">ℹ️</button>
                        <button id="header-leave-btn" class="header-action-btn" title="Gruppe verlassen">🚪</button>
                        <button id="header-delete-btn" class="header-action-btn delete-chat" title="Chat löschen">🗑️</button>
                    </div>
                </header>
                <div id="messages"></div>
                <div class="input-area" style="display: none;" id="chat-input-area">
                    <input type="text" id="msg-input" placeholder="Nachricht schreiben...">
                    <button id="send-btn">Senden</button>
                </div>
        </div>
    `;

  // Event Listener zuweisen
  document.getElementById("logout-btn").addEventListener("click", logout);
  document
    .getElementById("contact-search-btn")
    .addEventListener("click", sucheKontakt);
  document
    .getElementById("contact-search-input")
    .addEventListener("keypress", (e) => {
      if (e.key === "Enter") sucheKontakt();
    });

  // --- NEU: Event Listener für das Senden von Nachrichten ---

  const sendBtn = document.getElementById("send-btn");
  const msgInput = document.getElementById("msg-input");
  const createGroupBtn = document.getElementById("create-group-btn");
  if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
  }
  if (msgInput) {
    msgInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendMessage();
      }
    });
  }
  // ---------------------------------------------------------
  if (createGroupBtn) {
    createGroupBtn.addEventListener("click", zeigeGruppenModal);
  }
  // Lade die existierenden Chats des Users beim Start

  ladeAktiveChats();
}

async function wechsleChat(chatId, partnerName, ichBinAusgetreten = false) {
  if (mqttClient && aktuellerChatId) {
    mqttClient.unsubscribe(`chat/rooms/${aktuellerChatId}`);
  }

  aktuellerChatId = chatId;
  chatPartnerName = partnerName;

  document.getElementById("current-room-title").textContent = partnerName;

  const inputArea = document.getElementById("chat-input-area");
  inputArea.style.display = "flex";

  // Wenn ausgetreten: Eingabefeld sperren!
  const msgInput = document.getElementById("msg-input");
  const sendBtn = document.getElementById("send-btn");

  if (ichBinAusgetreten) {
    msgInput.disabled = true;
    msgInput.placeholder = "Du bist ausgetreten. Schreiben nicht möglich.";
    sendBtn.disabled = true;
    sendBtn.style.opacity = "0.5";
  } else {
    msgInput.disabled = false;
    msgInput.placeholder = "Nachricht schreiben...";
    sendBtn.disabled = false;
    sendBtn.style.opacity = "1";
  }

  document.querySelectorAll(".room-item").forEach((el) => {
    el.classList.remove("active");
    if (el.textContent === partnerName) el.classList.add("active");
  });

  await loadMessageHistory(chatId);

  if (mqttClient) {
    mqttClient.subscribe(`chat/rooms/${chatId}`);
  }

  const headerActions = document.getElementById("chat-header-actions");
  const headerInfoBtn = document.getElementById("header-info-btn");
  const headerLeaveBtn = document.getElementById("header-leave-btn");
  const headerDeleteBtn = document.getElementById("header-delete-btn"); // NEU

  if (headerActions) {
    headerActions.style.display = "flex"; // Jetzt für Gruppen UND private Chats anzeigen (wegen dem Mülleimer)
    const isGroup = partnerName.startsWith("👥");

    // Info & Verlassen-Icon nur bei Gruppen einblenden
    if (headerInfoBtn) headerInfoBtn.style.display = isGroup ? "flex" : "none";
    if (headerLeaveBtn) headerLeaveBtn.style.display = isGroup && !ichBinAusgetreten ? "flex" : "none";

    // 1. Aktionen für GRUPPEN
    if (isGroup) {
      if (headerInfoBtn) {
        headerInfoBtn.onclick = () => zeigeGruppenInfo(chatId, partnerName.replace("👥 ", "").replace(" (Ausgetreten)", ""));
      }
      if (headerLeaveBtn) {
        headerLeaveBtn.onclick = () => gruppenAktion(chatId, partnerName.replace("👥 ", ""), "leave");
      }
      if (headerDeleteBtn) {
        headerDeleteBtn.onclick = () => gruppenAktion(chatId, partnerName.replace("👥 ", ""), "delete");
      }
    } 
    // 2. Aktionen für PRIVAT-CHATS
    else {
      if (headerDeleteBtn) {
        headerDeleteBtn.onclick = () => loeschePrivatChat(chatId, partnerName);
      }
    }
  }
}

function logout() {
  localStorage.removeItem("messenger_token");

  if (mqttClient) {
    mqttClient.end();
    mqttClient = null;
  }

  showLoginScreen();
}

function connectMQTT() {
  if (mqttClient) mqttClient.end();
  mqttClient = mqtt.connect(MQTT_BROKER_URL, {
    username: "webmessenger-frontend",
    password: "Webmessenger1"
  });

  const meinName = localStorage.getItem("messenger_username");

  mqttClient.on("connect", () => {
    console.log("Verbunden mit dem Chat-Broker!");

    // 1. Auf den aktuellen Chat hören (falls einer offen ist)
    if (aktuellerChatId) {
      mqttClient.subscribe(`chat/rooms/${aktuellerChatId}`);
    }

    // 2. --- NEU: Auf persönliche Benachrichtigungen hören ---
    if (meinName) {
      mqttClient.subscribe(`chat/updates/${meinName}`);
      console.log(`Lausche auf Update-Signale für: chat/updates/${meinName}`);
    }
  });

  mqttClient.on("error", (err) => {
    console.error("MQTT Verbindungsfehler: ", err);
  });

  mqttClient.on("message", (topic, message) => {
    try {
      // --- NEU: Wenn ein Update-Signal reinkommt, Chatliste sofort aktualisieren! ---
      if (topic === `chat/updates/${meinName}`) {
        const data = JSON.parse(message.toString());
        if (data.action === "refresh_chats") {
          console.log("🔄 Signal erhalten: Neue Chat-Liste wird geladen...");
          ladeAktiveChats();
        }
        return; // Keine Chat-Nachrichtenlogik für dieses Topic ausführen
      }

      // Empfange Nachrichten nur für den aktuell geöffneten Chat
      if (topic === `chat/rooms/${aktuellerChatId}`) {
        const data = JSON.parse(message.toString());

        if (data.sender !== meinName) {
          const klartext = decryptMsg(data.content, data.sender, data.index);
          displayNewMessage(`${data.sender}: ${klartext}`, "received");
        }

        if (data.index >= msgCounter) msgCounter = data.index + 1;
      }
    } catch (e) {
      displayNewMessage("[Fehler beim Lesen]", "received");
    }
  });
}

async function sendMessage() {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  const meinName = localStorage.getItem("messenger_username") || "Unbekannt";
  const token = localStorage.getItem("messenger_token");

  if (!text || !mqttClient || !aktuellerChatId) return;

  // Mute-Status prüfen
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/chats/${aktuellerChatId}/members`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();
    if (data.success) {
      const ichSelbst = data.members.find((m) => m.name === meinName);
      if (
        ichSelbst?.mutedUntil &&
        new Date(ichSelbst.mutedUntil) > new Date()
      ) {
        const bis = new Date(ichSelbst.mutedUntil).toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        });
        alert(`🔇 Du bist bis ${bis} Uhr gemutet.`);
        return;
      }
    }
  } catch (e) {
    /* ignorieren, trotzdem senden */
  }

  const encrypted = encryptMsg(text, meinName, msgCounter);
  const payload = {
    sender: meinName,
    content: encrypted,
    index: msgCounter,
    timeStamp: new Date().getTime(),
  };

  mqttClient.publish(`chat/rooms/${aktuellerChatId}`, JSON.stringify(payload));
  displayNewMessage(text, "sent");
  msgCounter++;
  input.value = "";
}

// ---- NEUE LOGIN HANDLER-LOGIK ----
async function loadMessageHistory(chatId) {
  const token = localStorage.getItem("messenger_token");
  const meinName = localStorage.getItem("messenger_username");

  if (!token) return;

  try {
    console.log(`Lade Chatverlauf für Chat-ID [${chatId}]...`);
    // WICHTIG: Die Route im Backend heißt bei dir /api/history/:chatId !
    const response = await fetch(
      `${API_BASE_URL}/api/history/${chatId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) throw new Error(`HTTP-Fehler!`);

    const history = await response.json();

    const msgDiv = document.getElementById("messages");
    if (msgDiv) msgDiv.innerHTML = ""; // Altes Chatfenster leeren

    if (!Array.isArray(history) || history.length === 0) {
      msgCounter = 1;
      console.log("Keine alten Nachrichten für diesen Raum gefunden.");
      return;
    }

    msgCounter = Math.max(...history.map((m) => m.index)) + 1;

    history.forEach((msg) => {
      const senderName = msg.sender || msg.name;
      const klartext = decryptMsg(msg.content, senderName, msg.index);
      const typ = senderName === meinName ? "sent" : "received";
      const anzeigeText =
        typ === "sent" ? klartext : `${senderName}: ${klartext}`;
      displayNewMessage(anzeigeText, typ);
    });
  } catch (err) {
    console.error("Fehler beim Laden der History im Frontend:", err);
  }
}

function displayNewMessage(text, type) {
  const msgDiv = document.getElementById("messages");
  if (!msgDiv) return;
  const newMsg = document.createElement("div");
  newMsg.classList.add("message", type);
  newMsg.textContent = text;
  msgDiv.appendChild(newMsg);

  msgDiv.scrollTop = msgDiv.scrollHeight;
}

async function initApp() {
  const token = localStorage.getItem("messenger_token");

  if (token) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/refresh-token`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const daten = await response.json();
        localStorage.setItem("messenger_token", daten.token);
        console.log("Token erfolgreich erneuert.");
        showChatScreen();
        connectMQTT(); // <-- NEU: Verbindet den MQTT-Client beim automatischen Login!
      } else {
        logout();
      }
    } catch (err) {
      console.error("Server nicht erreichbar! Nutze Offline-Modus.");
      showChatScreen();
      connectMQTT(); // <-- NEU: Auch im Offline/Fallback-Modus versuchen zu verbinden
    }
  } else {
    console.log("Kein Token gefunden. Zeige Login.");
    showLoginScreen();
  }
}

// ---- KORRIGIERTE LOGIN HANDLER-LOGIK ----
async function handleLogin() {
  const kontakt = document.getElementById("kontakt").value;
  const password = document.getElementById("password").value;
  const errorBox = document.getElementById("login-error");

  // Box vorher unsichtbar machen
  errorBox.style.display = "none";
  errorBox.textContent = "";

  if (!kontakt || !password) {
    showError(errorBox, "Bitte füllen Sie beide Felder aus!");
    return;
  }

  const loginDaten = { kontakt, password };

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginDaten),
    });

    const ergebnis = await response.json();

    if (response.ok && ergebnis.success) {
      console.log("Login erfolgreich!");

      // HIER werden die Daten erst gespeichert, nachdem wir die Antwort vom Server haben!
      localStorage.setItem("messenger_token", ergebnis.token);
      localStorage.setItem("messenger_username", ergebnis.user.displayName);

      showChatScreen();
      connectMQTT();
    } else {
      // Zeigt den genauen Fehler (z.B. "E-Mail nicht registriert" oder "Passwort falsch")
      showError(errorBox, ergebnis.message || "Login fehlgeschlagen");
    }
  } catch (err) {
    console.error("Netzwerkfehler:", err);
    showError(errorBox, "Server ist derzeit nicht erreichbar!");
  }
}

// ---- REGISTRIERUNGS HANDLER ----
async function handleRegister() {
  const displayName = document.getElementById("reg-name").value;
  const mail = document.getElementById("reg-email").value;
  const phone = document.getElementById("reg-phone").value;
  const password = document.getElementById("reg-password").value;
  const errorBox = document.getElementById("register-error");

  errorBox.style.display = "none";

  if (!displayName || !mail || !password) {
    showError(errorBox, "Bitte fülle Name, E-Mail und Passwort aus!");
    return;
  }

  const registerDaten = { 
    displayName, 
    mail, 
    phone, 
    password,
    publicKey: "secretKey" + Date.now()
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerDaten),
    });

    const ergebnis = await response.json();

    if (response.ok && ergebnis.success) {
      alert("🎉 Registrierung erfolgreich! Bitte logge dich ein.");
      showLoginScreen();
    } else {
      showError(errorBox, ergebnis.error || "Registrierung fehlgeschlagen.");
    }
  } catch (err) {
    console.error("Registrierungsfehler:", err);
    showError(errorBox, "Server beim Registrieren nicht erreichbar!");
  }
}

// =================================================================
// NEUE FUNKTIONEN FÜR CHAT-AUFLISTUNG UND KONTAKTSUCHE
// =================================================================

async function ladeAktiveChats() {
  const token = localStorage.getItem("messenger_token");
  const meinName = localStorage.getItem("messenger_username");
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const chats = await response.json();
    const listContainer = document.getElementById("room-list");
    listContainer.innerHTML = "";

    if (chats.length === 0) {
      listContainer.innerHTML = `<li style="padding: 15px; color: #888; text-align: center; font-size: 13px;">Noch keine Chats gestartet. Nutze die Suche oben!</li>`;
      return;
    }

    chats.forEach((chat) => {
      let chatTitel = "";
      let partnerName = "";

      if (chat.type === "private") {
        // NEU: members ist jetzt { user: { displayName, ... }, joinedAt, ... }
        const partner = chat.members.find(
          (m) => m.user && m.user.displayName !== meinName,
        );
        chatTitel = partner ? partner.user.displayName : "Unbekannter Partner";
        partnerName = chatTitel;
      } else {
        chatTitel = `👥 ${chat.groupName || "Gruppe"}`;
        if (chat.ichBinAusgetreten) {
          chatTitel += " (Ausgetreten)";
        }
        partnerName = chatTitel;
      }

      const li = document.createElement("li");
      li.className = `room-item ${chat._id === aktuellerChatId ? "active" : ""}`;
      if (chat.ichBinAusgetreten) {
        li.style.opacity = "0.6"; // Ausgetretene Gruppen leicht ausgrauen
      }

      const spanText = document.createElement("span");
      spanText.textContent = chatTitel;
      spanText.style.flex = "1";
      spanText.onclick = () =>
        wechsleChat(chat._id, partnerName, chat.ichBinAusgetreten);
      li.appendChild(spanText);

      // Container für Buttons
      const actionsContainer = document.createElement("div");
      actionsContainer.className = "chat-actions";

      if (chat.type === "group") {
        // 1. AUSTRETEN-BUTTON (nur anzeigen, wenn man noch nicht ausgetreten ist)
        // INFO-BUTTON
        /*const infoBtn = document.createElement("button");
        infoBtn.className = "action-btn";
        infoBtn.innerHTML = "ℹ️";
        infoBtn.title = "Gruppeninfo & Mitglieder verwalten";
        infoBtn.onclick = (e) => {
          e.stopPropagation();
          zeigeGruppenInfo(chat._id, chat.groupName || "Gruppe");
        };
        actionsContainer.appendChild(infoBtn);
        if (!chat.ichBinAusgetreten) {
          const leaveBtn = document.createElement("button");
          leaveBtn.className = "action-btn";
          leaveBtn.innerHTML = "🚪";
          leaveBtn.title = "Gruppe verlassen (Verlauf behalten)";
          leaveBtn.onclick = (e) => {
            e.stopPropagation();
            gruppenAktion(chat._id, chat.groupName, "leave");
          };
          actionsContainer.appendChild(leaveBtn);
        }*/

        // 2. LÖSCHEN-BUTTON (immer da, um die Gruppe aus der Liste zu entfernen)
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "action-btn";
        deleteBtn.innerHTML = "🗑️";
        deleteBtn.title = "Gruppe komplett löschen/ausblenden";
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          gruppenAktion(chat._id, chat.groupName, "delete");
        };
        actionsContainer.appendChild(deleteBtn);
      } else {
        // Privater Chat hat nur den normalen Mülleimer
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "action-btn";
        deleteBtn.innerHTML = "🗑️";
        deleteBtn.title = "Chatverlauf löschen";
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          loeschePrivatChat(chat._id, chatTitel);
        };
        actionsContainer.appendChild(deleteBtn);
      }

      li.appendChild(actionsContainer);
      listContainer.appendChild(li);
    });
  } catch (err) {
    console.error("Fehler beim Laden der Chat-Liste:", err);
  }
}
// Aktion für GRUPPEN: Verlassen oder Löschen
async function gruppenAktion(chatId, groupName, action) {
  let frage = "";
  if (action === "leave") {
    frage = `Möchtest du die Gruppe "${groupName}" wirklich verlassen?\n\n(Du empfängst keine neuen Nachrichten mehr, behältst aber den alten Verlauf in deiner Liste.)`;
  } else if (action === "delete") {
    frage = `Möchtest du die Gruppe "${groupName}" wirklich komplett aus deiner Liste löschen?\n\n(Der Verlauf wird unwiderruflich ausgeblendet. Falls du noch nicht ausgetreten bist, wirst du automatisch ausgetragen.)`;
  }

  if (!confirm(frage)) return;

  const token = localStorage.getItem("messenger_token");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/chats/${chatId}?action=${action}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (response.ok) {
      // Wenn der aktuell geöffnete Chat gelöscht oder verlassen wurde, Ansicht zurücksetzen
      if (aktuellerChatId === chatId) {
        aktuellerChatId = null;
        document.getElementById("current-room-title").textContent =
          "Wähle einen Chat aus, um zu schreiben";
        document.getElementById("messages").innerHTML = "";
        document.getElementById("chat-input-area").style.display = "none";
      }
      await ladeAktiveChats();
    } else {
      alert("Fehler bei der Gruppenaktion.");
    }
  } catch (err) {
    console.error("Fehler bei Gruppenaktion:", err);
  }
}

// Aktion für PRIVAT-CHATS (Normales Löschen/Ausblenden)
async function loeschePrivatChat(chatId, partnerName) {
  const frage = `Möchtest du den Chat mit "${partnerName}" löschen?\n\n(Der Chat wird ausgeblendet, bis du eine neue Nachricht von dieser Person erhältst.)`;
  if (!confirm(frage)) return;

  const token = localStorage.getItem("messenger_token");

  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      if (aktuellerChatId === chatId) {
        aktuellerChatId = null;
        document.getElementById("current-room-title").textContent =
          "Wähle einen Chat aus, um zu schreiben";
        document.getElementById("messages").innerHTML = "";
        document.getElementById("chat-input-area").style.display = "none";
      }
      await ladeAktiveChats();
    } else {
      alert("Fehler beim Löschen des Chats.");
    }
  } catch (err) {
    console.error("Fehler beim Löschen des Privat-Chats:", err);
  }
}

// Neue Funktion zum Löschen im Frontend
async function loescheOderVerlasseChat(chatId, chatName, type) {
  const frage =
    type === "group"
      ? `Möchtest du die Gruppe "${chatName}" wirklich verlassen? Du kannst dann keine neuen Nachrichten mehr empfangen.`
      : `Möchtest du den Verlauf von "${chatName}" löschen? Der Chat wird ausgeblendet, bis neue Nachrichten eingehen.`;

  if (!confirm(frage)) return;

  const token = localStorage.getItem("messenger_token");

  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      // Wenn der aktive Chat gelöscht/verlassen wurde, Ansicht zurücksetzen
      if (aktuellerChatId === chatId) {
        aktuellerChatId = null;
        document.getElementById("current-room-title").textContent =
          "Wähle einen Chat aus, um zu schreiben";
        document.getElementById("messages").innerHTML = "";
        document.getElementById("chat-input-area").style.display = "none";
      }
      await ladeAktiveChats();
    } else {
      alert("Fehler bei der Aktion.");
    }
  } catch (err) {
    console.error("Fehler:", err);
  }
}

async function sucheKontakt() {
  const queryInput = document.getElementById("contact-search-input");
  const query = queryInput.value.trim();
  const resultBox = document.getElementById("search-result-box");
  const token = localStorage.getItem("messenger_token");

  if (!query) return;

  try {
    resultBox.style.display = "block";
    resultBox.innerHTML =
      "<p style='padding: 10px; color: #aaa;'>Suche läuft...</p>";

    const response = await fetch(
      `${API_BASE_URL}/api/users/search?query=${encodeURIComponent(query)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await response.json();

    if (!response.ok || !data.success) {
      resultBox.innerHTML = `<p style="padding: 10px; color: #ef4444; font-size: 13px;">Kein Nutzer mit dieser E-Mail/Nummer gefunden.</p>`;
      return;
    }

    const user = data.user;
    resultBox.innerHTML = `
            <div style="padding: 10px; background: #24243e; border-radius: 8px; margin-top: 5px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: #fff;">${user.displayName}</strong><br>
                    <span style="font-size: 11px; color: #aaa;">${user.mail || user.phone}</span>
                </div>
                <button onclick="startePrivatenChat('${user._id}', '${user.displayName}')" 
                        style="background: #a855f7; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                    Chatten
                </button>
            </div>
        `;
  } catch (err) {
    resultBox.innerHTML = `<p style="padding: 10px; color: #ef4444;">Suchfehler.</p>`;
  }
}

async function startePrivatenChat(partnerId, partnerName) {
  const token = localStorage.getItem("messenger_token");
  const resultBox = document.getElementById("search-result-box");
  const queryInput = document.getElementById("contact-search-input");

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/chats/get-or-create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partnerId }),
      },
    );
    const data = await response.json();

    if (data.success) {
      resultBox.style.display = "none";
      queryInput.value = "";

      await ladeAktiveChats();
      wechsleChat(data.chatId, partnerName);

      if (mqttClient) {
        const updatePayload = { action: "refresh_chats" };
        mqttClient.publish(
          `chat/updates/${partnerName}`,
          JSON.stringify(updatePayload),
        );
      }
    }
  } catch (err) {
    console.error("Fehler beim Starten des Chats:", err);
  }
}

let temporaereGruppenMitglieder = []; // Speichert ausgewählte User-IDs für die neue Gruppe

// Öffnet ein einfaches Overlay (Modal) im Browser
// Öffnet ein einfaches Overlay (Modal) im Browser
function zeigeGruppenModal() {
  // Falls schon ein Modal existiert, entfernen wir es
  const altesModal = document.getElementById("group-modal");
  if (altesModal) altesModal.remove();

  temporaereGruppenMitglieder = []; // Zurücksetzen

  const modal = document.createElement("div");
  modal.id = "group-modal";
  modal.className = "modal-overlay"; // <--- NEU: Nutzt jetzt die CSS-Klasse

  modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Neue Gruppe erstellen</h3>
                <button id="close-group-modal" class="close-modal-btn">✕</button>
            </div>
            
            <div>
                <label style="font-size: 12px; color: var(--text-muted);">Gruppenname</label>
                <input type="text" id="new-group-name" placeholder="z.B. Lerngruppe">
            </div>

            <div>
                <label style="font-size: 12px; color: var(--text-muted);">Mitglieder hinzufügen</label>
                <div style="display: flex; gap: 5px; margin-top: 5px;">
                    <input type="text" id="group-search-input" placeholder="Email/Telefonnummer..." style="margin-top:0;">
                    <button id="group-search-btn" class="btn-primary" style="margin-top:0; width:auto; padding: 0 15px;">🔍</button>
                </div>
                <div id="group-search-results" style="margin-top: 5px;"></div>
            </div>

            <div>
                <label style="font-size: 12px; color: var(--text-muted);">Ausgewählte Mitglieder:</label>
                <ul id="selected-members-list" style="list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px;"></ul>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                <button id="submit-group-btn" class="btn-primary" style="width: auto; padding: 10px 20px;">Gruppe erstellen</button>
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  // Event Listener für das Modal
  document.getElementById("close-group-modal").addEventListener("click", () => modal.remove());
  document.getElementById("group-search-btn").addEventListener("click", sucheGruppeKontakt);
  document.getElementById("submit-group-btn").addEventListener("click", sendeGruppeErstellen);
}

// Sucht nach Nutzern innerhalb des Gruppen-Modals
async function sucheGruppeKontakt() {
  const query = document.getElementById("group-search-input").value.trim();
  const resultBox = document.getElementById("group-search-results");
  const token = localStorage.getItem("messenger_token");

  if (!query) return;

  try {
    resultBox.innerHTML =
      "<p style='font-size: 12px; color: #aaa;'>Suche...</p>";
    const response = await fetch(
      `${API_BASE_URL}/api/users/search?query=${encodeURIComponent(query)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await response.json();

    if (!response.ok || !data.success) {
      resultBox.innerHTML =
        "<p style='font-size: 12px; color: #ef4444;'>Kein Nutzer gefunden.</p>";
      return;
    }

    const user = data.user;
    resultBox.innerHTML = `
            <div style="padding: 8px; background: #24243e; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                <span style="font-size: 13px;">${user.displayName}</span>
                <button onclick="fuegeMitgliedHinzu('${user._id}', '${user.displayName}')" 
                        style="background: #10b981; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    Hinzufügen
                </button>
            </div>
        `;
  } catch (err) {
    resultBox.innerHTML =
      "<p style='font-size: 12px; color: #ef4444;'>Fehler bei der Suche.</p>";
  }
}

// Fügt ein Mitglied visuell der Liste hinzu
window.fuegeMitgliedHinzu = function (id, name) {
  if (temporaereGruppenMitglieder.includes(id)) return; // Dubletten verhindern

  temporaereGruppenMitglieder.push(id);
  const list = document.getElementById("selected-members-list");
  const li = document.createElement("li");
  li.id = `member-${id}`;
  li.style =
    "background: #a855f7; padding: 4px 10px; border-radius: 12px; font-size: 12px; display: flex; align-items: center; gap: 5px;";
  li.innerHTML = `
        <span>${name}</span>
        <span onclick="entferneMitglied('${id}')" style="cursor: pointer; font-weight: bold; color: #ff4d4d;">×</span>
    `;
  list.appendChild(li);
  document.getElementById("group-search-results").innerHTML = "";
  document.getElementById("group-search-input").value = "";
};

// Entfernt ein ausgewähltes Mitglied wieder
window.entferneMitglied = function (id) {
  temporaereGruppenMitglieder = temporaereGruppenMitglieder.filter(
    (mId) => mId !== id,
  );
  const li = document.getElementById(`member-${id}`);
  if (li) li.remove();
};

// Schickt die fertigen Gruppendaten an das Backend
async function sendeGruppeErstellen() {
  const groupName = document.getElementById("new-group-name").value.trim();
  const token = localStorage.getItem("messenger_token");

  if (!groupName) {
    alert("Bitte gib einen Gruppennamen ein!");
    return;
  }
  if (temporaereGruppenMitglieder.length === 0) {
    alert("Bitte füge mindestens ein Mitglied hinzu!");
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/chats/create-group`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          groupName: groupName,
          memberIds: temporaereGruppenMitglieder,
        }),
      },
    );

    const data = await response.json();
    if (data.chatId) {
      document.getElementById("group-modal").remove(); // Modal schließen
      await ladeAktiveChats(); // Liste aktualisieren
      wechsleChat(data.chatId, `👥 ${data.groupName}`); // Direkt in die neue Gruppe wechseln
    } else {
      alert("Fehler beim Erstellen der Gruppe.");
    }
  } catch (err) {
    console.error("Fehler beim Senden des Gruppen-Requests:", err);
  }
}

// Hilfsfunktion zum Einblenden von Fehlern im Interface
function showError(element, message) {
  element.textContent = message;
  element.style.display = "block";
}

// =================================================================
// GRUPPENINFO & VERWALTUNG
// =================================================================

async function zeigeGruppenInfo(chatId, groupName) {
  const token = localStorage.getItem("messenger_token");
  const meinName = localStorage.getItem("messenger_username");

  const res = await fetch(`${API_BASE_URL}/api/chats/${chatId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) return alert("Fehler beim Laden der Mitglieder");

  const members = data.members;
  const ichSelbst = members.find((m) => m.name === meinName);
  const meineRolle = ichSelbst?.role || "member";
  const rangOrdnung = { founder: 4, admin: 3, moderator: 2, member: 1 };

  const roleBadge = (role) => {
    const farben = {
      founder: "#f59e0b",
      admin: "#a855f7",
      moderator: "#3b82f6",
      member: "#6b7280",
    };
    const labels = {
      founder: "👑 Gründer",
      admin: "🛡️ Admin",
      moderator: "🔵 Moderator",
      member: "Mitglied",
    };
    return `<span style="font-size:11px;padding:2px 7px;border-radius:10px;background:${farben[role]}22;color:${farben[role]};border:1px solid ${farben[role]};">${labels[role]}</span>`;
  };

  const altesModal = document.getElementById("group-info-modal");
  if (altesModal) altesModal.remove();

  const modal = document.createElement("div");
  modal.id = "group-info-modal";
  modal.className = "modal-overlay";


  const memberRows = members
    .map((m) => {
      const istIch = m.name === meinName;
      const kannVerwalten =
        rangOrdnung[meineRolle] > rangOrdnung[m.role] && !istIch;
      const gemutet = m.mutedUntil && new Date(m.mutedUntil) > new Date();
      let aktionen = "";

      if (kannVerwalten) {
        // Rolle ändern (Dropdowns ohne Inline-Styles, nutzen jetzt .btn-small-action)
        if (meineRolle === "founder" || meineRolle === "admin") {
          aktionen += `
            <select onchange="aendereRolle('${chatId}','${m.userId}',this.value)" class="btn-small-action">
              <option value="">Rolle...</option>
              ${meineRolle === "founder" ? `<option value="admin" ${m.role==="admin"?"selected":""}>Admin</option>` : ""}
              <option value="moderator" ${m.role==="moderator"?"selected":""}>Moderator</option>
              <option value="member"    ${m.role==="member"?"selected":""}>Mitglied</option>
            </select>`;
        }

        // Muten
        if (!gemutet) {
          aktionen += `
            <select onchange="muteMitglied('${chatId}','${m.userId}',this.value)" class="btn-small-action">
              <option value="">Muten...</option>
              <option value="5">5 Min</option>
              <option value="15">15 Min</option>
              <option value="30">30 Min</option>
              <option value="60">1 Std</option>
            </select>`;
        } else {
          const bis = new Date(m.mutedUntil).toLocaleTimeString("de-DE", {hour:"2-digit", minute:"2-digit"});
          aktionen += `<span style="font-size:11px;color:#ef4444;">🔇 bis ${bis}</span>`;
        }

        // Kicken
        if (["founder","admin"].includes(meineRolle)) {
          aktionen += `
            <button onclick="entferneMitgliedAusGruppe('${chatId}','${m.userId}')" class="btn-small-action danger">
              Kick
            </button>`;
        }
      }

      // Kontakt hinzufügen Button (für alle sichtbar, außer für sich selbst)
      const kontaktBtn = !istIch ? `
        <button onclick="fuegeZuKontaktenHinzu('${m.userId}', '${m.name}')" title="Zu Kontakten hinzufügen" style="background:transparent;border:none;color:#a0aec0;font-size:14px;cursor:pointer;">➕</button>` : "";

      const nameAnzeige = istIch ? `<strong>${m.name} (Du)</strong>` : m.name;
      const kontaktInfo = m.phone ? `<span style="font-size:11px;color:#6b7280;display:block;">${m.phone}</span>` : 
                          m.mail  ? `<span style="font-size:11px;color:#6b7280;display:block;">${m.mail}</span>` : "";

      // HIER KOMMT DAS NEUE HTML FÜR JEDEN NUTZER ZURÜCK
      return `
        <li class="member-item">
          <div class="member-info">
            <div style="display:flex;align-items:center;gap:6px;">
              <span>${nameAnzeige}</span>
              ${m.role !== 'member' ? `<span class="role-badge ${m.role === 'admin' || m.role === 'founder' ? 'admin' : ''}">${m.role}</span>` : ''}
              ${kontaktBtn}
            </div>
            ${kontaktInfo}
          </div>
          <div class="member-actions">${aktionen}</div>
        </li>`;
    })
    .join("");

  const kannHinzufuegen = ["founder", "admin"].includes(meineRolle);
  const hinzufuegenSection = kannHinzufuegen
    ? `
    <div style="margin-top:15px;padding-top:15px;border-top:1px solid #2a2a4a;">
      <label style="font-size:12px;color:#aaa;">Mitglied hinzufügen</label>
      <div style="display:flex;gap:5px;margin-top:5px;">
        <input type="text" id="add-member-input" placeholder="E-Mail oder Name suchen..."
               style="flex:1;padding:8px;border-radius:6px;border:1px solid #444;background:#0f0c1b;color:white;font-size:13px;">
        <button onclick="sucheUndFuegeHinzu('${chatId}')"
                style="background:#a855f7;border:none;padding:0 12px;border-radius:6px;cursor:pointer;color:white;">🔍</button>
      </div>
      <div id="add-member-result" style="margin-top:5px;"></div>
    </div>`
    : "";

  modal.innerHTML = `
    <div class="modal-content" style="max-height:80vh;">
      <div class="modal-header">
        <h3 style="margin:0;">👥 ${groupName}</h3>
        <button onclick="document.getElementById('group-info-modal').remove()" class="close-modal-btn">✕</button>
      </div>
      <p style="font-size:12px;color:#aaa;margin:0;">${members.length} Mitglieder</p>
      <ul class="member-list">${memberRows}</ul>
      ${hinzufuegenSection}
    </div>`;

  document.body.appendChild(modal);
}

// Hilfsfunktion, um den Raumnamen ohne Absturz auszulesen
function getSicherenRaumTitel() {
  const roomTitleEl = document.getElementById("current-room-title");
  return roomTitleEl ? roomTitleEl.textContent.replace("👥 ", "") : "Gruppe";
}

async function aendereRolle(chatId, userId, newRole) {
  if (!newRole) return;
  const token = localStorage.getItem("messenger_token");
  const res = await fetch(`${API_BASE_URL}/api/chats/${chatId}/members/role`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId, newRole }),
  });
  const data = await res.json();
  if (data.success) {
    zeigeGruppenInfo(chatId, getSicherenRaumTitel());
  } else {
    alert(data.error || "Fehler beim Ändern der Rolle");
  }
}

async function muteMitglied(chatId, userId, minutes) {
  if (!minutes) return;
  const token = localStorage.getItem("messenger_token");
  const res = await fetch(`${API_BASE_URL}/api/chats/${chatId}/members/mute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId, minutes: parseInt(minutes) }),
  });
  const data = await res.json();
  if (data.success) {
    zeigeGruppenInfo(chatId, getSicherenRaumTitel());
  } else {
    alert(data.error || "Fehler beim Muten");
  }
}

async function entferneMitgliedAusGruppe(chatId, userId) {
  if (!confirm("Mitglied wirklich entfernen?")) return;
  const token = localStorage.getItem("messenger_token");
  const res = await fetch(`${API_BASE_URL}/api/chats/${chatId}/members/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId }),
  });
  const data = await res.json();
  if (data.success) {
    zeigeGruppenInfo(chatId, getSicherenRaumTitel());
  } else {
    alert(data.error || "Fehler beim Entfernen");
  }
}

async function sucheUndFuegeHinzu(chatId) {
  const query = document.getElementById("add-member-input").value.trim();
  const resultBox = document.getElementById("add-member-result");
  const token = localStorage.getItem("messenger_token");
  if (!query) return;

  const res = await fetch(
    `${API_BASE_URL}/api/users/search?query=${encodeURIComponent(query)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const data = await res.json();

  if (!data.success) {
    resultBox.innerHTML = `<p style="color:#ef4444;font-size:12px;">Kein Nutzer gefunden.</p>`;
    return;
  }

  const user = data.user;
  resultBox.innerHTML = `
    <div style="padding:8px;background:#24243e;border-radius:6px;display:flex;justify-content:space-between;align-items:center;margin-top:5px;">
      <span style="font-size:13px;">${user.displayName}</span>
      <button onclick="fuegeZurGruppeHinzu('${chatId}','${user._id}')"
              style="background:#10b981;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">
        Hinzufügen
      </button>
    </div>`;
}

async function fuegeZurGruppeHinzu(chatId, userId) {
  const token = localStorage.getItem("messenger_token");
  const res = await fetch(
    `${API_BASE_URL}/api/chats/${chatId}/members/add`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
    },
  );
  const data = await res.json();
  if (data.success) {
    zeigeGruppenInfo(
      chatId,
      document
        .getElementById("current-room-title")
        .textContent.replace("👥 ", ""),
    );
  } else {
    alert(data.error || "Fehler beim Hinzufügen");
  }
}

async function fuegeZuKontaktenHinzu(userId, userName) {
  const token = localStorage.getItem("messenger_token");
  try {
    const response = await fetch(`${API_BASE_URL}/api/chats/get-or-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ partnerId: userId })
    });
    const data = await response.json();
    if (data.success) {
      await ladeAktiveChats();
      alert(`✅ ${userName} wurde zu deinen Kontakten hinzugefügt!`);
    }
  } catch(err) {
    alert("Fehler beim Hinzufügen.");
  }
}

initApp();
