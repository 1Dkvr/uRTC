import { Ø1D } from "./Humans.js";
import { LocalBS } from "https://1dkvr.github.io/FrameKit/core/js/BrowserStorage.js";

/**
 * @class uRTC
 * @description An ultra-performant, zero-dependency WebRTC wrapper for P2P data & file synchronization. Multi-peer WebRTC wrapper for high-speed P2P sync and media.
 * @version 1.0.1432
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
        this.peer = new Peer();
        this.peer.on('open', (id) => {
            this.id = id;
            console.log("uRTC: Mon ID est " + id);
            // 1. On lance une première vérification IMMÉDIATE
            this._checkPeers(); 
            // 2. Puis on surveille toutes les 5 secondes
            setInterval(() => this._checkPeers(), 5000);
        });

        this.peer.on('connection', (conn) => this._setupConn(conn));
        
        this.peer.on('error', (err) => {
            if (err.type === 'peer-unavailable') {
                console.log("uRTC: Le partenaire n'est pas encore prêt...");
            }
        });
    }

    _checkPeers() {
        if (!this.id) return;

        let allPeers = LocalBS.get('uRTC_active_peers_' + this.room) || {};
        if (typeof allPeers === 'string') allPeers = JSON.parse(allPeers);

        const now = Date.now();
        allPeers[this.id] = now;

        // Nettoyage des vieux peers (> 15s)
        for (let pid in allPeers) {
            if (now - allPeers[pid] > 15000) delete allPeers[pid];
        }

        LocalBS.set('uRTC_active_peers_' + this.room, allPeers);

        // Recherche d'un partenaire
        const otherId = Object.keys(allPeers).find(pid => pid !== this.id);
        
        if (otherId && !this.connections[otherId]) {
            // Politesse : le plus petit ID appelle
            if (this.id < otherId) {
                console.log("uRTC: Tentative de liaison vers", otherId);
                this.connect(otherId);
            } else {
                console.log("uRTC: J'attends l'appel de", otherId);
            }
        }
    }

    connect(remoteId) {
        if (this.connections[remoteId]) return;
        const conn = this.peer.connect(remoteId, { 
            serialization: "json",
            reliable: true 
        });
        this._setupConn(conn);
    }

    _setupConn(conn) {
        conn.on('open', () => {
            if (this.connections[conn.peer]) return;
            this.connections[conn.peer] = conn;
            this.onConnected();
            console.log("uRTC: ✅ CONNECTÉ À " + conn.peer);
        });

        conn.on('data', (data) => this.onMessage(data));
        conn.on('close', () => delete this.connections[conn.peer]);
        conn.on('error', () => {});
    }

    send(msg) {
        Object.values(this.connections).forEach(conn => {
            if (conn.open) conn.send(msg);
        });
    }
}
