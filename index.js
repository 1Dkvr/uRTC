import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1316
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor() {
        this.config = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" }
            ],
            iceCandidatePoolSize: 10 // Pré-chauffe les routes réseau
        };

        this.peers = new Map();
        this.localStream = null;

        // Callbacks
        this.onSignalUpdate = (signal) => {};
        this.onConnection = (peerId) => {};
        this.onStream = (peerId, stream) => {};
        this.onData = (peerId, data) => {};
    }

    /**
     * Initialise une nouvelle tentative de connexion (Offreur)
     */
    async initiate() {
        const peerId = Math.random().toString(36).substring(7);
        const pc = this._createPeer(peerId);
        
        const dc = pc.createDataChannel("uRTC-high-speed", { ordered: false }); // Mode UDP pour la vitesse
        this._setupDataChannel(peerId, dc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        this._emitSignal(pc);
        return peerId;
    }

    /**
     * Répond à un signal distant
     */
    async connect(remoteSignal) {
        const signal = JSON.parse(remoteSignal);
        const peerId = "peer_" + Math.random().toString(36).substring(7);
        const pc = this._createPeer(peerId);

        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        
        if (signal.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this._emitSignal(pc);
        }
    }

    /**
     * Capture Média haute définition
     */
    async enableMedia() {
        this.localStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 },
                frameRate: { ideal: 30 } 
            },
            audio: { echoCancellation: true, noiseSuppression: true }
        });
        return this.localStream;
    }

    // --- INTERNE ---

    _createPeer(peerId) {
        const pc = new RTCPeerConnection(this.config);
        this.peers.set(peerId, pc);

        if (this.localStream) {
            this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
        }

        pc.onicecandidate = () => this._emitSignal(pc);
        
        pc.ontrack = (e) => this.onStream(peerId, e.streams[0]);

        pc.ondatachannel = (e) => this._setupDataChannel(peerId, e.channel);

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === "connected") this.onConnection(peerId);
        };

        return pc;
    }

    _setupDataChannel(peerId, dc) {
        dc.onmessage = (e) => this.onData(peerId, e.data);
        dc.onopen = () => console.log(`Canal ouvert avec ${peerId}`);
    }

    _emitSignal(pc) {
        // On n'attend pas que ce soit "complete", on envoie dès qu'on a du contenu
        if (pc.localDescription) {
            this.onSignalUpdate(JSON.stringify(pc.localDescription));
        }
    }

    broadcast(data) {
        const payload = typeof data === 'object' ? JSON.stringify(data) : data;
        this.peers.forEach((pc, id) => {
            // Ici on pourrait optimiser l'envoi de fichiers lourds par chunks
        });
    }
}
