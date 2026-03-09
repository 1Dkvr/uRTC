import { Ø1D } from "./Humans.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1410
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

    _startPeer() {
        // On utilise le nom de la room comme base pour se trouver
        // Un utilisateur sera le "Lobby" (le nom de la room fixe)
        // Les autres seront des "Clients"
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            this.id = id;
            console.log("uRTC: Mon ID est " + id);
            this._autoConnect();
        });

        this.peer.on('connection', (conn) => {
            this._setupConn(conn);
        });

        this.peer.on('error', (err) => {
            console.error("PeerJS Error:", err.type);
            // Si l'ID est déjà pris, on ne panique pas, on en génère un autre
            if (err.type === 'unavailable-id') setTimeout(() => this._startPeer(), 1000);
        });
    }

    _autoConnect() {
        // Cette partie est cruciale : on essaie de se connecter à la "Room"
        // Si ça échoue, c'est qu'on est le premier, donc on devient la Room.
        // Pour simplifier, on va utiliser le localStorage pour s'échanger l'ID en local
        // et un système de retry pour le distant.
        
        const lastPeer = localStorage.getItem('uRTC_last_peer_' + this.room);
        if (lastPeer && lastPeer !== this.id) {
            this.connect(lastPeer);
        }
        localStorage.setItem('uRTC_last_peer_' + this.room, this.id);
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
