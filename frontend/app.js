const GROUP_SECRET = "meim-super-sicheres-passwort-123";
let msgCounter = 1;

const appDiv = document.getElementById("app");
let mqttClient;

const meineClientID = "user_" + Math.floor(Math.random() * 1000000);


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
        <div id="chat-container">
            <header>
                <h3>Mein Messenger</h3>
                <button id="logout-btn">Abmelden</button>
            </header>
            <div id="messages">
                </div>
            <div class="input-area">
                <input type="text" id="msg-input" placeholder="Nachricht schreiben...">
                <button id="send-btn">Senden</button>
            </div>
        </div>
    `;

    connectMQTT();
    loadMessageHistory();

    document.getElementById("logout-btn").addEventListener("click", logout);

    document.getElementById("send-btn").addEventListener("click", sendMessage);
    document.getElementById("msg-input").addEventListener("keypress", (e) => {
        if(e.key == "Enter") sendMessage();
    });
    
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
        mqttClient.subscribe('chat/main');
    });

    mqttClient.on('message', (topic, message) => {
        try{
            const data = JSON.parse(message.toString());
            const meinName = localStorage.getItem("messenger_username");

            if(data.sender !== meinName) {
                const klartext = decryptMsg(data.content, data.sender, data.index);
                displayNewMessage(`${data.sender}: ${klartext}`, 'received');
            }

            if(data.index >= msgCounter) msgCounter = data.index + 1;

        }catch (e){
            displayNewMessage("[Fehler beim Lesen]", 'received');
        }
    
            
    });
}

function sendMessage(){
    const input = document.getElementById("msg-input");
    const text = input.value.trim();
    const meinName = localStorage.getItem("messenger_username") || "Unbekannt";
    
    if(text && mqttClient){

        const encrypted = encryptMsg(text, meinName, msgCounter);

        const payload = {
            sender: meinName,
            content: encrypted,
            index: msgCounter,
            timeStamp: new Date().getTime()
        };

        mqttClient.publish('chat/main', JSON.stringify(payload));
        displayNewMessage(text, 'sent');
        msgCounter++;
        input.value = "";
    }
}

// ---- NEUE LOGIN HANDLER-LOGIK ----
async function loadMessageHistory() {
    const token = localStorage.getItem("messenger_token");
    const meinName = localStorage.getItem("messenger_username");
    
    if (!token) {
        console.warn("Kein Token für History-Laden vorhanden.");
        return;
    }
    
    try {
        console.log("Lade Chatverlauf vom Server...");
        const response = await fetch("http://localhost:3000/api/messages", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        
        const history = await response.json();
        console.log("Geladene History vom Server:", history);

        const msgDiv = document.getElementById("messages");
        if (msgDiv) msgDiv.innerHTML = ""; // Altes Chatfenster leeren

        if (!Array.isArray(history) || history.length === 0) {
            console.log("Keine alten Nachrichten in der Datenbank gefunden.");
            return;
        }

        if(history.length > 0){
            msgCounter = Math.max(...history.map(m => m.index)) + 1;
        }

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
            } else {
                logout();
            }
        } catch (err) {
            console.error("Server nicht erreichbar! Nutze Offline-Modus.");
            // Wir zeigen den Chat-Screen trotzdem, falls der Server mal kurz zickt
            showChatScreen();
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

// Hilfsfunktion zum Einblenden von Fehlern im Interface
function showError(element, message) {
    element.textContent = message;
    element.style.display = "block";
}

initApp();
