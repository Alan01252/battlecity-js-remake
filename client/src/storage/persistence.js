const CITY_STORAGE_KEY = 'battlecity:cities';
const INVENTORY_STORAGE_KEY = 'battlecity:inventory';

const hasStorage = () => typeof window !== 'undefined' && window.localStorage;

const parseJson = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        console.warn('Failed to parse stored state', error);
        return fallback;
    }
};

const saveJson = (key, value) => {
    if (!hasStorage()) {
        return;
    }
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn('Failed to persist state', error);
    }
};

const loadCityState = () => {
    if (!hasStorage()) {
        return {};
    }
    return parseJson(window.localStorage.getItem(CITY_STORAGE_KEY), {});
};

const loadInventoryState = () => {
    if (!hasStorage()) {
        return [];
    }
    return parseJson(window.localStorage.getItem(INVENTORY_STORAGE_KEY), []);
};

const capturePlayerInventory = (game) => {
    if (!game?.iconFactory || !game.player) {
        return [];
    }
    const inventory = [];
    let icon = game.iconFactory.getHead();
    while (icon) {
        if (icon.owner === game.player.id) {
            inventory.push({
                type: icon.type,
                selected: !!icon.selected,
            });
        }
        icon = icon.next;
    }
    return inventory;
};

let pendingInventory = [];
let inventoryRestored = false;

const restoreInventoryIfNeeded = (game) => {
    if (inventoryRestored || !game?.player || game.player.id < 0) {
        return;
    }
    if (!pendingInventory || pendingInventory.length === 0) {
        inventoryRestored = true;
        return;
    }

    const existingOwnedIcons = [];
    let node = game.iconFactory?.getHead();
    while (node) {
        if (node.owner === game.player.id) {
            existingOwnedIcons.push(node);
        }
        node = node.next;
    }
    if (existingOwnedIcons.length > 0) {
        // Already restored elsewhere; avoid duplicating.
        pendingInventory = [];
        inventoryRestored = true;
        return;
    }

    pendingInventory.forEach((entry, index) => {
        const icon = game.iconFactory?.newIcon(game.player.id, game.player.offset.x, game.player.offset.y, entry.type);
        if (icon) {
            icon.selected = !!entry.selected && pendingInventory.findIndex((item) => item.selected) === index;
        }
    });
    pendingInventory = [];
    inventoryRestored = true;
    game.forceDraw = true;
    saveInventory(game);
};

export const initPersistence = (game) => {
    if (!game) {
        return;
    }

    const storedCities = loadCityState();
    game.cities.forEach((city, index) => {
        const savedCity = storedCities[city.id ?? index];
        if (savedCity && city.canBuild) {
            Object.keys(city.canBuild).forEach((key) => {
                if (savedCity.canBuild && savedCity.canBuild[key] !== undefined) {
                    city.canBuild[key] = savedCity.canBuild[key];
                }
            });
        }
    });

    pendingInventory = loadInventoryState();
    inventoryRestored = false;

    const ensureInventory = () => restoreInventoryIfNeeded(game);
    if (game.socketListener) {
        game.socketListener.on('connected', ensureInventory);
    }

    game.persistence = game.persistence || {};
    game.persistence.saveCityState = (cityId) => saveCityState(game, cityId);
    game.persistence.saveInventory = () => saveInventory(game);
    game.persistence.restoreInventory = ensureInventory;

    // Attempt restoration immediately in case we're already connected.
    ensureInventory();
};

export const saveCityState = (game, cityId) => {
    if (!hasStorage() || !game?.cities || cityId === undefined || cityId === null) {
        return;
    }
    const city = game.cities[cityId];
    if (!city || !city.canBuild) {
        return;
    }
    const stored = loadCityState();
    stored[city.id ?? cityId] = {
        canBuild: { ...city.canBuild },
    };
    saveJson(CITY_STORAGE_KEY, stored);
};

export const saveInventory = (game) => {
    if (!hasStorage() || !game?.player || game.player.id < 0) {
        return;
    }
    const inventory = capturePlayerInventory(game);
    saveJson(INVENTORY_STORAGE_KEY, inventory);
};
