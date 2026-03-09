import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1332
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(roomId = "default-room") {
        this.roomId = roomId;
        this.myId = "user-" + Math.random().toString(36).slice(2, 6);
        this.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        this.dc = null;

        this.onMessage = (msg) => {};
        this.onConnected = () => {};

        this._init();
    }

    async _init() {
        // On crée le DataChannel tout de suite
        this.dc = this.pc.createDataChannel("chat");
        this._setupDC();

        this.pc.onicecandidate = (e) => {
            if (e.candidate) this._sendSignal({ candidate: e.candidate });
        };

        // On écoute les offres entrantes sur ton serveur
        setInterval(() => this._pollSignals(), 2000);
        
        console.log("uRTC Ready. ID:", this.myId);
    }

    // Fonction pour générer l'offre (le premier qui clique sur ton bouton)
    async createOffer() {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this._sendSignal({ sdp: offer });
    }

    _setupDC() {
        this.pc.ondatachannel = (e) => {
            this.dc = e.channel;
            this.dc.onmessage = (evt) => this.onMessage(evt.data);
            this.dc.onopen = () => this.onConnected();
        };
        if (this.dc) {
            this.dc.onmessage = (evt) => this.onMessage(evt.data);
            this.dc.onopen = () => this.onConnected();
        }
    }

    send(msg) {
        if (this.dc && this.dc.readyState === "open") this.dc.send(msg);
    }

    // --- C'est ici que la magie opère sans serveur externe ---
    // On utilise une API de stockage temporaire gratuite (ou ton serveur)
    async _sendSignal(data) {
        await fetch(`https://kvdb.io/S97W8pU8XN9f7z6z2X7p/${this.roomId}`, {
            method: 'POST',
            body: JSON.stringify({ from: this.myId, data: data })
        });
    }

    async _pollSignals() {
        const res = await fetch(`https://kvdb.io/S97W8pU8XN9f7z6z2X7p/${this.roomId}`);
        const text = await res.text();
        if (!text) return;
        const msg = JSON.parse(text);
        
        if (msg.from === this.myId) return; // Ignorer mon propre message

        if (msg.data.sdp) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(msg.data.sdp));
            if (msg.data.sdp.type === "offer") {
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                this._sendSignal({ sdp: answer });
            }
        } else if (msg.data.candidate) {
            try { await this.pc.addIceCandidate(new RTCIceCandidate(msg.data.candidate)); } catch(e) {}
        }
    }
}
