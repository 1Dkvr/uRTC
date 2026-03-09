import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1402
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(roomName) {
        // On nettoie le nom de la room pour l'URL
        this.room = roomName.replace(/[^a-zA-Z0-9]/g, '');
        this.id = Math.random().toString(36).substring(7);
        this.pc = null;
        this.dc = null;
        this.onConnected = () => {};
        this.onMessage = (m) => {};
        
        this._initSignaling();
    }

    async _initSignaling() {
        console.log("uRTC: Recherche de pairs via HTTP...");
        
        // On écoute les signaux entrants via EventSource (Standard HTTP)
        const es = new EventSource(`https://ntfy.sh/${this.room}/sse`);
        es.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.from === this.id) return;

            if (m.type === "hello" && !this.pc) this._setupRTC(m.from, true);
            if (m.type === "offer") this._handleOffer(m.from, m.sdp);
            if (m.type === "answer") this.pc?.setRemoteDescription(new RTCSessionDescription(m.sdp));
            if (m.type === "candidate") this.pc?.addIceCandidate(new RTCIceCandidate(m.candidate)).catch(() => {});
        };

        // On signale notre présence
        this._send({ type: "hello" });
        // On relance un "hello" court au cas où
        this.helloInt = setInterval(() => {
            if (!this.pc) this._send({ type: "hello" });
            else clearInterval(this.helloInt);
        }, 3000);
    }

    _setupRTC(remoteId, isOfferer) {
        if (this.pc) return;
        this.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

        this.pc.onicecandidate = (e) => {
            if (e.candidate) this._send({ type: "candidate", candidate: e.candidate });
        };

        this.dc = this.pc.createDataChannel("chat", { negotiated: true, id: 0 });
        this.dc.onopen = () => this.onConnected();
        this.dc.onmessage = (e) => this.onMessage(e.data);

        if (isOfferer) {
            this.pc.createOffer().then(o => {
                this.pc.setLocalDescription(o);
                this._send({ type: "offer", sdp: o });
            });
        }
    }

    async _handleOffer(remoteId, sdp) {
        this._setupRTC(remoteId, false);
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const a = await this.pc.createAnswer();
        await this.pc.setLocalDescription(a);
        this._send({ type: "answer", sdp: a });
    }

    async _send(data) {
        data.from = this.id;
        try {
            await fetch(`https://ntfy.sh/${this.room}`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        } catch (e) { console.error("Erreur d'envoi signal", e); }
    }

    send(m) { if(this.dc?.readyState === "open") this.dc.send(m); }
}
