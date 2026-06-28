/**
 * MADRASSA ONLINE v7 — ÁUDIO COM FALLBACK PARA CELULAR
 * Se MediaRecorder falhar, usa Web Audio API + gravação manual
 */

// ========== DIAGNÓSTICO VISUAL ==========
let debugVisible = false;
function toggleDebug() {
    debugVisible = !debugVisible;
    const panel = document.getElementById('debug-panel');
    if(panel) panel.style.display = debugVisible ? 'block' : 'none';
}
function dlog(msg, type='info') {
    const div = document.getElementById('debug-logs');
    if(!div) return;
    const line = document.createElement('div');
    const time = new Date().toLocaleTimeString('pt-MZ');
    line.style.cssText = 'border-bottom:1px solid #333; padding:2px 0; color:' + (type==='error'?'#ff4444':type==='warn'?'#ffaa00':'#00ff88');
    line.textContent = '[' + time + '] ' + msg;
    div.appendChild(line);
    div.scrollTop = div.scrollHeight;
}

// ========== FIREBASE ==========
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
    dlog('Firebase OK');
} catch (e) {
    dlog('Firebase erro: ' + e.message, 'error');
}

const db = firebase.database();
const st = firebase.storage();

// ========== CONSTANTES ==========
const SYNC = 'rooms/sala_de_aulas_principal/sync';
const TYPING = 'rooms/sala_de_aulas_principal/typing';
const LS_USER = 'madrassa_user';
const LS_MSGS = 'madrassa_messages';

const EMOJIS = '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾🕌🕋🤲🙏☪️✨🌙⭐🌟💫🔥❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝👍👎👌✌️🤞🤟🤘🤙👈👉👆👇☝️👋🤚🖐️✋🖖👏🙌👐🤲🤝🙏✍️💪🦾🦿🦵🦶👂🦻👃🧠🫀🫁🦷🦴👀👁️👅👄👶🧒👦👧🧑👱👨🧔👩🧓👴👵'.split('');

// ========== VARIÁVEIS ==========
let me = null;
let recorder = null;
let audioChunks = [];
let isRec = false;
let recStart = 0;
let recTimer = null;
let player = null;
let playerTimer = null;
let typingT = null;
let isTyping = false;
let seen = new Set();
let imgFile = null;
let imgData = null;

// Variáveis para fallback de áudio
let audioContext = null;
let mediaStream = null;
let scriptNode = null;
let audioBuffer = [];
let useFallbackAudio = false;

// ========== ELEMENTOS ==========
function $(id) { return document.getElementById(id); }

// ========== LOCALSTORAGE ==========
function getMsgs() {
    try { return JSON.parse(localStorage.getItem(LS_MSGS)) || []; }
    catch(e) { return []; }
}
function saveMsgs(msgs) {
    try { localStorage.setItem(LS_MSGS, JSON.stringify(msgs)); }
    catch(e) { dlog('Erro LS: ' + e.message, 'error'); }
}
function addMsg(msg) {
    const msgs = getMsgs();
    if (msgs.some(m => m.id === msg.id)) return false;
    msgs.push(msg);
    saveMsgs(msgs);
    return true;
}
function clearMsgs() {
    localStorage.removeItem(LS_MSGS);
    seen.clear();
    renderAll();
    toast('Conversa limpa!');
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', () => {
    dlog('App v7 iniciado');
    $('welcome-time').textContent = fmtTime(new Date());

    // Emojis
    $('emoji-grid').innerHTML = EMOJIS.map(e => '<span onclick="addEmoji(this)">' + e + '</span>').join('');

    // Restaurar usuário
    const saved = localStorage.getItem(LS_USER);
    if (saved) {
        try {
            const u = JSON.parse(saved);
            $('user-name').value = u.name || '';
            dlog('Usuário: ' + u.name);
        } catch(e) { $('user-name').value = saved; }
    }

    bindEvents();
    bindFirebase();
    renderAll();
});

function addEmoji(el) {
    $('message-input').value += el.textContent;
    $('message-input').focus();
    toggleSendMic();
}

// ========== EVENTOS ==========
function bindEvents() {
    $('btn-enter').onclick = login;
    $('user-name').onkeypress = (e) => { if(e.key==='Enter') login(); };

    $('btn-send').onclick = sendText;
    $('message-input').onkeypress = (e) => {
        if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    };
    $('message-input').oninput = () => { handleTyping(); toggleSendMic(); };

    $('btn-attach').onclick = (e) => { e.stopPropagation(); toggleAttach(); };
    document.onclick = (e) => {
        if(!$('attach-menu').contains(e.target) && e.target!==$('btn-attach')) $('attach-menu').classList.add('hidden');
        if(!$('emoji-picker').contains(e.target) && e.target!==$('btn-emoji')) $('emoji-picker').classList.add('hidden');
    };

    $('btn-image').onclick = () => { $('image-input').removeAttribute('capture'); $('image-input').click(); $('attach-menu').classList.add('hidden'); };
    $('btn-camera').onclick = () => { $('image-input').setAttribute('capture','environment'); $('image-input').click(); $('attach-menu').classList.add('hidden'); };
    $('image-input').onchange = onImgSelect;
    $('btn-confirm-image').onclick = sendImg;
    $('btn-cancel-image').onclick = cancelImg;
    $('btn-close-viewer').onclick = () => $('image-viewer-modal').classList.add('hidden');

    $('btn-emoji').onclick = (e) => { e.stopPropagation(); toggleEmoji(); };

    $('btn-record').onclick = startRec;
    $('btn-stop-record').onclick = stopRec;
    $('btn-cancel-record').onclick = cancelRec;

    $('btn-close-audio').onclick = closePlayer;
    $('btn-play-pause').onclick = togglePlay;
    $('audio-progress').oninput = seekAudio;

    $('btn-clear').onclick = () => { if(confirm('Limpar conversa?')) clearMsgs(); };

    $('image-preview-modal').onclick = (e) => { if(e.target===$('image-preview-modal')) cancelImg(); };
    $('image-viewer-modal').onclick = (e) => { if(e.target===$('image-viewer-modal')) $('image-viewer-modal').classList.add('hidden'); };
    $('audio-player-modal').onclick = (e) => { if(e.target===$('audio-player-modal')) closePlayer(); };
}

function toggleSendMic() {
    const has = $('message-input').value.trim().length > 0;
    $('btn-record').classList.toggle('hidden', has);
    $('btn-send').classList.toggle('hidden', !has);
}
function toggleAttach() { $('attach-menu').classList.toggle('hidden'); $('emoji-picker').classList.add('hidden'); }
function toggleEmoji() { $('emoji-picker').classList.toggle('hidden'); $('attach-menu').classList.add('hidden'); }

// ========== LOGIN ==========
function login() {
    const name = $('user-name').value.trim();
    if(!name || name.length<2) { toast('Digite seu nome'); return; }

    me = { name:name, id:'u'+Date.now()+'_'+Math.random().toString(36).substr(2,6) };
    localStorage.setItem(LS_USER, JSON.stringify(me));
    dlog('Login: ' + me.name);

    $('login-screen').classList.remove('active');
    setTimeout(() => {
        $('chat-screen').classList.add('active');
        $('message-input').focus();
    }, 300);

    toast('Bem-vindo, ' + name + '!');
    connectRoom();
}

// ========== FIREBASE ==========
function bindFirebase() {
    db.ref('.info/connected').on('value', (s) => {
        const on = s.val();
        $('online-status').textContent = on ? 'Online' : 'Offline';
        $('online-status').style.color = on ? '#25D366' : '#ff4444';
    });

    const saved = localStorage.getItem(LS_USER);
    if(saved) {
        try {
            me = JSON.parse(saved);
            $('login-screen').classList.remove('active');
            $('chat-screen').classList.add('active');
            connectRoom();
        } catch(e) {}
    }
}

function connectRoom() {
    if(!me) return;
    dlog('Conectando...');

    db.ref(SYNC).limitToLast(50).on('value', (snap) => {
        const data = snap.val();
        if(!data) return;

        const keys = Object.keys(data);
        let novas = 0;

        keys.forEach(k => {
            const d = data[k];
            if(!d || d.senderId===me.id) return;
            if(seen.has(d.id || d.syncId)) return;

            const id = d.id || d.syncId || k;
            seen.add(id);

            const msg = {
                id: id, type: d.type, sender: d.sender, senderId: d.senderId,
                time: d.timestamp || Date.now(), text: d.text || null,
                img: d.imageUrl || null, audio: d.audioUrl || null, dur: d.duration || 0
            };

            if(addMsg(msg)) {
                renderMsg(msg);
                novas++;
            }
        });

        if(novas>0) scrollBottom();
    }, (err) => {
        dlog('ERRO: ' + err.message, 'error');
    });

    db.ref(TYPING).on('value', (snap) => {
        const t = snap.val();
        if(!t) { $('typing-indicator').classList.add('hidden'); return; }
        const others = Object.keys(t).filter(id => id!==me.id);
        if(others.length>0) {
            const names = others.map(id => t[id].name).join(', ');
            $('typing-text').textContent = others.length===1 ? names+' está digitando' : names+' estão digitando';
            $('typing-indicator').classList.remove('hidden');
            scrollBottom();
        } else {
            $('typing-indicator').classList.add('hidden');
        }
    });

    window.onbeforeunload = () => { if(me) db.ref(TYPING+'/'+me.id).remove(); };
}

function pub(msg) {
    const data = {
        id: msg.id, syncId: msg.id, type: msg.type,
        sender: msg.sender, senderId: msg.senderId,
        timestamp: msg.time, text: msg.text,
        imageUrl: msg.img, audioUrl: msg.audio, duration: msg.dur
    };
    return db.ref(SYNC).push(data)
        .then(() => { dlog('Enviado: ' + msg.id); })
        .catch(err => { dlog('ERRO enviar: ' + err.message, 'error'); toast('Erro ao enviar'); throw err; });
}

// ========== TEXTO ==========
function sendText() {
    const text = $('message-input').value.trim();
    if(!text || !me) return;

    const msg = mkMsg('text', {text:text});
    addMsg(msg);
    renderMsg(msg);
    scrollBottom();

    $('message-input').value = '';
    toggleSendMic();
    stopTyping();
    pub(msg);
}

// ========== IMAGEM ==========
function onImgSelect(e) {
    const f = e.target.files[0];
    if(!f) return;
    if(f.size > 8*1024*1024) { toast('Máx 8MB'); return; }

    imgFile = f;
    const r = new FileReader();
    r.onload = (ev) => {
        imgData = ev.target.result;
        $('preview-img').src = imgData;
        $('image-preview-modal').classList.remove('hidden');
    };
    r.readAsDataURL(f);
}

function cancelImg() {
    $('image-preview-modal').classList.add('hidden');
    $('image-input').value = '';
    imgFile = null; imgData = null;
}

async function sendImg() {
    if(!imgFile || !me) return;
    $('btn-confirm-image').textContent = 'Enviando...';
    $('btn-confirm-image').disabled = true;

    try {
        const blob = await compressImg(imgFile);
        const name = 'img/'+Date.now()+'_'+Math.random().toString(36).substr(2,8)+'.jpg';
        const ref = st.ref(name);

        await ref.put(blob);
        const url = await ref.getDownloadURL();

        const msg = mkMsg('image', {img:url});
        addMsg(msg);
        renderMsg(msg);
        scrollBottom();

        await pub(msg);
        cancelImg();
        toast('Imagem enviada!');

    } catch(e) {
        dlog('ERRO img: ' + e.message, 'error');
        toast('Erro: ' + e.message);
    } finally {
        $('btn-confirm-image').textContent = 'Enviar';
        $('btn-confirm-image').disabled = false;
    }
}

function compressImg(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const r = new FileReader();
        r.onload = (e) => { img.src = e.target.result; };
        r.onerror = reject;
        r.readAsDataURL(file);

        img.onload = () => {
            const c = document.createElement('canvas');
            const MAX = 1200;
            let w = img.width, h = img.height;
            if(w>h){ if(w>MAX){ h=Math.round(h*MAX/w); w=MAX; }}
            else { if(h>MAX){ w=Math.round(w*MAX/h); h=MAX; }}
            c.width=w; c.height=h;
            const ctx = c.getContext('2d');
            ctx.fillStyle='#FFF'; ctx.fillRect(0,0,w,h);
            ctx.drawImage(img,0,0,w,h);
            c.toBlob((b) => { if(b) resolve(b); else reject('Falha'); }, 'image/jpeg', 0.75);
        };
        img.onerror = reject;
    });
}

// ========== ÁUDIO COM FALLBACK ==========
async function startRec() {
    dlog('=== INICIANDO GRAVAÇÃO v7 ===');

    if(!navigator.mediaDevices) {
        dlog('mediaDevices não existe!', 'error');
        toast('Navegador não suporta áudio');
        return;
    }

    try {
        dlog('Solicitando microfone...');
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 1
            }
        });
        dlog('Microfone OK!');

        // Tentar MediaRecorder primeiro
        const mimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            ''
        ];

        let supportedMime = '';
        for(const mime of mimeTypes) {
            if(MediaRecorder.isTypeSupported(mime)) {
                supportedMime = mime;
                dlog('MIME suportado: ' + mime);
                break;
            }
        }

        if(supportedMime && !useFallbackAudio) {
            dlog('Usando MediaRecorder');
            await startMediaRecorder(stream, supportedMime);
        } else {
            dlog('Usando fallback Web Audio');
            await startWebAudio(stream);
        }

    } catch(err) {
        dlog('ERRO: ' + err.name + ' - ' + err.message, 'error');
        if(err.name === 'NotAllowedError') toast('Permita acesso ao microfone');
        else if(err.name === 'NotFoundError') toast('Microfone não encontrado');
        else toast('Erro: ' + err.message);
    }
}

// Método 1: MediaRecorder (funciona em desktop e alguns mobile)
async function startMediaRecorder(stream, mimeType) {
    const options = {};
    if(mimeType) options.mimeType = mimeType;

    recorder = new MediaRecorder(stream, options);
    audioChunks = [];

    recorder.ondataavailable = (e) => {
        dlog('Chunk: ' + e.data.size + ' bytes');
        if(e.data.size > 0) audioChunks.push(e.data);
    };

    recorder.onstop = async () => {
        dlog('MediaRecorder parado. Chunks: ' + audioChunks.length);

        if(audioChunks.length === 0 || audioChunks.every(c => c.size === 0)) {
            dlog('MediaRecorder vazio! Tentando fallback...', 'warn');
            useFallbackAudio = true;
            toast('Tentando método alternativo...');
            return;
        }

        const blob = new Blob(audioChunks, {type: mimeType || 'audio/webm'});
        dlog('Blob: ' + blob.size + ' bytes');

        if(blob.size < 100) {
            dlog('Blob muito pequeno!', 'error');
            toast('Áudio muito curto');
            return;
        }

        await uploadAudio(blob, mimeType);
        stream.getTracks().forEach(t => t.stop());
    };

    recorder.onerror = (e) => {
        dlog('MediaRecorder erro: ' + e.message, 'error');
        useFallbackAudio = true;
    };

    recorder.start(1000);
    isRec = true;
    recStart = Date.now();
    showRecUI();
    dlog('MediaRecorder iniciado');
}

// Método 2: Web Audio API + ScriptProcessor (fallback para mobile)
async function startWebAudio(stream) {
    dlog('Iniciando Web Audio fallback...');

    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100
    });

    mediaStream = audioContext.createMediaStreamSource(stream);
    scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
    audioBuffer = [];

    scriptNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Copiar dados (Float32Array)
        audioBuffer.push(new Float32Array(inputData));
    };

    mediaStream.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    isRec = true;
    recStart = Date.now();
    showRecUI();
    dlog('Web Audio gravando...');
}

function showRecUI() {
    $('audio-recorder').classList.remove('hidden');
    $('normal-input').classList.add('hidden');
    recTimer = setInterval(() => {
        const s = Math.floor((Date.now()-recStart)/1000);
        const m = Math.floor(s/60).toString().padStart(2,'0');
        const sec = (s%60).toString().padStart(2,'0');
        $('recorder-timer').textContent = m+':'+sec;
        if(s>=300) stopRec();
    }, 1000);
}

function cancelRecUI() {
    $('audio-recorder').classList.add('hidden');
    $('normal-input').classList.remove('hidden');
    clearInterval(recTimer);
    $('recorder-timer').textContent = '00:00';
}

async function stopRec() {
    if(!isRec) return;
    dlog('Parando gravação...');

    if(recorder && recorder.state !== 'inactive') {
        // MediaRecorder ativo
        recorder.stop();
    } else if(scriptNode) {
        // Web Audio ativo
        scriptNode.disconnect();
        mediaStream.disconnect();

        if(audioContext) {
            await audioContext.close();
        }

        // Converter buffer para WAV
        dlog('Convertendo buffer (' + audioBuffer.length + ' chunks)...');
        const wavBlob = bufferToWav(audioBuffer, audioContext.sampleRate);
        dlog('WAV criado: ' + wavBlob.size + ' bytes');

        if(wavBlob.size > 100) {
            await uploadAudio(wavBlob, 'audio/wav');
        } else {
            dlog('WAV vazio!', 'error');
            toast('Áudio vazio');
        }

        // Parar stream
        if(mediaStream && mediaStream.mediaStream) {
            mediaStream.mediaStream.getTracks().forEach(t => t.stop());
        }
    }

    isRec = false;
    clearInterval(recTimer);
    cancelRecUI();
}

function cancelRec() {
    if(!isRec) return;
    dlog('Cancelando...');

    if(recorder && recorder.state !== 'inactive') {
        recorder.stop();
    }

    if(scriptNode) {
        scriptNode.disconnect();
        if(mediaStream) mediaStream.disconnect();
        if(audioContext) audioContext.close();
    }

    isRec = false;
    clearInterval(recTimer);
    audioChunks = [];
    audioBuffer = [];
    cancelRecUI();
}

// Converter Float32Array buffer para WAV Blob
function bufferToWav(buffers, sampleRate) {
    // Juntar todos os buffers
    let totalLength = 0;
    buffers.forEach(b => totalLength += b.length);

    const merged = new Float32Array(totalLength);
    let offset = 0;
    buffers.forEach(b => {
        merged.set(b, offset);
        offset += b.length;
    });

    // Converter para 16-bit PCM
    const bytesPerSample = 2;
    const dataLength = merged.length * bytesPerSample;

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV Header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true); // 16-bit
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // PCM Data
    offset = 44;
    for(let i = 0; i < merged.length; i++) {
        let s = Math.max(-1, Math.min(1, merged[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, s, true);
        offset += 2;
    }

    return new Blob([buffer], {type: 'audio/wav'});
}

function writeString(view, offset, string) {
    for(let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

async function uploadAudio(blob, mimeType) {
    dlog('=== UPLOAD ===');
    dlog('Tamanho: ' + blob.size + ' bytes');
    dlog('Tipo: ' + mimeType);

    const dur = Math.floor((Date.now()-recStart)/1000);
    toast('Enviando áudio...');

    try {
        let ext = 'webm';
        if(mimeType.includes('mp4')) ext = 'mp4';
        else if(mimeType.includes('ogg')) ext = 'ogg';
        else if(mimeType.includes('wav')) ext = 'wav';

        const name = 'audio/'+Date.now()+'_'+Math.random().toString(36).substr(2,8)+'.'+ext;
        dlog('Nome: ' + name);

        const ref = st.ref(name);
        const metadata = { contentType: mimeType || 'audio/webm' };

        await ref.put(blob, metadata);
        dlog('Upload OK!');

        const url = await ref.getDownloadURL();
        dlog('URL: ' + url.substring(0,40) + '...');

        const msg = mkMsg('audio', {audio:url, dur:dur});
        addMsg(msg);
        renderMsg(msg);
        scrollBottom();

        await pub(msg);
        toast('Áudio enviado! (' + dur + 's)');

    } catch(e) {
        dlog('ERRO upload: ' + e.message, 'error');
        toast('Erro ao enviar áudio');
    }
}

// ========== CRIAR MENSAGEM ==========
function mkMsg(type, data) {
    return {
        id: 'm'+Date.now()+'_'+Math.random().toString(36).substr(2,6),
        type: type,
        sender: me.name,
        senderId: me.id,
        time: Date.now(),
        text: data.text || null,
        img: data.img || null,
        audio: data.audio || null,
        dur: data.dur || 0
    };
}

// ========== RENDERIZAR ==========
function renderAll() {
    $('messages-list').innerHTML = '';
    seen.clear();
    const msgs = getMsgs();
    msgs.sort((a,b) => a.time - b.time);
    msgs.forEach(m => { seen.add(m.id); renderMsg(m, false); });
    scrollBottom();
}

function renderMsg(msg, anim) {
    const isMe = msg.senderId === (me ? me.id : null);
    if(document.querySelector('[data-id="'+msg.id+'"]')) return;

    const div = document.createElement('div');
    div.className = 'message ' + (isMe?'me':'other');
    div.dataset.id = msg.id;
    if(anim!==false) div.style.animation = 'msgIn 0.25s ease';

    const t = fmtTime(new Date(msg.time));
    let html = '';

    if(!isMe) html += '<div class="msg-sender">'+esc(msg.sender)+'</div>';

    if(msg.type==='text') {
        html += '<div class="msg-text">'+esc(msg.text)+'</div>';
    }
    else if(msg.type==='image') {
        if(msg.img) html += '<img class="msg-img" src="'+msg.img+'" onclick="viewImg(\''+msg.img+'\')">';
        else html += '<div class="msg-text">[Imagem não carregada]</div>';
    }
    else if(msg.type==='audio') {
        if(msg.audio) {
            const d = fmtDur(msg.dur);
            html += '<div class="msg-audio" onclick="playAudio(\''+msg.audio+'\','+msg.dur+')">'+
                '<div class="aud-icon">▶️</div>'+
                '<div class="aud-info">'+
                '<div class="aud-wave"><span></span><span></span><span></span><span></span><span></span></div>'+
                '<div class="aud-dur">'+d+'</div></div></div>';
        } else {
            html += '<div class="msg-text">[Áudio não carregado]</div>';
        }
    }

    html += '<div class="msg-meta"><span class="msg-time">'+t+'</span>'+(isMe?'<span class="msg-check">✓✓</span>':'')+'</div>';

    div.innerHTML = html;
    $('messages-list').appendChild(div);
}

// ========== PLAYER ==========
window.playAudio = function(url, dur) {
    dlog('Play: ' + url.substring(0,40));
    if(player) { player.pause(); player.currentTime=0; }

    player = new Audio(url);
    $('audio-player-modal').classList.remove('hidden');
    $('btn-play-pause').textContent = '⏸️';
    $('audio-progress').value = 0;
    $('audio-progress').max = dur || 100;

    player.play().catch((e) => { dlog('Erro play: ' + e.message, 'error'); toast('Erro ao reproduzir'); });

    player.onended = () => {
        $('btn-play-pause').textContent = '▶️';
        clearInterval(playerTimer);
    };
    player.onerror = () => { dlog('Erro carregar', 'error'); toast('Erro áudio'); closePlayer(); };

    clearInterval(playerTimer);
    playerTimer = setInterval(() => {
        if(player && !player.paused) {
            $('audio-progress').value = player.currentTime;
            $('audio-time').textContent = fmtDur(Math.floor(player.currentTime))+' / '+fmtDur(dur);
        }
    }, 500);
};

function togglePlay() {
    if(!player) return;
    if(player.paused) { player.play().catch(()=>{}); $('btn-play-pause').textContent='⏸️'; }
    else { player.pause(); $('btn-play-pause').textContent='▶️'; }
}
function seekAudio() { if(player) player.currentTime = parseFloat($('audio-progress').value); }
function closePlayer() {
    if(player) { player.pause(); player.currentTime=0; player=null; }
    clearInterval(playerTimer);
    $('audio-player-modal').classList.add('hidden');
}

// ========== VIEWER ==========
window.viewImg = function(url) {
    $('viewer-img').src = url;
    $('image-viewer-modal').classList.remove('hidden');
};

// ========== TYPING ==========
function handleTyping() {
    if(!me) return;
    if(!isTyping && $('message-input').value.length>0) {
        isTyping = true;
        db.ref(TYPING+'/'+me.id).set({name:me.name, timestamp:firebase.database.ServerValue.TIMESTAMP});
    }
    clearTimeout(typingT);
    typingT = setTimeout(stopTyping, 2500);
}
function stopTyping() {
    if(!isTyping || !me) return;
    isTyping = false;
    db.ref(TYPING+'/'+me.id).remove();
}

// ========== UTILS ==========
function scrollBottom() {
    requestAnimationFrame(() => { $('messages-area').scrollTop = $('messages-area').scrollHeight; });
}
function fmtTime(d) {
    try { return d.toLocaleTimeString('pt-MZ',{hour:'2-digit',minute:'2-digit'}); }
    catch { const h=d.getHours().toString().padStart(2,'0'); const m=d.getMinutes().toString().padStart(2,'0'); return h+':'+m; }
}
function fmtDur(s) {
    if(!s || s<0) s=0;
    const m=Math.floor(s/60).toString().padStart(2,'0');
    const sec=(s%60).toString().padStart(2,'0');
    return m+':'+sec;
}
function esc(t) { if(!t)return''; const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

let toastT = null;
function toast(m) {
    $('toast').textContent = m;
    $('toast').classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => $('toast').classList.add('hidden'), 3000);
}
