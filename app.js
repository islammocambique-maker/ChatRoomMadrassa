/**
 * MADRASSA ONLINE — ISLAM MOÇAMBIQUE
 * Sala de Aulas — Firebase + LocalStorage Sync v3
 * 
 * CORREÇÃO: Usar .on('value') para capturar TODAS as mensagens (existentes + novas)
 * em vez de .on('child_added') que só pega novas.
 */

// ============================================
// CONFIGURAÇÃO FIREBASE
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyD2rNS7HSJyek3OCrRquudFgqQSWXZJYrY",
    authDomain: "madrassa-online-b851c.firebaseapp.com",
    databaseURL: "https://madrassa-online-b851c-default-rtdb.firebaseio.com",
    projectId: "madrassa-online-b851c",
    storageBucket: "madrassa-online-b851c.firebasestorage.app",
    messagingSenderId: "360782668012",
    appId: "1:360782668012:web:d501ef187911db632445c9",
    measurementId: "G-RV9GD4S22T"
};

try {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase OK');
} catch (e) {
    console.error('Firebase erro:', e);
}

const database = firebase.database();
const storage = firebase.storage();

// ============================================
// CONSTANTES
// ============================================
const ROOM_ID = 'sala_de_aulas_principal';
const LS_PREFIX = 'madrassa_';
const LS_USER = LS_PREFIX + 'user';
const LS_MESSAGES = LS_PREFIX + 'messages';
const SYNC_PATH = 'rooms/' + ROOM_ID + '/sync';
const TYPING_PATH = 'rooms/' + ROOM_ID + '/typing';

const EMOJIS = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
    '😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️',
    '😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓',
    '🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵',
    '🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽',
    '👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾',
    '🕌','🕋','🤲','🙏','☪️','✨','🌙','⭐','🌟','💫','🔥','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎',
    '💔','❣️','💕','💞','💓','💗','💖','💘','💝',
    '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌',
    '👐','🤝','🙏','✍️','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅',
    '👄','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵'
];

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let currentUser = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let currentAudio = null;
let audioPlayerInterval = null;
let typingTimeout = null;
let isTyping = false;
let processedIds = new Set();
let selectedImageFile = null;
let selectedImageDataUrl = null;
let lastSyncTimestamp = 0;

// ============================================
// ELEMENTOS DOM
// ============================================
const els = {};

function cacheElements() {
    const ids = [
        'login-screen','chat-screen','user-name','btn-enter',
        'messages-area','messages-list','message-input','btn-send',
        'btn-attach','attach-menu','btn-record','audio-recorder',
        'recorder-timer','btn-stop-record','btn-cancel-record',
        'btn-emoji','emoji-picker','image-input',
        'image-preview-modal','preview-img','btn-confirm-image','btn-cancel-image',
        'image-viewer-modal','viewer-img','btn-close-viewer',
        'typing-indicator','typing-text','online-status','toast',
        'welcome-time','audio-player-modal','btn-close-audio',
        'btn-play-pause','audio-progress','audio-time',
        'normal-input','btn-clear','btn-image','btn-camera','emoji-grid'
    ];
    ids.forEach(id => {
        els[id.replace(/-/g, '_')] = document.getElementById(id);
    });
}

// ============================================
// LOCALSTORAGE
// ============================================
function getLocalMessages() {
    try {
        const data = localStorage.getItem(LS_MESSAGES);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveLocalMessages(messages) {
    try {
        localStorage.setItem(LS_MESSAGES, JSON.stringify(messages));
    } catch (e) {
        console.error('Erro LS:', e);
    }
}

function addLocalMessage(msg) {
    const messages = getLocalMessages();
    const exists = messages.some(m => m.syncId === msg.syncId);
    if (exists) return false;
    messages.push(msg);
    saveLocalMessages(messages);
    return true;
}

function clearLocalMessages() {
    localStorage.removeItem(LS_MESSAGES);
    processedIds.clear();
    lastSyncTimestamp = 0;
    renderAllMessages();
    showToast('Conversa limpa!');
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    els.welcome_time.textContent = formatTime(new Date());
    renderEmojis();

    const savedUser = localStorage.getItem(LS_USER);
    if (savedUser) {
        try {
            const userData = JSON.parse(savedUser);
            els.user_name.value = userData.name || '';
        } catch (e) {
            els.user_name.value = savedUser;
        }
    }

    setupEventListeners();
    setupFirebaseConnection();
    renderAllMessages();
});

function renderEmojis() {
    els.emoji_grid.innerHTML = EMOJIS.map(e => `<span>${e}</span>`).join('');
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    els.btn_enter.addEventListener('click', doLogin);
    els.user_name.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    els.btn_send.addEventListener('click', sendTextMessage);
    els.message_input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });

    els.message_input.addEventListener('input', () => {
        handleTyping();
        toggleSendMic();
    });

    els.btn_attach.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAttachMenu();
    });

    document.addEventListener('click', (e) => {
        if (!els.attach_menu.contains(e.target) && e.target !== els.btn_attach) {
            els.attach_menu.classList.add('hidden');
        }
        if (!els.emoji_picker.contains(e.target) && e.target !== els.btn_emoji) {
            els.emoji_picker.classList.add('hidden');
        }
    });

    els.btn_image.addEventListener('click', () => {
        els.image_input.removeAttribute('capture');
        els.image_input.click();
        els.attach_menu.classList.add('hidden');
    });

    els.btn_camera.addEventListener('click', () => {
        els.image_input.setAttribute('capture', 'environment');
        els.image_input.click();
        els.attach_menu.classList.add('hidden');
    });

    els.image_input.addEventListener('change', handleImageSelect);
    els.btn_confirm_image.addEventListener('click', sendImageMessage);
    els.btn_cancel_image.addEventListener('click', cancelImagePreview);

    els.btn_close_viewer.addEventListener('click', () => {
        els.image_viewer_modal.classList.add('hidden');
    });

    els.btn_emoji.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEmojiPicker();
    });

    els.emoji_grid.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            els.message_input.value += e.target.textContent;
            els.message_input.focus();
            toggleSendMic();
        }
    });

    els.btn_record.addEventListener('click', startRecording);
    els.btn_stop_record.addEventListener('click', stopRecording);
    els.btn_cancel_record.addEventListener('click', cancelRecording);

    els.btn_close_audio.addEventListener('click', closeAudioPlayer);
    els.btn_play_pause.addEventListener('click', toggleAudioPlayback);
    els.audio_progress.addEventListener('input', seekAudio);

    els.btn_clear.addEventListener('click', () => {
        if (confirm('Limpar toda a conversa?')) clearLocalMessages();
    });

    els.image_preview_modal.addEventListener('click', (e) => {
        if (e.target === els.image_preview_modal) cancelImagePreview();
    });
    els.image_viewer_modal.addEventListener('click', (e) => {
        if (e.target === els.image_viewer_modal) els.image_viewer_modal.classList.add('hidden');
    });
    els.audio_player_modal.addEventListener('click', (e) => {
        if (e.target === els.audio_player_modal) closeAudioPlayer();
    });
}

function toggleSendMic() {
    const hasText = els.message_input.value.trim().length > 0;
    els.btn_record.classList.toggle('hidden', hasText);
    els.btn_send.classList.toggle('hidden', !hasText);
}

// ============================================
// LOGIN
// ============================================
function doLogin() {
    const name = els.user_name.value.trim();
    if (!name || name.length < 2) {
        showToast('Digite seu nome completo');
        return;
    }

    currentUser = {
        name: name,
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };

    localStorage.setItem(LS_USER, JSON.stringify(currentUser));

    els.login_screen.classList.remove('active');
    setTimeout(() => {
        els.chat_screen.classList.add('active');
        els.message_input.focus();
    }, 300);

    showToast('Bem-vindo, ' + name + '!');
    connectToRoom();
}

// ============================================
// FIREBASE — CONEXÃO
// ============================================
function setupFirebaseConnection() {
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snap) => {
        const connected = snap.val();
        if (connected) {
            els.online_status.textContent = 'Online';
            els.online_status.style.color = '#25D366';
        } else {
            els.online_status.textContent = 'Offline';
            els.online_status.style.color = '#ff4444';
        }
    });

    const savedUser = localStorage.getItem(LS_USER);
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            els.login_screen.classList.remove('active');
            els.chat_screen.classList.add('active');
            connectToRoom();
        } catch (e) {
            console.error('Erro restore user:', e);
        }
    }
}

// ============================================
// FIREBASE — SINCRONIZAÇÃO CORRIGIDA
// ============================================
function connectToRoom() {
    if (!currentUser) {
        console.error('Sem usuário');
        return;
    }

    console.log('Conectando sala:', ROOM_ID);
    console.log('Path:', SYNC_PATH);
    console.log('User:', currentUser.name, currentUser.id);

    // === MÉTODO CORRETO: Usar .on('value') para pegar TUDO ===
    // .on('value') dispara sempre que QUALQUER dado muda no nó
    // Isso garante que vemos mensagens antigas E novas

    const syncRef = database.ref(SYNC_PATH);

    syncRef.limitToLast(50).on('value', (snapshot) => {
        console.log('📨 VALUE event recebido!');

        const allData = snapshot.val();
        if (!allData) {
            console.log('Nó vazio');
            return;
        }

        const keys = Object.keys(allData);
        console.log('Total mensagens no Firebase:', keys.length);

        let newCount = 0;

        keys.forEach(key => {
            const syncData = allData[key];
            if (!syncData) return;

            // Ignorar mensagens do próprio usuário
            if (syncData.senderId === currentUser.id) return;

            // Ignorar já processadas
            if (processedIds.has(syncData.syncId)) return;
            processedIds.add(syncData.syncId);

            const msg = {
                syncId: syncData.syncId,
                type: syncData.type,
                sender: syncData.sender,
                senderId: syncData.senderId,
                timestamp: syncData.timestamp,
                text: syncData.text || null,
                imageUrl: syncData.imageUrl || null,
                audioUrl: syncData.audioUrl || null,
                duration: syncData.duration || null
            };

            const added = addLocalMessage(msg);
            if (added) {
                renderMessage(msg);
                newCount++;

                if (document.hidden) {
                    showToast('💬 ' + syncData.sender + ': ' + (syncData.text || 'mídia').substring(0, 30));
                }
            }
        });

        if (newCount > 0) {
            console.log('Novas mensagens recebidas:', newCount);
            scrollToBottom();
        }

    }, (error) => {
        console.error('ERRO NO LISTENER:', error.code, error.message);
        showToast('Erro: ' + error.message);
    });

    // === TYPING ===
    const typingRef = database.ref(TYPING_PATH);
    typingRef.child(currentUser.id).remove();

    typingRef.on('value', (snapshot) => {
        const typings = snapshot.val();
        if (!typings) {
            els.typing_indicator.classList.add('hidden');
            return;
        }

        const others = Object.keys(typings).filter(id => id !== currentUser.id);
        if (others.length > 0) {
            const names = others.map(id => typings[id].name).join(', ');
            els.typing_text.textContent = others.length === 1 ? names + ' está digitando' : names + ' estão digitando';
            els.typing_indicator.classList.remove('hidden');
            scrollToBottom();
        } else {
            els.typing_indicator.classList.add('hidden');
        }
    });

    console.log('Listener ativo!');
}

// ============================================
// PUBLICAR NO FIREBASE
// ============================================
function publishToFirebase(msg) {
    console.log('Publicando:', msg.syncId);

    const syncData = {
        syncId: msg.syncId,
        type: msg.type,
        sender: msg.sender,
        senderId: msg.senderId,
        timestamp: msg.timestamp,
        text: msg.text || null,
        imageUrl: msg.imageUrl || null,
        audioUrl: msg.audioUrl || null,
        duration: msg.duration || null
    };

    return database.ref(SYNC_PATH).push(syncData)
        .then(() => console.log('Publicado OK'))
        .catch(err => {
            console.error('Erro publicar:', err.code, err.message);
            showToast('Erro ao enviar: ' + err.message);
            throw err;
        });
}

// ============================================
// ENVIAR MENSAGEM DE TEXTO
// ============================================
function sendTextMessage() {
    const text = els.message_input.value.trim();
    if (!text || !currentUser) return;

    const msg = createMessage('text', { text: text });

    addLocalMessage(msg);
    renderMessage(msg);
    scrollToBottom();

    els.message_input.value = '';
    toggleSendMic();
    stopTyping();

    publishToFirebase(msg);
}

// ============================================
// ENVIAR IMAGEM
// ============================================
function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
        showToast('Imagem muito grande. Máx 8MB.');
        return;
    }

    selectedImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        selectedImageDataUrl = e.target.result;
        els.preview_img.src = selectedImageDataUrl;
        els.image_preview_modal.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function cancelImagePreview() {
    els.image_preview_modal.classList.add('hidden');
    els.image_input.value = '';
    selectedImageFile = null;
    selectedImageDataUrl = null;
}

async function sendImageMessage() {
    if (!selectedImageFile || !currentUser) return;

    els.btn_confirm_image.textContent = 'Enviando...';
    els.btn_confirm_image.disabled = true;

    try {
        showToast('Comprimindo...');
        const compressedBlob = await compressImage(selectedImageFile);

        const fileName = 'images/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg';
        const storageRef = storage.ref(fileName);

        await storageRef.put(compressedBlob);
        const downloadURL = await storageRef.getDownloadURL();

        const msg = createMessage('image', { imageUrl: downloadURL });

        addLocalMessage(msg);
        renderMessage(msg);
        scrollToBottom();

        await publishToFirebase(msg);

        cancelImagePreview();
        showToast('Imagem enviada!');

    } catch (error) {
        console.error('Erro imagem:', error);
        showToast('Erro: ' + error.message);
    } finally {
        els.btn_confirm_image.textContent = 'Enviar';
        els.btn_confirm_image.disabled = false;
    }
}

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = reject;
        reader.readAsDataURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 1200;
            let w = img.width, h = img.height;

            if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }}
            else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }}

            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Falha'));
            }, 'image/jpeg', 0.75);
        };
        img.onerror = reject;
    });
}

// ============================================
// GRAVAR E ENVIAR ÁUDIO
// ============================================
async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        showToast('Navegador não suporta gravação');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 22050 }
        });

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus' : 'audio/webm';

        mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            await uploadAudio(blob);
            stream.getTracks().forEach(t => t.stop());
        };

        mediaRecorder.onerror = (e) => {
            console.error('Erro recorder:', e);
            showToast('Erro na gravação');
            cancelRecordingUI();
        };

        mediaRecorder.start(100);
        isRecording = true;
        recordingStartTime = Date.now();
        showRecordingUI();

    } catch (err) {
        console.error('Erro gravar:', err);
        showToast('Permita acesso ao microfone');
    }
}

function showRecordingUI() {
    els.audio_recorder.classList.remove('hidden');
    els.normal_input.classList.add('hidden');
    startRecordingTimer();
}

function cancelRecordingUI() {
    els.audio_recorder.classList.add('hidden');
    els.normal_input.classList.remove('hidden');
    clearInterval(recordingTimer);
    els.recorder_timer.textContent = '00:00';
}

function startRecordingTimer() {
    recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const s = (elapsed % 60).toString().padStart(2, '0');
        els.recorder_timer.textContent = m + ':' + s;
        if (elapsed >= 300) stopRecording();
    }, 1000);
}

function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingTimer);
    cancelRecordingUI();
}

function cancelRecording() {
    if (!isRecording || !mediaRecorder) return;
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingTimer);
    audioChunks = [];
    cancelRecordingUI();
}

async function uploadAudio(audioBlob) {
    if (audioBlob.size === 0) return;
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

    showToast('Enviando áudio...');

    try {
        const fileName = 'audio/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.webm';
        const storageRef = storage.ref(fileName);

        await storageRef.put(audioBlob);
        const downloadURL = await storageRef.getDownloadURL();

        const msg = createMessage('audio', { audioUrl: downloadURL, duration: duration });

        addLocalMessage(msg);
        renderMessage(msg);
        scrollToBottom();

        await publishToFirebase(msg);

        showToast('Áudio enviado!');

    } catch (error) {
        console.error('Erro áudio:', error);
        showToast('Erro ao enviar áudio');
    }
}

// ============================================
// CRIAR MENSAGEM
// ============================================
function createMessage(type, data) {
    return {
        syncId: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        type: type,
        sender: currentUser.name,
        senderId: currentUser.id,
        timestamp: Date.now(),
        text: data.text || null,
        imageUrl: data.imageUrl || null,
        audioUrl: data.audioUrl || null,
        duration: data.duration || null
    };
}

// ============================================
// RENDERIZAR MENSAGENS
// ============================================
function renderAllMessages() {
    els.messages_list.innerHTML = '';
    processedIds.clear();

    const messages = getLocalMessages();
    messages.sort((a, b) => a.timestamp - b.timestamp);

    messages.forEach(msg => {
        processedIds.add(msg.syncId);
        renderMessage(msg, false);
    });

    scrollToBottom();
}

function renderMessage(msg, animate) {
    const isMe = msg.senderId === (currentUser ? currentUser.id : null);

    const existing = document.querySelector('[data-sync-id="' + msg.syncId + '"]');
    if (existing) return;

    const div = document.createElement('div');
    div.className = 'message ' + (isMe ? 'me' : 'other');
    div.dataset.syncId = msg.syncId;
    if (animate !== false) div.style.animation = 'messageIn 0.25s ease';

    const time = formatTime(new Date(msg.timestamp));
    let content = '';

    if (!isMe) {
        content += '<div class="message-sender">' + escapeHtml(msg.sender) + '</div>';
    }

    switch (msg.type) {
        case 'text':
            content += '<div class="message-text">' + escapeHtml(msg.text) + '</div>';
            break;
        case 'image':
            if (msg.imageUrl) {
                content += '<img class="message-image" src="' + msg.imageUrl + '" alt="Imagem" loading="lazy" onclick="window.viewImage(&quot;' + msg.imageUrl + '&quot;)">';
            }
            break;
        case 'audio':
            const dur = formatDuration(msg.duration || 0);
            content += '<div class="message-audio" onclick="window.playAudio(&quot;' + msg.audioUrl + '&quot;, ' + (msg.duration || 0) + ')">' +
                '<div class="audio-icon">▶️</div>' +
                '<div class="audio-info">' +
                '<div class="audio-wave"><span></span><span></span><span></span><span></span><span></span></div>' +
                '<div class="audio-duration">' + dur + '</div></div></div>';
            break;
    }

    content += '<div class="message-meta"><span class="message-time">' + time + '</span>' +
        (isMe ? '<span class="message-checks">✓✓</span>' : '') + '</div>';

    div.innerHTML = content;
    els.messages_list.appendChild(div);
}

// ============================================
// REPRODUTOR DE ÁUDIO
// ============================================
window.playAudio = function(url, duration) {
    if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }

    currentAudio = new Audio(url);
    els.audio_player_modal.classList.remove('hidden');
    els.btn_play_pause.textContent = '⏸️';
    els.audio_progress.value = 0;
    els.audio_progress.max = duration || 100;

    currentAudio.play().catch(() => showToast('Erro ao reproduzir'));

    currentAudio.onended = () => {
        els.btn_play_pause.textContent = '▶️';
        clearInterval(audioPlayerInterval);
    };

    currentAudio.onerror = () => { showToast('Erro ao carregar'); closeAudioPlayer(); };

    clearInterval(audioPlayerInterval);
    audioPlayerInterval = setInterval(() => {
        if (currentAudio && !currentAudio.paused) {
            els.audio_progress.value = currentAudio.currentTime;
            els.audio_time.textContent = formatDuration(Math.floor(currentAudio.currentTime)) + ' / ' + formatDuration(duration);
        }
    }, 500);
};

function toggleAudioPlayback() {
    if (!currentAudio) return;
    if (currentAudio.paused) {
        currentAudio.play().catch(() => showToast('Erro'));
        els.btn_play_pause.textContent = '⏸️';
    } else {
        currentAudio.pause();
        els.btn_play_pause.textContent = '▶️';
    }
}

function seekAudio() {
    if (currentAudio) currentAudio.currentTime = parseFloat(els.audio_progress.value);
}

function closeAudioPlayer() {
    if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null; }
    clearInterval(audioPlayerInterval);
    els.audio_player_modal.classList.add('hidden');
}

// ============================================
// VISUALIZADOR DE IMAGEM
// ============================================
window.viewImage = function(url) {
    els.viewer_img.src = url;
    els.image_viewer_modal.classList.remove('hidden');
};

// ============================================
// TYPING
// ============================================
function handleTyping() {
    if (!currentUser) return;

    if (!isTyping && els.message_input.value.length > 0) {
        isTyping = true;
        database.ref(TYPING_PATH + '/' + currentUser.id).set({
            name: currentUser.name,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 2500);
}

function stopTyping() {
    if (!isTyping || !currentUser) return;
    isTyping = false;
    database.ref(TYPING_PATH + '/' + currentUser.id).remove();
}

// ============================================
// MENUS
// ============================================
function toggleAttachMenu() {
    els.attach_menu.classList.toggle('hidden');
    els.emoji_picker.classList.add('hidden');
}

function toggleEmojiPicker() {
    els.emoji_picker.classList.toggle('hidden');
    els.attach_menu.classList.add('hidden');
}

// ============================================
// UTILITÁRIOS
// ============================================
function scrollToBottom() {
    requestAnimationFrame(() => {
        els.messages_area.scrollTop = els.messages_area.scrollHeight;
    });
}

function formatTime(date) {
    try {
        return date.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });
    } catch {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return h + ':' + m;
    }
}

function formatDuration(seconds) {
    if (!seconds || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return m + ':' + s;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let toastTimeout = null;
function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { els.toast.classList.add('hidden'); }, 2800);
}

// ============================================
// LIMPEZA
// ============================================
window.addEventListener('beforeunload', () => {
    if (currentUser) database.ref(TYPING_PATH + '/' + currentUser.id).remove();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentUser) {
        database.ref(TYPING_PATH + '/' + currentUser.id).remove();
        isTyping = false;
    }
});
