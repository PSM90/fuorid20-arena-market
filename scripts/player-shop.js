/**
 * Fuori D20: Arena Market
 * Player Shop - Shopping interface for players
 */

import { MODULE_ID, AVAILABILITY_TYPES, getShopConfig, isShopOpen, getCurrencyName, getReservations } from './config.js';
import { MarketStore } from './market-store.js';
import { SocketHandler, SOCKET_EVENTS } from './socket-handler.js';

/**
 * PlayerShop - Player interface for browsing and purchasing items
 */
export class PlayerShop extends Application {
    static _instance = null;

    constructor(options = {}) {
        super(options);
        this._selectedActorId = null;
        this._activeCategory = null;
        this._setupSocketListeners();
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'arena-market-player',
            title: game.i18n.localize('ARENA_MARKET.PlayerTitle'),
            template: `modules/${MODULE_ID}/templates/player-shop.hbs`,
            classes: ['arena-market', 'arena-market-player'],
            width: 700,
            height: 600,
            resizable: true
        });
    }

    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!this._instance) {
            this._instance = new PlayerShop();
        }
        return this._instance;
    }

    /**
     * Open the player shop
     */
    static open() {
        return this.getInstance().render(true);
    }

    /**
     * Setup socket listeners for real-time updates
     */
    _setupSocketListeners() {
        SocketHandler.on(SOCKET_EVENTS.SHOP_STATE_CHANGED, (payload) => {
            if (this.rendered) {
                this.render(false);
            }
        });

        SocketHandler.on(SOCKET_EVENTS.ITEM_PURCHASED, (payload) => {
            if (this.rendered) {
                this.render(false);
            }
        });

        SocketHandler.on(SOCKET_EVENTS.CONFIG_UPDATED, () => {
            if (this.rendered) {
                this.render(false);
            }
        });

        SocketHandler.on(SOCKET_EVENTS.REFRESH_UI, () => {
            if (this.rendered) {
                this.render(false);
            }
        });
    }

    /**
     * Get data for template rendering
     */
    async getData() {
        const shopOpen = isShopOpen();
        const currencyName = getCurrencyName();
        const config = getShopConfig();
        const playerActors = MarketStore.getPlayerActors();

        // Auto-select first actor if none selected
        if (!this._selectedActorId && playerActors.length > 0) {
            this._selectedActorId = playerActors[0].id;
        }

        const selectedActor = game.actors.get(this._selectedActorId);
        const playerGold = selectedActor?.system?.currency?.gp || 0;

        // Build categories (one per compendium)
        const categories = [];
        for (const compId of config.compendiums || []) {
            const pack = game.packs.get(compId);
            if (!pack) continue;

            const items = await pack.getDocuments();
            const categoryItems = [];

            for (const item of items) {
                const itemConfig = config.items?.[item.uuid];
                if (!itemConfig) continue; // Skip unconfigured items

                const price = MarketStore.getItemPrice(item, itemConfig);
                const stock = MarketStore.getAvailableStock(item.uuid);
                const canAfford = playerGold >= price;
                const isSoldOut = itemConfig.availability === AVAILABILITY_TYPES.LIMITED && stock <= 0;

                // Check if player already reserved this item
                const reservations = getReservations();
                const hasReserved = reservations[item.uuid]?.some(r => r.actorId === this._selectedActorId);

                categoryItems.push({
                    uuid: item.uuid,
                    name: item.name,
                    img: item.img,
                    type: item.type,
                    description: item.system?.description?.value || '',
                    price,
                    availability: itemConfig.availability,
                    stock,
                    isUnlimited: itemConfig.availability === AVAILABILITY_TYPES.UNLIMITED,
                    isLimited: itemConfig.availability === AVAILABILITY_TYPES.LIMITED,
                    isReservation: itemConfig.availability === AVAILABILITY_TYPES.RESERVATION,
                    canAfford,
                    isSoldOut,
                    hasReserved,
                    disabled: !shopOpen || isSoldOut || (!canAfford && itemConfig.availability !== AVAILABILITY_TYPES.RESERVATION) || hasReserved
                });
            }

            if (categoryItems.length > 0) {
                categories.push({
                    id: compId,
                    name: pack.metadata.label,
                    items: categoryItems,
                    active: this._activeCategory === compId || (!this._activeCategory && categories.length === 0)
                });
            }
        }

        // Set active category if not set
        if (!this._activeCategory && categories.length > 0) {
            this._activeCategory = categories[0].id;
            categories[0].active = true;
        }

        return {
            shopOpen,
            currencyName,
            playerActors: playerActors.map(a => ({
                id: a.id,
                name: a.name,
                img: a.img,
                selected: a.id === this._selectedActorId
            })),
            selectedActor: selectedActor ? {
                id: selectedActor.id,
                name: selectedActor.name,
                img: selectedActor.img
            } : null,
            playerGold,
            categories,
            hasCategories: categories.length > 0,
            isGM: game.user.isGM
        };
    }

    /**
     * Activate event listeners
     */
    activateListeners(html) {
        super.activateListeners(html);

        // Actor selection
        html.find('.actor-select').on('change', this._onActorSelect.bind(this));

        // Category tabs
        html.find('.category-tab').on('click', this._onCategoryClick.bind(this));

        // Item click for details
        html.find('.shop-item').on('click', this._onItemClick.bind(this));

        // Buy button
        html.find('.buy-btn').on('click', this._onBuyClick.bind(this));

        // Reserve button
        html.find('.reserve-btn').on('click', this._onReserveClick.bind(this));
    }

    /**
     * Handle actor selection change
     */
    _onActorSelect(event) {
        this._selectedActorId = event.currentTarget.value;
        this.render(false);
    }

    /**
     * Handle category tab click
     */
    _onCategoryClick(event) {
        event.preventDefault();
        this._activeCategory = event.currentTarget.dataset.category;
        this.render(false);
    }

    /**
     * Handle item click - show details
     */
    async _onItemClick(event) {
        // Don't trigger if clicking on buttons
        if (event.target.closest('button')) return;

        const uuid = event.currentTarget.dataset.uuid;
        const item = await fromUuid(uuid);
        if (!item) return;

        const config = getShopConfig();
        const itemConfig = config.items?.[uuid];
        const price = MarketStore.getItemPrice(item, itemConfig);
        const currencyName = getCurrencyName();

        // Render item details dialog
        const content = await renderTemplate(`modules/${MODULE_ID}/templates/item-details.hbs`, {
            item: {
                uuid: item.uuid,
                name: item.name,
                img: item.img,
                type: item.type,
                description: item.system?.description?.value || '',
                price,
                currencyName,
                availability: itemConfig?.availability,
                stock: MarketStore.getAvailableStock(uuid),
                isUnlimited: itemConfig?.availability === AVAILABILITY_TYPES.UNLIMITED,
                isLimited: itemConfig?.availability === AVAILABILITY_TYPES.LIMITED,
                isReservation: itemConfig?.availability === AVAILABILITY_TYPES.RESERVATION,
                // D&D 5e specific properties
                rarity: item.system?.rarity,
                weight: item.system?.weight?.value,
                attunement: item.system?.attunement,
                properties: item.system?.properties
            }
        });

        new Dialog({
            title: item.name,
            content,
            buttons: {},
            render: (html) => {
                html.find('.buy-btn').on('click', () => this._purchaseItem(uuid));
                html.find('.reserve-btn').on('click', () => this._reserveItem(uuid));
            }
        }, {
            classes: ['arena-market', 'arena-market-details'],
            width: 500
        }).render(true);
    }

    /**
     * Handle buy button click
     */
    async _onBuyClick(event) {
        event.preventDefault();
        event.stopPropagation();
        const uuid = event.currentTarget.dataset.uuid;
        await this._purchaseItem(uuid);
    }

    /**
     * Handle reserve button click
     */
    async _onReserveClick(event) {
        event.preventDefault();
        event.stopPropagation();
        const uuid = event.currentTarget.dataset.uuid;
        await this._reserveItem(uuid);
    }

    /**
     * Purchase an item
     */
    async _purchaseItem(uuid) {
        if (!this._selectedActorId) {
            ui.notifications.warn(game.i18n.localize('ARENA_MARKET.Notifications.NoCharacterSelected'));
            return;
        }

        if (!isShopOpen()) {
            ui.notifications.warn(game.i18n.localize('ARENA_MARKET.Notifications.ShopClosed'));
            return;
        }

        // Request purchase through GM
        if (game.user.isGM) {
            const result = await MarketStore.purchaseItem(this._selectedActorId, uuid);
            if (result.success) {
                ui.notifications.info(result.message);
                SocketHandler.emitItemPurchased(uuid, result.newStock);
            } else {
                ui.notifications.warn(result.message);
            }
        } else {
            // Send request to GM via socket
            game.socket.emit(`module.${MODULE_ID}`, {
                action: 'purchaseRequest',
                actorId: this._selectedActorId,
                itemUuid: uuid
            });
        }

        this.render(false);
    }

    /**
     * Reserve an item
     */
    async _reserveItem(uuid) {
        if (!this._selectedActorId) {
            ui.notifications.warn(game.i18n.localize('ARENA_MARKET.Notifications.NoCharacterSelected'));
            return;
        }

        if (!isShopOpen()) {
            ui.notifications.warn(game.i18n.localize('ARENA_MARKET.Notifications.ShopClosed'));
            return;
        }

        // Request reservation through GM
        if (game.user.isGM) {
            const result = await MarketStore.reserveItem(this._selectedActorId, uuid);
            if (result.success) {
                ui.notifications.info(result.message);
                const actor = game.actors.get(this._selectedActorId);
                SocketHandler.emitItemReserved(uuid, actor?.name, game.user.name);
            } else {
                ui.notifications.warn(result.message);
            }
        } else {
            // Send request to GM via socket
            game.socket.emit(`module.${MODULE_ID}`, {
                action: 'reserveRequest',
                actorId: this._selectedActorId,
                itemUuid: uuid
            });
        }

        this.render(false);
    }
}
