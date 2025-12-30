/**
 * Fuori D20: Arena Market
 * Main Module Entry Point
 */

import { MODULE_ID, MODULE_NAME, registerSettings, isShopOpen, getCurrencyName } from './config.js';
import { ShopManager } from './shop-manager.js';
import { PlayerShop } from './player-shop.js';
import { MarketStore } from './market-store.js';
import { SocketHandler, SOCKET_EVENTS } from './socket-handler.js';

/**
 * Module initialization
 */
Hooks.once('init', async () => {
    console.log(`${MODULE_ID} | Initializing Arena Market`);

    // Register module settings
    registerSettings();

    // Register Handlebars helpers
    registerHandlebarsHelpers();

    // Load templates
    await loadTemplates([
        `modules/${MODULE_ID}/templates/admin-config.hbs`,
        `modules/${MODULE_ID}/templates/player-shop.hbs`,
        `modules/${MODULE_ID}/templates/item-details.hbs`,
        `modules/${MODULE_ID}/templates/activity-log.hbs`
    ]);

    console.log(`${MODULE_ID} | Initialization complete`);
});

/**
 * Module ready
 */
Hooks.once('ready', async () => {
    console.log(`${MODULE_ID} | Module ready`);

    // Initialize socket handler
    SocketHandler.init();

    // Handle purchase/reserve requests from players (GM only)
    if (game.user.isGM) {
        game.socket.on(`module.${MODULE_ID}`, async (data) => {
            if (data.action === 'purchaseRequest') {
                const result = await MarketStore.purchaseItem(data.actorId, data.itemUuid);
                if (result.success) {
                    SocketHandler.emitItemPurchased(data.itemUuid, result.newStock);
                }
                // Notify the requesting player
                game.socket.emit(`module.${MODULE_ID}`, {
                    action: 'purchaseResult',
                    result,
                    targetUser: data.sender
                });
            }

            if (data.action === 'reserveRequest') {
                const result = await MarketStore.reserveItem(data.actorId, data.itemUuid);
                if (result.success) {
                    const actor = game.actors.get(data.actorId);
                    SocketHandler.emitItemReserved(data.itemUuid, actor?.name, 'Player');
                }
                // Notify the requesting player
                game.socket.emit(`module.${MODULE_ID}`, {
                    action: 'reserveResult',
                    result,
                    targetUser: data.sender
                });
            }
        });
    }

    // Handle results for players
    game.socket.on(`module.${MODULE_ID}`, async (data) => {
        if (data.targetUser === game.user.id) {
            if (data.action === 'purchaseResult' || data.action === 'reserveResult') {
                if (data.result.success) {
                    ui.notifications.info(data.result.message);
                } else {
                    ui.notifications.warn(data.result.message);
                }
                // Refresh player shop
                PlayerShop.getInstance().render(false);
            }
        }
    });

    // Expose API
    game.modules.get(MODULE_ID).api = {
        ShopManager,
        PlayerShop,
        MarketStore,
        SocketHandler,

        openAdminConfig: () => ShopManager.open(),
        openPlayerShop: () => PlayerShop.open(),
        isShopOpen: () => isShopOpen(),
        getCurrencyName: () => getCurrencyName()
    };

    console.log(`${MODULE_ID} | API exposed at game.modules.get('${MODULE_ID}').api`);
});

/**
 * Add controls to scene controls
 */
Hooks.on('getSceneControlButtons', (controls) => {
    // Foundry v13: controls is an array of control groups
    // We need to find the token controls group
    let tokenControls;

    // Check if controls is an array (v13+) or object
    if (Array.isArray(controls)) {
        tokenControls = controls.find(c => c.name === 'token');
    } else if (controls.tokens) {
        // Fallback for different structure
        tokenControls = controls.tokens;
    }

    if (!tokenControls) {
        console.warn(`${MODULE_ID} | Could not find token controls`);
        return;
    }

    // Ensure tools exists
    if (!tokenControls.tools) {
        tokenControls.tools = [];
    }

    // Check if tools is an array or Map
    if (Array.isArray(tokenControls.tools)) {
        tokenControls.tools.push({
            name: 'arena-market',
            title: game.i18n.localize('ARENA_MARKET.Title'),
            icon: 'fas fa-store',
            button: true,
            onClick: () => {
                if (game.user.isGM) {
                    ShopManager.open();
                } else {
                    if (isShopOpen()) {
                        PlayerShop.open();
                    } else {
                        ui.notifications.warn(game.i18n.localize('ARENA_MARKET.Shop.ClosedMessage'));
                    }
                }
            }
        });

        if (game.user.isGM) {
            tokenControls.tools.push({
                name: 'arena-market-preview',
                title: game.i18n.localize('ARENA_MARKET.PlayerTitle') + ' (Preview)',
                icon: 'fas fa-shopping-cart',
                button: true,
                onClick: () => PlayerShop.open()
            });
        }
    } else if (tokenControls.tools instanceof Map || typeof tokenControls.tools.set === 'function') {
        // Foundry v13 uses a Map for tools
        tokenControls.tools.set('arena-market', {
            name: 'arena-market',
            title: game.i18n.localize('ARENA_MARKET.Title'),
            icon: 'fas fa-store',
            button: true,
            onClick: () => {
                if (game.user.isGM) {
                    ShopManager.open();
                } else {
                    if (isShopOpen()) {
                        PlayerShop.open();
                    } else {
                        ui.notifications.warn(game.i18n.localize('ARENA_MARKET.Shop.ClosedMessage'));
                    }
                }
            }
        });

        if (game.user.isGM) {
            tokenControls.tools.set('arena-market-preview', {
                name: 'arena-market-preview',
                title: game.i18n.localize('ARENA_MARKET.PlayerTitle') + ' (Preview)',
                icon: 'fas fa-shopping-cart',
                button: true,
                onClick: () => PlayerShop.open()
            });
        }
    }
});

/**
 * Register Handlebars helpers
 */
function registerHandlebarsHelpers() {
    // Check equality
    Handlebars.registerHelper('arenaEq', function (a, b) {
        return a === b;
    });

    // Format currency
    Handlebars.registerHelper('arenaFormatCurrency', function (amount) {
        return new Intl.NumberFormat('it-IT').format(amount);
    });

    // Format date
    Handlebars.registerHelper('arenaFormatDate', function (dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    });

    // Localize with module prefix
    Handlebars.registerHelper('arenaLoc', function (key) {
        return game.i18n.localize(`ARENA_MARKET.${key}`);
    });

    // Truncate text
    Handlebars.registerHelper('arenaTruncate', function (text, length) {
        if (!text) return '';
        // Strip HTML
        const stripped = text.replace(/<[^>]*>/g, '');
        if (stripped.length <= length) return stripped;
        return stripped.substring(0, length) + '...';
    });

    // Check if value is in array
    Handlebars.registerHelper('arenaIncludes', function (array, value) {
        return Array.isArray(array) && array.includes(value);
    });
}

// Log module load
console.log(`${MODULE_ID} | Module script loaded`);
