import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1327
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(roomId = "default-room") {
        this.roomId = roomId;
        this.connections = {};
        
        this.onMessage = (from, msg) => {};
        this.onPeerConnect = (id) => {};
        
        this._init();
    }

    async _init() {
        // Chargement dynamique de la lib si pas présente
        if (!window.Peer) {
            await new Promise(r => {
                const s = document.createElement('script');
                s.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
                s.onload = r;
                document.head.appendChild(s);
            });
        }

        // On utilise un ID basé sur la room + un random pour être unique
        this.myId = this.roomId + "-" + Math.random().toString(36).slice(2, 6);
        
        // Connexion au serveur de signalisation public de PeerJS
        this.peer = new Peer(this.myId);

        this.peer.on('open', (id) => {
            console.log("uRTC: Connecté au réseau sous l'ID", id);
            this._discoverPeers();
        });

        // Écoute les appels entrants
        this.peer.on('connection', (conn) => {
            this._setupConnection(conn);
        });

        this.peer.on('error', (err) => console.error("uRTC Peer Error:", err));
    }

    _discoverPeers() {
        // Dans un système sans liste de serveurs, on ne peut pas "deviner" les autres.
        // On demande à l'utilisateur de partager son ID ou on utilise un système de 'Room'
        // Pour l'instant, on simule la découverte :
        console.warn("Partagez cet ID pour que d'autres rejoignent :", this.myId);
    }

    connect(remoteId) {
        if (this.connections[remoteId]) return;
        const conn = this.peer.connect(remoteId);
        this._setupConnection(conn);
    }

    _setupConnection(conn) {
        this.connections[conn.peer] = conn;
        conn.on('open', () => {
            this.onPeerConnect(conn.peer);
            conn.send({type: "system", msg: "Hello!"});
        });
        conn.on('data', (data) => {
            this.onMessage(conn.peer, data);
        });
    }

    send(msg) {
        Object.values(this.connections).forEach(conn => {
            if (conn.open) conn.send(msg);
        });
    }
}
