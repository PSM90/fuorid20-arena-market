/**
 * Fuori D20: Arena Market
 * Configuration and Settings
 */

export const MODULE_ID = 'fuorid20-arena-market';
export const MODULE_NAME = 'Arena Market';

/**
 * Availability types for shop items
 */
export const AVAILABILITY_TYPES = {
    UNLIMITED: 'unlimited',
    LIMITED: 'limited',
    RESERVATION: 'reservation'
};

/**
 * Register all module settings
 */
export function registerSettings() {
    // Currency display name
    game.settings.register(MODULE_ID, 'currencyName', {
        name: game.i18n.localize('ARENA_MARKET.Settings.CurrencyName.Name'),
        hint: game.i18n.localize('ARENA_MARKET.Settings.CurrencyName.Hint'),
        scope: 'world',
        config: true,
        type: String,
        default: 'Ori'
    });

    // Shop open/closed state
    game.settings.register(MODULE_ID, 'shopOpen', {
        name: game.i18n.localize('ARENA_MARKET.Settings.ShopOpen.Name'),
        hint: game.i18n.localize('ARENA_MARKET.Settings.ShopOpen.Hint'),
        scope: 'world',
        config: false,
        type: Boolean,
        default: false
    });

    // Shop configuration (selected compendiums, items, prices, quantities)
    game.settings.register(MODULE_ID, 'shopConfig', {
        scope: 'world',
        config: false,
        type: Object,
        default: {
            compendiums: [],  // Array of compendium IDs
            items: {}         // itemUuid -> { availability, quantity, customPrice, currentStock }
        }
    });

    // Activity log
    game.settings.register(MODULE_ID, 'activityLog', {
        scope: 'world',
        config: false,
        type: Array,
        default: []
    });

    // Reservations
    game.settings.register(MODULE_ID, 'reservations', {
        scope: 'world',
        config: false,
        type: Object,
        default: {}  // itemUuid -> [{ actorId, actorName, playerName, timestamp }]
    });
}

/**
 * Get currency display name
 */
export function getCurrencyName() {
    return game.settings.get(MODULE_ID, 'currencyName');
}

/**
 * Check if shop is open
 */
export function isShopOpen() {
    return game.settings.get(MODULE_ID, 'shopOpen');
}

/**
 * Toggle shop state
 */
export async function toggleShop() {
    const currentState = isShopOpen();
    await game.settings.set(MODULE_ID, 'shopOpen', !currentState);
    return !currentState;
}

/**
 * Get shop configuration
 */
export function getShopConfig() {
    return game.settings.get(MODULE_ID, 'shopConfig');
}

/**
 * Set shop configuration
 */
export async function setShopConfig(config) {
    await game.settings.set(MODULE_ID, 'shopConfig', config);
}

/**
 * Get activity log
 */
export function getActivityLog() {
    return game.settings.get(MODULE_ID, 'activityLog');
}

/**
 * Add entry to activity log
 */
export async function addActivityLog(entry) {
    const log = getActivityLog();
    log.unshift({
        ...entry,
        id: foundry.utils.randomID(),
        timestamp: new Date().toISOString()
    });
    // Keep only last 500 entries (persistent log)
    if (log.length > 500) log.pop();
    await game.settings.set(MODULE_ID, 'activityLog', log);
}

/**
 * Delete a specific entry from activity log
 */
export async function deleteActivityLogEntry(entryId) {
    const log = getActivityLog();
    const index = log.findIndex(entry => entry.id === entryId);
    if (index > -1) {
        log.splice(index, 1);
        await game.settings.set(MODULE_ID, 'activityLog', log);
    }
}

/**
 * Clear activity log
 */
export async function clearActivityLog() {
    await game.settings.set(MODULE_ID, 'activityLog', []);
}

/**
 * Get reservations
 */
export function getReservations() {
    return game.settings.get(MODULE_ID, 'reservations');
}

/**
 * Add reservation
 */
export async function addReservation(itemUuid, actorId, actorName, playerName) {
    const reservations = getReservations();
    if (!reservations[itemUuid]) {
        reservations[itemUuid] = [];
    }
    reservations[itemUuid].push({
        actorId,
        actorName,
        playerName,
        timestamp: new Date().toISOString()
    });
    await game.settings.set(MODULE_ID, 'reservations', reservations);
}

/**
 * Clear reservations for an item
 */
export async function clearItemReservations(itemUuid) {
    const reservations = getReservations();
    delete reservations[itemUuid];
    await game.settings.set(MODULE_ID, 'reservations', reservations);
}
