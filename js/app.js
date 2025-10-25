// ComChat - Main Application Logic

class ComChat {
    constructor() {
        this.peer = null;
        this.localStream = null;
        this.connections = new Map();
        this.calls = new Map();
        this.roomId = null;
        this.isHost = false;
        this.username = 'User';
        
        this.initializeUI();
    }

    initializeUI() {
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.callScreen = document.getElementById('call-screen');
        this.videoGrid = document.getElementById('video-grid');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.statusDiv = document.getElementById('status');
        
        // Buttons
        this.createRoomBtn = document.getElementById('create-room');
        this.joinRoomBtn = document.getElementById('join-room');
        this.chatSendBtn = document.getElementById('chat-send');
        this.hangupBtn = document.getElementById('hangup');
        this.toggleVideoBtn = document.getElementById('toggle-video');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.shareScreenBtn = document.getElementById('share-screen');
        
        // Event listeners
        this.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        this.chatSendBtn.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        this.hangupBtn.addEventListener('click', () => this.hangup());
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
        this.shareScreenBtn.addEventListener('click', () => this.shareScreen());
    }

    async createRoom() {
        try {
            this.showStatus('ルームを作成中...', 'connecting');
            
            // Generate room ID
            this.roomId = this.generateRoomId();
            this.isHost = true;
            
            // Initialize peer
            await this.initializePeer(this.roomId);
            
            // Get user media
            await this.getUserMedia();
            
            // Show call screen
            this.showCallScreen();
            
            // Display room ID for sharing
            this.showStatus(`ルームID: ${this.roomId} (共有してください)`, 'connected');
            
        } catch (error) {
            this.showStatus('ルーム作成に失敗しました: ' + error.message, 'error');
        }
    }

    async joinRoom() {
        try {
            const roomId = prompt('ルームIDを入力してください:');
            if (!roomId) return;
            
            this.showStatus('ルームに参加中...', 'connecting');
            this.roomId = roomId;
            this.isHost = false;
            
            // Initialize peer
            await this.initializePeer();
            
            // Get user media
            await this.getUserMedia();
            
            // Connect to host
            await this.connectToHost(roomId);
            
            // Show call screen
            this.showCallScreen();
            
        } catch (error) {
            this.showStatus('ルーム参加に失敗しました: ' + error.message, 'error');
        }
    }

    async initializePeer(id = null) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer(id, {
                debug: 2
            });

            this.peer.on('open', (peerId) => {
                console.log('Peer connected with ID:', peerId);
                this.setupPeerEvents();
                resolve(peerId);
            });

            this.peer.on('error', (error) => {
                console.error('Peer error:', error);
                reject(error);
            });
        });
    }

    setupPeerEvents() {
        // Handle incoming connections
        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });

        // Handle incoming calls
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
            
            // Display local video
            this.addVideoElement('local', this.localStream, 'あなた');
            
        } catch (error) {
            throw new Error('カメラ/マイクへのアクセスが拒否されました');
        }
    }

    async connectToHost(hostId) {
        // Connect for data channel
        const conn = this.peer.connect(hostId);
        this.handleConnection(conn);
        
        // Call host for video
        const call = this.peer.call(hostId, this.localStream);
        this.handleCall(call);
    }

    handleConnection(conn) {
        this.connections.set(conn.peer, conn);
        
        conn.on('open', () => {
            console.log('Data connection opened with:', conn.peer);
            this.broadcastUserList();
        });
        
        conn.on('data', (data) => {
            this.handleDataMessage(data, conn.peer);
        });
        
        conn.on('close', () => {
            console.log('Connection closed with:', conn.peer);
            this.connections.delete(conn.peer);
            this.removeVideoElement(conn.peer);
            this.broadcastUserList();
        });
    }

    handleIncomingCall(call) {
        // Answer with local stream
        call.answer(this.localStream);
        this.handleCall(call);
    }

    handleCall(call) {
        this.calls.set(call.peer, call);
        
        call.on('stream', (remoteStream) => {
            console.log('Received stream from:', call.peer);
            this.addVideoElement(call.peer, remoteStream, call.peer);
        });
        
        call.on('close', () => {
            console.log('Call closed with:', call.peer);
            this.calls.delete(call.peer);
            this.removeVideoElement(call.peer);
        });
    }

    handleDataMessage(data, senderId) {
        switch (data.type) {
            case 'chat':
                this.displayChatMessage(data.username, data.message);
                break;
            case 'user-list':
                this.updateUserList(data.users);
                break;
        }
    }

    addVideoElement(id, stream, label) {
        // Remove existing video if any
        this.removeVideoElement(id);
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `video-${id}`;
        
        const video = document.createElement('video');
        video.className = 'video-element';
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = id === 'local'; // Mute local video to prevent echo
        
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
        
        // Display locally
        this.displayChatMessage(this.username, message);
        
        // Send to all connections
        const data = {
            type: 'chat',
            username: this.username,
            message: message
        };
        
        this.broadcast(data);
        this.chatInput.value = '';
    }

    displayChatMessage(username, message) {
        const messageDiv = document.createElement('div');
        messageDiv.innerHTML = `<strong>${username}:</strong> ${message}`;
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
        
        const data = {
            type: 'user-list',
            users: users
        };
        
        this.broadcast(data);
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
            
            // Replace video track in all calls
            const videoTrack = screenStream.getVideoTracks()[0];
            
            this.calls.forEach((call) => {
                const sender = call.peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                if (sender) {
                    sender.replaceTrack(videoTrack);
                }
            });
            
            // Update local video
            const localVideo = document.querySelector('#video-local video');
            if (localVideo) {
                localVideo.srcObject = screenStream;
            }
            
            // Switch back when screen share ends
            videoTrack.onended = () => {
                this.getUserMedia().then(() => {
                    const cameraTrack = this.localStream.getVideoTracks()[0];
                    this.calls.forEach((call) => {
                        const sender = call.peerConnection.getSenders().find(s => 
                            s.track && s.track.kind === 'video'
                        );
                        if (sender) {
                            sender.replaceTrack(cameraTrack);
                        }
                    });
                });
            };
            
        } catch (error) {
            console.error('Screen share failed:', error);
            this.showStatus('画面共有に失敗しました', 'error');
        }
    }

    hangup() {
        // Close all connections
        this.connections.forEach((conn) => {
            conn.close();
        });
        this.connections.clear();
        
        // Close all calls
        this.calls.forEach((call) => {
            call.close();
        });
        this.calls.clear();
        
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Close peer
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        
        // Clear video grid
        this.videoGrid.innerHTML = '';
        
        // Show welcome screen
        this.showWelcomeScreen();
        this.showStatus('通話を終了しました', 'connected');
    }

    showWelcomeScreen() {
        this.welcomeScreen.classList.remove('hidden');
        this.callScreen.classList.add('hidden');
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
        return Math.random().toString(36).substr(2, 9);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.comChat = new ComChat();
    
    // Set initial username
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        window.comChat.username = usernameInput.value || 'ユーザー';
        
        // Update username when input changes
        usernameInput.addEventListener('input', (e) => {
            window.comChat.username = e.target.value || 'ユーザー';
        });
    }
});