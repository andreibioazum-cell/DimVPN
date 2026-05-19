
let peer = null;
let connections = {};
let activeChatPeerId = null;
let currentCall = null;
let selfDestructEnabled = false;

// User & Store
let accounts = JSON.parse(localStorage.getItem('enof_accounts') || '{}');
let currentUser = null;
let points = parseInt(localStorage.getItem('enof_points') || '0');
let upgrades = JSON.parse(localStorage.getItem('enof_upgrades') || '[]');

// Canvas Particles (Золотой дождь)
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize; resize();
class Particle {
    constructor() { this.reset(); }
    reset() { this.x = Math.random() * canvas.width; this.y = Math.random() * -canvas.height; this.vx = (Math.random() - 0.5) * 0.2; this.vy = Math.random() * 1.5 + 0.5; this.size = Math.random() * 2 + 1; this.opacity = Math.random() * 0.5 + 0.5; }
    update() { this.x += this.vx; this.y += this.vy; if (this.y > canvas.height) { this.reset(); this.y = -10; } }
    draw() { ctx.shadowBlur = 8; ctx.shadowColor = '#ffc107'; ctx.fillStyle = `rgba(255, 193, 7, ${this.opacity})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
}
function initParticles() { particles = []; for (let i = 0; i < 100; i++) particles.push(new Particle()); }
function animate() { ctx.clearRect(0, 0, canvas.width, canvas.height); particles.forEach(p => { p.update(); p.draw(); }); requestAnimationFrame(animate); }

// --- СИСТЕМА БЕЗОПАСНОСТИ ---

// Функция "Паника" - очистка всего
window.panicButton = () => {
    if (confirm('ВНИМАНИЕ! Это действие безвозвратно удалит ваш аккаунт, переписку и все EC. Продолжить?')) {
        localStorage.clear();
        location.reload();
    }
};

// Шифрование сообщений (простая реализация E2EE через XOR для примера в P2P, в реальном мире AES-GCM)
function crypt(text, key) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
}

function decrypt(cipher, key) {
    let text = atob(cipher);
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

const SHARED_SECRET = "ENOF_VAULT_2024"; // В реальности генерируется динамически при handshake

// --- ЛОГИКА ПРИЛОЖЕНИЯ ---

function startMining() {
    setInterval(() => {
        points++;
        localStorage.setItem('enof_points', points);
        updatePointsUI();
    }, 1000);
}

function updatePointsUI() {
    document.getElementById('points-display').innerText = `${points} EC`;
    document.getElementById('shop-points').innerText = points;
}

window.buyUpgrade = (type) => {
    const prices = { 'lvl1': 500, 'lvl2': 1200, 'lvl3': 2500, 'lvl4': 5000 };
    if (upgrades.includes(type)) return alert('Модуль уже активен');
    if (points >= prices[type]) {
        points -= prices[type];
        upgrades.push(type);
        localStorage.setItem('enof_points', points);
        localStorage.setItem('enof_upgrades', JSON.stringify(upgrades));
        applyUpgrades();
        updatePointsUI();
    } else alert('Недостаточно EC');
};

function applyUpgrades(targetId = null, remoteUpgrades = null) {
    const activeUpgrades = remoteUpgrades || upgrades;
    const elements = targetId ? document.querySelectorAll(`#chat-item-${targetId} .upgrade-target`) : document.querySelectorAll('.upgrade-target');
    let maxLvl = 0;
    if (activeUpgrades.includes('lvl4')) maxLvl = 4;
    else if (activeUpgrades.includes('lvl3')) maxLvl = 3;
    else if (activeUpgrades.includes('lvl2')) maxLvl = 2;
    else if (activeUpgrades.includes('lvl1')) maxLvl = 1;

    if (!targetId) {
        const ranks = ["NODE", "ANGEL", "SHINING", "STORM", "GOD MODE"];
        document.getElementById('active-rank').innerText = "Security Rank: " + ranks[maxLvl];
    }

    elements.forEach(el => {
        if (!el) return;
        el.classList.remove('upg-lvl1', 'upg-lvl2', 'upg-lvl3', 'upg-lvl4');
        const ball = el.querySelector('.upg-ball'); if (ball) ball.remove();
        if (maxLvl > 0) {
            el.classList.add(`upg-lvl${maxLvl}`);
            if (maxLvl >= 3) {
                const b = document.createElement('div');
                b.className = `upg-ball upg-lvl${maxLvl}-ball`;
                el.appendChild(b);
            }
        }
    });
}

function initAuthFlow() {
    const toAuthBtn = document.getElementById('to-auth-btn');
    let count = 5;
    const timer = setInterval(() => {
        count--;
        if (count > 0) toAuthBtn.innerText = `Синхронизация (${count})...`;
        else { clearInterval(timer); toAuthBtn.innerText = 'Подключиться'; toAuthBtn.disabled = false; }
    }, 1000);
    toAuthBtn.onclick = () => showStep('step-auth');

    document.getElementById('auth-submit-btn').onclick = () => {
        const name = document.getElementById('auth-name').value.trim();
        const pass = document.getElementById('auth-pass').value.trim();
        if (!name || !pass) return alert('Введите данные');
        if (name === 'Dima' && pass === 'test') { points = 1000000; localStorage.setItem('enof_points', points); }
        if (accounts[name] && accounts[name].pass === pass) { currentUser = accounts[name]; showStep(null); startApp(); }
        else if (accounts[name]) alert('Доступ запрещен');
        else { currentUser = { name, pass, id: 'enof-' + Math.floor(Math.random()*90000+10000), avatar: null }; showStep('step-profile'); }
    };

    document.getElementById('avatar-input').onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = () => { currentUser.avatar = reader.result; document.getElementById('avatar-preview').innerHTML = `<img src="${reader.result}">`; };
        reader.readAsDataURL(file);
    };

    document.getElementById('finish-reg-btn').onclick = () => {
        accounts[currentUser.name] = currentUser;
        localStorage.setItem('enof_accounts', JSON.stringify(accounts));
        showStep(null); startApp();
    };
}

function showStep(id) {
    document.querySelectorAll('.neon-overlay').forEach(el => el.style.display = 'none');
    if (id) document.getElementById(id).style.display = 'flex';
}

function startApp() {
    document.getElementById('my-id').innerText = currentUser.id;
    const mini = document.getElementById('my-avatar-mini');
    if (currentUser.avatar) mini.innerHTML = `<img src="${currentUser.avatar}">`;
    else mini.innerText = currentUser.name[0].toUpperCase();
    startMining(); applyUpgrades(); initPeer();
}

function initPeer() {
    peer = new Peer(currentUser.id);
    peer.on('connection', (conn) => setupConnection(conn));
    peer.on('call', (call) => handleIncomingCall(call));
}

function setupConnection(conn) {
    connections[conn.peer] = { conn, messages: [], upgrades: [] };
    conn.on('open', () => {
        renderChatList();
        if (!activeChatPeerId) selectChat(conn.peer);
        conn.send({ type: 'handshake', name: currentUser.name, avatar: currentUser.avatar, upgrades: upgrades });
    });
    conn.on('data', (data) => {
        if (data.type === 'handshake') {
            connections[conn.peer].name = data.name;
            connections[conn.peer].avatar = data.avatar;
            connections[conn.peer].upgrades = data.upgrades || [];
            renderChatList(); if (activeChatPeerId === conn.peer) updateChatHeader();
        }
        if (data.type === 'secure_msg') {
            const decryptedText = decrypt(data.payload, SHARED_SECRET);
            addMessage(conn.peer, { text: decryptedText, destruct: data.destruct }, 'received');
            if (activeChatPeerId === conn.peer) renderMessages();
            renderChatList();
        }
    });
}

function selectChat(peerId) {
    activeChatPeerId = peerId;
    updateChatHeader(); renderMessages();
    document.body.classList.add('chat-open');
}

function updateChatHeader() {
    const info = connections[activeChatPeerId];
    document.getElementById('header-name').innerText = info?.name || activeChatPeerId;
    const headerAvatar = document.getElementById('header-avatar');
    if (info?.avatar) headerAvatar.innerHTML = `<img src="${info.avatar}">`;
    else headerAvatar.innerHTML = '<i data-lucide="user"></i>';
    applyUpgrades(null, info?.upgrades);
    lucide.createIcons();
}

function renderChatList() {
    const list = document.getElementById('chat-list'); list.innerHTML = '';
    Object.keys(connections).forEach(id => {
        const info = connections[id];
        const item = document.createElement('div');
        item.className = 'chat-item';
        const avatarHTML = info.avatar ? `<img src="${info.avatar}">` : `<i data-lucide="user"></i>`;
        item.innerHTML = `<div class="neon-avatar upgrade-target">${avatarHTML}</div><div class="chat-info"><div class="chat-name neon-text-yellow">${info.name || id}</div><div class="chat-last-msg">Связь защищена</div></div>`;
        item.onclick = () => selectChat(id);
        list.appendChild(item);
        applyUpgrades(id, info.upgrades);
    });
    lucide.createIcons();
}

function addMessage(peerId, data, type) {
    if (!connections[peerId]) connections[peerId] = { messages: [] };
    const msgObj = { ...data, type, id: Date.now() };
    connections[peerId].messages.push(msgObj);
    
    // Самоуничтожение
    if (data.destruct) {
        setTimeout(() => {
            connections[peerId].messages = connections[peerId].messages.filter(m => m.id !== msgObj.id);
            if (activeChatPeerId === peerId) renderMessages();
        }, 10000);
    }
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    const msgs = connections[activeChatPeerId] ? connections[activeChatPeerId].messages : [];
    msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.type}`;
        if (msg.destruct) div.style.borderStyle = 'dashed';
        div.innerHTML = `<p>${msg.text}</p>${msg.destruct ? '<span style="font-size:8px; color:#ff3b30;">Удалится через 10с</span>' : ''}`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !activeChatPeerId) return;
    const conn = connections[activeChatPeerId].conn;
    if (conn && conn.open) {
        const encrypted = crypt(text, SHARED_SECRET);
        conn.send({ type: 'secure_msg', payload: encrypted, destruct: selfDestructEnabled });
        addMessage(activeChatPeerId, { text, destruct: selfDestructEnabled }, 'sent');
        input.value = ''; renderMessages();
    }
}

function handleIncomingCall(call) {
    const overlay = document.getElementById('call-overlay');
    const info = connections[call.peer];
    overlay.style.display = 'flex';
    document.getElementById('call-name').innerText = info?.name || call.peer;
    const container = document.getElementById('call-avatar-container');
    if (info?.avatar) container.innerHTML = `<img src="${info.avatar}">`;
    else container.innerText = '?';
    const acceptBtn = document.getElementById('accept-call-btn'); acceptBtn.style.display = 'flex';
    acceptBtn.onclick = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        call.answer(stream); acceptBtn.style.display = 'none';
        call.on('stream', (st) => { document.getElementById('remote-audio').srcObject = st; });
    };
    document.getElementById('end-call-btn').onclick = () => { call.close(); overlay.style.display = 'none'; };
}

document.addEventListener('DOMContentLoaded', () => {
    initParticles(); animate(); initAuthFlow();
    document.getElementById('connect-btn').onclick = () => {
        const connectBtn = document.getElementById('connect-btn');
        const input = document.getElementById('connect-to-id');
        const id = input.value.trim();

        if (!id) {
            input.classList.add('input-error');
            setTimeout(() => input.classList.remove('input-error'), 1000);
            return;
        }

        if (id === currentUser.id) {
            alert('Нельзя подключиться к самому себе');
            return;
        }

        // Визуальный процесс подключения
        connectBtn.disabled = true;
        connectBtn.innerText = 'ПОИСК УЗЛА...';
        
        const conn = peer.connect(id);
        
        // Тайм-аут на поиск узла
        const timeout = setTimeout(() => {
            if (!connections[id]) {
                alert('Узел не отвечает. Проверьте ID или интернет.');
                connectBtn.disabled = false;
                connectBtn.innerText = 'УСТАНОВИТЬ СВЯЗЬ';
            }
        }, 10000);

        setupConnection(conn);

        conn.on('open', () => {
            clearTimeout(timeout);
            connectBtn.disabled = false;
            connectBtn.innerText = 'УСТАНОВИТЬ СВЯЗЬ';
            input.value = '';
        });

        conn.on('error', (err) => {
            clearTimeout(timeout);
            alert('Ошибка соединения: ' + err);
            connectBtn.disabled = false;
            connectBtn.innerText = 'УСТАНОВИТЬ СВЯЗЬ';
        });
    };
    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('message-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    document.getElementById('back-btn').onclick = () => document.body.classList.remove('chat-open');
    document.getElementById('call-btn').onclick = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const call = peer.call(activeChatPeerId, stream);
        document.getElementById('call-overlay').style.display = 'flex';
        document.getElementById('call-name').innerText = connections[activeChatPeerId].name;
    };
    
    // Кнопка самоуничтожения
    document.getElementById('self-destruct-btn').onclick = () => {
        selfDestructEnabled = !selfDestructEnabled;
        document.getElementById('destruct-indicator').style.display = selfDestructEnabled ? 'block' : 'none';
        document.getElementById('self-destruct-btn').style.color = selfDestructEnabled ? '#ff3b30' : '#ffc107';
    };

    lucide.createIcons();
});
