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

            this.peer.on('open', (peerId) => {
                console.log('Peer connected with ID:', peerId);
                resolve(peerId);
            });

            this.peer.on('error', (error) => {
                console.error('Peer error:', error);
                reject(error);
            });
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
        const fileId = Math.random().toString(36).slice(2, 11);
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
                let bin = '';
                for (let j = 0; j < slice.length; j++) bin += String.fromCharCode(slice[j]);
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
            const dc = conn.dataChannel;
            if (dc && dc.bufferedAmount > threshold) full.push(dc);
        }
        if (full.length === 0) return;
        await Promise.all(full.map(dc => new Promise(resolve => {
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
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.toggleVideoBtn.classList.toggle('off', !videoTrack.enabled);
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

        // Restore remote peers to camera
        this.calls.forEach((call) => {
            const sender = call.peerConnection.getSenders().find(s =>
                s.track && s.track.kind === 'video'
            );
            if (sender && this.cameraVideoTrack) sender.replaceTrack(this.cameraVideoTrack);
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

    hangup() {
        if (this.currentScreenStream) this.stopScreenShare();

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
        this.createRoomBtn.disabled = false;
        this.joinRoomBtn.disabled = false;
        this.confirmJoinBtn.disabled = false;

        this.videoGrid.innerHTML = '';
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
        return Math.random().toString(36).slice(2, 11);
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
