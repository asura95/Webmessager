const GROUP_SECRET = "meim-super-sicheres-passwort-123";
let msgCounter = 1;

const appDiv = document.getElementById("app");
let mqttClient;

const meineClientID = "user_" + Math.floor(Math.random() * 1000000);


let aktuellerChatId = null;
let chatPartnerName = "";    // Wird vom Server geliefert

function encryptMsg(text, senderName, index) {
    const key = GROUP_SECRET + senderName + index;  // + nicht ,
    return CryptoJS.AES.encrypt(text, key).toString();
}

function decryptMsg(encrypted, senderName, index) {
    try {
        const key = GROUP_SECRET + senderName + index;
        const bytes = CryptoJS.AES.decrypt(encrypted, key);
        const klartext = bytes.toString(CryptoJS.enc.Utf8);
        return klartext || "[Entschlüsselung fehlgeschlagen]";
    } catch(e) {
        return "[Entschlüsselung fehlgeschlagen]";
    }
}

function showLoginScreen(){
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

    document.getElementById("register-btn").addEventListener("click", handleRegister);
    document.getElementById("back-to-login-btn").addEventListener("click", showLoginScreen);
}

function showChatScreen(){
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

            <div id="chat-container">
                <header>
                    <h3 id="current-room-title">Wähle einen Chat aus, um zu schreiben</h3>
                </header>
                <div id="messages"></div>
                <div class="input-area" style="display: none;" id="chat-input-area">
                    <input type="text" id="msg-input" placeholder="Nachricht schreiben...">
                    <button id="send-btn">Senden</button>
                </div>
            </div>
        </div>
    `;

   // Event Listener zuweisen
    document.getElementById("logout-btn").addEventListener("click", logout);
    document.getElementById("contact-search-btn").addEventListener("click", sucheKontakt);
    document.getElementById("contact-search-input").addEventListener("keypress", (e) => {
        if(e.key === "Enter") sucheKontakt();
    });

    // --- NEU: Event Listener für das Senden von Nachrichten ---
    const sendBtn = document.getElementById("send-btn");
    const msgInput = document.getElementById("msg-input");

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

    // Lade die existierenden Chats des Users beim Start
    ladeAktiveChats();

}

async function wechsleChat(chatId, partnerName) {
    if (mqttClient && aktuellerChatId) {
        // Vom alten spezifischen Chat-Topic abmelden
        mqttClient.unsubscribe(`chat/rooms/${aktuellerChatId}`);
    }

    aktuellerChatId = chatId;
    chatPartnerName = partnerName;

    // Header und Eingabebereich updaten
    document.getElementById("current-room-title").textContent = partnerName;
    document.getElementById("chat-input-area").style.display = "flex";

    // CSS-Klassen für aktive Auswahl in der Seitenleiste anpassen
    document.querySelectorAll(".room-item").forEach(el => {
        el.classList.remove("active");
        if (el.textContent === partnerName) el.classList.add("active");
    });

    // 1. History laden (per chatId!)
    await loadMessageHistory(chatId);

    // 2. MQTT-Client auf das neue dynamische Chat-Topic schalten
    if (mqttClient) {
        mqttClient.subscribe(`chat/rooms/${chatId}`);
    }
}

function logout(){
    localStorage.removeItem("messenger_token");

    if(mqttClient){
        mqttClient.end();
        mqttClient = null;
    }

    showLoginScreen();
}



function connectMQTT(){
    if(mqttClient) mqttClient.end();
    mqttClient = mqtt.connect('ws://localhost:9001');

    mqttClient.on('connect', () => {
        console.log("Verbunden mit dem Chat-Broker!");
        if (aktuellerChatId) {
            mqttClient.subscribe(`chat/rooms/${aktuellerChatId}`);
        }
    });

    mqttClient.on('message', (topic, message) => {
        try {
            // Empfange Nachrichten nur für den aktuell geöffneten Chat
            if (topic === `chat/rooms/${aktuellerChatId}`) {
                const data = JSON.parse(message.toString());
                const meinName = localStorage.getItem("messenger_username");

                if(data.sender !== meinName) {
                    const klartext = decryptMsg(data.content, data.sender, data.index);
                    displayNewMessage(`${data.sender}: ${klartext}`, 'received');
                }

                if(data.index >= msgCounter) msgCounter = data.index + 1;
            }
        } catch (e) {
            displayNewMessage("[Fehler beim Lesen]", 'received');
        }
    });
}

function sendMessage(){
    const input = document.getElementById("msg-input");
    const text = input.value.trim();
    const meinName = localStorage.getItem("messenger_username") || "Unbekannt";
    
    // Wir senden nur, wenn wir auch wirklich in einem Chat (aktuellerChatId) sind!
    if(text && mqttClient && aktuellerChatId){
        const encrypted = encryptMsg(text, meinName, msgCounter);

        const payload = {
            sender: meinName,
            content: encrypted,
            index: msgCounter,
            timeStamp: new Date().getTime()
        };

        // Veröffentlichen auf dem spezifischen Chat-Topic der Datenbank-ID
        mqttClient.publish(`chat/rooms/${aktuellerChatId}`, JSON.stringify(payload));
        displayNewMessage(text, 'sent');
        msgCounter++;
        input.value = "";
    }
}

// ---- NEUE LOGIN HANDLER-LOGIK ----
async function loadMessageHistory(chatId) {
    const token = localStorage.getItem("messenger_token");
    const meinName = localStorage.getItem("messenger_username");
    
    if (!token) return;
    
    try {
        console.log(`Lade Chatverlauf für Chat-ID [${chatId}]...`);
        // WICHTIG: Die Route im Backend heißt bei dir /api/history/:chatId !
        const response = await fetch(`http://localhost:3000/api/history/${chatId}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error(`HTTP-Fehler!`);
        
        const history = await response.json();

        const msgDiv = document.getElementById("messages");
        if (msgDiv) msgDiv.innerHTML = ""; // Altes Chatfenster leeren

        if (!Array.isArray(history) || history.length === 0) {
            msgCounter = 1;
            console.log("Keine alten Nachrichten für diesen Raum gefunden.");
            return;
        }

        msgCounter = Math.max(...history.map(m => m.index)) + 1;

        history.forEach(msg => {
            const senderName = msg.sender || msg.name;
            const klartext = decryptMsg(msg.content, senderName, msg.index);
            const typ = senderName === meinName ? 'sent' : 'received';
            const anzeigeText = typ === 'sent' ? klartext : `${senderName}: ${klartext}`;
            displayNewMessage(anzeigeText, typ);
        });
    } catch (err) {
        console.error("Fehler beim Laden der History im Frontend:", err);    
    }
}

function displayNewMessage(text, type) {
    const msgDiv = document.getElementById("messages");
    if(!msgDiv) return;
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
            const response = await fetch("http://localhost:3000/api/refresh-token", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
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

    if(!kontakt || !password){
        showError(errorBox, "Bitte füllen Sie beide Felder aus!");
        return;
    }

    const loginDaten = { kontakt, password };

    try {
        const response = await fetch("http://localhost:3000/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(loginDaten)
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

    const registerDaten = { displayName, mail, phone, password };

    try {
        const response = await fetch("http://localhost:3000/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(registerDaten)
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
        const response = await fetch("http://localhost:3000/api/chats", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const chats = await response.json();
        const listContainer = document.getElementById("room-list");
        listContainer.innerHTML = "";

        if (chats.length === 0) {
            listContainer.innerHTML = `<li style="padding: 15px; color: #888; text-align: center; font-size: 13px;">Noch keine Chats gestartet. Nutze die Suche oben!</li>`;
            return;
        }

        chats.forEach(chat => {
            let chatTitel = "";
            
            if (chat.type === "private") {
                // Finde das Mitglied, das NICHT ich selbst bin
                const partner = chat.members.find(m => m.displayName !== meinName);
                chatTitel = partner ? partner.displayName : "Unbekannter Partner";
            } else {
                chatTitel = `👥 ${chat.groupName || "Gruppe"}`;
            }

            const li = document.createElement("li");
            li.className = `room-item ${chat._id === aktuellerChatId ? "active" : ""}`;
            li.textContent = chatTitel;
            li.onclick = () => wechsleChat(chat._id, chatTitel);
            listContainer.appendChild(li);
        });
    } catch (err) {
        console.error("Fehler beim Laden der Chat-Liste:", err);
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
        resultBox.innerHTML = "<p style='padding: 10px; color: #aaa;'>Suche läuft...</p>";

        const response = await fetch(`http://localhost:3000/api/users/search?query=${encodeURIComponent(query)}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
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
        const response = await fetch("http://localhost:3000/api/chats/get-or-create", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ partnerId })
        });
        const data = await response.json();

        if (data.success) {
            resultBox.style.display = "none";
            queryInput.value = "";

            await ladeAktiveChats();
            wechsleChat(data.chatId, partnerName);
        }
    } catch (err) {
        console.error("Fehler beim Starten des Chats:", err);
    }
}

// Hilfsfunktion zum Einblenden von Fehlern im Interface
function showError(element, message) {
    element.textContent = message;
    element.style.display = "block";
}

initApp();
