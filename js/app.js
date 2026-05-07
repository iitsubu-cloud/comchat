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

        this.initializeUI();
    }

    initializeUI() {
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.callScreen = document.getElementById('call-screen');
        this.videoGrid = document.getElementById('video-grid');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.statusDiv = document.getElementById('status');
        this.roomIdDisplay = document.getElementById('room-id-display');
        this.participantCount = document.getElementById('participant-count');
        this.roomInfoDiv = document.getElementById('room-info');
        this.joinGroup = document.getElementById('join-group');
        this.joinRoomIdInput = document.getElementById('join-room-id');
        this.confirmJoinBtn = document.getElementById('confirm-join');

        this.createRoomBtn = document.getElementById('create-room');
        this.joinRoomBtn = document.getElementById('join-room');
        this.chatSendBtn = document.getElementById('chat-send');
        this.hangupBtn = document.getElementById('hangup');
        this.toggleVideoBtn = document.getElementById('toggle-video');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.shareScreenBtn = document.getElementById('share-screen');

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
        this.hangupBtn.addEventListener('click', () => this.hangup());
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        this.shareScreenBtn.addEventListener('click', () => this.shareScreen());
    }

    showJoinInput() {
        this.joinGroup.classList.remove('hidden');
        this.joinRoomIdInput.focus();
    }

    async createRoom() {
        try {
            this.showStatus('ルームを作成中...', 'connecting');

            this.roomId = this.generateRoomId();
            this.isHost = true;

            // getUserMedia before setupPeerEvents to avoid answering calls with null stream
            await this.initializePeer(this.roomId);
            await this.getUserMedia();
            this.setupPeerEvents();

            this.showCallScreen();
            this.updateRoomInfo();
            this.showStatus('ルームを作成しました。ルームIDを友達に共有してください', 'connected');

        } catch (error) {
            this.showStatus('ルーム作成に失敗しました: ' + error.message, 'error');
        }
    }

    async joinRoom() {
        try {
            const roomId = this.joinRoomIdInput.value.trim();
            if (!roomId) {
                this.showStatus('ルームIDを入力してください', 'error');
                return;
            }

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
            this.showStatus('ルーム参加に失敗しました: ' + error.message, 'error');
        }
    }

    async initializePeer(id = null) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer(id, { debug: 2 });

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
    }

    async getUserMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            this.addVideoElement('local', this.localStream, 'あなた');
        } catch (error) {
            throw new Error('カメラ/マイクへのアクセスが拒否されました');
        }
    }

    async connectToHost(hostId) {
        const conn = this.peer.connect(hostId);
        this.handleConnection(conn);

        const call = this.peer.call(hostId, this.localStream);
        this.handleCall(call);
    }

    handleConnection(conn) {
        // Enforce 6-person limit (5 remotes + self)
        if (this.connections.size >= 5) {
            conn.close();
            return;
        }

        this.connections.set(conn.peer, conn);

        conn.on('open', () => {
            console.log('Data connection opened with:', conn.peer);
            // Send own username so the remote side can display it
            conn.send({ type: 'user-join', username: this.username });
            this.broadcastUserList();
            this.updateRoomInfo();
        });

        conn.on('data', (data) => {
            this.handleDataMessage(data, conn.peer);
        });

        conn.on('close', () => {
            console.log('Connection closed with:', conn.peer);
            this.connections.delete(conn.peer);
            this.usernames.delete(conn.peer);
            this.removeVideoElement(conn.peer);
            this.broadcastUserList();
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
        });

        call.on('close', () => {
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
            case 'user-list':
                this.updateUserList(data.users);
                break;
        }
    }

    updateUserList(users) {
        if (this.participantCount) {
            this.participantCount.textContent = users.length;
        }
    }

    updateRoomInfo() {
        this.roomInfoDiv.classList.remove('hidden');
        this.roomIdDisplay.textContent = this.roomId;
        this.participantCount.textContent = this.connections.size + 1;
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

        videoContainer.appendChild(video);
        videoContainer.appendChild(labelDiv);
        this.videoGrid.appendChild(videoContainer);
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

    broadcast(data) {
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }

    broadcastUserList() {
        const users = Array.from(this.connections.keys());
        users.push(this.peer.id);
        this.broadcast({ type: 'user-list', users });
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
                this.toggleAudioBtn.classList.toggle('off', !audioTrack.enabled);
            }
        }
    }

    async shareScreen() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            const screenVideoTrack = screenStream.getVideoTracks()[0];
            // Save camera track to restore later (don't stop it)
            const cameraVideoTrack = this.localStream.getVideoTracks()[0];

            this.calls.forEach((call) => {
                const sender = call.peerConnection.getSenders().find(s =>
                    s.track && s.track.kind === 'video'
                );
                if (sender) sender.replaceTrack(screenVideoTrack);
            });

            // Update local preview without touching this.localStream
            const localVideo = document.querySelector('#video-local video');
            if (localVideo) {
                const previewStream = new MediaStream([screenVideoTrack, ...this.localStream.getAudioTracks()]);
                localVideo.srcObject = previewStream;
            }

            screenVideoTrack.onended = () => {
                screenStream.getTracks().forEach(t => t.stop());

                this.calls.forEach((call) => {
                    const sender = call.peerConnection.getSenders().find(s =>
                        s.track && s.track.kind === 'video'
                    );
                    if (sender) sender.replaceTrack(cameraVideoTrack);
                });

                // Restore local preview to original camera stream
                if (localVideo) localVideo.srcObject = this.localStream;
            };

        } catch (error) {
            // NotAllowedError means the user cancelled — not an error worth showing
            if (error.name !== 'NotAllowedError') {
                this.showStatus('画面共有に失敗しました', 'error');
            }
        }
    }

    hangup() {
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

        this.videoGrid.innerHTML = '';
        this.showWelcomeScreen();
        this.showStatus('通話を終了しました', 'connected');
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
        this.statusDiv.textContent = message;
        this.statusDiv.className = `status ${type}`;
    }

    generateRoomId() {
        return Math.random().toString(36).slice(2, 11);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.comChat = new ComChat();

    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        window.comChat.username = usernameInput.value || 'ユーザー';
        usernameInput.addEventListener('input', (e) => {
            window.comChat.username = e.target.value || 'ユーザー';
        });
    }
});
