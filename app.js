/**
 * MADRASSA ONLINE — ISLAM MOÇAMBIQUE
 * Sala de Aulas — Firebase + LocalStorage Sync
 * 
 * ARQUITETURA:
 * - Cada usuário mantém seu próprio LocalStorage (fonte de verdade)
 * - Firebase serve apenas como canal de DISTRIBUIÇÃO entre usuários
 * - Mensagens recebidas de outros são salvas no LocalStorage local
 * - Ao enviar, salva no LocalStorage PRIMEIRO, depois publica no Firebase
 * - Ao receber do Firebase, salva no LocalStorage e renderiza
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

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const storage = firebase.storage();

// ============================================
// CONSTANTES
// ============================================
const ROOM_ID = 'sala_de_aulas_principal';
const LS_PREFIX = 'madrassa_';
const LS_USER = LS_PREFIX + 'user';
const LS_MESSAGES = LS_PREFIX + 'messages';
const LS_LAST_SYNC = LS_PREFIX + 'lastSync';

// Emojis populares
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
let messagesRef = null;
let typingRef = null;
let syncRef = null;
let processedSyncIds = new Set(); // Evita processar a mesma mensagem 2x
let selectedImageFile = null;
let selectedImageDataUrl = null;

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
// LOCALSTORAGE — GERENCIAMENTO DE MENSAGENS
// ============================================

/**
 * Obtém todas as mensagens do LocalStorage
 */
function getLocalMessages() {
    try {
        const data = localStorage.getItem(LS_MESSAGES);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Erro ao ler LocalStorage:', e);
        return [];
    }
}

/**
 * Salva mensagens no LocalStorage
 */
function saveLocalMessages(messages) {
    try {
        localStorage.setItem(LS_MESSAGES, JSON.stringify(messages));
    } catch (e) {
        console.error('Erro ao salvar LocalStorage:', e);
        showToast('Erro ao salvar mensagem localmente');
    }
}

/**
 * Adiciona uma mensagem ao LocalStorage
 * Retorna true se foi adicionada (nova), false se já existia
 */
function addLocalMessage(msg) {
    const messages = getLocalMessages();

    // Verificar se já existe (pelo syncId ou combinação de campos)
    const exists = messages.some(m => 
        m.syncId === msg.syncId || 
        (m.senderId === msg.senderId && 
         m.timestamp === msg.timestamp && 
         m.type === msg.type &&
         (msg.type === 'text' ? m.text === msg.text : true))
    );

    if (exists) return false;

    messages.push(msg);
    saveLocalMessages(messages);
    return true;
}

/**
 * Limpa todas as mensagens do LocalStorage
 */
function clearLocalMessages() {
    localStorage.removeItem(LS_MESSAGES);
    localStorage.removeItem(LS_LAST_SYNC);
    renderAllMessages();
    showToast('Conversa limpa! 🗑️');
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    cacheElements();

    // Definir hora de boas-vindas
    els.welcome_time.textContent = formatTime(new Date());

    // Preencher emojis
    renderEmojis();

    // Verificar se já tem nome salvo
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
    setupFirebaseListeners();

    // Renderizar mensagens existentes do LocalStorage
    renderAllMessages();
});

function renderEmojis() {
    els.emoji_grid.innerHTML = EMOJIS.map(e => `<span>${e}</span>`).join('');
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Login
    els.btn_enter.addEventListener('click', doLogin);
    els.user_name.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    // Mensagens
    els.btn_send.addEventListener('click', sendTextMessage);
    els.message_input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });

    // Toggle entre mic e send
    els.message_input.addEventListener('input', () => {
        handleTyping();
        toggleSendMic();
    });

    // Anexos
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

    // Imagem
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

    // Visualizador de imagem
    els.btn_close_viewer.addEventListener('click', () => {
        els.image_viewer_modal.classList.add('hidden');
    });

    // Emoji
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

    // Áudio
    els.btn_record.addEventListener('click', startRecording);
    els.btn_stop_record.addEventListener('click', stopRecording);
    els.btn_cancel_record.addEventListener('click', cancelRecording);

    // Audio Player
    els.btn_close_audio.addEventListener('click', closeAudioPlayer);
    els.btn_play_pause.addEventListener('click', toggleAudioPlayback);
    els.audio_progress.addEventListener('input', seekAudio);

    // Limpar conversa
    els.btn_clear.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar toda a conversa?')) {
            clearLocalMessages();
        }
    });

    // Fechar modais ao clicar fora
    els.image_preview_modal.addEventListener('click', (e) => {
        if (e.target === els.image_preview_modal) cancelImagePreview();
    });
    els.image_viewer_modal.addEventListener('click', (e) => {
        if (e.target === els.image_viewer_modal) {
            els.image_viewer_modal.classList.add('hidden');
        }
    });
    els.audio_player_modal.addEventListener('click', (e) => {
        if (e.target === els.audio_player_modal) closeAudioPlayer();
    });
}

function toggleSendMic() {
    const hasText = els.message_input.value.trim().length > 0;
    if (hasText) {
        els.btn_record.classList.add('hidden');
        els.btn_send.classList.remove('hidden');
    } else {
        els.btn_record.classList.remove('hidden');
        els.btn_send.classList.add('hidden');
    }
}

// ============================================
// LOGIN
// ============================================
function doLogin() {
    const name = els.user_name.value.trim();
    if (!name || name.length < 2) {
        showToast('Por favor, digite seu nome completo');
        return;
    }

    currentUser = {
        name: name,
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };

    localStorage.setItem(LS_USER, JSON.stringify(currentUser));

    // Animar transição
    els.login_screen.classList.remove('active');
    setTimeout(() => {
        els.chat_screen.classList.add('active');
        els.message_input.focus();
    }, 300);

    showToast(`Bem-vindo, ${name}! 🕌`);

    // Conectar ao Firebase
    connectToRoom();
}

// ============================================
// FIREBASE — SINCRONIZAÇÃO
// ============================================
function connectToRoom() {
    // Referências Firebase
    messagesRef = database.ref(`rooms/${ROOM_ID}/sync`);
    typingRef = database.ref(`rooms/${ROOM_ID}/typing`);

    // Limpar typing antigo deste usuário
    if (currentUser) {
        typingRef.child(currentUser.id).remove();
    }

    // === ESCUTAR SINCRONIZAÇÃO (canal de distribuição) ===
    // Usamos 'child_added' para receber NOVAS mensagens de outros usuários
    messagesRef.limitToLast(30).on('child_added', (snapshot) => {
        const syncData = snapshot.val();
        if (!syncData) return;

        // Não processar mensagens do próprio usuário (já estão no LocalStorage)
        if (syncData.senderId === currentUser?.id) return;

        // Não processar mensagens já processadas
        if (processedSyncIds.has(syncData.syncId)) return;
        processedSyncIds.add(syncData.syncId);

        // Salvar no LocalStorage local
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
            scrollToBottom();

            // Notificação sutil se não estiver no foco
            if (document.hidden && syncData.type === 'text') {
                showToast(`💬 ${syncData.sender}: ${syncData.text.substring(0, 30)}...`);
            }
        }

        // Limpar do Firebase após processar (opcional, para economizar espaço)
        // snapshot.ref.remove();
    });

    // === ESCUTAR TYPING ===
    typingRef.on('value', (snapshot) => {
        const typings = snapshot.val();
        if (!typings) {
            els.typing_indicator.classList.add('hidden');
            return;
        }

        const othersTyping = Object.keys(typings).filter(id => id !== currentUser?.id);
        if (othersTyping.length > 0) {
            const names = othersTyping.map(id => typings[id].name).join(', ');
            els.typing_text.textContent = 
                othersTyping.length === 1 ? `${names} está digitando` : `${names} estão digitando`;
            els.typing_indicator.classList.remove('hidden');
            scrollToBottom();
        } else {
            els.typing_indicator.classList.add('hidden');
        }
    });

    // === STATUS ONLINE ===
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
            els.online_status.textContent = 'Online';
            els.online_status.style.color = '#25D366';
        } else {
            els.online_status.textContent = 'Conectando...';
            els.online_status.style.color = 'rgba(255,255,255,0.8)';
        }
    });
}

/**
 * Publica uma mensagem no Firebase para distribuição
 * Outros usuários receberão e salvarão no próprio LocalStorage
 */
function publishToFirebase(msg) {
    if (!messagesRef) return Promise.resolve();

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

    return messagesRef.push(syncData);
}

// ============================================
// ENVIAR MENSAGEM DE TEXTO
// ============================================
function sendTextMessage() {
    const text = els.message_input.value.trim();
    if (!text || !currentUser) return;

    const msg = createMessage('text', { text: text });

    // 1. Salvar no LocalStorage PRIMEIRO
    addLocalMessage(msg);

    // 2. Renderizar imediatamente
    renderMessage(msg);
    scrollToBottom();

    // 3. Limpar input
    els.message_input.value = '';
    toggleSendMic();
    stopTyping();

    // 4. Publicar no Firebase para outros usuários
    publishToFirebase(msg).catch(err => {
        console.error('Erro ao publicar no Firebase:', err);
        showToast('Mensagem salva localmente. Sincronizando...');
    });
}

// ============================================
// ENVIAR IMAGEM
// ============================================
function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
        showToast('Imagem muito grande. Máximo 8MB.');
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
        // 1. Comprimir imagem
        showToast('Comprimindo imagem...');
        const compressedBlob = await compressImage(selectedImageFile);

        // 2. Upload para Firebase Storage
        const fileName = `images/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;
        const storageRef = storage.ref(fileName);

        await storageRef.put(compressedBlob);
        const downloadURL = await storageRef.getDownloadURL();

        // 3. Criar mensagem
        const msg = createMessage('image', { imageUrl: downloadURL });

        // 4. Salvar no LocalStorage
        addLocalMessage(msg);

        // 5. Renderizar
        renderMessage(msg);
        scrollToBottom();

        // 6. Publicar no Firebase
        await publishToFirebase(msg);

        // 7. Limpar
        cancelImagePreview();
        showToast('Imagem enviada! 📷');

    } catch (error) {
        console.error('Erro ao enviar imagem:', error);
        showToast('Erro ao enviar imagem. Tente novamente.');
    } finally {
        els.btn_confirm_image.textContent = 'Enviar';
        els.btn_confirm_image.disabled = false;
    }
}

// Comprimir imagem via canvas
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height = Math.round(height * MAX_WIDTH / width);
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width = Math.round(width * MAX_HEIGHT / height);
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Falha ao comprimir imagem'));
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
        showToast('Seu navegador não suporta gravação de áudio');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 22050
            }
        });

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
            ? 'audio/webm;codecs=opus' 
            : 'audio/webm';

        mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await uploadAudio(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.onerror = (e) => {
            console.error('Erro no MediaRecorder:', e);
            showToast('Erro na gravação');
            cancelRecordingUI();
        };

        mediaRecorder.start(100); // Coletar a cada 100ms
        isRecording = true;
        recordingStartTime = Date.now();

        showRecordingUI();

    } catch (err) {
        console.error('Erro ao iniciar gravação:', err);
        showToast('Permita o acesso ao microfone para gravar áudio');
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
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        els.recorder_timer.textContent = `${mins}:${secs}`;

        // Limite de 5 minutos
        if (elapsed >= 300) {
            stopRecording();
        }
    }, 1000);
}

function stopRecording() {
    if (!isRecording || !mediaRecorder) return;

    if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    clearInterval(recordingTimer);
    cancelRecordingUI();
}

function cancelRecording() {
    if (!isRecording || !mediaRecorder) return;

    if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    clearInterval(recordingTimer);
    audioChunks = [];
    cancelRecordingUI();
}

async function uploadAudio(audioBlob) {
    if (audioBlob.size === 0) return;

    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

    showToast('Enviando áudio... 🎵');

    try {
        const fileName = `audio/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.webm`;
        const storageRef = storage.ref(fileName);

        await storageRef.put(audioBlob);
        const downloadURL = await storageRef.getDownloadURL();

        const msg = createMessage('audio', { 
            audioUrl: downloadURL, 
            duration: duration 
        });

        // Salvar no LocalStorage
        addLocalMessage(msg);

        // Renderizar
        renderMessage(msg);
        scrollToBottom();

        // Publicar no Firebase
        await publishToFirebase(msg);

        showToast('Áudio enviado! 🎵');

    } catch (error) {
        console.error('Erro ao enviar áudio:', error);
        showToast('Erro ao enviar áudio');
    }
}

// ============================================
// CRIAR MENSAGEM PADRONIZADA
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
// RENDERIZAR TODAS AS MENSAGENS (do LocalStorage)
// ============================================
function renderAllMessages() {
    els.messages_list.innerHTML = '';
    const messages = getLocalMessages();

    messages.sort((a, b) => a.timestamp - b.timestamp);

    messages.forEach(msg => {
        renderMessage(msg, false);
    });

    scrollToBottom();
}

// ============================================
// RENDERIZAR UMA MENSAGEM
// ============================================
function renderMessage(msg, animate = true) {
    const isMe = msg.senderId === currentUser?.id;

    // Verificar se já existe no DOM
    const existing = document.querySelector(`[data-sync-id="${msg.syncId}"]`);
    if (existing) return;

    const div = document.createElement('div');
    div.className = `message ${isMe ? 'me' : 'other'}`;
    div.dataset.syncId = msg.syncId;
    if (animate) div.style.animation = 'messageIn 0.25s ease';

    const time = formatTime(new Date(msg.timestamp));

    let content = '';

    if (!isMe) {
        content += `<div class="message-sender">${escapeHtml(msg.sender)}</div>`;
    }

    switch (msg.type) {
        case 'text':
            content += `<div class="message-text">${escapeHtml(msg.text)}</div>`;
            break;

        case 'image':
            if (msg.imageUrl) {
                content += `<img class="message-image" src="${msg.imageUrl}" alt="Imagem" loading="lazy" onclick="window.viewImage('${msg.imageUrl}')">`;
            }
            break;

        case 'audio':
            const durationStr = formatDuration(msg.duration || 0);
            content += `
                <div class="message-audio" onclick="window.playAudio('${msg.audioUrl}', ${msg.duration || 0})">
                    <div class="audio-icon">▶️</div>
                    <div class="audio-info">
                        <div class="audio-wave">
                            <span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <div class="audio-duration">${durationStr}</div>
                    </div>
                </div>
            `;
            break;
    }

    content += `
        <div class="message-meta">
            <span class="message-time">${time}</span>
            ${isMe ? '<span class="message-checks">✓✓</span>' : ''}
        </div>
    `;

    div.innerHTML = content;
    els.messages_list.appendChild(div);
}

// ============================================
// REPRODUTOR DE ÁUDIO
// ============================================
window.playAudio = function(url, duration) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    currentAudio = new Audio(url);
    els.audio_player_modal.classList.remove('hidden');
    els.btn_play_pause.textContent = '⏸️';
    els.audio_progress.value = 0;
    els.audio_progress.max = duration || 100;

    currentAudio.play().catch(err => {
        console.error('Erro ao reproduzir:', err);
        showToast('Erro ao reproduzir áudio');
    });

    currentAudio.onended = () => {
        els.btn_play_pause.textContent = '▶️';
        clearInterval(audioPlayerInterval);
        els.audio_time.textContent = formatDuration(duration) + ' / ' + formatDuration(duration);
    };

    currentAudio.onerror = () => {
        showToast('Erro ao carregar áudio');
        closeAudioPlayer();
    };

    clearInterval(audioPlayerInterval);
    audioPlayerInterval = setInterval(() => {
        if (currentAudio && !currentAudio.paused) {
            const current = Math.floor(currentAudio.currentTime);
            els.audio_progress.value = currentAudio.currentTime;
            els.audio_time.textContent = `${formatDuration(current)} / ${formatDuration(duration)}`;
        }
    }, 500);
};

function toggleAudioPlayback() {
    if (!currentAudio) return;

    if (currentAudio.paused) {
        currentAudio.play().catch(() => showToast('Erro ao reproduzir'));
        els.btn_play_pause.textContent = '⏸️';
    } else {
        currentAudio.pause();
        els.btn_play_pause.textContent = '▶️';
    }
}

function seekAudio() {
    if (currentAudio) {
        currentAudio.currentTime = parseFloat(els.audio_progress.value);
    }
}

function closeAudioPlayer() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
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
// INDICADOR DE DIGITAÇÃO
// ============================================
function handleTyping() {
    if (!currentUser || !typingRef) return;

    if (!isTyping && els.message_input.value.length > 0) {
        isTyping = true;
        typingRef.child(currentUser.id).set({
            name: currentUser.name,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 2500);
}

function stopTyping() {
    if (!isTyping || !typingRef || !currentUser) return;
    isTyping = false;
    typingRef.child(currentUser.id).remove();
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
        return `${h}:${m}`;
    }
}

function formatDuration(seconds) {
    if (!seconds || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
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
    toastTimeout = setTimeout(() => {
        els.toast.classList.add('hidden');
    }, 2800);
}

// ============================================
// LIMPEZA AO SAIR
// ============================================
window.addEventListener('beforeunload', () => {
    if (currentUser && typingRef) {
        typingRef.child(currentUser.id).remove();
    }
});

// Limpar typing quando a aba perde foco
document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentUser && typingRef) {
        typingRef.child(currentUser.id).remove();
        isTyping = false;
    }
});
