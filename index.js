import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization.
 * @version 1.0.220
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(config = {}) {
        this.config = {
            iceServers: config.iceServers || [{ urls: "stun:stun.l.google.com:19302" }]
        };

        this.peers = {}; // Stocke les connexions : { peerId: RTCPeerConnection }
        this.channels = {}; // Stocke les dataChannels : { peerId: RTCDataChannel }
        this.localStream = null;

        // Signaling (WebSocket public ultra-rapide)
        this.signalingUrl = "wss://signaling.simplewebrtc.com/v1/";
        this.socket = null;
        this.myId = Math.random().toString(36).substr(2, 9);

        // Événements Publics
        this.onPeerConnect = (peerId) => {};
        this.onData = (peerId, data) => {};
        this.onStream = (peerId, stream) => {};
    }

    /**
     * Rejoindre une room via un ID unique
     */
    join(roomId) {
        const url = `${this.signalingUrl}${roomId}`;
        this.socket = new WebSocket(url);

        this.socket.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            if (msg.from === this.myId) return; // Ignorer mes propres messages

            switch (msg.type) {
                case "new-peer":
                    this._createPeer(msg.from, true); // On crée l'offre
                    break;
                case "signal":
                    this._handleSignal(msg.from, msg.data);
                    break;
            }
        };

        this.socket.onopen = () => {
            // Annoncer mon arrivée à la room
            this._sendSignaling({ type: "new-peer", from: this.myId });
        };
    }

    async addStream(videoElementId) {
        this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoElementId) document.getElementById(videoElementId).srcObject = this.localStream;
        return this.localStream;
    }

    /**
     * Envoie des données à tout le monde
     */
    broadcast(data) {
        const payload = typeof data === 'object' ? JSON.stringify(data) : data;
        Object.values(this.channels).forEach(ch => {
            if (ch.readyState === "open") ch.send(payload);
        });
    }

    // --- LOGIQUE INTERNE MESH ---

    _createPeer(peerId, isOfferer) {
        const pc = new RTCPeerConnection(this.config);
        this.peers[peerId] = pc;

        // Gestion du flux Audio/Vidéo
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
        }

        pc.ontrack = (e) => this.onStream(peerId, e.streams[0]);

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this._sendSignaling({ type: "signal", from: this.myId, to: peerId, data: { candidate: e.candidate } });
            }
        };

        if (isOfferer) {
            const dc = pc.createDataChannel("uRTC-data");
            this._setupDataChannel(peerId, dc);
            pc.createOffer().then(offer => {
                pc.setLocalDescription(offer);
                this._sendSignaling({ type: "signal", from: this.myId, to: peerId, data: offer });
            });
        } else {
            pc.ondatachannel = (e) => this._setupDataChannel(peerId, e.channel);
        }
    }

    async _handleSignal(peerId, data) {
        let pc = this.peers[peerId];
        if (!pc) {
            this._createPeer(peerId, false);
            pc = this.peers[peerId];
        }

        if (data.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            if (data.type === "offer") {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this._sendSignaling({ type: "signal", from: this.myId, to: peerId, data: answer });
            }
        } else if (data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }

    _setupDataChannel(peerId, dc) {
        this.channels[peerId] = dc;
        dc.onopen = () => this.onPeerConnect(peerId);
        dc.onmessage = (e) => this.onData(peerId, e.data);
    }

    _sendSignaling(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }
}
