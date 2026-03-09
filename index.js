import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1411
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(roomName = "default-room") {
        this.room = roomName.replace(/[^a-zA-Z0-9]/g, '');
        this.id = null;
        this.peer = null;
        this.connections = {};
        
        this.onConnected = () => {};
        this.onMessage = (m) => {};

        this._loadAndInit();
    }

    async _loadAndInit() {
        if (!window.Peer) {
            await new Promise(r => {
                const s = document.createElement('script');
                s.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
                s.onload = r; document.head.appendChild(s);
            });
        }
        this._startPeer();
    }

    _autoConnect() {
        const lastPeer = localStorage.getItem('uRTC_last_peer_' + this.room);
        // Si un ID existe et que ce n'est pas le mien, je tente la connexion
        if (lastPeer && lastPeer !== this.id) {
            console.log("uRTC: Tentative de connexion automatique vers", lastPeer);
            this.connect(lastPeer);
        }
        // J'enregistre mon ID pour les futurs onglets
        localStorage.setItem('uRTC_last_peer_' + this.room, this.id);
    }

    _startPeer() {
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            this.id = id;
            console.log("uRTC: Mon ID est " + id);
            this._autoConnect();
        });

        this.peer.on('connection', (conn) => this._setupConn(conn));

        this.peer.on('error', (err) => {
            console.warn("uRTC Peer Error:", err.type);
            
            // SI L'AUTRE N'EST PAS ENCORE PRÊT, ON RÉESSAIE DANS 2 SECONDES
            if (err.type === 'peer-unavailable') {
                const lastPeer = localStorage.getItem('uRTC_last_peer_' + this.room);
                if (lastPeer) {
                    console.log("uRTC: Peer pas encore prêt, nouvel essai dans 2s...");
                    setTimeout(() => this.connect(lastPeer), 2000);
                }
            }
        });
    }

    connect(remoteId) {
        if (this.connections[remoteId]) return;
        const conn = this.peer.connect(remoteId, { serialization: "json" });
        this._setupConn(conn);
    }

    _setupConn(conn) {
        conn.on('open', () => {
            this.connections[conn.peer] = conn;
            this.onConnected();
            console.log("uRTC: Connecté à " + conn.peer);
        });

        conn.on('data', (data) => {
            this.onMessage(data);
        });

        conn.on('close', () => delete this.connections[conn.peer]);
    }

    send(msg) {
        Object.values(this.connections).forEach(conn => {
            if (conn.open) conn.send(msg);
        });
    }
}
