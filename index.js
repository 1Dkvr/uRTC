import { Ø1D } from "./Humans.js";
import { LocalBS } from "https://1dkvr.github.io/FrameKit/core/js/BrowserStorage.js";

/**
 * @class uRTC
 * @description Full Mesh Peer-to-Peer. End-to-End Encrypted (Native WebRTC)
 * @version 1.3.1630
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    constructor(config = {}) {
        this.room = config.room || 'lobby';
        this.userId = this._getPersistentId();
        this.peers = {};
        this.storageKey = `uRTC_mesh_${this.room}`;
        
        this.onMessage = config.onMessage || (() => {});
        this.onStatusChange = config.onStatusChange || (() => {});
        
        // Chargement automatique de la dépendance
        this._loadDependency().then(() => this._initPeer());
    }

    async _loadDependency() {
        if (window.Peer) return; // Déjà chargé
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    _initPeer() {
        this.instance = new Peer(this.userId, {
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
        });

        this.instance.on('open', (id) => {
            console.log(`[uRTC] Noeud actif: ${id}`);
            this.onStatusChange(this.getStats());
            this._startDiscovery();
        });

        this.instance.on('connection', (conn) => this._bindEvents(conn));
        this.instance.on('error', (err) => this._handleError(err));
    }

    _startDiscovery() {
        const heartbeat = () => {
            let registry = LocalBS.get(this.storageKey) || {};
            registry[this.userId] = Date.now();
            for (let id in registry) {
                if (Date.now() - registry[id] > 15000) delete registry[id];
            }
            LocalBS.set(this.storageKey, registry);

            Object.keys(registry).forEach(targetId => {
                if (targetId !== this.userId && !this.peers[targetId]) {
                    if (this.userId < targetId) this.connect(targetId);
                }
            });
        };
        setInterval(heartbeat, 5000);
        heartbeat();
    }

    connect(targetId) {
        if (this.peers[targetId]) return;
        const conn = this.instance.connect(targetId, { reliable: true });
        this._bindEvents(conn);
    }

    _bindEvents(conn) {
        conn.on('open', () => {
            this.peers[conn.peer] = conn;
            this.onStatusChange(this.getStats());
        });
        conn.on('data', (data) => this.onMessage(data, conn.peer));
        conn.on('close', () => {
            delete this.peers[conn.peer];
            this.onStatusChange(this.getStats());
        });
    }

    broadcast(payload, type = 'text') {
        const envelope = {
            type,
            payload,
            timestamp: new Date().toISOString(),
            sender: this.userId
        };
        Object.values(this.peers).forEach(conn => {
            if (conn.open) conn.send(envelope);
        });
        return envelope;
    }

    _getPersistentId() {
        let id = LocalBS.get('uRTC_guid');
        if (!id) {
            id = 'u_' + Math.random().toString(36).substring(2, 9);
            LocalBS.set('uRTC_guid', id);
        }
        return id;
    }

    _handleError(err) {
        if (err.type === 'peer-unavailable') {
            const ghostId = err.message.split(' ').pop();
            let db = LocalBS.get(this.storageKey) || {};
            delete db[ghostId];
            LocalBS.set(this.storageKey, db);
        }
    }

    getStats() {
        return {
            myId: this.userId,
            activeConnections: Object.keys(this.peers).length,
            peers: Object.keys(this.peers)
        };
    }
}
