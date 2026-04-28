const appDiv = document.getElementById("app");

function showLoginScreen(){
    appDiv.innerHTML = `
        <div id= "login-container">
            <h2>Messenger Login</h2>
            <input type="text" id="kontakt" placeholder="Email/Telefon">
            <input type="password" id="password" placeholder="Password">
            <button id="login-btn">Log in</button>
        </div>
    `;
    document.getElementById("login-btn").addEventListener("click", handleLogin);
}

function showChatScreen(){
    appDiv.innerHTML = ` 
        <div id="chat-container">
            <header>
                <h3>Mein Messenger</h3>
                <button onclick ="logout()">Abmelden</button>
            </header>
            <div id="messages">
                </div>
            <div class="input-area">
                <input type="text" id="msg-input" placeholder="Nachricht schreiben..."
                <button id="send-btn">Senden</button>
            </div>
        </div>
    `;
}

async function initApp() {
    const token = localStorage.getItem("messenger_token");
    
    if(token){
        console.log("Token gefunden! Versuche Auto-Login...");
        showChatScreen();
    }else{
        console.log("Keine Token gefunden. Zeige Login.");
        showLoginScreen();
    }
}



async function handleLogin() {
    const kontakt = document.getElementById("kontakt").value;
    const password = document.getElementById("password").value;

    if(!kontakt || !password){
        alert("Bitte füllen Sie beide Felder aus!");
        return;
    }

    const loginDaten = {
        kontakt: kontakt,
        password: password
    };

    console.log("Sende Daten zum Server...", loginDaten);

    try{
        const response = await fetch("http://localhost:3000/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(loginDaten)
        });
        
        const ergebnis = await response.json();

        if(ergebnis.success){
            console.log("Login erfolgreich! Token erhalten:", ergebnis.token);

            localStorage.setItem("messenger_token", ergebnis.token);
            showChatScreen();
        } else{
            alert("Fehler: " + ergebnis.message);
        }
    } catch (err){
        console.error("Netzwerkfehler:", err);
    }

}

function logout(){
    localStorage.removeItem("messenger_token");
    showLoginScreen();
}

initApp();
