
let peer = null;
let connections = {};
let activeChatPeerId = null;
let currentCall = null;
let mediaRecorder = null;
let audioChunks = [];

// Canvas Particles
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.onresize = resize; resize();

class Particle {
    constructor() { this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height; this.vx = (Math.random() - 0.5) * 0.6; this.vy = (Math.random() - 0.5) * 0.6; this.size = Math.random() * 2.5 + 1; }
    update() { this.x += this.vx; this.y += this.vy; if (this.x < 0 || this.x > canvas.width) this.vx *= -1; if (this.y < 0 || this.y > canvas.height) this.vy *= -1; }
    draw() { ctx.fillStyle = '#ffc107'; ctx.shadowBlur = 10; ctx.shadowColor = '#ffc107'; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
}
function initParticles() { particles = []; for (let i = 0; i < 110; i++) particles.push(new Particle()); }
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    ctx.strokeStyle = 'rgba(255, 193, 7, 0.4)'; ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y, dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) { ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y); ctx.stroke(); }
        }
    }
    requestAnimationFrame(animate);
}

// Peer Logic
function initPeer() {
    const randomId = 'enof-' + Math.floor(Math.random() * 9000 + 1000);
    peer = new Peer(randomId);
    peer.on('open', (id) => document.getElementById('my-id').innerText = id);
    peer.on('connection', (conn) => setupConnection(conn));
    peer.on('call', (call) => handleIncomingCall(call));
}

function setupConnection(conn) {
    connections[conn.peer] = { conn, messages: [] };
    conn.on('open', () => {
        renderChatList();
        if (!activeChatPeerId) selectChat(conn.peer);
    });
    conn.on('data', (data) => {
        if (data.type === 'msg') {
            addMessage(conn.peer, data, 'received');
            if (activeChatPeerId === conn.peer) renderMessages();
            renderChatList();
        }
    });
}

function selectChat(peerId) {
    activeChatPeerId = peerId;
    document.getElementById('header-name').innerText = peerId;
    document.getElementById('header-avatar').innerText = peerId.substring(5, 7).toUpperCase();
    renderMessages();
    document.body.classList.add('chat-open');
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    list.innerHTML = '';
    Object.keys(connections).forEach(id => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        const msgs = connections[id].messages;
        const lastMsgText = msgs.length > 0 ? (msgs[msgs.length - 1].text || 'Медиафайл') : 'Связь активна';
        item.innerHTML = `<div class="neon-avatar">${id.substring(5, 7).toUpperCase()}</div><div class="chat-info"><div class="chat-name neon-text-yellow">${id}</div><div class="chat-last-msg">${lastMsgText}</div></div>`;
        item.onclick = () => selectChat(id);
        list.appendChild(item);
    });
}

function addMessage(peerId, data, type) {
    if (!connections[peerId]) connections[peerId] = { messages: [] };
    connections[peerId].messages.push({ ...data, type });
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    const msgs = connections[activeChatPeerId] ? connections[activeChatPeerId].messages : [];
    msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.type}`;
        
        if (msg.text) {
            const p = document.createElement('p');
            p.innerText = msg.text;
            div.appendChild(p);
        }
        
        if (msg.fileType === 'image') {
            const img = document.createElement('img');
            img.src = msg.fileData;
            img.className = 'chat-img';
            div.appendChild(img);
        } else if (msg.fileType === 'voice') {
            const audio = document.createElement('audio');
            audio.src = msg.fileData;
            audio.controls = true;
            audio.style.width = '200px';
            div.appendChild(audio);
        } else if (msg.fileType === 'file') {
            const link = document.createElement('a');
            link.href = msg.fileData;
            link.download = msg.fileName || 'file';
            link.innerText = `📄 ${msg.fileName || 'Файл'}`;
            link.style.color = 'var(--neon-yellow)';
            div.appendChild(link);
        }
        
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
        const data = { type: 'msg', text };
        conn.send(data);
        addMessage(activeChatPeerId, data, 'sent');
        input.value = '';
        renderMessages();
        renderChatList();
    }
}

// Attach Files
async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file || !activeChatPeerId) return;

    const reader = new FileReader();
    reader.onload = () => {
        const conn = connections[activeChatPeerId].conn;
        const fileType = file.type.startsWith('image/') ? 'image' : 'file';
        const data = {
            type: 'msg',
            fileType: fileType,
            fileData: reader.result,
            fileName: file.name
        };
        conn.send(data);
        addMessage(activeChatPeerId, data, 'sent');
        renderMessages();
        renderChatList();
    };
    reader.readAsDataURL(file);
}

// Voice Recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
            const reader = new FileReader();
            reader.onload = () => {
                const conn = connections[activeChatPeerId].conn;
                const data = {
                    type: 'msg',
                    fileType: 'voice',
                    fileData: reader.result
                };
                conn.send(data);
                addMessage(activeChatPeerId, data, 'sent');
                renderMessages();
                renderChatList();
            };
            reader.readAsDataURL(audioBlob);
            stream.getTracks().forEach(t => t.stop());
        };
        
        mediaRecorder.start();
        document.getElementById('recording-status').style.display = 'block';
    } catch (e) { alert('Микрофон недоступен'); }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        document.getElementById('recording-status').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initParticles(); animate();
    
    const startBtn = document.getElementById('start-btn');
    let countdown = 5;
    const welcomeTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            startBtn.innerText = `Подождите (${countdown})...`;
        } else {
            clearInterval(welcomeTimer);
            startBtn.innerText = 'Войти в сеть';
            startBtn.disabled = false;
        }
    }, 1000);

    startBtn.onclick = () => {
        document.getElementById('welcome-overlay').style.display = 'none';
        initPeer();
    };

    document.getElementById('connect-btn').onclick = () => {
        const input = document.getElementById('connect-to-id');
        const id = input.value.trim();
        if (!id) {
            input.classList.add('input-error');
            setTimeout(() => input.classList.remove('input-error'), 1000);
            return;
        }
        setupConnection(peer.connect(id));
    };

    document.getElementById('attach-btn').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = handleFileSelect;

    let isRecording = false;
    document.getElementById('voice-btn').onclick = () => {
        if (!activeChatPeerId) return;
        if (!isRecording) {
            startRecording();
            isRecording = true;
            document.getElementById('voice-btn').style.color = '#ff3b30';
        } else {
            stopRecording();
            isRecording = false;
            document.getElementById('voice-btn').style.color = 'var(--neon-yellow)';
        }
    };

    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('message-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    document.getElementById('back-btn').onclick = () => document.body.classList.remove('chat-open');
    document.getElementById('my-id-btn').onclick = () => { navigator.clipboard.writeText(peer.id); alert('ID скопирован'); };

    lucide.createIcons();
});
