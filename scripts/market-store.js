/**
 * Fuori D20: Arena Market
 * Market Store - Data persistence and transactions
 */

import { MODULE_ID, getShopConfig, setShopConfig, addActivityLog, getCurrencyName, addReservation, getReservations, AVAILABILITY_TYPES } from './config.js';

/**
 * MarketStore handles all data operations for the shop
 */
export class MarketStore {

    /**
     * Get item configuration from shop config
     * @param {string} itemUuid - The item's UUID
     * @returns {Object|null} Item configuration or null
     */
    static getItemConfig(itemUuid) {
        const config = getShopConfig();
        return config.items?.[itemUuid] || null;
    }

    /**
     * Get effective price for an item
     * @param {Item} item - The Foundry item
     * @param {Object} itemConfig - Item configuration from shop
     * @returns {number} Price in gold
     */
    static getItemPrice(item, itemConfig) {
        if (itemConfig?.customPrice !== null && itemConfig?.customPrice !== undefined && itemConfig?.customPrice !== '') {
            return Number(itemConfig.customPrice);
        }
        // Get price from D&D 5e item
        return item.system?.price?.value || 0;
    }

    /**
     * Get available stock for an item
     * @param {string} itemUuid - The item's UUID
     * @returns {number|null} Available stock, null for unlimited
     */
    static getAvailableStock(itemUuid) {
        const config = getShopConfig();
        const itemConfig = config.items?.[itemUuid];

        if (!itemConfig) return null;
        if (itemConfig.availability === AVAILABILITY_TYPES.UNLIMITED) return null;

        return itemConfig.currentStock ?? itemConfig.quantity ?? 0;
    }

    /**
     * Check if player can afford item
     * @param {Actor} actor - The player's actor
     * @param {number} price - Item price in gold
     * @returns {boolean} True if can afford
     */
    static canAfford(actor, price) {
        const gold = actor.system?.currency?.gp || 0;
        return gold >= price;
    }

    /**
     * Purchase an item
     * @param {string} actorId - The actor's ID
     * @param {string} itemUuid - The item's UUID
     * @returns {Object} Result with success status and message
     */
    static async purchaseItem(actorId, itemUuid) {
        const actor = game.actors.get(actorId);
        if (!actor) {
            return { success: false, message: 'Actor not found' };
        }

        const item = await fromUuid(itemUuid);
        if (!item) {
            return { success: false, message: 'Item not found' };
        }

        const config = getShopConfig();
        const itemConfig = config.items?.[itemUuid];

        if (!itemConfig) {
            return { success: false, message: 'Item not configured in shop' };
        }

        // Check stock for limited items
        if (itemConfig.availability === AVAILABILITY_TYPES.LIMITED) {
            if ((itemConfig.currentStock ?? itemConfig.quantity) <= 0) {
                return {
                    success: false,
                    message: game.i18n.localize('ARENA_MARKET.Notifications.ItemSoldOut')
                };
            }
        }

        // Get price
        const price = this.getItemPrice(item, itemConfig);

        // Check if can afford
        if (!this.canAfford(actor, price)) {
            return {
                success: false,
                message: game.i18n.format('ARENA_MARKET.Notifications.NotEnoughGold', {
                    currency: getCurrencyName()
                })
            };
        }

        // Deduct gold
        const currentGold = actor.system.currency.gp;
        await actor.update({
            'system.currency.gp': currentGold - price
        });

        // Add item to actor's inventory
        const itemData = item.toObject();
        delete itemData._id;
        await actor.createEmbeddedDocuments('Item', [itemData]);

        // Update stock for limited items
        if (itemConfig.availability === AVAILABILITY_TYPES.LIMITED) {
            const newStock = (itemConfig.currentStock ?? itemConfig.quantity) - 1;
            config.items[itemUuid].currentStock = newStock;
            await setShopConfig(config);
        }

        // Log activity
        await addActivityLog({
            type: 'purchase',
            actorId: actor.id,
            actorName: actor.name,
            playerName: game.users.get(actor.ownership ?
                Object.keys(actor.ownership).find(id => actor.ownership[id] === 3 && id !== 'default') :
                null)?.name || 'Unknown',
            itemUuid,
            itemName: item.name,
            price,
            currency: getCurrencyName()
        });

        // Play purchase sound effect
        AudioHelper.play({
            src: 'sounds/coins.ogg',
            volume: 0.5,
            autoplay: true,
            loop: false
        }, true);

        return {
            success: true,
            message: game.i18n.format('ARENA_MARKET.Notifications.PurchaseSuccess', {
                item: item.name,
                price,
                currency: getCurrencyName()
            }),
            newStock: itemConfig.availability === AVAILABILITY_TYPES.LIMITED ?
                config.items[itemUuid].currentStock : null
        };
    }

    /**
     * Reserve an item
     * @param {string} actorId - The actor's ID  
     * @param {string} itemUuid - The item's UUID
     * @returns {Object} Result with success status and message
     */
    static async reserveItem(actorId, itemUuid) {
        const actor = game.actors.get(actorId);
        if (!actor) {
            return { success: false, message: 'Actor not found' };
        }

        const item = await fromUuid(itemUuid);
        if (!item) {
            return { success: false, message: 'Item not found' };
        }

        const config = getShopConfig();
        const itemConfig = config.items?.[itemUuid];

        if (!itemConfig || itemConfig.availability !== AVAILABILITY_TYPES.RESERVATION) {
            return { success: false, message: 'Item is not available for reservation' };
        }

        // Check if already reserved by this actor
        const reservations = getReservations();
        const existing = reservations[itemUuid]?.find(r => r.actorId === actorId);
        if (existing) {
            return { success: false, message: 'Hai già prenotato questo oggetto!' };
        }

        // Get player name
        const playerName = game.users.get(
            Object.keys(actor.ownership || {}).find(id =>
                actor.ownership[id] === 3 && id !== 'default'
            )
        )?.name || 'Unknown';

        // Add reservation
        await addReservation(itemUuid, actorId, actor.name, playerName);

        // Log activity
        await addActivityLog({
            type: 'reservation',
            actorId: actor.id,
            actorName: actor.name,
            playerName,
            itemUuid,
            itemName: item.name
        });

        return {
            success: true,
            message: game.i18n.format('ARENA_MARKET.Notifications.ReservationSuccess', {
                item: item.name
            })
        };
    }

    /**
     * Update item stock (GM only)
     * @param {string} itemUuid - The item's UUID
     * @param {number} newStock - New stock value
     */
    static async updateStock(itemUuid, newStock) {
        const config = getShopConfig();
        if (config.items[itemUuid]) {
            config.items[itemUuid].currentStock = newStock;
            await setShopConfig(config);
        }
    }

    /**
     * Get all actors the current user can control
     * @returns {Actor[]} Array of actors
     */
    static getPlayerActors() {
        return game.actors.filter(actor => {
            // Must be a character
            if (actor.type !== 'character') return false;
            // Must have owner permission
            return actor.testUserPermission(game.user, 'OWNER');
        });
    }
}
