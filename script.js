
let peer = null;
let connections = {};
let activeChatPeerId = null;
let currentCall = null;

let accounts = JSON.parse(localStorage.getItem('enof_accounts') || '{}');
let currentUser = null;

// Canvas Particles
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
function initParticles() { particles = []; for (let i = 0; i < 120; i++) particles.push(new Particle()); }
function animate() { ctx.clearRect(0, 0, canvas.width, canvas.height); particles.forEach(p => { p.update(); p.draw(); }); requestAnimationFrame(animate); }

window.panicButton = () => {
    if (confirm('Удалить ваш профиль и историю переписки?')) {
        localStorage.clear(); location.reload();
    }
};

function initAuthFlow() {
    const toAuthBtn = document.getElementById('to-auth-btn');
    let count = 5;
    const timer = setInterval(() => {
        count--; if (count > 0) toAuthBtn.innerText = `Синхронизация (${count})...`;
        else { clearInterval(timer); toAuthBtn.innerText = 'Подключиться'; toAuthBtn.disabled = false; }
    }, 1000);
    toAuthBtn.onclick = () => showStep('step-auth');

    document.getElementById('auth-submit-btn').onclick = () => {
        const name = document.getElementById('auth-name').value.trim();
        const pass = document.getElementById('auth-pass').value.trim();
        if (!name || !pass) return alert('Введите имя и пароль');

        if (accounts[name] && accounts[name].pass === pass) { 
            currentUser = accounts[name]; showStep(null); startApp(); 
        }
        else if (accounts[name]) { 
            alert('Неверный пароль'); 
        }
        else { 
            currentUser = { name, pass, id: 'enof-' + Math.floor(Math.random()*90000+10000), avatar: null }; 
            showStep('step-profile'); 
        }
    };

    document.getElementById('avatar-input').onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = () => { 
            currentUser.avatar = reader.result; 
            document.getElementById('avatar-preview').innerHTML = `<img src="${reader.result}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`; 
        };
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
    document.getElementById('my-display-name').innerText = currentUser.name;
    const mini = document.getElementById('my-avatar-mini');
    if (currentUser.avatar) mini.innerHTML = `<img src="${currentUser.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    else mini.innerText = currentUser.name[0].toUpperCase();
    initPeer();
}

function initPeer() {
    peer = new Peer(currentUser.id, { debug: 1 });
    
    peer.on('open', (id) => {
        console.log('Узел активен:', id);
        document.getElementById('my-id').innerText = id;
    });

    peer.on('connection', (conn) => setupConnection(conn));
    peer.on('call', (call) => handleIncomingCall(call));

    peer.on('error', (err) => {
        console.error('Peer Error:', err.type);
        const connectBtn = document.getElementById('connect-btn');
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.innerText = 'УСТАНОВИТЬ СВЯЗЬ';
        }
        if (err.type === 'peer-unavailable') alert('Узел не найден. Проверьте ID.');
        else if (err.type !== 'connection-closed') alert('Ошибка сети: ' + err.type);
    });
}

function setupConnection(conn) {
    // Ждем открытия, прежде чем добавлять в список
    conn.on('open', () => {
        connections[conn.peer] = { conn, messages: [] };
        renderChatList();
        selectChat(conn.peer);
        conn.send({ type: 'handshake', name: currentUser.name, avatar: currentUser.avatar });
    });

    conn.on('data', (data) => {
        if (data.type === 'handshake') {
            if (!connections[conn.peer]) connections[conn.peer] = { conn, messages: [] };
            connections[conn.peer].name = data.name;
            connections[conn.peer].avatar = data.avatar;
            renderChatList();
            if (activeChatPeerId === conn.peer) updateChatHeader();
        }
        if (data.type === 'msg') {
            addMessage(conn.peer, data.text, 'received');
            if (activeChatPeerId === conn.peer) renderMessages();
            renderChatList();
        }
    });

    conn.on('close', () => {
        delete connections[conn.peer];
        renderChatList();
    });
}

function selectChat(peerId) {
    activeChatPeerId = peerId;
    updateChatHeader();
    renderMessages();
    document.body.classList.add('chat-open');
}

function updateChatHeader() {
    const info = connections[activeChatPeerId];
    document.getElementById('header-name').innerText = info?.name || activeChatPeerId;
    const headerAvatar = document.getElementById('header-avatar');
    if (info?.avatar) headerAvatar.innerHTML = `<img src="${info.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    else headerAvatar.innerHTML = '<i data-lucide="user"></i>';
    lucide.createIcons();
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    list.innerHTML = '';
    Object.keys(connections).forEach(id => {
        const info = connections[id];
        const item = document.createElement('div');
        item.className = 'chat-item';
        const avatarHTML = info.avatar ? `<img src="${info.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : `<i data-lucide="user"></i>`;
        item.innerHTML = `<div class="neon-avatar" style="width:44px; height:44px; margin-right:12px;">${avatarHTML}</div><div class="chat-info"><div class="chat-name neon-text-yellow">${info.name || id}</div><div class="chat-last-msg">Соединение установлено</div></div>`;
        item.onclick = () => selectChat(id);
        list.appendChild(item);
    });
    lucide.createIcons();
}

function addMessage(peerId, text, type) {
    if (!connections[peerId]) return;
    connections[peerId].messages.push({ text, type });
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    const msgs = connections[activeChatPeerId] ? connections[activeChatPeerId].messages : [];
    msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.type}`;
        div.innerText = msg.text;
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
        conn.send({ type: 'msg', text });
        addMessage(activeChatPeerId, text, 'sent');
        input.value = '';
        renderMessages();
    }
}

function handleIncomingCall(call) {
    const overlay = document.getElementById('call-overlay');
    const info = connections[call.peer];
    overlay.style.display = 'flex';
    document.getElementById('call-name').innerText = info?.name || call.peer;
    const container = document.getElementById('call-avatar-container');
    if (info?.avatar) container.innerHTML = `<img src="${info.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    else container.innerText = '?';
    
    const acceptBtn = document.getElementById('accept-call-btn');
    acceptBtn.style.display = 'flex';
    acceptBtn.onclick = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        call.answer(stream);
        acceptBtn.style.display = 'none';
        call.on('stream', (st) => { document.getElementById('remote-audio').srcObject = st; });
    };
    document.getElementById('end-call-btn').onclick = () => { call.close(); overlay.style.display = 'none'; };
}

document.addEventListener('DOMContentLoaded', () => {
    initParticles(); animate(); initAuthFlow();
    
    document.getElementById('connect-btn').onclick = () => {
        const btn = document.getElementById('connect-btn');
        const input = document.getElementById('connect-to-id');
        const id = input.value.trim();
        
        if (!id) return input.classList.add('input-error'), setTimeout(() => input.classList.remove('input-error'), 1000);
        if (id === currentUser.id) return alert('Нельзя подключиться к себе');

        btn.disabled = true;
        btn.innerText = 'ПОДКЛЮЧЕНИЕ...';
        
        // Попытка подключения
        const conn = peer.connect(id, { reliable: true });
        setupConnection(conn);

        // Тайм-аут на случай, если узел оффлайн
        setTimeout(() => {
            if (btn.innerText === 'ПОДКЛЮЧЕНИЕ...') {
                btn.disabled = false;
                btn.innerText = 'УСТАНОВИТЬ СВЯЗЬ';
            }
        }, 10000);
    };

    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('message-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    document.getElementById('back-btn').onclick = () => document.body.classList.remove('chat-open');
    
    document.getElementById('call-btn').onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const call = peer.call(activeChatPeerId, stream);
            document.getElementById('call-overlay').style.display = 'flex';
            document.getElementById('call-name').innerText = connections[activeChatPeerId].name;
            const container = document.getElementById('call-avatar-container');
            if (connections[activeChatPeerId].avatar) container.innerHTML = `<img src="${connections[activeChatPeerId].avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        } catch (e) { alert('Микрофон недоступен'); }
    };
    
    lucide.createIcons();
});
