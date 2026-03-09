import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1400
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(roomName) {
        this.room = roomName;
        this.id = Math.random().toString(36).substring(7);
        this.pc = null;
        this.dc = null;
        this.onConnected = () => {};
        this.onMessage = (m) => {};
        this._connectSignaling();
    }

    async _connectSignaling() {
        if (!window.mqtt) {
            await new Promise(r => {
                const s = document.createElement('script');
                s.src = "https://unpkg.com/mqtt/dist/mqtt.min.js";
                s.onload = r; document.head.appendChild(s);
            });
        }

        // On se connecte au broker MQTT (Signalisation)
        this.mqtt = mqtt.connect('wss://test.mosquitto.org:8081');
        
        this.mqtt.on('connect', () => {
            this.mqtt.subscribe(`uRTC/${this.room}`);
            // On signale qu'on est là TOUTES LES SECONDES jusqu'à connexion
            this.helloInt = setInterval(() => this._send({ type: "hello" }), 1000);
        });

        this.mqtt.on('message', (t, p) => {
            const m = JSON.parse(p.toString());
            if (m.from === this.id) return;

            if (m.type === "hello" && !this.pc) this._init(m.from, true);
            if (m.type === "offer") this._handleOffer(m.from, m.sdp);
            if (m.type === "answer") this.pc?.setRemoteDescription(new RTCSessionDescription(m.sdp));
            if (m.type === "candidate") this.pc?.addIceCandidate(new RTCIceCandidate(m.candidate)).catch(() => {});
        });
    }

    _init(remoteId, isOfferer) {
        if (this.pc) return;

        // CONFIGURATION RADICALE : On vide les iceServers pour le test local
        // Ça évite que le navigateur interroge Google et attende la réponse
        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }], 
            iceCandidatePoolSize: 10
        });

        this.pc.onicecandidate = (e) => {
            if (e.candidate) this._send({ type: "candidate", candidate: e.candidate });
        };

        // On force le DataChannel en mode "Prêt à l'emploi"
        this.dc = this.pc.createDataChannel("chat", { negotiated: true, id: 0 });
        this._setupDC();

        if (isOfferer) {
            this.pc.createOffer().then(o => {
                this.pc.setLocalDescription(o);
                this._send({ type: "offer", sdp: o });
            });
        }
    }

    async _handleOffer(remoteId, sdp) {
        this._init(remoteId, false);
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const a = await this.pc.createAnswer();
        await this.pc.setLocalDescription(a);
        this._send({ type: "answer", sdp: a });
    }

    _setupDC() {
        // L'astuce : On vérifie l'état toutes les 100ms pour ne pas rater l'ouverture
        const check = setInterval(() => {
            if (this.dc && this.dc.readyState === "open") {
                clearInterval(this.helloInt);
                clearInterval(check);
                this.onConnected();
            }
        }, 100);
        this.dc.onmessage = (e) => this.onMessage(e.data);
    }

    _send(data) {
        data.from = this.id;
        if (this.mqtt.connected) this.mqtt.publish(`uRTC/${this.room}`, JSON.stringify(data));
    }

    send(m) { if(this.dc?.readyState === "open") this.dc.send(m); }
}
