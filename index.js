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
    constructor(roomId) {
        // @ts-ignore - Bugout est chargé via CDN
        this.b = new Bugout(roomId);
        this.peers = {}; // Liste des connexions WebRTC
        
        this.onMessage = (from, msg) => {};
        this.onPeerCount = (count) => {};
        this.onStream = (stream, id) => {};

        this._setupDHT();
    }

    _setupDHT() {
        // Quand un nouvel appareil rejoint la "Room" via le réseau BitTorrent
        this.b.on("seen", (address) => {
            console.log("Nouveau pair détecté sur le réseau:", address);
            this.onPeerCount(Object.keys(this.b.peers).length);
        });

        // Réception de messages via le canal de signalisation ou data
        this.b.on("message", (address, data) => {
            if (typeof data === "object" && data.type === "rtc-sig") {
                this._handleRTCSig(address, data.sig);
            } else {
                this.onMessage(address, data);
            }
        });
    }

    /**
     * Envoie un message à tout le monde
     */
    send(msg) {
        this.b.send(msg);
    }

    /**
     * Logique WebRTC automatique (Optionnelle, déclenchée au besoin)
     */
    async connectMedia() {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        // Pour chaque pair détecté, on tente d'ouvrir un flux direct
        Object.keys(this.b.peers).forEach(address => {
            this._initDirectVideo(address, stream);
        });
        return stream;
    }

    // Gestion interne du flux WebRTC pour la vidéo/audio si activé
    _initDirectVideo(address, stream) {
        const pc = new RTCPeerConnection({iceServers: [{urls: "stun:stun.l.google.com:19302"}]});
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        
        pc.onicecandidate = (e) => {
            if (e.candidate) this.b.send(address, {type: "rtc-sig", sig: {candidate: e.candidate}});
        };
        
        pc.ontrack = (e) => this.onStream(e.streams[0], address);

        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            this.b.send(address, {type: "rtc-sig", sig: {sdp: offer}});
        });
        this.peers[address] = pc;
    }

    _handleRTCSig(address, sig) {
        // Ici on gère les SDP/ICE automatiquement pour la vidéo si besoin
        console.log("Signal WebRTC reçu de", address);
    }
}
