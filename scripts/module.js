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
    console.log(`${MODULE_ID} | getSceneControlButtons called`, controls);
    console.log(`${MODULE_ID} | controls type:`, typeof controls, Array.isArray(controls));

    // In Foundry v13, controls might be passed differently
    // Let's inspect what we get
    if (!controls) {
        console.warn(`${MODULE_ID} | controls is null/undefined`);
        return;
    }

    // Try to find token controls in various ways
    let tokenControls = null;

    if (Array.isArray(controls)) {
        // Standard array approach
        tokenControls = controls.find(c => c.name === 'token' || c.name === 'tokens');
        console.log(`${MODULE_ID} | Found in array:`, tokenControls);
    } else if (typeof controls === 'object') {
        // Object with named properties
        tokenControls = controls.token || controls.tokens;
        console.log(`${MODULE_ID} | Found in object:`, tokenControls);

        // If still not found, try to iterate
        if (!tokenControls) {
            for (const [key, value] of Object.entries(controls)) {
                console.log(`${MODULE_ID} | Control key: ${key}`, value);
                if (key === 'token' || key === 'tokens') {
                    tokenControls = value;
                    break;
                }
            }
        }
    }

    if (!tokenControls) {
        console.warn(`${MODULE_ID} | Could not find token controls, adding to first available`);
        // Try adding to the first control group
        if (Array.isArray(controls) && controls.length > 0) {
            tokenControls = controls[0];
        } else {
            return;
        }
    }

    // Define our tools
    const shopTool = {
        name: 'arena-market',
        title: 'Arena Market',
        icon: 'fas fa-store',
        button: true,
        visible: true,
        onClick: () => {
            console.log(`${MODULE_ID} | Shop button clicked`);
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
    };

    // Add tools based on structure
    if (tokenControls.tools) {
        if (Array.isArray(tokenControls.tools)) {
            tokenControls.tools.push(shopTool);
            console.log(`${MODULE_ID} | Added to tools array`);
        } else if (tokenControls.tools.set) {
            tokenControls.tools.set('arena-market', shopTool);
            console.log(`${MODULE_ID} | Added to tools Map`);
        } else {
            tokenControls.tools['arena-market'] = shopTool;
            console.log(`${MODULE_ID} | Added to tools object`);
        }
    } else {
        console.warn(`${MODULE_ID} | tokenControls.tools not found`);
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
