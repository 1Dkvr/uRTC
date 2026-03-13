import { Ø1D } from "./Humans.js";
import { LocalBS } from "https://1dkvr.github.io/FrameKit/core/js/BrowserStorage.js";

/**
 * @class uRTC
 * @description Full Mesh Peer-to-Peer. End-to-End Encrypted (Native WebRTC). Manages a WebRTC mesh network with persistent identity and auto-discovery. Support: Unicast (1:1), Multicast (1:N), Mesh (N:N)
 * @version 1.5.1047
 * @author 1D
 * @copyright © 2026 Hold"inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026.03.13
 */
export default class uRTC {
    constructor(config = {}) {
        // Sécurisation de l'alias pour éviter les erreurs d'import
        const defaultRoom = (window.Ø1D && Ø1D.alias) ? `${Ø1D.alias}_room` : 'lobby_uRTC';
        
        this.room = config.room || defaultRoom;
        this.userId = this._getPersistentId();
        this.peers = {}; 
        this.storageKey = `uRTC_mesh_${this.room}`;
        this.onMessage = config.onMessage || (() => {});
        this.onStatusChange = config.onStatusChange || (() => {});
        
        this._loadDependency().then(() => this._initPeer());
    }

    async _loadDependency() {
        if (window.Peer) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    _initPeer() {
        this.instance = new Peer(this.userId, {
            host: "0.peerjs.com", port: 443, secure: true,
            config: { 
                "iceServers": [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:stun1.l.google.com:19302" }
                ] 
            }
        });

        this.instance.on("open", () => {
            // Premier scan immédiat
            this._discoverAndMesh();
            
            // On réduit à 5s pour plus de réactivité en mesh
            setInterval(() => this._discoverAndMesh(), 5000);

            // Écouteur Storage pour réagir instantanément au nouvel onglet
            window.addEventListener("storage", (e) => {
                if (e.key === this.storageKey) this._discoverAndMesh();
            });
            
            this.onStatusChange(this.getStats());
        });

        this.instance.on("connection", (conn) => this._bindEvents(conn));
        this.instance.on("error", (err) => this._handleError(err));
    }

    _discoverAndMesh() {
        let registry = LocalBS.get(this.storageKey) || {};
        const now = Date.now();
        
        // On s'inscrit
        registry[this.userId] = now;
        
        // Nettoyage des fantômes
        for (let id in registry) { 
            if (now - registry[id] > 15000) delete registry[id]; 
        }
        LocalBS.set(this.storageKey, registry);

        // Tentative de connexion aux autres
        Object.keys(registry).forEach(targetId => {
            if (targetId !== this.userId && !this.peers[targetId]) {
                // Stratégie de poignée de main : Le plus petit ID appelle le plus grand
                if (this.userId < targetId) {
                    this.connect(targetId);
                }
            }
        });
    }

    connect(targetId) {
        if (this.peers[targetId] || targetId === this.userId) return;
        const conn = this.instance.connect(targetId, { reliable: true });
        this._bindEvents(conn);
    }

    _bindEvents(conn) {
        conn.on("open", () => {
            this.peers[conn.peer] = conn;
            this.onStatusChange(this.getStats());
        });
        conn.on("data", (data) => {
            if (data.target && data.target !== this.userId) return; 
            this.onMessage(data, conn.peer);
        });
        conn.on("close", () => {
            delete this.peers[conn.peer];
            this.onStatusChange(this.getStats());
        });
    }

    send(payload, targetId = null, type = "text") {
        const envelope = { 
            type, 
            payload, 
            target: targetId, 
            timestamp: new Date().toISOString(), 
            sender: this.userId 
        };
        
        if (targetId && this.peers[targetId]) {
            this.peers[targetId].send(envelope);
        } else {
            Object.values(this.peers).forEach(conn => { 
                if (conn.open) conn.send(envelope); 
            });
        }
        return envelope;
    }

    _getPersistentId() {
        let id = LocalBS.get("uRTC_guid");
        if (!id) {
            id = "u_" + Math.random().toString(36).substring(2, 9);
            LocalBS.set("uRTC_guid", id);
        }
        return id;
    }

    _handleError(err) {
        if (err.type === "peer-unavailable") {
            const ghostId = err.message.split(" ").pop();
            this._unregister(ghostId);
        }
    }

    _unregister(id) {
        let db = LocalBS.get(this.storageKey) || {};
        delete db[id];
        LocalBS.set(this.storageKey, db);
    }

    getStats() {
        return { 
            myId: this.userId, 
            activeConnections: Object.keys(this.peers).length, 
            peers: Object.keys(this.peers) 
        };
    }
}
