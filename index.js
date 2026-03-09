import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1357
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

        this.mqtt = mqtt.connect('wss://test.mosquitto.org:8081');
        
        this.mqtt.on('connect', () => {
            this.mqtt.subscribe(`uRTC/${this.room}`);
            // On crie "HELLO" pour voir s'il y a quelqu'un
            this._send({ type: "hello" });
        });

        this.mqtt.on('message', (t, p) => {
            const m = JSON.parse(p.toString());
            if (m.from === this.id) return;

            // LOGIQUE DE RÉPONSE INSTANTANÉE
            if (m.type === "hello") {
                this._init(m.from, true); 
            }
            if (m.type === "offer") {
                this._handleOffer(m.from, m.sdp);
            }
            if (m.type === "answer") {
                this.pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
            }
            if (m.type === "candidate") {
                this.pc.addIceCandidate(new RTCIceCandidate(m.candidate)).catch(() => {});
            }
        });
    }

    _init(remoteId, isOfferer) {
        if (this.pc) return; 

        // CONFIGURATION AGRESSIVE
        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        });

        this.pc.onicecandidate = (e) => {
            if (e.candidate) {
                this._send({ type: "candidate", candidate: e.candidate });
            }
        };

        // On définit le DataChannel AVANT de créer l'offre
        this.dc = this.pc.createDataChannel("chat", { negotiated: true, id: 0 });
        this._setupDC();

        if (isOfferer) {
            this.pc.createOffer()
                .then(o => this.pc.setLocalDescription(o))
                .then(() => {
                    // ON ENVOIE L'OFFRE TOUT DE SUITE, SANS ATTENDRE LES CANDIDATS
                    this._send({ type: "offer", sdp: this.pc.localDescription });
                });
        }
    }

    async _handleOffer(remoteId, sdp) {
        this._init(remoteId, false);
        await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const a = await this.pc.createAnswer();
        await this.pc.setLocalDescription(a);
        this._send({ type: "answer", sdp: this.pc.localDescription });
    }

    _setupDC() {
        this.dc.onopen = () => this.onConnected();
        this.dc.onmessage = (e) => this.onMessage(e.data);
    }

    _send(data) {
        data.from = this.id;
        this.mqtt.publish(`uRTC/${this.room}`, JSON.stringify(data));
    }

    send(m) { 
        if(this.dc && this.dc.readyState === "open") this.dc.send(m); 
    }
}
