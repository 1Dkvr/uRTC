import Ø1D from "./Humans.js";
import { LocalBS } from "https://1dkvr.github.io/FrameKit/core/js/BrowserStorage.js";

/**
 * @class uRTC
 * @description Full Mesh Peer-to-Peer wrapper. End-to-End Encrypted (Native WebRTC). Manages a decentralized mesh network with persistent identity and auto-discovery via local registry. Supports Unicast (1:1), Multicast (1:N), and Mesh (N:N).
 * @version 1.5.1113
 * @author 1D
 * @copyright © 2026 Hold'inCorp. All rights reserved.
 * @license Apache-2.0
 * @updated 2026.03.13
 */
export default class uRTC {
    /**
     * @constructor
     * @param {Object} config - Configuration object.
     * @param {string} [config.room] - Room identifier for peering.
     * @param {Function} [config.onMessage] - Callback triggered on data reception.
     * @param {Function} [config.onStatusChange] - Callback triggered on network topology change.
     */
    constructor(config = {}) {
        /** @private @type {string} Room identifier */
        const defaultRoom = (window.Ø1D && Ø1D.alias) ? `${Ø1D.alias}_room` : 'default_uRTC_room';
        
        this.room = config.room || defaultRoom;
        
        /** @public @type {string} Unique Persistent Peer ID */
        this.userId = this._getPersistentId();
        
        /** @private @type {Object.<string, Peer.DataConnection>} Active peer connections map */
        this.peers = {}; 
        
        /** @private @type {string} Storage key for auto-discovery registry */
        this.storageKey = `uRTC_mesh_${this.room}`;
        
        /** @public @type {Function} Message handler */
        this.onMessage = config.onMessage || (() => {});
        
        /** @public @type {Function} Status handler */
        this.onStatusChange = config.onStatusChange || (() => {});
        
        // Asynchronous initialization
        this._loadDependency().then(() => this._initPeer());
    }

    /**
     * Dynamically loads PeerJS library if not present in window.
     * @private
     * @returns {Promise<void>}
     */
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

    /**
     * Initializes the PeerJS instance and sets up global event listeners.
     * @private
     */
    _initPeer() {
        this.instance = new Peer(this.userId, {
            host: "0.peerjs.com", 
            port: 443, 
            secure: true,
            config: { 
                "iceServers": [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:stun1.l.google.com:19302" }
                ] 
            }
        });

        this.instance.on("open", () => {
            // Immediate initial discovery
            this._discoverAndMesh();
            
            // Set 5s interval for mesh responsiveness
            setInterval(() => this._discoverAndMesh(), 5000);

            // Listen to storage changes to react to new tabs/peers instantly
            window.addEventListener("storage", (e) => {
                if (e.key === this.storageKey) this._discoverAndMesh();
            });
            
            this.onStatusChange(this.getStats());
        });

        this.instance.on("connection", (conn) => this._bindEvents(conn));
        this.instance.on("error", (err) => this._handleError(err));
    }

    /**
     * Discovery logic: syncs local registry and initiates handshakes.
     * Implements a "Smallest-ID-calls-Largest-ID" strategy to prevent race conditions.
     * @private
     */
    _discoverAndMesh() {
        let registry = LocalBS.get(this.storageKey) || {};
        const now = Date.now();
        
        // Register current node
        registry[this.userId] = now;
        
        // Clean ghost entries (idle > 15s)
        for (let id in registry) { 
            if (now - registry[id] > 15000) delete registry[id]; 
        }
        LocalBS.set(this.storageKey, registry);

        // Attempt handshakes
        Object.keys(registry).forEach(targetId => {
            if (targetId !== this.userId && !this.peers[targetId]) {
                // Handshake strategy: Lower ID calls Higher ID
                if (this.userId < targetId) {
                    this.connect(targetId);
                }
            }
        });
    }

    /**
     * Initiates a manual connection to a specific peer.
     * @public
     * @param {string} targetId - The remote Peer ID.
     */
    connect(targetId) {
        if (this.peers[targetId] || targetId === this.userId) return;
        const conn = this.instance.connect(targetId, { reliable: true });
        this._bindEvents(conn);
    }

    /**
     * Binds lifecycle events to a data connection.
     * @private
     * @param {Peer.DataConnection} conn 
     */
    _bindEvents(conn) {
        conn.on("open", () => {
            this.peers[conn.peer] = conn;
            this.onStatusChange(this.getStats());
        });
        conn.on("data", (data) => {
            // Filtering: Ignore if message is directed to someone else
            if (data.target && data.target !== this.userId) return; 
            this.onMessage(data, conn.peer);
        });
        conn.on("close", () => {
            delete this.peers[conn.peer];
            this.onStatusChange(this.getStats());
        });
    }

    /**
     * Broadcasts or sends data to a specific peer.
     * @public
     * @param {any} payload - The content to send.
     * @param {string|null} [targetId=null] - Destination ID. If null, broadcasts to all.
     * @param {string} [type="text"] - Message type descriptor.
     * @returns {Object} The generated envelope.
     */
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

    /**
     * Retrieves or generates a persistent Unique Identifier.
     * @private
     * @returns {string}
     */
    _getPersistentId() {
        let id = LocalBS.get("uRTC_guid");
        if (!id) {
            id = "u_" + Math.random().toString(36).substring(2, 9);
            LocalBS.set("uRTC_guid", id);
        }
        return id;
    }

    /**
     * Internal error handler for PeerJS events.
     * @private
     * @param {Error} err 
     */
    _handleError(err) {
        if (err.type === "peer-unavailable") {
            const ghostId = err.message.split(" ").pop();
            this._unregister(ghostId);
        }
    }

    /**
     * Removes a ghost ID from the local registry.
     * @private
     * @param {string} id 
     */
    _unregister(id) {
        let db = LocalBS.get(this.storageKey) || {};
        delete db[id];
        LocalBS.set(this.storageKey, db);
    }

    /**
     * Returns the current network state and local ID.
     * @public
     * @returns {Object} { myId, activeConnections, peers }
     */
    getStats() {
        return { 
            myId: this.userId, 
            activeConnections: Object.keys(this.peers).length, 
            peers: Object.keys(this.peers) 
        };
    }
}
