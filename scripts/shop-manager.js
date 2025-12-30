/**
 * Fuori D20: Arena Market
 * Shop Manager - Admin configuration interface
 */

import { MODULE_ID, AVAILABILITY_TYPES, getShopConfig, setShopConfig, isShopOpen, toggleShop, getActivityLog, clearActivityLog, deleteActivityLogEntry, getReservations, getCurrencyName } from './config.js';
import { SocketHandler, SOCKET_EVENTS } from './socket-handler.js';

/**
 * ShopManager - Admin interface for configuring the shop
 */
export class ShopManager extends FormApplication {
    static _instance = null;

    constructor(options = {}) {
        super(options);
        this._selectedCompendiums = new Set();
        this._itemConfigs = {};
        this._activeTab = null;
        this._loadConfig();
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'arena-market-admin',
            title: game.i18n.localize('ARENA_MARKET.AdminTitle'),
            template: `modules/${MODULE_ID}/templates/admin-config.hbs`,
            classes: ['arena-market', 'arena-market-admin'],
            width: 1300,
            height: 700,
            resizable: true,
            tabs: [{
                navSelector: '.tabs-nav',
                contentSelector: '.tabs-content',
                initial: 'compendiums'
            }]
        });
    }

    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!this._instance) {
            this._instance = new ShopManager();
        }
        return this._instance;
    }

    /**
     * Open the admin interface
     */
    static open() {
        return this.getInstance().render(true);
    }

    /**
     * Load existing configuration
     */
    _loadConfig() {
        const config = getShopConfig();
        this._selectedCompendiums = new Set(config.compendiums || []);
        this._itemConfigs = foundry.utils.deepClone(config.items || {});
    }

    /**
     * Get data for template rendering
     */
    async getData() {
        const compendiums = this._getItemCompendiums();
        const shopOpen = isShopOpen();
        const activityLog = getActivityLog();
        const reservations = getReservations();
        const currencyName = getCurrencyName();

        // Get items for selected compendiums
        const categorizedItems = {};
        for (const compId of this._selectedCompendiums) {
            const pack = game.packs.get(compId);
            if (!pack) continue;

            const items = await pack.getDocuments();
            categorizedItems[compId] = {
                name: pack.metadata.label,
                packId: compId,
                items: items.map(item => ({
                    uuid: item.uuid,
                    name: item.name,
                    img: item.img,
                    type: item.type,
                    price: item.system?.price?.value || 0,
                    priceUnit: item.system?.price?.denomination || 'gp',
                    config: this._itemConfigs[item.uuid] || {
                        availability: AVAILABILITY_TYPES.UNLIMITED,
                        quantity: 1,
                        customPrice: null,
                        currentStock: null
                    }
                }))
            };
        }

        return {
            compendiums,
            selectedCompendiums: Array.from(this._selectedCompendiums),
            categorizedItems,
            shopOpen,
            activityLog: activityLog.slice(0, 50),
            reservations,
            currencyName,
            availabilityTypes: AVAILABILITY_TYPES,
            hasSelectedCompendiums: this._selectedCompendiums.size > 0
        };
    }

    /**
     * Get all Item-type compendiums
     */
    _getItemCompendiums() {
        return game.packs
            .filter(p => p.documentName === 'Item')
            .map(p => ({
                id: p.collection,
                label: p.metadata.label,
                package: p.metadata.packageName,
                selected: this._selectedCompendiums.has(p.collection)
            }));
    }

    /**
     * Activate event listeners
     */
    activateListeners(html) {
        super.activateListeners(html);

        // Tab switching
        html.find('.tab-item').on('click', this._onTabClick.bind(this));

        // Compendium selection
        html.find('.compendium-checkbox').on('change', this._onCompendiumToggle.bind(this));

        // Item configuration
        html.find('.item-availability').on('change', this._onAvailabilityChange.bind(this));
        html.find('.item-quantity').on('change', this._onQuantityChange.bind(this));
        html.find('.item-custom-price').on('change', this._onCustomPriceChange.bind(this));

        // Shop toggle
        html.find('.toggle-shop-btn').on('click', this._onToggleShop.bind(this));

        // Clear activity log
        html.find('.clear-log-btn').on('click', this._onClearLog.bind(this));

        // Delete individual log entry
        html.find('.delete-entry-btn').on('click', this._onDeleteEntry.bind(this));

        // Save button
        html.find('.save-config-btn').on('click', this._onSaveConfig.bind(this));
    }

    /**
     * Handle tab switching
     */
    _onTabClick(event) {
        event.preventDefault();
        const clickedTab = event.currentTarget;
        const tabName = clickedTab.dataset.tab;

        // Update tab navigation
        this.element.find('.tab-item').removeClass('active');
        clickedTab.classList.add('active');

        // Update tab content
        this.element.find('.tab-content').removeClass('active');
        this.element.find(`.tab-content[data-tab="${tabName}"]`).addClass('active');
    }

    /**
     * Handle compendium toggle
     */
    async _onCompendiumToggle(event) {
        const compId = event.currentTarget.dataset.compendium;
        const checked = event.currentTarget.checked;

        if (checked) {
            this._selectedCompendiums.add(compId);
        } else {
            this._selectedCompendiums.delete(compId);
        }

        this.render(false);
    }

    /**
     * Handle availability type change
     */
    _onAvailabilityChange(event) {
        const uuid = event.currentTarget.dataset.uuid;
        const value = event.currentTarget.value;

        if (!this._itemConfigs[uuid]) {
            this._itemConfigs[uuid] = {};
        }
        this._itemConfigs[uuid].availability = value;

        // Show/hide quantity field
        const row = event.currentTarget.closest('.item-row');
        const qtyField = row.querySelector('.item-quantity');
        if (qtyField) {
            qtyField.closest('.quantity-wrapper').style.display =
                value === AVAILABILITY_TYPES.UNLIMITED ? 'none' : 'flex';
        }
    }

    /**
     * Handle quantity change
     */
    _onQuantityChange(event) {
        const uuid = event.currentTarget.dataset.uuid;
        const value = parseInt(event.currentTarget.value) || 1;

        if (!this._itemConfigs[uuid]) {
            this._itemConfigs[uuid] = {};
        }
        this._itemConfigs[uuid].quantity = value;
        this._itemConfigs[uuid].currentStock = value;
    }

    /**
     * Handle custom price change
     */
    _onCustomPriceChange(event) {
        const uuid = event.currentTarget.dataset.uuid;
        const value = event.currentTarget.value.trim();

        if (!this._itemConfigs[uuid]) {
            this._itemConfigs[uuid] = {};
        }
        this._itemConfigs[uuid].customPrice = value === '' ? null : parseFloat(value);
    }

    /**
     * Handle shop toggle
     */
    async _onToggleShop(event) {
        event.preventDefault();
        const newState = await toggleShop();
        SocketHandler.emitShopStateChanged(newState);
        this.render(false);

        ui.notifications.info(
            newState ?
                game.i18n.localize('ARENA_MARKET.Shop.Open') :
                game.i18n.localize('ARENA_MARKET.Shop.Closed')
        );
    }

    /**
     * Handle clear log
     */
    async _onClearLog(event) {
        event.preventDefault();

        // Confirm before clearing
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('ARENA_MARKET.Activity.Clear'),
            content: '<p>Sei sicuro di voler cancellare tutto il log attività?</p>',
            yes: () => true,
            no: () => false
        });

        if (confirmed) {
            await clearActivityLog();
            this.render(false);
        }
    }

    /**
     * Handle delete individual log entry
     */
    async _onDeleteEntry(event) {
        event.preventDefault();
        const entryId = event.currentTarget.dataset.entryId;
        if (entryId) {
            await deleteActivityLogEntry(entryId);
            this.render(false);
        }
    }

    /**
     * Handle save configuration
     */
    async _onSaveConfig(event) {
        event.preventDefault();

        // Collect all item configs from form
        const form = this.element.find('form')[0];
        const formData = new FormData(form);

        // Build config object
        const config = {
            compendiums: Array.from(this._selectedCompendiums),
            items: {}
        };

        // Process each item
        for (const uuid of Object.keys(this._itemConfigs)) {
            const itemConfig = this._itemConfigs[uuid];
            config.items[uuid] = {
                availability: itemConfig.availability || AVAILABILITY_TYPES.UNLIMITED,
                quantity: itemConfig.quantity || 1,
                customPrice: itemConfig.customPrice,
                currentStock: itemConfig.currentStock ?? itemConfig.quantity ?? null
            };
        }

        await setShopConfig(config);
        SocketHandler.emitConfigUpdated();

        ui.notifications.info(game.i18n.localize('ARENA_MARKET.Notifications.ConfigSaved'));
        this.close();
    }

    /**
     * Form submission handler
     */
    async _updateObject(event, formData) {
        // Handled by _onSaveConfig
    }
}
