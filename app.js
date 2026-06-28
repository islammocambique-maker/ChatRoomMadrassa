/**
 * MADRASSA ONLINE — ISLAM MOÇAMBIQUE
 * Sala de Aulas — Firebase Realtime Chat
 * 
 * Features:
 * - Texto, Áudio, Imagem
 * - Baixo consumo de dados
 * - Design WhatsApp-like
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
let messagesRef = null;
let typingRef = null;
let isTyping = false;

// ============================================
// ELEMENTOS DOM
// ============================================
const els = {
    loginScreen: document.getElementById('login-screen'),
    chatScreen: document.getElementById('chat-screen'),
    userName: document.getElementById('user-name'),
    btnEnter: document.getElementById('btn-enter'),
    messagesArea: document.getElementById('messages-area'),
    messagesList: document.getElementById('messages-list'),
    messageInput: document.getElementById('message-input'),
    btnSend: document.getElementById('btn-send'),
    btnAttach: document.getElementById('btn-attach'),
    attachMenu: document.getElementById('attach-menu'),
    btnRecord: document.getElementById('btn-record'),
    audioRecorder: document.getElementById('audio-recorder'),
    recorderTimer: document.getElementById('recorder-timer'),
    btnStopRecord: document.getElementById('btn-stop-record'),
    btnCancelRecord: document.getElementById('btn-cancel-record'),
    btnEmoji: document.getElementById('btn-emoji'),
    emojiPicker: document.getElementById('emoji-picker'),
    imageInput: document.getElementById('image-input'),
    imagePreviewModal: document.getElementById('image-preview-modal'),
    previewImg: document.getElementById('preview-img'),
    btnConfirmImage: document.getElementById('btn-confirm-image'),
    btnCancelImage: document.getElementById('btn-cancel-image'),
    typingIndicator: document.getElementById('typing-indicator'),
    onlineStatus: document.getElementById('online-status'),
    toast: document.getElementById('toast'),
    welcomeTime: document.getElementById('welcome-time'),
    audioPlayerModal: document.getElementById('audio-player-modal'),
    btnCloseAudio: document.getElementById('btn-close-audio'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    audioProgress: document.getElementById('audio-progress'),
    audioTime: document.getElementById('audio-time')
};

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Definir hora de boas-vindas
    els.welcomeTime.textContent = formatTime(new Date());
    
    // Verificar se já tem nome salvo
    const savedName = localStorage.getItem('madrassa_username');
    if (savedName) {
        els.userName.value = savedName;
    }
    
    setupEventListeners();
    setupFirebaseListeners();
});

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Login
    els.btnEnter.addEventListener('click', doLogin);
    els.userName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    
    // Mensagens
    els.btnSend.addEventListener('click', sendTextMessage);
    els.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });
    
    // Detectar digitação
    els.messageInput.addEventListener('input', handleTyping);
    
    // Anexos
    els.btnAttach.addEventListener('click', toggleAttachMenu);
    document.addEventListener('click', (e) => {
        if (!els.attachMenu.contains(e.target) && e.target !== els.btnAttach) {
            els.attachMenu.classList.add('hidden');
        }
    });
    
    // Imagem
    document.getElementById('btn-image').addEventListener('click', () => {
        els.imageInput.click();
        els.attachMenu.classList.add('hidden');
    });
    document.getElementById('btn-camera').addEventListener('click', () => {
        els.imageInput.setAttribute('capture', 'environment');
        els.imageInput.click();
        els.attachMenu.classList.add('hidden');
    });
    document.getElementById('btn-gallery').addEventListener('click', () => {
        els.imageInput.removeAttribute('capture');
        els.imageInput.click();
        els.attachMenu.classList.add('hidden');
    });
    
    els.imageInput.addEventListener('change', handleImageSelect);
    els.btnConfirmImage.addEventListener('click', sendImageMessage);
    els.btnCancelImage.addEventListener('click', () => {
        els.imagePreviewModal.classList.add('hidden');
        els.imageInput.value = '';
    });
    
    // Emoji
    els.btnEmoji.addEventListener('click', toggleEmojiPicker);
    els.emojiPicker.querySelector('.emoji-grid').addEventListener('click', (e) => {
        if (e.target.textContent) {
            els.messageInput.value += e.target.textContent;
            els.messageInput.focus();
        }
    });
    
    // Áudio
    els.btnRecord.addEventListener('click', startRecording);
    els.btnStopRecord.addEventListener('click', stopRecording);
    els.btnCancelRecord.addEventListener('click', cancelRecording);
    
    // Audio Player
    els.btnCloseAudio.addEventListener('click', closeAudioPlayer);
    els.btnPlayPause.addEventListener('click', toggleAudioPlayback);
    els.audioProgress.addEventListener('input', seekAudio);
    
    // Fechar modais ao clicar fora
    els.imagePreviewModal.addEventListener('click', (e) => {
        if (e.target === els.imagePreviewModal) {
            els.imagePreviewModal.classList.add('hidden');
        }
    });
}

// ============================================
// LOGIN
// ============================================
function doLogin() {
    const name = els.userName.value.trim();
    if (!name || name.length < 2) {
        showToast('Por favor, digite seu nome completo');
        return;
    }
    
    currentUser = {
        name: name,
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };
    
    localStorage.setItem('madrassa_username', name);
    
    // Animar transição
    els.loginScreen.classList.remove('active');
    setTimeout(() => {
        els.chatScreen.classList.add('active');
        els.messageInput.focus();
    }, 300);
    
    showToast(`Bem-vindo, ${name}! 🕌`);
    
    // Conectar ao Firebase
    connectToRoom();
}

// ============================================
// FIREBASE — CONEXÃO E MENSAGENS
// ============================================
function connectToRoom() {
    const roomId = 'sala_de_aulas_principal';
    messagesRef = database.ref(`rooms/${roomId}/messages`);
    typingRef = database.ref(`rooms/${roomId}/typing`);
    
    // Limpar typing antigo deste usuário
    typingRef.child(currentUser.id).remove();
    
    // Escutar novas mensagens (limitado para economizar dados)
    messagesRef.limitToLast(50).on('child_added', (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg, snapshot.key);
        scrollToBottom();
    });
    
    // Escutar mudanças (edições, deleções)
    messagesRef.on('child_changed', (snapshot) => {
        updateMessage(snapshot.key, snapshot.val());
    });
    
    // Escutar typing
    typingRef.on('value', (snapshot) => {
        const typings = snapshot.val();
        if (!typings) {
            els.typingIndicator.classList.add('hidden');
            return;
        }
        
        const othersTyping = Object.keys(typings).filter(id => id !== currentUser.id);
        if (othersTyping.length > 0) {
            const names = othersTyping.map(id => typings[id].name).join(', ');
            document.getElementById('typing-text').textContent = 
                othersTyping.length === 1 ? `${names} está digitando` : `${names} estão digitando`;
            els.typingIndicator.classList.remove('hidden');
            scrollToBottom();
        } else {
            els.typingIndicator.classList.add('hidden');
        }
    });
    
    // Status online
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
            els.onlineStatus.textContent = 'Online';
            els.onlineStatus.style.color = '#25D366';
        } else {
            els.onlineStatus.textContent = 'Conectando...';
            els.onlineStatus.style.color = 'rgba(255,255,255,0.8)';
        }
    });
}

// ============================================
// ENVIAR MENSAGEM DE TEXTO
// ============================================
function sendTextMessage() {
    const text = els.messageInput.value.trim();
    if (!text || !currentUser) return;
    
    const message = {
        type: 'text',
        text: text,
        sender: currentUser.name,
        senderId: currentUser.id,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    messagesRef.push(message);
    els.messageInput.value = '';
    stopTyping();
}

// ============================================
// ENVIAR IMAGEM
// ============================================
let selectedImageFile = null;

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Verificar tamanho (máx 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Imagem muito grande. Máximo 5MB.');
        return;
    }
    
    selectedImageFile = file;
    
    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
        els.previewImg.src = e.target.result;
        els.imagePreviewModal.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

async function sendImageMessage() {
    if (!selectedImageFile || !currentUser) return;
    
    els.btnConfirmImage.textContent = 'Enviando...';
    els.btnConfirmImage.disabled = true;
    
    try {
        // Comprimir imagem antes de enviar
        const compressedFile = await compressImage(selectedImageFile);
        
        // Upload para Firebase Storage
        const fileName = `images/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;
        const storageRef = storage.ref(fileName);
        
        await storageRef.put(compressedFile);
        const downloadURL = await storageRef.getDownloadURL();
        
        // Salvar mensagem no database
        const message = {
            type: 'image',
            imageUrl: downloadURL,
            sender: currentUser.name,
            senderId: currentUser.id,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        messagesRef.push(message);
        
        els.imagePreviewModal.classList.add('hidden');
        els.imageInput.value = '';
        selectedImageFile = null;
        showToast('Imagem enviada! 📷');
        
    } catch (error) {
        console.error('Erro ao enviar imagem:', error);
        showToast('Erro ao enviar imagem. Tente novamente.');
    } finally {
        els.btnConfirmImage.textContent = 'Enviar';
        els.btnConfirmImage.disabled = false;
    }
}

// Comprimir imagem para economizar dados
function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1280;
                const MAX_HEIGHT = 1280;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.7);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await uploadAudio(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        
        // UI
        els.audioRecorder.classList.remove('hidden');
        els.btnRecord.classList.add('hidden');
        startRecordingTimer();
        
    } catch (err) {
        console.error('Erro ao iniciar gravação:', err);
        showToast('Permita o acesso ao microfone para gravar áudio');
    }
}

function startRecordingTimer() {
    recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        els.recorderTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingTimer);
    
    els.audioRecorder.classList.add('hidden');
    els.btnRecord.classList.remove('hidden');
    els.recorderTimer.textContent = '00:00';
}

function cancelRecording() {
    if (!isRecording || !mediaRecorder) return;
    
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingTimer);
    audioChunks = [];
    
    els.audioRecorder.classList.add('hidden');
    els.btnRecord.classList.remove('hidden');
    els.recorderTimer.textContent = '00:00';
}

async function uploadAudio(audioBlob) {
    if (audioBlob.size === 0) return;
    
    showToast('Enviando áudio... 🎵');
    
    try {
        const fileName = `audio/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.webm`;
        const storageRef = storage.ref(fileName);
        
        await storageRef.put(audioBlob);
        const downloadURL = await storageRef.getDownloadURL();
        
        // Calcular duração aproximada
        const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
        
        const message = {
            type: 'audio',
            audioUrl: downloadURL,
            duration: duration,
            sender: currentUser.name,
            senderId: currentUser.id,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        messagesRef.push(message);
        showToast('Áudio enviado! 🎵');
        
    } catch (error) {
        console.error('Erro ao enviar áudio:', error);
        showToast('Erro ao enviar áudio');
    }
}

// ============================================
// RENDERIZAR MENSAGENS
// ============================================
function renderMessage(msg, key) {
    const isMe = msg.senderId === currentUser?.id;
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'me' : 'other'}`;
    div.dataset.key = key;
    
    const time = msg.timestamp ? formatTime(new Date(msg.timestamp)) : formatTime(new Date());
    
    let content = '';
    
    if (!isMe) {
        content += `<div class="message-sender">${escapeHtml(msg.sender)}</div>`;
    }
    
    switch (msg.type) {
        case 'text':
            content += `<div class="message-text">${escapeHtml(msg.text)}</div>`;
            break;
            
        case 'image':
            content += `<img class="message-image" src="${msg.imageUrl}" alt="Imagem" loading="lazy" onclick="viewImage('${msg.imageUrl}')">`;
            break;
            
        case 'audio':
            const durationStr = formatDuration(msg.duration || 0);
            content += `
                <div class="message-audio" onclick="playAudio('${msg.audioUrl}', ${msg.duration || 0})">
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
    els.messagesList.appendChild(div);
}

function updateMessage(key, msg) {
    // Implementar se necessário (edições, etc.)
}

// ============================================
// REPRODUTOR DE ÁUDIO
// ============================================
function playAudio(url, duration) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    currentAudio = new Audio(url);
    els.audioPlayerModal.classList.remove('hidden');
    els.btnPlayPause.textContent = '⏸️';
    els.audioProgress.max = duration || 100;
    els.audioProgress.value = 0;
    
    currentAudio.play();
    
    currentAudio.onended = () => {
        els.btnPlayPause.textContent = '▶️';
        clearInterval(audioPlayerInterval);
    };
    
    audioPlayerInterval = setInterval(() => {
        if (currentAudio) {
            els.audioProgress.value = currentAudio.currentTime;
            els.audioTime.textContent = `${formatDuration(Math.floor(currentAudio.currentTime))} / ${formatDuration(duration)}`;
        }
    }, 1000);
}

function toggleAudioPlayback() {
    if (!currentAudio) return;
    
    if (currentAudio.paused) {
        currentAudio.play();
        els.btnPlayPause.textContent = '⏸️';
    } else {
        currentAudio.pause();
        els.btnPlayPause.textContent = '▶️';
    }
}

function seekAudio() {
    if (currentAudio) {
        currentAudio.currentTime = els.audioProgress.value;
    }
}

function closeAudioPlayer() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    clearInterval(audioPlayerInterval);
    els.audioPlayerModal.classList.add('hidden');
}

// ============================================
// INDICADOR DE DIGITAÇÃO
// ============================================
function handleTyping() {
    if (!currentUser || !typingRef) return;
    
    if (!isTyping && els.messageInput.value.length > 0) {
        isTyping = true;
        typingRef.child(currentUser.id).set({
            name: currentUser.name,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 3000);
}

function stopTyping() {
    if (!isTyping || !typingRef || !currentUser) return;
    isTyping = false;
    typingRef.child(currentUser.id).remove();
}

// ============================================
// UTILITÁRIOS
// ============================================
function toggleAttachMenu() {
    els.attachMenu.classList.toggle('hidden');
    els.emojiPicker.classList.add('hidden');
}

function toggleEmojiPicker() {
    els.emojiPicker.classList.toggle('hidden');
    els.attachMenu.classList.add('hidden');
}

function viewImage(url) {
    els.previewImg.src = url;
    els.imagePreviewModal.classList.remove('hidden');
}

function scrollToBottom() {
    els.messagesArea.scrollTop = els.messagesArea.scrollHeight;
}

function formatTime(date) {
    return date.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    
    setTimeout(() => {
        els.toast.classList.add('hidden');
    }, 3000);
}

// Limpar typing ao sair
window.addEventListener('beforeunload', () => {
    if (currentUser && typingRef) {
        typingRef.child(currentUser.id).remove();
    }
});

// ============================================
// Otimizações para baixo consumo de dados
// ============================================
// Lazy loading de imagens
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
                imageObserver.unobserve(img);
            }
        });
    });
    
    // Observar imagens novas
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    const images = node.querySelectorAll ? node.querySelectorAll('img[data-src]') : [];
                    images.forEach(img => imageObserver.observe(img));
                }
            });
        });
    });
    
    observer.observe(els.messagesList, { childList: true, subtree: true });
}
