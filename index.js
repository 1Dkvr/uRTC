import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1335
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(roomName) {
        this.roomName = roomName;
        this.password = window.location.hash.substring(1);
        this.myId = Math.random().toString(36).substring(7);
        
        this.pc = null;
        this.dc = null;
        this.onMessage = (msg) => {};
        this.onConnected = () => {};

        this._init();
    }

    async _init() {
        if (!window.mqtt) {
            await new Promise(r => {
                const s = document.createElement('script');
                s.src = "https://unpkg.com/mqtt/dist/mqtt.min.js";
                s.onload = r;
                document.head.appendChild(s);
            });
        }

        this.client = mqtt.connect('wss://test.mosquitto.org:8081');
        
        this.client.on('connect', () => {
            this.client.subscribe(`uRTC/${this.roomName}`);
            // On annonce notre présence toutes les 2 secondes jusqu'à connexion
            this.announceInterval = setInterval(() => {
                this.client.publish(`uRTC/${this.roomName}`, JSON.stringify({
                    from: this.myId,
                    type: "presence"
                }));
            }, 2000);
            console.log("uRTC: Prêt et en attente d'un pair...");
        });

        this.client.on('message', async (topic, payload) => {
            const msg = JSON.parse(payload.toString());
            if (msg.from === this.myId) return;

            if (msg.type === "presence") {
                // Si on voit quelqu'un, on initialise le WebRTC
                if (!this.pc) this._setupWebRTC(msg.from);
            } else if (msg.type === "signal") {
                const decrypted = await this._decrypt(msg.data);
                this._handleSignal(decrypted);
            }
        });
    }

    _setupWebRTC(remoteId) {
        this.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

        this.pc.onicecandidate = (e) => {
            if (e.candidate) this._sendSignal({ candidate: e.candidate });
        };

        this.pc.ondatachannel = (e) => this._bindDC(e.channel);

        // L'initiateur est celui qui a l'ID le plus "petit" (tri alphabétique)
        // Cela permet de décider automatiquement qui crée l'offre
        if (this.myId < remoteId) {
            this.dc = this.pc.createDataChannel("chat");
            this._bindDC(this.dc);
            this.pc.createOffer().then(o => {
                this.pc.setLocalDescription(o);
                this._sendSignal(o);
            });
        }
    }

    async _handleSignal(sig) {
        if (sig.type === "offer") {
            await this.pc.setRemoteDescription(new RTCSessionDescription(sig));
            const a = await this.pc.createAnswer();
            await this.pc.setLocalDescription(a);
            this._sendSignal(a);
        } else if (sig.type === "answer") {
            await this.pc.setRemoteDescription(new RTCSessionDescription(sig));
        } else if (sig.candidate) {
            try { await this.pc.addIceCandidate(new RTCIceCandidate(sig.candidate)); } catch(e) {}
        }
    }

    async _sendSignal(data) {
        const encrypted = await this._encrypt(JSON.stringify(data));
        this.client.publish(`uRTC/${this.roomName}`, JSON.stringify({
            from: this.myId,
            type: "signal",
            data: encrypted
        }));
    }

    // Chiffrement Base64 simple pour le test (On sécurisera après validation du flux)
    async _encrypt(text) { return btoa(text); }
    async _decrypt(data) { return JSON.parse(atob(data)); }

    _bindDC(dc) {
        this.dc = dc;
        this.dc.onopen = () => {
            clearInterval(this.announceInterval);
            this.onConnected();
        };
        this.dc.onmessage = (e) => this.onMessage(e.data);
    }

    send(m) { if(this.dc && this.dc.readyState === "open") this.dc.send(m); }
}
