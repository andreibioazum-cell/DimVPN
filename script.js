
let peer;
let connections = {}; // Храним активные P2P соединения
let activeChatPeerId = null;
let currentCall = null;

const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const chatList = document.getElementById('chat-list');

// Инициализация Peer
function initPeer() {
    // Генерируем случайный короткий ID для удобства
    const randomId = 'tg-' + Math.floor(Math.random() * 9000 + 1000);
    peer = new Peer(randomId);

    peer.on('open', (id) => {
        document.getElementById('my-id').innerText = id;
        console.log('Мой ID:', id);
    });

    // Обработка входящего текстового соединения
    peer.on('connection', (conn) => {
        setupConnection(conn);
    });

    // Обработка входящего звонка
    peer.on('call', (call) => {
        handleIncomingCall(call);
    });

    peer.on('error', (err) => {
        alert('Ошибка Peer: ' + err.type);
    });
}

function setupConnection(conn) {
    connections[conn.peer] = {
        conn: conn,
        messages: []
    };

    conn.on('open', () => {
        renderChatList();
        // Если это новое входящее соединение, уведомляем пользователя
        if (!activeChatPeerId) selectChat(conn.peer);
    });

    conn.on('data', (data) => {
        if (data.type === 'msg') {
            addMessageToStore(conn.peer, data.text, 'received');
            if (activeChatPeerId === conn.peer) renderMessages();
            renderChatList();
        }
    });

    conn.on('close', () => {
        delete connections[conn.peer];
        renderChatList();
    });
}

// Функции Чат
function selectChat(peerId) {
    activeChatPeerId = peerId;
    document.getElementById('header-name').innerText = peerId;
    document.getElementById('header-status').innerText = 'онлайн (P2P)';
    document.getElementById('header-avatar-placeholder').innerText = peerId.substring(3, 5);
    
    renderMessages();
    document.body.classList.add('chat-open');
}

function renderChatList() {
    chatList.innerHTML = '';
    Object.keys(connections).forEach(id => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        const msgs = connections[id].messages;
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1].text : 'Соединение установлено';

        item.innerHTML = `
            <div class="avatar" style="background:#3390ec">${id.substring(3,5)}</div>
            <div class="chat-info">
                <div class="chat-top"><span class="chat-name">${id}</span></div>
                <div class="chat-last-msg">${lastMsg}</div>
            </div>
        `;
        item.onclick = () => selectChat(id);
        chatList.appendChild(item);
    });
}

function addMessageToStore(peerId, text, type) {
    if (!connections[peerId]) return;
    connections[peerId].messages.push({ text, type });
}

function renderMessages() {
    messagesContainer.innerHTML = '';
    const msgs = connections[activeChatPeerId] ? connections[activeChatPeerId].messages : [];
    msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.type}`;
        div.innerText = msg.text;
        messagesContainer.appendChild(div);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChatPeerId) return;

    const conn = connections[activeChatPeerId].conn;
    if (conn && conn.open) {
        conn.send({ type: 'msg', text: text });
        addMessageToStore(activeChatPeerId, text, 'sent');
        messageInput.value = '';
        renderMessages();
        renderChatList();
    }
}

// Функции Звонка
async function startCall() {
    if (!activeChatPeerId) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const call = peer.call(activeChatPeerId, stream);
        setupCallHandlers(call, stream);
        
        document.getElementById('call-overlay').style.display = 'flex';
        document.getElementById('call-name').innerText = activeChatPeerId;
        document.getElementById('call-status-text').innerText = 'Исходящий звонок...';
        document.getElementById('accept-call-btn').style.display = 'none';
    } catch (err) {
        alert('Не удалось получить доступ к микрофону: ' + err);
    }
}

function handleIncomingCall(call) {
    currentCall = call;
    document.getElementById('call-overlay').style.display = 'flex';
    document.getElementById('call-name').innerText = call.peer;
    document.getElementById('call-status-text').innerText = 'Входящий звонок...';
    document.getElementById('accept-call-btn').style.display = 'flex';

    document.getElementById('accept-call-btn').onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            call.answer(stream);
            setupCallHandlers(call, stream);
            document.getElementById('accept-call-btn').style.display = 'none';
            document.getElementById('call-status-text').innerText = 'Разговор...';
        } catch (err) {
            alert('Ошибка при ответе: ' + err);
        }
    };
}

function setupCallHandlers(call, localStream) {
    currentCall = call;
    call.on('stream', (remoteStream) => {
        const audio = document.getElementById('remote-audio');
        audio.srcObject = remoteStream;
    });

    call.on('close', () => {
        localStream.getTracks().forEach(t => t.stop());
        document.getElementById('call-overlay').style.display = 'none';
    });
}

function endCall() {
    if (currentCall) currentCall.close();
    document.getElementById('call-overlay').style.display = 'none';
}

// Инициализация интерфейса
document.addEventListener('DOMContentLoaded', () => {
    initPeer();

    document.getElementById('connect-btn').onclick = () => {
        const id = document.getElementById('connect-to-id').value.trim();
        if (id && id !== peer.id) {
            const conn = peer.connect(id);
            setupConnection(conn);
        }
    };

    document.getElementById('my-id').onclick = () => {
        navigator.clipboard.writeText(peer.id);
        alert('ID скопирован: ' + peer.id);
    };

    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('message-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    document.getElementById('back-btn').onclick = () => { document.body.classList.remove('chat-open'); };
    document.getElementById('call-btn').onclick = startCall;
    document.getElementById('end-call-btn').onclick = endCall;

    if (window.lucide) window.lucide.createIcons();
});
