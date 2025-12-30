/**
 * Fuori D20: Arena Market
 * Socket Handler - Real-time synchronization
 */

import { MODULE_ID } from './config.js';

/**
 * Socket event types
 */
export const SOCKET_EVENTS = {
    SHOP_STATE_CHANGED: 'shopStateChanged',
    ITEM_PURCHASED: 'itemPurchased',
    ITEM_RESERVED: 'itemReserved',
    CONFIG_UPDATED: 'configUpdated',
    REFRESH_UI: 'refreshUI'
};

/**
 * SocketHandler manages real-time communication between clients
 */
export class SocketHandler {
    static _callbacks = new Map();

    /**
     * Initialize socket handling
     */
    static init() {
        game.socket.on(`module.${MODULE_ID}`, (data) => {
            this._handleMessage(data);
        });
        console.log(`${MODULE_ID} | Socket handler initialized`);
    }

    /**
     * Handle incoming socket message
     * @param {Object} data - Socket message data
     */
    static _handleMessage(data) {
        const { event, payload } = data;
        const callbacks = this._callbacks.get(event) || [];

        for (const callback of callbacks) {
            try {
                callback(payload);
            } catch (err) {
                console.error(`${MODULE_ID} | Socket callback error:`, err);
            }
        }
    }

    /**
     * Register a callback for a socket event
     * @param {string} event - Event type
     * @param {Function} callback - Callback function
     */
    static on(event, callback) {
        if (!this._callbacks.has(event)) {
            this._callbacks.set(event, []);
        }
        this._callbacks.get(event).push(callback);
    }

    /**
     * Remove a callback for a socket event
     * @param {string} event - Event type
     * @param {Function} callback - Callback function to remove
     */
    static off(event, callback) {
        const callbacks = this._callbacks.get(event) || [];
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * Emit a socket event to all clients
     * @param {string} event - Event type
     * @param {Object} payload - Event data
     */
    static emit(event, payload = {}) {
        game.socket.emit(`module.${MODULE_ID}`, {
            event,
            payload,
            sender: game.user.id
        });

        // Also trigger local callbacks
        this._handleMessage({ event, payload });
    }

    /**
     * Notify all clients that shop state changed
     * @param {boolean} isOpen - New shop state
     */
    static emitShopStateChanged(isOpen) {
        this.emit(SOCKET_EVENTS.SHOP_STATE_CHANGED, { isOpen });
    }

    /**
     * Notify all clients that an item was purchased
     * @param {string} itemUuid - Item UUID
     * @param {number|null} newStock - New stock level (null for unlimited)
     */
    static emitItemPurchased(itemUuid, newStock) {
        this.emit(SOCKET_EVENTS.ITEM_PURCHASED, { itemUuid, newStock });
    }

    /**
     * Notify GM that an item was reserved
     * @param {string} itemUuid - Item UUID
     * @param {string} actorName - Actor name
     * @param {string} playerName - Player name
     */
    static emitItemReserved(itemUuid, actorName, playerName) {
        this.emit(SOCKET_EVENTS.ITEM_RESERVED, { itemUuid, actorName, playerName });
    }

    /**
     * Notify all clients to refresh their UI
     */
    static emitConfigUpdated() {
        this.emit(SOCKET_EVENTS.CONFIG_UPDATED, {});
    }

    /**
     * Request all clients to refresh their shop UI
     */
    static emitRefreshUI() {
        this.emit(SOCKET_EVENTS.REFRESH_UI, {});
    }
}
