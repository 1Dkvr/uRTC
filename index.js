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
    constructor() {
        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });
        this.dc = null;

        // Callbacks
        this.onSignal = (sig) => {};
        this.onConnected = () => {};
        this.onMessage = (msg) => {};

        this._setup();
    }

    _setup() {
        // Dès qu'un morceau de chemin réseau est trouvé, on génère le signal
        this.pc.onicecandidate = () => {
            this.onSignal(JSON.stringify(this.pc.localDescription));
        };

        // Écoute l'ouverture du canal
        this.pc.ondatachannel = (e) => this._bindDC(e.channel);
    }

    async createOffer() {
        this.dc = this.pc.createDataChannel("chat");
        this._bindDC(this.dc);
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.onSignal(JSON.stringify(this.pc.localDescription));
    }

    async handleSignal(answerStr) {
        const signal = JSON.parse(answerStr);
        if (signal.type === "offer") {
            await this.pc.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.onSignal(JSON.stringify(this.pc.localDescription));
        } else {
            await this.pc.setRemoteDescription(new RTCSessionDescription(signal));
        }
    }

    _bindDC(channel) {
        this.dc = channel;
        this.dc.onopen = () => this.onConnected();
        this.dc.onmessage = (e) => this.onMessage(e.data);
    }

    send(msg) {
        if (this.dc && this.dc.readyState === "open") this.dc.send(msg);
    }
}
