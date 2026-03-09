import { Ø1D } from "./Humans.js";
import { LocalBS } from "https://1dkvr.github.io/FrameKit/core/js/BrowserStorage.js";

/**
 * @class uRTC
 * @description Full Mesh Peer-to-Peer. End-to-End Encrypted (Native WebRTC). Manages a WebRTC mesh network with persistent identity and auto-discovery. Support: Unicast (1:1), Multicast (1:N), Mesh (N:N)
 * @version 1.3.1637
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026-03-09
 */
export class uRTC {
    /**
     * @param {Object} config - Configuration object.
     * @param {string} [config.room='lobby'] - The namespace for peer discovery.
     * @param {Function} [config.onMessage] - Callback triggered on data reception: (envelope, senderId) => {}.
     * @param {Function} [config.onStatusChange] - Callback triggered on network change: (stats) => {}.
     */
    constructor(config = {}) {
        /** @private @type {string} */
        this.room = config.room || 'lobby';
        
        /** @public @type {string} */
        this.userId = this._getPersistentId();
        
        /** @private @type {Object.<string, any>} */
        this.peers = {}; 
        
        /** @private @type {string} */
        this.storageKey = `uRTC_mesh_${this.room}`;
        
        /** @public @type {Function} */
        this.onMessage = config.onMessage || (() => {});
        
        /** @public @type {Function} */
        this.onStatusChange = config.onStatusChange || (() => {});
        
        this._loadDependency()
            .then(() => this._initPeer())
            .catch(err => console.error("uRTC: Failed to load PeerJS", err));
    }

    /**
     * Injects PeerJS script into the document if not present.
     * @private
     * @returns {Promise<void>}
     */
    async _loadDependency() {
        if (window.Peer) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Initializes the PeerJS instance and sets up core listeners.
     * @private
     */
    _initPeer() {
        this.instance = new Peer(this.userId, {
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            config: { 
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ] 
            }
        });

        this.instance.on('open', () => {
            this._startDiscovery();
            this.onStatusChange(this.getStats());
        });

        this.instance.on('connection', (conn) => this._bindEvents(conn));
        
        this.instance.on('error', (err) => this._handleError(err));
    }

    /**
     * Handles the signaling heartbeat and auto-discovery via BrowserStorage.
     * @private
     */
    _startDiscovery() {
        const pulse = () => {
            let registry = LocalBS.get(this.storageKey) || {};
            const now = Date.now();
            
            // Register self
            registry[this.userId] = now;
            
            // Clean inactive nodes (TTL: 15 seconds)
            for (let id in registry) {
                if (now - registry[id] > 15000) delete registry[id];
            }
            LocalBS.set(this.storageKey, registry);

            // Establish Full Mesh: lowest ID connects to higher IDs
            Object.keys(registry).forEach(targetId => {
                if (targetId !== this.userId && !this.peers[targetId]) {
                    if (this.userId < targetId) this.connect(targetId);
                }
            });
        };

        pulse();
        this.discoveryInterval = setInterval(pulse, 5000);
        
        // Real-time synchronization for multiple tabs/devices
        window.addEventListener('storage', (e) => {
            if (e.key === this.storageKey) pulse();
        });
    }

    /**
     * Initiates a P2P connection with a remote peer.
     * @param {string} targetId - The ID of the remote peer.
     * @public
     */
    connect(targetId) {
        if (this.peers[targetId] || targetId === this.userId) return;
        const conn = this.instance.connect(targetId, { reliable: true });
        this._bindEvents(conn);
    }

    /**
     * Binds DataConnection events to local handlers.
     * @param {Object} conn - PeerJS DataConnection object.
     * @private
     */
    _bindEvents(conn) {
        conn.on('open', () => {
            this.peers[conn.peer] = conn;
            this.onStatusChange(this.getStats());
        });

        conn.on('data', (data) => {
            // Unicast filtering: discard if message is not for us
            if (data.target && data.target !== this.userId) return; 
            this.onMessage(data, conn.peer);
        });

        conn.on('close', () => {
            delete this.peers[conn.peer];
            this.onStatusChange(this.getStats());
        });
    }

    /**
     * Transmits data to the network.
     * @param {any} payload - The data to send.
     * @param {string|null} [targetId=null] - Optional recipient ID for 1:1. If null, broadcasts to all.
     * @param {string} [type='text'] - The data format/intent.
     * @returns {Object} The transmitted envelope.
     * @public
     */
    send(payload, targetId = null, type = 'text') {
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

    /**
     * Retrieves or generates a unique persistent identifier.
     * @private
     * @returns {string}
     */
    _getPersistentId() {
        let id = LocalBS.get('uRTC_guid');
        if (!id) {
            id = 'u_' + Math.random().toString(36).substring(2, 9);
            LocalBS.set('uRTC_guid', id);
        }
        return id;
    }

    /**
     * Internal error handling.
     * @private
     */
    _handleError(err) {
        if (err.type === 'peer-unavailable') {
            const ghostId = err.message.split(' ').pop();
            let db = LocalBS.get(this.storageKey) || {};
            delete db[ghostId];
            LocalBS.set(this.storageKey, db);
        }
        console.error(`[uRTC Engine] Error: ${err.type}`, err);
    }

    /**
     * Provides current network state and statistics.
     * @public
     * @returns {Object}
     */
    getStats() {
        return {
            myId: this.userId,
            room: this.room,
            activeConnections: Object.keys(this.peers).length,
            peers: Object.keys(this.peers)
        };
    }
}
