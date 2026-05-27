// ComChat - Main Application Logic

class ComChat {
    constructor() {
        this.peer = null;
        this.localStream = null;
        this.connections = new Map();
        this.calls = new Map();
        this.usernames = new Map();
        this.roomId = null;
        this.isHost = false;
        this.username = 'ユーザー';
        this.isAudioMuted = false;
        this.muteStates = new Map();
        this.receivingFiles = new Map();
        this.isConnecting = false;
        this.bgFilterType = 'none';
        this.bgFilterCanvas = null;
        this.bgFilterCtx = null;
        this.bgFilterStream = null;
        this.bgFilterAnimId = null;
        this.bgSourceVideo = null;
        this.imageSegmenter = null;
        this.maskCanvas = null;
        this.maskCtx = null;
        this.maskImageData = null;
        this.blurCanvas = null;
        this.blurCtx = null;
        this.personCanvas = null;
        this.personCtx = null;
        this.smallCanvas = null;
        this.smallCtx = null;
        this.maskSmallCanvas = null;
        this.maskSmallCtx = null;
        this.sigmoidLUT = null;
        this.prevConfidenceData = null;
        this.bgSourceIsOwned = false;
        this.imageCapture = null;
        this.objectURLs = [];
        this.currentRemoteSharerId = null;
        this.currentScreenStream = null;
        this.cameraVideoTrack = null;

        this.initializeUI();
    }

    initializeUI() {
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.callScreen = document.getElementById('call-screen');
        this.videoGrid = document.getElementById('video-grid');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.statusDiv = document.getElementById('status'); // may be null if removed from HTML
        this.roomIdDisplay = document.getElementById('room-id-display');
        this.participantCount = document.getElementById('participant-count');
        this.roomInfoDiv = document.getElementById('room-info');
        this.joinGroup = document.getElementById('join-group');
        this.joinRoomIdInput = document.getElementById('join-room-id');
        this.confirmJoinBtn = document.getElementById('confirm-join');

        this.callMain = document.querySelector('.call-main');
        this.screenShareContainer = document.getElementById('screen-share-container');
        this.screenShareVideo = document.getElementById('screen-share-video');
        this.createRoomBtn = document.getElementById('create-room');
        this.joinRoomBtn = document.getElementById('join-room');
        this.chatSendBtn = document.getElementById('chat-send');
        this.hangupBtn = document.getElementById('hangup');
        this.toggleVideoBtn = document.getElementById('toggle-video');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.shareScreenBtn = document.getElementById('share-screen');
        this.stopShareBtn = document.getElementById('stop-share-btn');
        this.shareViewerLabel = document.getElementById('share-viewer-label');
        this.screenSharePlaceholder = document.getElementById('screen-share-placeholder');

        this.copyRoomIdBtn = document.getElementById('copy-room-id');
        this.copyRoomIdBtn.addEventListener('click', () => this.copyRoomId());

        this.usernameCurrentDisplay = document.getElementById('username-current');
        this.editUsernameBtn = document.getElementById('edit-username-btn');
        this.usernameEditInput = document.getElementById('username-edit-input');
        this.usernameConfirmBtn = document.getElementById('username-confirm-btn');
        this.editUsernameBtn.addEventListener('click', () => this.startEditUsername());
        this.usernameConfirmBtn.addEventListener('click', () => this.confirmEditUsername());
        this.usernameEditInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.confirmEditUsername();
        });
        this.usernameEditInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.exitUsernameEdit();
        });

        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.showJoinInput());
        this.confirmJoinBtn.addEventListener('click', () => this.joinRoom());
        this.joinRoomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        this.chatSendBtn.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        this.hangupModal = document.getElementById('hangup-modal');
        this.hangupConfirmBtn = document.getElementById('hangup-confirm');
        this.hangupCancelBtn = document.getElementById('hangup-cancel');

        this.hangupBtn.addEventListener('click', () => this.showHangupModal());
        this.hangupConfirmBtn.addEventListener('click', () => { this.hideHangupModal(); this.hangup(); });
        this.hangupCancelBtn.addEventListener('click', () => this.hideHangupModal());
        this.hangupModal.addEventListener('click', (e) => { if (e.target === this.hangupModal) this.hideHangupModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hideHangupModal(); });
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        this.shareScreenBtn.addEventListener('click', () => this.shareScreen());
        this.stopShareBtn.addEventListener('click', () => this.stopScreenShare());

        this.fileInput = document.getElementById('file-input');
        this.fileAttachBtn = document.getElementById('file-attach-btn');
        this.isSendingFile = false;

        this.bgFilterBtn = document.getElementById('bg-filter');
        this.filterPanel = document.getElementById('filter-panel');
        this.bgFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = this.filterPanel.classList.contains('hidden');
            if (!isHidden) { this.filterPanel.classList.add('hidden'); return; }
            const rect = this.bgFilterBtn.getBoundingClientRect();
            this.filterPanel.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            this.filterPanel.style.left = (rect.left + rect.width / 2) + 'px';
            this.filterPanel.classList.remove('hidden');
        });
        document.addEventListener('click', () => this.filterPanel.classList.add('hidden'));
        this.filterPanel.addEventListener('click', (e) => {
            e.stopPropagation();
            const option = e.target.closest('.filter-option');
            if (option) { this.applyBgFilter(option.dataset.filter); this.filterPanel.classList.add('hidden'); }
        });
        this.fileAttachBtn.addEventListener('click', () => {
            if (!this.isSendingFile) this.fileInput.click();
        });
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) { this.sendFile(file); e.target.value = ''; }
        });
    }

    showJoinInput() {
        this.joinGroup.classList.remove('hidden');
        this.joinRoomIdInput.focus();
    }

    async createRoom() {
        if (this.isConnecting) return;
        this.isConnecting = true;
        this.createRoomBtn.disabled = true;
        this.joinRoomBtn.disabled = true;
        try {
            this.showStatus('ルームを作成中...', 'connecting');

            this.roomId = this.generateRoomId();
            this.isHost = true;

            await this.initializePeer(this.roomId);
            await this.getUserMedia();
            this.setupPeerEvents();

            this.showCallScreen();
            this.updateRoomInfo();
            this.showStatus('ルームを作成しました。ルームIDを友達に共有してください', 'connected');

        } catch (error) {
            if (this.peer) { this.peer.destroy(); this.peer = null; }
            this.isHost = false;
            this.roomId = null;
            this.createRoomBtn.disabled = false;
            this.joinRoomBtn.disabled = false;
            this.showStatus('ルーム作成に失敗しました: ' + error.message, 'error');
        } finally {
            this.isConnecting = false;
        }
    }

    async joinRoom() {
        if (this.isConnecting) return;
        const roomId = this.joinRoomIdInput.value.trim();
        if (!roomId) {
            this.showStatus('ルームIDを入力してください', 'error');
            return;
        }
        this.isConnecting = true;
        this.confirmJoinBtn.disabled = true;
        try {
            this.showStatus('ルームに参加中...', 'connecting');
            this.roomId = roomId;
            this.isHost = false;

            await this.initializePeer();
            await this.getUserMedia();
            this.setupPeerEvents();
            await this.connectToHost(roomId);

            this.showCallScreen();
            this.updateRoomInfo();

        } catch (error) {
            if (this.peer) { this.peer.destroy(); this.peer = null; }
            this.roomId = null;
            this.confirmJoinBtn.disabled = false;
            this.showStatus('ルーム参加に失敗しました: ' + error.message, 'error');
        } finally {
            this.isConnecting = false;
        }
    }

    async initializePeer(id = null) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer(id, { debug: 0 });

            const onOpen = (peerId) => {
                this.peer.off('error', onError);
                console.log('Peer connected with ID:', peerId);
                resolve(peerId);
            };

            const onError = (error) => {
                this.peer.off('open', onOpen);
                console.error('Peer error:', error);
                reject(error);
            };

            this.peer.on('open', onOpen);
            this.peer.on('error', onError);
        });
    }

    // Called only after getUserMedia completes to guarantee localStream is ready
    setupPeerEvents() {
        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });

        this.peer.on('call', (call) => {
            this.handleIncomingCall(call);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (err.type === 'peer-unavailable') {
                this.showStatus('接続先が見つかりませんでした', 'error');
            } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
                this.showStatus('接続が切断されました。再度お試しください', 'error');
            }
        });
    }

    async getUserMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            this.addVideoElement('local', this.localStream, this.username);
        } catch (error) {
            throw new Error('カメラ/マイクへのアクセスが拒否されました');
        }
    }

    async connectToHost(hostId) {
        this.connectToPeer(hostId);
    }

    connectToPeer(peerId) {
        if (this.connections.has(peerId)) return;
        const conn = this.peer.connect(peerId);
        this.handleConnection(conn);
        const call = this.peer.call(peerId, this.localStream);
        this.handleCall(call);
    }

    handleConnection(conn) {
        // Enforce 6-person limit (5 remotes + self)
        if (this.connections.size >= 5) {
            conn.close();
            return;
        }

        this.connections.set(conn.peer, conn);

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.connections.delete(conn.peer);
            this.usernames.delete(conn.peer);
            this.muteStates.delete(conn.peer);
        });

        conn.on('open', () => {
            conn.send({ type: 'user-join', username: this.username });
            conn.send({ type: 'mute-state', muted: this.isAudioMuted });
            if (this.currentScreenStream) {
                conn.send({ type: 'screen-share-start', peerId: this.peer.id, username: this.username });
            }
            if (this.isHost) {
                const existingPeers = Array.from(this.connections.keys())
                    .filter(id => id !== conn.peer)
                    .map(id => ({ id, username: this.usernames.get(id) || 'ユーザー' }));
                if (existingPeers.length > 0) {
                    conn.send({ type: 'peer-list', peers: existingPeers });
                }
            }
            this.updateRoomInfo();
        });

        conn.on('data', (data) => {
            this.handleDataMessage(data, conn.peer);
        });

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            this.usernames.delete(conn.peer);
            this.muteStates.delete(conn.peer);
            this.removeVideoElement(conn.peer);
            if (this.currentRemoteSharerId === conn.peer) {
                this.exitRemotePresenterMode();
            }
            if (!this.peer) return; // hangup済みなら何もしない
            this.updateRoomInfo();
        });
    }

    handleIncomingCall(call) {
        call.answer(this.localStream);
        this.handleCall(call);
    }

    handleCall(call) {
        this.calls.set(call.peer, call);

        call.on('stream', (remoteStream) => {
            const label = this.usernames.get(call.peer) || call.peer;
            this.addVideoElement(call.peer, remoteStream, label);
            // 画面共有中に遅れて参加した場合、共有画面を大画面に反映する
            if (this.currentRemoteSharerId === call.peer) {
                this.screenShareVideo.srcObject = remoteStream;
                this.screenShareVideo.classList.remove('hidden');
                this.screenSharePlaceholder.classList.add('hidden');
            }
            // 遅れて参加したピアへ、現在送信中の正しいビデオトラックを送る
            if (this.currentScreenStream) {
                const screenTrack = this.currentScreenStream.getVideoTracks()[0];
                const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender && screenTrack) sender.replaceTrack(screenTrack).catch(() => {});
            } else if (this.bgFilterType !== 'none' && this.bgFilterStream) {
                const canvasTrack = this.bgFilterStream.getVideoTracks()[0];
                const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender && canvasTrack) sender.replaceTrack(canvasTrack).catch(() => {});
            }
        });

        call.on('close', () => {
            this.calls.delete(call.peer);
            this.removeVideoElement(call.peer);
        });

        call.on('error', (err) => {
            console.error('Call error:', err);
            this.calls.delete(call.peer);
            this.removeVideoElement(call.peer);
        });
    }

    handleDataMessage(data, senderId) {
        switch (data.type) {
            case 'chat':
                this.displayChatMessage(data.username, data.message);
                break;
            case 'user-join': {
                this.usernames.set(senderId, data.username);
                // Update label if the video element already exists
                const labelDiv = document.querySelector(`#video-${senderId} .video-label`);
                if (labelDiv) labelDiv.textContent = data.username;
                break;
            }
            case 'peer-list':
                data.peers.forEach(({ id, username }) => {
                    if (!this.connections.has(id) && id !== this.peer.id) {
                        if (username) this.usernames.set(id, username);
                        this.connectToPeer(id);
                    }
                });
                break;
            case 'mute-state':
                this.muteStates.set(senderId, data.muted);
                this.setMuteIndicator(senderId, data.muted);
                break;
            case 'screen-share-start':
                this.enterRemotePresenterMode(data.peerId, data.username);
                break;
            case 'screen-share-stop':
                this.exitRemotePresenterMode();
                break;
            case 'file-meta': {
                const senderName = this.usernames.get(senderId) || senderId;
                const progress = this.createFileProgress(senderName, data.name, '受信中');
                this.receivingFiles.set(data.id, { meta: data, chunks: [], received: 0, progress });
                break;
            }
            case 'file-chunk':
                if (this.receivingFiles.has(data.id)) {
                    const tf = this.receivingFiles.get(data.id);
                    tf.chunks[data.index] = data.data;
                    tf.received++;
                    this.updateFileProgress(tf.progress, Math.round(tf.received / tf.meta.totalChunks * 100));
                }
                break;
            case 'file-done': {
                const transfer = this.receivingFiles.get(data.id);
                if (!transfer) break;
                this.receivingFiles.delete(data.id);
                const { meta, chunks, progress } = transfer;
                const buffers = [];
                for (let i = 0; i < meta.totalChunks; i++) {
                    if (!chunks[i]) continue;
                    const bin = atob(chunks[i]);
                    const buf = new Uint8Array(bin.length);
                    for (let j = 0; j < bin.length; j++) buf[j] = bin.charCodeAt(j);
                    buffers.push(buf);
                }
                const blob = new Blob(buffers, { type: meta.mimeType || 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                this.finalizeFileProgress(progress, meta.name, meta.size, url);
                break;
            }
        }
    }

    updateRoomInfo() {
        this.roomInfoDiv.classList.remove('hidden');
        this.roomIdDisplay.textContent = this.roomId;
        this.participantCount.textContent = this.connections.size + 1;
        this.usernameCurrentDisplay.textContent = this.username;
    }

    startEditUsername() {
        this.usernameEditInput.value = this.username;
        this.usernameCurrentDisplay.classList.add('hidden');
        this.editUsernameBtn.classList.add('hidden');
        this.usernameEditInput.classList.remove('hidden');
        this.usernameConfirmBtn.classList.remove('hidden');
        this.usernameEditInput.focus();
        this.usernameEditInput.select();
    }

    confirmEditUsername() {
        const newName = this.usernameEditInput.value.trim();
        if (newName && newName !== this.username) {
            this.username = newName;
            const localLabel = document.querySelector('#video-local .video-label');
            if (localLabel) localLabel.textContent = newName;
            this.broadcast({ type: 'user-join', username: newName });
        }
        this.exitUsernameEdit();
    }

    exitUsernameEdit() {
        this.usernameCurrentDisplay.textContent = this.username;
        this.usernameCurrentDisplay.classList.remove('hidden');
        this.editUsernameBtn.classList.remove('hidden');
        this.usernameEditInput.classList.add('hidden');
        this.usernameConfirmBtn.classList.add('hidden');
    }

    addVideoElement(id, stream, label) {
        this.removeVideoElement(id);

        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `video-${id}`;

        const video = document.createElement('video');
        video.className = 'video-element';
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true; // Required for iOS Safari
        video.muted = id === 'local';

        const labelDiv = document.createElement('div');
        labelDiv.className = 'video-label';
        labelDiv.textContent = label;

        const muteIndicator = document.createElement('div');
        muteIndicator.className = 'mute-indicator hidden';
        muteIndicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="20" y1="4" x2="4" y2="20" stroke-width="2.5"/></svg>`;
        if (id === 'local' && this.isAudioMuted) muteIndicator.classList.remove('hidden');
        if (id !== 'local' && this.muteStates.get(id)) muteIndicator.classList.remove('hidden');

        videoContainer.appendChild(video);
        videoContainer.appendChild(labelDiv);
        videoContainer.appendChild(muteIndicator);
        this.videoGrid.appendChild(videoContainer);
        video.play().catch(() => {});
    }

    removeVideoElement(id) {
        const videoElement = document.getElementById(`video-${id}`);
        if (videoElement) {
            const video = videoElement.querySelector('video');
            if (video) video.srcObject = null;
            videoElement.remove();
        }
    }

    sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;

        this.displayChatMessage(this.username, message);

        this.broadcast({
            type: 'chat',
            username: this.username,
            message: message
        });

        this.chatInput.value = '';
    }

    displayChatMessage(username, message) {
        const messageDiv = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = username + ':';
        const span = document.createElement('span');
        span.textContent = ' ' + message;
        messageDiv.appendChild(strong);
        messageDiv.appendChild(span);
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async sendFile(file) {
        const MAX = 200 * 1024 * 1024;
        if (file.size > MAX) {
            this.showStatus('ファイルサイズは200MB以下にしてください', 'error');
            return;
        }
        const idBytes = new Uint8Array(9);
        crypto.getRandomValues(idBytes);
        const idChars = '0123456789abcdefghijklmnopqrstuvwxyz';
        const fileId = Array.from(idBytes, b => idChars[b % 36]).join('');
        const CHUNK = 64 * 1024;
        const BUFFER_HIGH = 512 * 1024;
        this.isSendingFile = true;
        this.fileAttachBtn.disabled = true;
        const progress = this.createFileProgress(this.username, file.name, '送信中');
        try {
            const buffer = await file.arrayBuffer();
            const totalChunks = Math.ceil(buffer.byteLength / CHUNK) || 1;
            this.broadcast({ type: 'file-meta', id: fileId, name: file.name, size: file.size, mimeType: file.type, totalChunks });
            for (let i = 0; i < totalChunks; i++) {
                await this.waitForBuffers(BUFFER_HIGH);
                const slice = new Uint8Array(buffer, i * CHUNK, Math.min(CHUNK, buffer.byteLength - i * CHUNK));
                // Build binary string in 8 KB sub-batches to avoid O(n²) string concat
                // and stack overflow from apply() on large arrays.
                const SAFE = 8192;
                let bin = '';
                for (let j = 0; j < slice.length; j += SAFE) {
                    bin += String.fromCharCode.apply(null, slice.subarray(j, j + SAFE));
                }
                this.broadcast({ type: 'file-chunk', id: fileId, index: i, data: btoa(bin) });
                this.updateFileProgress(progress, Math.round((i + 1) / totalChunks * 100));
            }
            this.broadcast({ type: 'file-done', id: fileId });
            const url = URL.createObjectURL(file);
            this.finalizeFileProgress(progress, file.name, file.size, url);
        } catch (err) {
            console.error('File send error:', err);
            progress.statusEl.textContent = '送信失敗';
            progress.barInner.style.background = '#dc3545';
            this.showStatus('ファイルの送信に失敗しました', 'error');
        } finally {
            this.isSendingFile = false;
            this.fileAttachBtn.disabled = false;
        }
    }

    async waitForBuffers(threshold) {
        const full = [];
        for (const conn of this.connections.values()) {
            try {
                const dc = conn.dataChannel;
                if (dc && dc.bufferedAmount > threshold) full.push(dc);
            } catch {}
        }
        if (full.length === 0) return;
        await Promise.all(full.map(dc => new Promise(resolve => {
            if (!('bufferedAmountLowThreshold' in dc)) { resolve(); return; }
            dc.bufferedAmountLowThreshold = Math.floor(threshold / 2);
            const done = () => resolve();
            dc.addEventListener('bufferedamountlow', done, { once: true });
            setTimeout(() => { dc.removeEventListener('bufferedamountlow', done); resolve(); }, 5000);
        })));
    }

    createFileProgress(username, filename, label) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-file-msg';
        const nameEl = document.createElement('strong');
        nameEl.textContent = username + ':';
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-info file-progress';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-progress-name';
        nameSpan.textContent = filename;
        const statusEl = document.createElement('span');
        statusEl.className = 'file-progress-status';
        statusEl.textContent = `${label}... 0%`;
        const barWrap = document.createElement('div');
        barWrap.className = 'file-progress-bar-wrap';
        const barInner = document.createElement('div');
        barInner.className = 'file-progress-bar';
        barWrap.appendChild(barInner);
        fileDiv.appendChild(nameSpan);
        fileDiv.appendChild(statusEl);
        fileDiv.appendChild(barWrap);
        msgDiv.appendChild(nameEl);
        msgDiv.appendChild(fileDiv);
        this.chatMessages.appendChild(msgDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        return { fileDiv, statusEl, barInner, label };
    }

    updateFileProgress(progress, pct) {
        progress.statusEl.textContent = `${progress.label}... ${pct}%`;
        progress.barInner.style.width = `${pct}%`;
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    finalizeFileProgress(progress, filename, filesize, url) {
        const { fileDiv } = progress;
        fileDiv.classList.remove('file-progress');
        fileDiv.innerHTML = '';
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.textContent = filename;
        link.className = 'file-link';
        const sizeEl = document.createElement('span');
        sizeEl.className = 'file-size';
        sizeEl.textContent = this.formatFileSize(filesize);
        fileDiv.appendChild(link);
        fileDiv.appendChild(sizeEl);
        this.objectURLs.push(url);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    broadcast(data) {
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }

    async toggleVideo() {
        if (!this.localStream) return;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        videoTrack.enabled = !videoTrack.enabled;
        this.toggleVideoBtn.classList.toggle('off', !videoTrack.enabled);
        // When bg filter is active, the sent stream is a canvas capture.
        // Disabling localStream's track freezes the canvas on the last frame.
        // Stop the loop and draw black (off) or resume (on).
        if (this.bgFilterType !== 'none' && this.bgFilterCtx && this.bgFilterCanvas) {
            if (!videoTrack.enabled) {
                this.stopBgFilterLoop();
                this.bgFilterCtx.fillStyle = '#000';
                this.bgFilterCtx.fillRect(0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
            } else {
                this.imageSegmenter ? this.startBgFilterLoop() : this.startCSSFilterLoop();
            }
        }
    }

    async toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioMuted = !audioTrack.enabled;
                this.toggleAudioBtn.classList.toggle('off', this.isAudioMuted);
                this.setMuteIndicator('local', this.isAudioMuted);
                this.broadcast({ type: 'mute-state', muted: this.isAudioMuted });
            }
        }
    }

    setMuteIndicator(id, isMuted) {
        const indicator = document.querySelector(`#video-${id} .mute-indicator`);
        if (indicator) indicator.classList.toggle('hidden', !isMuted);
    }

    async shareScreen() {
        if (this.currentScreenStream) return;
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            const screenVideoTrack = screenStream.getVideoTracks()[0];
            const cameraVideoTrack = this.localStream.getVideoTracks()[0];

            this.currentScreenStream = screenStream;
            this.cameraVideoTrack = cameraVideoTrack;

            // Send screen to remote peers
            this.calls.forEach((call) => {
                const sender = call.peerConnection.getSenders().find(s =>
                    s.track && s.track.kind === 'video'
                );
                if (sender) sender.replaceTrack(screenVideoTrack);
            });

            this.screenShareVideo.srcObject = screenStream;
            this.screenShareVideo.muted = true;
            this.screenShareVideo.classList.remove('hidden');
            this.screenSharePlaceholder.classList.add('hidden');
            this.screenShareContainer.classList.remove('hidden');
            this.callMain.classList.add('presenter-mode');
            this.shareViewerLabel.classList.add('hidden');
            this.stopShareBtn.classList.remove('hidden');

            screenVideoTrack.onended = () => this.stopScreenShare();

            this.shareScreenBtn.classList.add('active');
            this.broadcast({ type: 'screen-share-start', peerId: this.peer.id, username: this.username });

        } catch (error) {
            if (error.name !== 'NotAllowedError') {
                this.showStatus('画面共有に失敗しました', 'error');
            }
        }
    }

    enterRemotePresenterMode(sharerPeerId, sharerUsername) {
        this.currentRemoteSharerId = sharerPeerId;

        const sharerVideoEl = document.querySelector(`#video-${sharerPeerId} .video-element`);
        if (sharerVideoEl && sharerVideoEl.srcObject) {
            this.screenShareVideo.srcObject = sharerVideoEl.srcObject;
            this.screenShareVideo.classList.remove('hidden');
            this.screenSharePlaceholder.classList.add('hidden');
        } else {
            this.screenShareVideo.classList.add('hidden');
            this.screenSharePlaceholder.classList.remove('hidden');
        }

        this.screenShareContainer.classList.remove('hidden');
        this.callMain.classList.add('presenter-mode');
        this.stopShareBtn.classList.add('hidden');

        this.shareViewerLabel.textContent = `${sharerUsername || sharerPeerId} が共有中`;
        this.shareViewerLabel.classList.remove('hidden');
        this.shareViewerLabel.style.position = '';
        this.shareViewerLabel.style.bottom = '';
        this.shareViewerLabel.style.left = '';
        this.shareViewerLabel.style.zIndex = '';
    }

    exitRemotePresenterMode() {
        this.currentRemoteSharerId = null;
        this.screenShareVideo.srcObject = null;
        this.screenShareVideo.classList.add('hidden');
        this.screenSharePlaceholder.classList.add('hidden');
        this.screenShareContainer.classList.add('hidden');
        this.callMain.classList.remove('presenter-mode');
        this.shareViewerLabel.classList.add('hidden');
    }

    stopScreenShare() {
        if (!this.currentScreenStream) return;

        this.currentScreenStream.getTracks().forEach(t => t.stop());

        // Restore remote peers to camera (or canvas if filter is active)
        const restoreTrack = (this.bgFilterType !== 'none' && this.bgFilterStream)
            ? this.bgFilterStream.getVideoTracks()[0]
            : this.cameraVideoTrack;
        this.calls.forEach((call) => {
            const sender = call.peerConnection.getSenders().find(s =>
                s.track && s.track.kind === 'video'
            );
            if (sender && restoreTrack) sender.replaceTrack(restoreTrack).catch(() => {});
        });

        // Restore grid layout
        this.screenShareVideo.srcObject = null;
        this.screenShareVideo.classList.add('hidden');
        this.screenSharePlaceholder.classList.add('hidden');
        this.screenShareContainer.classList.add('hidden');

        this.callMain.classList.remove('presenter-mode');
        this.stopShareBtn.classList.add('hidden');
        this.currentScreenStream = null;
        this.shareScreenBtn.classList.remove('active');
        this.broadcast({ type: 'screen-share-stop' });
        this.cameraVideoTrack = null;
    }

    getCSSFilter(type) {
        const map = { blur: 'blur(10px)', grayscale: 'grayscale(100%)', sepia: 'sepia(100%)', brightness: 'brightness(1.5)' };
        return map[type] || 'none';
    }

    async loadMediaPipe() {
        if (window._mpTasks) return;
        window._mpTasks = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
    }

    async initSelfieSegmentation() {
        if (this.imageSegmenter) return;
        await this.loadMediaPipe();
        const { FilesetResolver, ImageSegmenter } = window._mpTasks;
        if (!window._mpVision) {
            window._mpVision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
            );
        }
        // selfie_multiclass_256x256: 256x256 resolution with 6-class output
        // (background, hair, body-skin, face-skin, clothes, accessories)
        // Higher effective resolution than selfie_segmenter_landscape (256x144)
        const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
        const segOpts = { runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true };
        try {
            this.imageSegmenter = await ImageSegmenter.createFromOptions(window._mpVision, {
                ...segOpts, baseOptions: { modelAssetPath, delegate: 'GPU' },
            });
        } catch {
            // GPU delegate fails in Safari due to WebGL incompatibility — fall back to CPU
            this.imageSegmenter = await ImageSegmenter.createFromOptions(window._mpVision, {
                ...segOpts, baseOptions: { modelAssetPath, delegate: 'CPU' },
            });
        }
    }

    onSegmentationResults(result, sourceImage) {
        if (this.bgFilterType === 'none' || !this.bgFilterCtx) { result.close?.(); return; }
        const ctx = this.bgFilterCtx;
        const w = this.bgFilterCanvas.width;
        const h = this.bgFilterCanvas.height;
        // confidenceMasks[0] = background confidence. Person confidence = 255 - bg.
        // Summing all 6 classes equals 255, so 255-bg = sum of person-part confidences.
        const bgMask = result.confidenceMasks?.[0];
        if (!bgMask || !this.maskImageData || !this.blurCtx || !this.personCtx || !this.maskSmallCtx) { result.close?.(); return; }
        const maskData = bgMask.getAsUint8Array();
        // Temporal smoothing with adaptive alpha (same as before)
        if (!this.prevConfidenceData || this.prevConfidenceData.length !== maskData.length) {
            this.prevConfidenceData = new Float32Array(maskData.length);
        }
        for (let i = 0; i < maskData.length; i++) {
            const personConf = 255 - maskData[i]; // invert: high = person
            const diff = Math.abs(personConf - this.prevConfidenceData[i]);
            const alpha = diff > 80 ? 0.5 : 0.15;
            this.prevConfidenceData[i] = alpha * personConf + (1 - alpha) * this.prevConfidenceData[i];
            this.maskImageData.data[i * 4 + 3] = this.sigmoidLUT[this.prevConfidenceData[i] | 0];
        }
        this.maskCtx.putImageData(this.maskImageData, 0, 0);
        result.close?.();

        // Scale-down/up smoothing softens jagged mask boundaries
        this.maskSmallCtx.clearRect(0, 0, this.maskSmallCanvas.width, this.maskSmallCanvas.height);
        this.maskSmallCtx.drawImage(this.maskCanvas, 0, 0, this.maskSmallCanvas.width, this.maskSmallCanvas.height);
        this.maskCtx.imageSmoothingEnabled = true;
        this.maskCtx.imageSmoothingQuality = 'high';
        this.maskCtx.clearRect(0, 0, w, h);
        this.maskCtx.drawImage(this.maskSmallCanvas, 0, 0, w, h);

        // Step 1: pre-render background effect to blurCanvas
        if (this.bgFilterType === 'blur' && this.smallCtx) {
            const sw = this.smallCanvas.width, sh = this.smallCanvas.height;
            this.blurCtx.imageSmoothingEnabled = true;
            this.blurCtx.imageSmoothingQuality = 'high';
            this.smallCtx.drawImage(sourceImage, 0, 0, sw, sh);
            this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
            this.smallCtx.drawImage(this.blurCanvas, 0, 0, sw, sh);
            this.blurCtx.drawImage(this.smallCanvas, 0, 0, w, h);
        } else {
            this.blurCtx.filter = this.getCSSFilter(this.bgFilterType);
            this.blurCtx.drawImage(sourceImage, 0, 0, w, h);
            this.blurCtx.filter = 'none';
        }

        // Step 2: extract sharp person pixels into personCanvas
        this.personCtx.globalCompositeOperation = 'copy';
        this.personCtx.drawImage(this.maskCanvas, 0, 0, w, h);
        this.personCtx.globalCompositeOperation = 'source-in';
        this.personCtx.drawImage(sourceImage, 0, 0, w, h);
        this.personCtx.globalCompositeOperation = 'source-over';

        // Step 3: composite — blurred background then sharp person on top
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(this.blurCanvas, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.personCanvas, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
    }

    startBgFilterLoop() {
        const loop = async () => {
            if (this.bgFilterType === 'none') return;
            try {
                if (this.imageCapture) {
                    const bitmap = await this.imageCapture.grabFrame();
                    if (this.imageSegmenter && this.bgFilterType !== 'none') {
                        const result = this.imageSegmenter.segmentForVideo(bitmap, performance.now());
                        this.onSegmentationResults(result, bitmap);
                    }
                    bitmap.close();
                } else if (this.bgSourceVideo?.readyState >= 2 && this.imageSegmenter) {
                    const bitmap = await createImageBitmap(this.bgSourceVideo);
                    const result = this.imageSegmenter.segmentForVideo(bitmap, performance.now());
                    this.onSegmentationResults(result, bitmap);
                    bitmap.close();
                }
            } catch (e) {}
            this.bgFilterAnimId = requestAnimationFrame(loop);
        };
        this.bgFilterAnimId = requestAnimationFrame(loop);
    }

    startCSSFilterLoop() {
        const draw = () => {
            if (this.bgFilterType === 'none' || !this.bgFilterCtx) return;
            if (this.imageCapture) {
                // ImageCapture: grab frame asynchronously, draw when ready
                this.imageCapture.grabFrame().then(bitmap => {
                    if (this.bgFilterType === 'none' || !this.bgFilterCtx) { bitmap.close(); return; }
                    const vw = bitmap.width;
                    const vh = bitmap.height;
                    if (vw > 0 && this.bgFilterCanvas.width !== vw) {
                        this.bgFilterCanvas.width = vw;
                        this.bgFilterCanvas.height = vh;
                    }
                    this.bgFilterCtx.filter = this.getCSSFilter(this.bgFilterType);
                    this.bgFilterCtx.drawImage(bitmap, 0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
                    this.bgFilterCtx.filter = 'none';
                    bitmap.close();
                }).catch(() => {});
            } else if (this.bgSourceVideo?.readyState >= 2) {
                const vw = this.bgSourceVideo.videoWidth;
                const vh = this.bgSourceVideo.videoHeight;
                if (vw > 0 && this.bgFilterCanvas.width !== vw) {
                    this.bgFilterCanvas.width = vw;
                    this.bgFilterCanvas.height = vh;
                }
                this.bgFilterCtx.filter = this.getCSSFilter(this.bgFilterType);
                this.bgFilterCtx.drawImage(this.bgSourceVideo, 0, 0, this.bgFilterCanvas.width, this.bgFilterCanvas.height);
                this.bgFilterCtx.filter = 'none';
            }
            this.bgFilterAnimId = requestAnimationFrame(draw);
        };
        this.bgFilterAnimId = requestAnimationFrame(draw);
    }

    stopBgFilterLoop() {
        if (this.bgFilterAnimId != null) {
            cancelAnimationFrame(this.bgFilterAnimId);
            this.bgFilterAnimId = null;
        }
    }

    cleanupBgFilterResources() {
        if (this.bgSourceVideo && this.bgSourceIsOwned) {
            this.bgSourceVideo.srcObject = null;
            this.bgSourceVideo.remove();
        }
        this.bgSourceVideo = null;
        this.bgSourceIsOwned = false;
        this.imageCapture = null;
        if (this.imageSegmenter) {
            this.imageSegmenter.close();
            this.imageSegmenter = null;
        }
        this.maskCanvas = null;
        this.maskCtx = null;
        this.maskImageData = null;
        this.blurCanvas = null;
        this.blurCtx = null;
        this.personCanvas = null;
        this.personCtx = null;
        this.smallCanvas = null;
        this.smallCtx = null;
        this.maskSmallCanvas = null;
        this.maskSmallCtx = null;
        this.sigmoidLUT = null;
        this.prevConfidenceData = null;
        this.bgFilterCanvas = null;
        this.bgFilterCtx = null;
        this.bgFilterStream = null;
    }

    async applyBgFilter(type) {
        const wasActive = this.bgFilterType !== 'none';
        this.bgFilterType = type;

        this.filterPanel.querySelectorAll('.filter-option').forEach(el => {
            el.classList.toggle('active', el.dataset.filter === type);
        });

        const localVideoEl = document.querySelector('#video-local .video-element');

        if (type === 'none') {
            this.stopBgFilterLoop();
            this.cleanupBgFilterResources();
            if (localVideoEl) {
                localVideoEl.style.filter = '';
                if (this.localStream) {
                    localVideoEl.srcObject = this.localStream;
                    localVideoEl.play().catch(() => {});
                }
            }
            if (!this.currentScreenStream) {
                const origTrack = this.localStream?.getVideoTracks()[0];
                if (origTrack) {
                    this.calls.forEach(call => {
                        const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(origTrack).catch(() => {});
                    });
                }
            }
            this.bgFilterBtn.classList.remove('active');
            return;
        }

        if (wasActive) {
            // CSS-only fallback: no canvas, update style.filter directly
            if (!this.bgFilterCanvas) {
                if (localVideoEl) localVideoEl.style.filter = this.getCSSFilter(type);
            }
            // Canvas loop reads bgFilterType dynamically — no other action needed.
            return;
        }

        // First activation
        this.bgFilterBtn.classList.add('active');

        try {
            const videoTrack = this.localStream?.getVideoTracks()[0];
            let srcW = 0, srcH = 0;

            // Strategy 1: ImageCapture API — reads frames directly from the video track,
            // bypassing DOM video element throttling entirely. Works on Safari 17.2+ and Chrome 59+.
            if (videoTrack && typeof ImageCapture !== 'undefined') {
                try {
                    const ic = new ImageCapture(videoTrack);
                    const probe = await ic.grabFrame();
                    srcW = probe.width;
                    srcH = probe.height;
                    probe.close();
                    this.imageCapture = ic;
                } catch (icErr) {
                    console.warn('ImageCapture unavailable:', icErr);
                    this.imageCapture = null;
                }
            }

            // Strategy 2: Hidden bgSourceVideo fallback (for browsers without ImageCapture)
            if (!this.imageCapture) {
                this.bgSourceVideo = document.createElement('video');
                // Off-screen at reasonable size — Safari throttles/misrenders tiny video elements
                this.bgSourceVideo.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:240px;pointer-events:none;';
                this.bgSourceVideo.muted = true;
                this.bgSourceVideo.autoplay = true;
                this.bgSourceVideo.playsInline = true;
                this.bgSourceVideo.srcObject = this.localStream;
                this.bgSourceIsOwned = true;
                document.body.appendChild(this.bgSourceVideo);
                await this.bgSourceVideo.play().catch(() => {});
                if (this.bgSourceVideo.readyState < 2) {
                    await new Promise(r => {
                        this.bgSourceVideo.addEventListener('loadeddata', r, { once: true });
                        setTimeout(r, 5000);
                    });
                }
                srcW = this.bgSourceVideo.videoWidth;
                srcH = this.bgSourceVideo.videoHeight;
            }

            if (!srcW || !srcH) throw new Error('could not determine video dimensions');

            // Canvas setup + ctx.filter support check (unsupported on Safari < 18)
            this.bgFilterCanvas = document.createElement('canvas');
            this.bgFilterCanvas.width = srcW;
            this.bgFilterCanvas.height = srcH;
            this.bgFilterCtx = this.bgFilterCanvas.getContext('2d');

            this.bgFilterStream = this.bgFilterCanvas.captureStream(30);
            if (!this.bgFilterStream.getVideoTracks().length) throw new Error('captureStream no tracks');

            // Try MediaPipe for background segmentation (person stays sharp)
            let usedMediaPipe = false;
            try {
                this.showStatus('背景フィルターを読み込み中...', 'connecting');
                await this.initSelfieSegmentation();
                // Pre-allocate compositing canvases (avoids per-frame allocation)
                this.maskCanvas = document.createElement('canvas');
                this.maskCanvas.width = srcW;
                this.maskCanvas.height = srcH;
                this.maskCtx = this.maskCanvas.getContext('2d');
                this.maskImageData = this.maskCtx.createImageData(srcW, srcH);
                for (let i = 0; i < this.maskImageData.data.length; i += 4) {
                    this.maskImageData.data[i] = 255;
                    this.maskImageData.data[i + 1] = 255;
                    this.maskImageData.data[i + 2] = 255;
                }
                this.blurCanvas = document.createElement('canvas');
                this.blurCanvas.width = srcW;
                this.blurCanvas.height = srcH;
                this.blurCtx = this.blurCanvas.getContext('2d');
                this.personCanvas = document.createElement('canvas');
                this.personCanvas.width = srcW;
                this.personCanvas.height = srcH;
                this.personCtx = this.personCanvas.getContext('2d');
                this.smallCanvas = document.createElement('canvas');
                this.smallCanvas.width = Math.max(1, Math.floor(srcW / 8));
                this.smallCanvas.height = Math.max(1, Math.floor(srcH / 8));
                this.smallCtx = this.smallCanvas.getContext('2d');
                this.maskSmallCanvas = document.createElement('canvas');
                this.maskSmallCanvas.width = Math.max(1, Math.floor(srcW / 16));
                this.maskSmallCanvas.height = Math.max(1, Math.floor(srcH / 16));
                this.maskSmallCtx = this.maskSmallCanvas.getContext('2d');
                // Sigmoid LUT: confidence → alpha via smooth S-curve (reduces hard edge at threshold)
                this.sigmoidLUT = new Uint8Array(256);
                for (let j = 0; j < 256; j++) {
                    this.sigmoidLUT[j] = Math.round(255 / (1 + Math.exp(-0.06 * (j - 128))));
                }
                this.startBgFilterLoop();
                usedMediaPipe = true;
            } catch (mpErr) {
                console.warn('MediaPipe unavailable, falling back to CSS filter:', mpErr);
                if (this.imageSegmenter) { this.imageSegmenter.close(); this.imageSegmenter = null; }
                this.startCSSFilterLoop();
            }

            // Switch local preview to canvas output (shows same result as remote peers)
            if (localVideoEl) {
                localVideoEl.srcObject = this.bgFilterStream;
                localVideoEl.style.filter = '';
                localVideoEl.play().catch(() => {});
            }

            // Send canvas track to remote peers
            if (!this.currentScreenStream) {
                const canvasTrack = this.bgFilterStream.getVideoTracks()[0];
                this.calls.forEach(call => {
                    const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                    if (sender && canvasTrack) sender.replaceTrack(canvasTrack).catch(() => {});
                });
            }

            this.showStatus(usedMediaPipe ? '背景フィルターを適用しました' : 'フィルターを適用しました', 'connected');

        } catch (err) {
            console.warn('Filter setup failed, using CSS-only mode:', err);
            this.stopBgFilterLoop();
            this.cleanupBgFilterResources();
            if (localVideoEl) localVideoEl.style.filter = this.getCSSFilter(type);
            this.showStatus('フィルターを適用しました（自分の画面のみ）', 'connected');
        }
    }

    hangup() {
        if (this.currentScreenStream) this.stopScreenShare();

        // Stop bg filter loop before stopping localStream to avoid reading stopped tracks
        this.stopBgFilterLoop();
        this.cleanupBgFilterResources();
        this.bgFilterType = 'none';

        this.connections.forEach((conn) => conn.close());
        this.connections.clear();

        this.calls.forEach((call) => call.close());
        this.calls.clear();

        this.usernames.clear();

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        this.isHost = false;
        this.roomId = null;
        this.isAudioMuted = false;
        this.muteStates.clear();
        this.receivingFiles.clear();
        this.currentRemoteSharerId = null;
        this.currentScreenStream = null;
        this.cameraVideoTrack = null;
        this.isConnecting = false;

        // ボタンの視覚状態をリセット（再入室時に前の状態が残らないように）
        this.toggleVideoBtn.classList.remove('off');
        this.toggleAudioBtn.classList.remove('off');
        this.shareScreenBtn.classList.remove('active');
        this.bgFilterBtn.classList.remove('active');
        this.createRoomBtn.disabled = false;
        this.joinRoomBtn.disabled = false;
        this.confirmJoinBtn.disabled = false;

        this.videoGrid.innerHTML = '';
        this.objectURLs.forEach(url => URL.revokeObjectURL(url));
        this.objectURLs = [];
        this.chatMessages.innerHTML = '';
        this.isSendingFile = false;
        this.fileAttachBtn.disabled = false;
        this.showWelcomeScreen();
        this.showStatus('退室しました', 'connected');
    }

    showHangupModal() {
        this.hangupModal.classList.remove('hidden');
        // モーダル表示直後の誤タップ防止：300ms間は確認ボタンを無効化
        this.hangupConfirmBtn.disabled = true;
        setTimeout(() => { this.hangupConfirmBtn.disabled = false; }, 300);
    }

    hideHangupModal() {
        this.hangupModal.classList.add('hidden');
        this.hangupConfirmBtn.disabled = false;
    }

    showWelcomeScreen() {
        this.welcomeScreen.classList.remove('hidden');
        this.callScreen.classList.add('hidden');
        this.roomInfoDiv.classList.add('hidden');
        this.joinGroup.classList.add('hidden');
        this.joinRoomIdInput.value = '';
    }

    showCallScreen() {
        this.welcomeScreen.classList.add('hidden');
        this.callScreen.classList.remove('hidden');
    }

    showStatus(message, type) {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status ${type}`;
        }
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    async copyRoomId() {
        const copyIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="0" width="11" height="11" rx="2"/><rect x="0" y="5" width="11" height="11" rx="2"/></svg>`;
        const checkIcon = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#28a745" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 8 6 13 14 3"/></svg>`;
        try {
            await navigator.clipboard.writeText(this.roomId);
            this.copyRoomIdBtn.innerHTML = checkIcon;
            setTimeout(() => { this.copyRoomIdBtn.innerHTML = copyIcon; }, 2000);
            this.showStatus('ルームIDをコピーしました', 'connected');
        } catch {
            this.showStatus('コピーに失敗しました', 'error');
        }
    }

    generateRoomId() {
        const bytes = new Uint8Array(9);
        crypto.getRandomValues(bytes);
        const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
        return Array.from(bytes, b => chars[b % 36]).join('');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.comChat = new ComChat();

    // Safari autoplay policy: resume paused videos on first user interaction
    document.addEventListener('click', () => {
        document.querySelectorAll('video').forEach(v => {
            if (v.paused) v.play().catch(() => {});
        });
    }, { once: true });

    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        window.comChat.username = usernameInput.value || 'ユーザー';
        usernameInput.addEventListener('input', (e) => {
            window.comChat.username = e.target.value || 'ユーザー';
        });
    }
});
