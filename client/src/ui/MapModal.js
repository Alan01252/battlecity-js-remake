import {
    MAP_SQUARE_LAVA,
    MAP_SQUARE_ROCK,
    MAP_SQUARE_BUILDING,
    BUILD_TREE_CONFIG,
    BUILDING_COMMAND_CENTER
} from '../constants';
import { getCityDisplayName } from '../utils/citySpawns';

const DEFAULT_SCALE = 2;
const MAX_SCALE = 4;
const CITY_MARKER_COLOR = '#4da3ff';
const CITY_MARKER_OUTLINE = 'rgba(4, 12, 24, 0.85)';

const TERRAIN_LEGEND = [
    { id: 'ground', label: 'Grassland & Plains', color: '#27421f' },
    { id: 'rock', label: 'Mountain Ridge', color: '#8d99a6' },
    { id: 'lava', label: 'Lava Field', color: '#d35400' },
    { id: 'building', label: 'Constructed Buildings', color: '#f6d743' }
];

const STRUCTURE_CATEGORY_DEFINITIONS = [
    { id: 'research', label: 'Research Centers', color: '#f7b538', marker: 'structure', defaultFootprint: 3 },
    { id: 'factory', label: 'Factories', color: '#ff6b6b', marker: 'structure', defaultFootprint: 3 },
    { id: 'hospital', label: 'Hospitals', color: '#9b6ef3', marker: 'structure', defaultFootprint: 3 },
    { id: 'housing', label: 'Housing', color: '#6fcf97', marker: 'structure', defaultFootprint: 1 },
    { id: 'support', label: 'Support & Other', color: '#5ad1ff', marker: 'structure', defaultFootprint: 3 },
    { id: 'command', label: 'City Command Center', color: CITY_MARKER_COLOR, marker: 'structure', defaultFootprint: 3 }
];

const LEGEND_ENTRIES = [...TERRAIN_LEGEND, ...STRUCTURE_CATEGORY_DEFINITIONS];

const clampScale = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 1) {
        return DEFAULT_SCALE;
    }
    return Math.min(MAX_SCALE, Math.max(1, Math.round(numeric)));
};

const hexToRgba = (hex, alpha = 255) => {
    if (typeof hex !== 'string') {
        return [0, 0, 0, alpha];
    }
    let normalized = hex.trim();
    if (normalized.startsWith('#')) {
        normalized = normalized.slice(1);
    }
    if (normalized.length === 3) {
        normalized = normalized
            .split('')
            .map((char) => `${char}${char}`)
            .join('');
    }
    if (normalized.length !== 6) {
        return [0, 0, 0, alpha];
    }
    const value = parseInt(normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return [r, g, b, alpha];
};

const TERRAIN_PALETTE = TERRAIN_LEGEND.reduce((acc, entry) => {
    acc[entry.id] = hexToRgba(entry.color);
    return acc;
}, {});

const STRUCTURE_CATEGORY_LOOKUP = STRUCTURE_CATEGORY_DEFINITIONS.reduce((acc, entry) => {
    acc[entry.id] = entry;
    return acc;
}, {});

const STRUCTURE_CATEGORY_ORDER = STRUCTURE_CATEGORY_DEFINITIONS.reduce((acc, entry, index) => {
    acc[entry.id] = index;
    return acc;
}, {});

const BUILDING_LABEL_LOOKUP = BUILD_TREE_CONFIG.reduce((acc, entry) => {
    const typeValue = Number(entry.type);
    if (Number.isFinite(typeValue) && entry.label) {
        acc[typeValue] = entry.label;
    }
    return acc;
}, {});

const DEFAULT_STRUCTURE_OUTLINE = 'rgba(4, 12, 24, 0.82)';

class MapModal {
    constructor(game, options = {}) {
        this.game = game;
        this.scale = clampScale(options.scale);
        this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
        this.overlay = null;
        this.panel = null;
        this.canvas = null;
        this.legendContainer = null;
        this.cityList = null;
        this.structureList = null;
        this.statusLabel = null;
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.palette = {
            ground: TERRAIN_PALETTE.ground,
            rock: TERRAIN_PALETTE.rock,
            lava: TERRAIN_PALETTE.lava,
            building: TERRAIN_PALETTE.building
        };
        this.ensureStyles();
        this.buildOverlay();
        this.open();
    }

    ensureStyles() {
        if (typeof document === 'undefined') {
            return;
        }
        if (document.getElementById('battlecity-map-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'battlecity-map-styles';
        style.textContent = `
            .battlecity-map-overlay {
                position: fixed;
                inset: 0;
                background: rgba(2, 6, 12, 0.82);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 18000;
                padding: 24px;
                pointer-events: auto;
            }
            .battlecity-map-panel {
                width: min(960px, 100%);
                max-height: calc(100vh - 48px);
                overflow-y: auto;
                background: rgba(8, 10, 18, 0.96);
                border: 1px solid rgba(145, 196, 255, 0.35);
                box-shadow: 0 28px 56px rgba(0, 0, 0, 0.65);
                border-radius: 20px;
                padding: 32px 36px;
                color: #f1f5ff;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                display: flex;
                flex-direction: column;
                gap: 22px;
                position: relative;
            }
            .battlecity-map-close {
                position: absolute;
                top: 14px;
                right: 14px;
                border: none;
                background: rgba(255, 255, 255, 0.08);
                color: #f1f5ff;
                font-size: 14px;
                padding: 6px 14px;
                border-radius: 999px;
                cursor: pointer;
                transition: background 0.2s ease;
            }
            .battlecity-map-close:hover {
                background: rgba(255, 255, 255, 0.18);
            }
            .battlecity-map-heading {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                letter-spacing: 0.4px;
                text-transform: uppercase;
            }
            .battlecity-map-description {
                margin: 0;
                font-size: 14px;
                line-height: 1.55;
                color: rgba(221, 230, 255, 0.85);
            }
            .battlecity-map-grid {
                display: flex;
                flex-direction: column;
                gap: 24px;
            }
            @media (min-width: 960px) {
                .battlecity-map-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
                    align-items: start;
                    gap: 28px;
                }
            }
            .battlecity-map-canvas-wrapper {
                display: flex;
                flex-direction: column;
                gap: 12px;
                align-items: center;
            }
            .battlecity-map-canvas {
                width: min(720px, 100%);
                height: auto;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.16);
                background: rgba(15, 19, 30, 0.85);
                image-rendering: pixelated;
                box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
                display: block;
            }
            .battlecity-map-status {
                margin: 0;
                font-size: 13px;
                color: rgba(214, 224, 255, 0.8);
                text-align: center;
            }
            .battlecity-map-meta {
                display: flex;
                flex-direction: column;
                gap: 24px;
            }
            .battlecity-map-section {
                display: flex;
                flex-direction: column;
                gap: 12px;
                background: rgba(18, 22, 34, 0.9);
                border-radius: 16px;
                padding: 18px 20px;
                border: 1px solid rgba(145, 196, 255, 0.18);
            }
            .battlecity-map-section h2 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                letter-spacing: 0.3px;
            }
            .battlecity-map-legend {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                gap: 12px;
            }
            .battlecity-map-legend-entry {
                display: flex;
                align-items: center;
                gap: 10px;
                background: rgba(12, 16, 26, 0.9);
                border-radius: 10px;
                padding: 10px 12px;
                border: 1px solid rgba(145, 196, 255, 0.16);
            }
            .battlecity-map-legend-swatch {
                width: 18px;
                height: 18px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.35);
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4) inset;
            }
            .battlecity-map-legend-entry[data-marker='structure'] .battlecity-map-legend-swatch {
                border-radius: 50%;
                box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.45);
            }
            .battlecity-map-legend-label {
                font-size: 13px;
                letter-spacing: 0.2px;
            }
            .battlecity-map-city-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 12px;
            }
            .battlecity-map-city-entry {
                background: rgba(12, 16, 26, 0.9);
                border: 1px solid rgba(145, 196, 255, 0.16);
                border-radius: 10px;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .battlecity-map-city-name {
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.3px;
            }
            .battlecity-map-city-coords {
                font-size: 12px;
                color: rgba(215, 225, 255, 0.75);
            }
            .battlecity-map-empty {
                font-size: 13px;
                color: rgba(215, 225, 255, 0.65);
            }
            .battlecity-map-structure-groups {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .battlecity-map-structure-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
                background: rgba(12, 16, 26, 0.9);
                border: 1px solid rgba(145, 196, 255, 0.16);
                border-radius: 12px;
                padding: 12px 14px;
            }
            .battlecity-map-structure-group-title {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.25px;
            }
            .battlecity-map-structure-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .battlecity-map-structure-item {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                background: rgba(8, 12, 20, 0.85);
                border: 1px solid rgba(145, 196, 255, 0.18);
                border-radius: 10px;
                padding: 10px 12px;
            }
            .battlecity-map-structure-marker {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.28);
                margin-top: 2px;
            }
            .battlecity-map-structure-content {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .battlecity-map-structure-name {
                font-size: 13px;
                font-weight: 600;
                letter-spacing: 0.25px;
            }
            .battlecity-map-structure-meta {
                font-size: 12px;
                color: rgba(215, 225, 255, 0.7);
            }
        `;
        document.head.appendChild(style);
    }

    buildOverlay() {
        if (typeof document === 'undefined') {
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'battlecity-map-overlay';
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                this.close();
            }
        });

        const panel = document.createElement('div');
        panel.className = 'battlecity-map-panel';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'battlecity-map-close';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => this.close());

        const heading = document.createElement('h1');
        heading.className = 'battlecity-map-heading';
        heading.textContent = 'Strategic Map';

        const description = document.createElement('p');
        description.className = 'battlecity-map-description';
        description.textContent = 'Review the full theatre: terrain, active build zones, and every city centre are plotted below. Press Esc or Close to return to command.';

        const grid = document.createElement('div');
        grid.className = 'battlecity-map-grid';

        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'battlecity-map-canvas-wrapper';

        const canvas = document.createElement('canvas');
        canvas.className = 'battlecity-map-canvas';

        const status = document.createElement('p');
        status.className = 'battlecity-map-status';
        status.textContent = 'Loading terrain data…';

        canvasWrapper.appendChild(canvas);
        canvasWrapper.appendChild(status);

        const meta = document.createElement('div');
        meta.className = 'battlecity-map-meta';

        const legendSection = document.createElement('section');
        legendSection.className = 'battlecity-map-section';
        const legendHeading = document.createElement('h2');
        legendHeading.textContent = 'Legend';
        const legend = document.createElement('div');
        legend.className = 'battlecity-map-legend';
        legendSection.appendChild(legendHeading);
        legendSection.appendChild(legend);

        const citySection = document.createElement('section');
        citySection.className = 'battlecity-map-section';
        const cityHeading = document.createElement('h2');
        cityHeading.textContent = 'Cities';
        const cityList = document.createElement('ul');
        cityList.className = 'battlecity-map-city-list';
        citySection.appendChild(cityHeading);
        citySection.appendChild(cityList);

        const structureSection = document.createElement('section');
        structureSection.className = 'battlecity-map-section';
        const structureHeading = document.createElement('h2');
        structureHeading.textContent = 'Structures';
        const structureList = document.createElement('div');
        structureList.className = 'battlecity-map-structure-groups';
        structureSection.appendChild(structureHeading);
        structureSection.appendChild(structureList);

        meta.appendChild(legendSection);
        meta.appendChild(citySection);
        meta.appendChild(structureSection);

        grid.appendChild(canvasWrapper);
        grid.appendChild(meta);

        panel.appendChild(closeButton);
        panel.appendChild(heading);
        panel.appendChild(description);
        panel.appendChild(grid);

        overlay.appendChild(panel);
        this.overlay = overlay;
        this.panel = panel;
        this.canvas = canvas;
        this.legendContainer = legend;
        this.cityList = cityList;
        this.structureList = structureList;
        this.statusLabel = status;
    }

    open() {
        if (typeof document === 'undefined') {
            return;
        }
        if (!this.overlay) {
            return;
        }
        if (!this.overlay.isConnected) {
            document.body.appendChild(this.overlay);
        }
        this.render();
        document.addEventListener('keydown', this.handleKeyDown);
        this.isOpen = true;
    }

    close() {
        if (!this.overlay) {
            if (typeof this.onClose === 'function') {
                this.onClose();
            }
            return;
        }
        document.removeEventListener('keydown', this.handleKeyDown);
        if (this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.panel = null;
        this.canvas = null;
        this.legendContainer = null;
        this.cityList = null;
        this.structureList = null;
        this.statusLabel = null;
        this.isOpen = false;
        if (typeof this.onClose === 'function') {
            this.onClose();
        }
    }

    handleKeyDown(event) {
        if (!event) {
            return;
        }
        if (event.key === 'Escape' || event.key === 'Esc') {
            event.preventDefault();
            this.close();
        }
    }

    render() {
        this.renderLegend();
        const cities = this.collectCities();
        const structureData = this.collectStructures();
        this.renderCityList(cities);
        this.renderStructureList(structureData.groups);
        this.renderMap(cities, structureData.structures);
    }

    renderLegend() {
        if (!this.legendContainer) {
            return;
        }
        this.legendContainer.replaceChildren();
        LEGEND_ENTRIES.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'battlecity-map-legend-entry';
            if (entry.marker) {
                row.dataset.marker = entry.marker;
            }
            const swatch = document.createElement('span');
            swatch.className = 'battlecity-map-legend-swatch';
            swatch.style.background = entry.color;
            const label = document.createElement('span');
            label.className = 'battlecity-map-legend-label';
            label.textContent = entry.label;
            row.appendChild(swatch);
            row.appendChild(label);
            this.legendContainer.appendChild(row);
        });
    }

    renderCityList(cities) {
        if (!this.cityList) {
            return;
        }
        this.cityList.replaceChildren();
        if (!cities.length) {
            const empty = document.createElement('p');
            empty.className = 'battlecity-map-empty';
            empty.textContent = 'No cities detected. Join a city or load a scenario to populate this list.';
            this.cityList.appendChild(empty);
            return;
        }
        cities.forEach((city) => {
            const item = document.createElement('li');
            item.className = 'battlecity-map-city-entry';
            const name = document.createElement('span');
            name.className = 'battlecity-map-city-name';
            name.textContent = city.name;
            const coords = document.createElement('span');
            coords.className = 'battlecity-map-city-coords';
            coords.textContent = `Tile: (${city.tileX}, ${city.tileY})`;
            item.appendChild(name);
            item.appendChild(coords);
            this.cityList.appendChild(item);
        });
    }

    renderStructureList(groups) {
        if (!this.structureList) {
            return;
        }
        this.structureList.replaceChildren();
        const hasEntries = Array.isArray(groups)
            && groups.some((group) => Array.isArray(group.entries) && group.entries.length > 0);
        if (!hasEntries) {
            const empty = document.createElement('p');
            empty.className = 'battlecity-map-empty';
            empty.textContent = 'No factories, research centres, or support structures detected yet.';
            this.structureList.appendChild(empty);
            return;
        }
        groups.forEach((group) => {
            if (!Array.isArray(group.entries) || group.entries.length === 0) {
                return;
            }
            const container = document.createElement('article');
            container.className = 'battlecity-map-structure-group';
            const title = document.createElement('h3');
            title.className = 'battlecity-map-structure-group-title';
            title.textContent = `${group.label} (${group.entries.length})`;
            const list = document.createElement('ul');
            list.className = 'battlecity-map-structure-list';
            group.entries.forEach((structure) => {
                const item = document.createElement('li');
                item.className = 'battlecity-map-structure-item';
                const marker = document.createElement('span');
                marker.className = 'battlecity-map-structure-marker';
                marker.style.background = group.color || '#9aa7bf';
                const content = document.createElement('div');
                content.className = 'battlecity-map-structure-content';
                const name = document.createElement('span');
                name.className = 'battlecity-map-structure-name';
                name.textContent = structure.label || 'Structure';
                const meta = document.createElement('span');
                meta.className = 'battlecity-map-structure-meta';
                const metaParts = [];
                if (structure.cityName) {
                    metaParts.push(structure.cityName);
                }
                metaParts.push(`Tile (${structure.tileX}, ${structure.tileY})`);
                meta.textContent = metaParts.join(' · ');
                content.appendChild(name);
                content.appendChild(meta);
                item.appendChild(marker);
                item.appendChild(content);
                list.appendChild(item);
            });
            container.appendChild(title);
            container.appendChild(list);
            this.structureList.appendChild(container);
        });
    }

    collectStructures() {
        const groups = STRUCTURE_CATEGORY_DEFINITIONS
            .filter((definition) => definition.id !== 'command')
            .map((definition) => ({
                id: definition.id,
                label: definition.label,
                color: definition.color,
                entries: []
            }));
        const groupLookup = groups.reduce((acc, group) => {
            acc[group.id] = group;
            return acc;
        }, {});
        const structures = [];
        const factory = this.game?.buildingFactory;
        const buildingStore = factory?.buildingsById;
        if (!buildingStore || typeof buildingStore !== 'object') {
            return { structures, groups };
        }
        const toTileCoordinate = (value) => {
            if (Number.isFinite(value)) {
                return Math.floor(value);
            }
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return Math.floor(parsed);
            }
            return null;
        };
        const comparator = (a, b) => {
            const hasCityA = typeof a.cityName === 'string' && a.cityName.length > 0;
            const hasCityB = typeof b.cityName === 'string' && b.cityName.length > 0;
            if (hasCityA && hasCityB) {
                const cityCompare = a.cityName.localeCompare(b.cityName);
                if (cityCompare !== 0) {
                    return cityCompare;
                }
            } else if (hasCityA) {
                return -1;
            } else if (hasCityB) {
                return 1;
            }
            const labelCompare = (a.label || '').localeCompare(b.label || '');
            if (labelCompare !== 0) {
                return labelCompare;
            }
            if (a.tileY !== b.tileY) {
                return a.tileY - b.tileY;
            }
            return a.tileX - b.tileX;
        };
        Object.values(buildingStore).forEach((building) => {
            if (!building || typeof building !== 'object') {
                return;
            }
            const numericType = Number(building.type);
            if (!Number.isFinite(numericType)) {
                return;
            }
            const categoryId = this.determineStructureCategory(numericType);
            if (categoryId === 'command' || !groupLookup[categoryId]) {
                return;
            }
            const tileX = toTileCoordinate(building.x);
            const tileY = toTileCoordinate(building.y);
            if (tileX === null || tileY === null) {
                return;
            }
            const footprint = this.resolveStructureFootprint(building, categoryId);
            const centerTileX = tileX + (footprint.width / 2);
            const centerTileY = tileY + (footprint.height / 2);
            const rawCity = building.city ?? building.cityId ?? null;
            const parsedCity = Number(rawCity);
            const cityId = Number.isFinite(parsedCity) ? parsedCity : null;
            let cityName = null;
            if (cityId !== null) {
                const cityEntry = Array.isArray(this.game?.cities) ? this.game.cities[cityId] : null;
                cityName = this.resolveCityName(cityEntry, cityId);
            }
            const structure = {
                id: building.id ?? `${tileX}_${tileY}_${numericType}`,
                type: numericType,
                category: categoryId,
                label: this.resolveStructureLabel(numericType, categoryId),
                tileX,
                tileY,
                centerTileX,
                centerTileY,
                cityId,
                cityName,
                widthTiles: footprint.width,
                heightTiles: footprint.height
            };
            structures.push(structure);
            groupLookup[categoryId].entries.push(structure);
        });
        groups.forEach((group) => {
            group.entries.sort(comparator);
        });
        structures.sort((a, b) => {
            const orderA = STRUCTURE_CATEGORY_ORDER[a.category] ?? Number.MAX_SAFE_INTEGER;
            const orderB = STRUCTURE_CATEGORY_ORDER[b.category] ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return comparator(a, b);
        });
        return { structures, groups };
    }

    resolveStructureFootprint(building, categoryId) {
        if (building && typeof building === 'object') {
            const numericWidth = Number(building.width);
            const numericHeight = Number(building.height);
            if (Number.isFinite(numericWidth) && Number.isFinite(numericHeight)) {
                return {
                    width: Math.max(1, Math.round(numericWidth)),
                    height: Math.max(1, Math.round(numericHeight))
                };
            }
        }
        const definition = STRUCTURE_CATEGORY_LOOKUP[categoryId];
        const fallback = Number.isFinite(definition?.defaultFootprint)
            ? Math.max(1, Math.round(definition.defaultFootprint))
            : 1;
        return {
            width: fallback,
            height: fallback
        };
    }

    resolveStructureLabel(type, categoryId) {
        if (Number.isFinite(type) && BUILDING_LABEL_LOOKUP[type]) {
            return BUILDING_LABEL_LOOKUP[type];
        }
        const definition = STRUCTURE_CATEGORY_LOOKUP[categoryId];
        if (definition) {
            return `${definition.label} (${type})`;
        }
        return `Structure ${type}`;
    }

    determineStructureCategory(type) {
        if (!Number.isFinite(type)) {
            return 'support';
        }
        if (type === BUILDING_COMMAND_CENTER) {
            return 'command';
        }
        if (type >= 400 && type < 500) {
            return 'research';
        }
        if (type >= 100 && type < 200) {
            return 'factory';
        }
        if (type >= 300 && type < 400) {
            return 'housing';
        }
        if (type >= 200 && type < 300) {
            return 'hospital';
        }
        return 'support';
    }

    renderMap(cities, structures) {
        if (!this.canvas) {
            return;
        }
        const map = Array.isArray(this.game?.map) ? this.game.map : null;
        const width = Array.isArray(map) ? map.length : 0;
        const height = width > 0 && Array.isArray(map[0]) ? map[0].length : 0;
        const context = this.canvas.getContext('2d');
        if (!context) {
            return;
        }
        if (!width || !height) {
            context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            if (this.statusLabel) {
                this.statusLabel.textContent = 'Map data is still loading. The overlay will update when terrain is ready.';
            }
            return;
        }
        const scale = this.scale;
        const renderWidth = width * scale;
        const renderHeight = height * scale;
        if (this.canvas.width !== renderWidth || this.canvas.height !== renderHeight) {
            this.canvas.width = renderWidth;
            this.canvas.height = renderHeight;
        }
        const imageData = context.createImageData(renderWidth, renderHeight);
        const buffer = imageData.data;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = map[x]?.[y] ?? 0;
                const color = this.getColorForTile(value);
                const r = color[0];
                const g = color[1];
                const b = color[2];
                const a = color[3];
                for (let dy = 0; dy < scale; dy++) {
                    const targetY = (y * scale) + dy;
                    const rowOffset = targetY * renderWidth;
                    for (let dx = 0; dx < scale; dx++) {
                        const targetX = (x * scale) + dx;
                        const index = ((rowOffset + targetX) * 4);
                        buffer[index] = r;
                        buffer[index + 1] = g;
                        buffer[index + 2] = b;
                        buffer[index + 3] = a;
                    }
                }
            }
        }
        context.putImageData(imageData, 0, 0);
        context.imageSmoothingEnabled = false;
        this.drawStructureMarkers(context, structures, scale);
        this.drawCityMarkers(context, cities, scale);
        if (this.statusLabel) {
            const cityCount = Array.isArray(cities) ? cities.length : 0;
            const structureCount = Array.isArray(structures) ? structures.length : 0;
            const cityText = `${cityCount} cit${cityCount === 1 ? 'y' : 'ies'}`;
            const structureText = structureCount
                ? `${structureCount} structure${structureCount === 1 ? '' : 's'} tracked`
                : 'No structures recorded yet';
            this.statusLabel.textContent = `${cityText}; ${structureText}. Terrain refreshed just now.`;
        }
    }

    drawStructureMarkers(context, structures, scale) {
        if (!Array.isArray(structures) || structures.length === 0) {
            return;
        }
        const markerSize = Math.max(3, Math.round(scale * 1.6));
        structures.forEach((structure) => {
            const style = STRUCTURE_CATEGORY_LOOKUP[structure.category] || null;
            const fill = style?.color || '#9aa7bf';
            const outline = style?.outline || DEFAULT_STRUCTURE_OUTLINE;
            const centerTileX = Number.isFinite(structure.centerTileX)
                ? structure.centerTileX
                : (structure.tileX ?? 0) + 0.5;
            const centerTileY = Number.isFinite(structure.centerTileY)
                ? structure.centerTileY
                : (structure.tileY ?? 0) + 0.5;
            const centerX = centerTileX * scale;
            const centerY = centerTileY * scale;
            if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
                return;
            }
            context.save();
            context.translate(centerX, centerY);
            context.rotate(Math.PI / 4);
            context.fillStyle = fill;
            context.strokeStyle = outline;
            context.lineWidth = Math.max(1, Math.round(scale / 2));
            context.fillRect(-markerSize, -markerSize, markerSize * 2, markerSize * 2);
            context.strokeRect(-markerSize, -markerSize, markerSize * 2, markerSize * 2);
            context.restore();
        });
    }

    drawCityMarkers(context, cities, scale) {
        if (!Array.isArray(cities) || !cities.length) {
            return;
        }
        const markerRadius = Math.max(4, Math.round(scale * 2.5));
        const labelFontSize = Math.max(12, Math.round(scale * 4.5));
        cities.forEach((city) => {
            const centerX = ((city.tileX ?? 0) + 0.5) * scale;
            const centerY = ((city.tileY ?? 0) + 0.5) * scale;
            context.beginPath();
            context.fillStyle = CITY_MARKER_COLOR;
            context.strokeStyle = CITY_MARKER_OUTLINE;
            context.lineWidth = Math.max(1, Math.round(scale / 1.5));
            context.arc(centerX, centerY, markerRadius, 0, Math.PI * 2);
            context.fill();
            context.stroke();
            if (!city.name) {
                return;
            }
            const labelY = centerY + markerRadius + Math.max(4, Math.round(scale));
            context.font = `600 ${labelFontSize}px "Segoe UI", sans-serif`;
            context.textAlign = 'center';
            context.textBaseline = 'top';
            const metrics = context.measureText(city.name);
            const textWidth = metrics.width;
            const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
            const paddingX = Math.max(4, Math.round(scale * 1.5));
            const paddingY = Math.max(2, Math.round(scale));
            context.fillStyle = 'rgba(6, 10, 18, 0.82)';
            context.fillRect(centerX - (textWidth / 2) - paddingX, labelY - paddingY, textWidth + (paddingX * 2), textHeight + (paddingY * 2));
            context.fillStyle = '#f6f9ff';
            context.fillText(city.name, centerX, labelY);
        });
    }

    collectCities() {
        const result = [];
        const list = Array.isArray(this.game?.cities) ? this.game.cities : [];
        list.forEach((entry, index) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }
            const tileX = Number.isFinite(entry.tileX)
                ? entry.tileX
                : Number.isFinite(entry.x)
                    ? Math.round(entry.x / 48)
                    : index;
            const tileY = Number.isFinite(entry.tileY)
                ? entry.tileY
                : Number.isFinite(entry.y)
                    ? Math.round(entry.y / 48)
                    : index;
            const name = this.resolveCityName(entry, index);
            result.push({
                id: Number.isFinite(entry.id) ? entry.id : index,
                name,
                tileX,
                tileY
            });
        });
        result.sort((a, b) => {
            if (!a.name && !b.name) {
                return a.id - b.id;
            }
            if (!a.name) {
                return 1;
            }
            if (!b.name) {
                return -1;
            }
            return a.name.localeCompare(b.name);
        });
        return result;
    }

    resolveCityName(entry, fallbackId) {
        if (!entry || typeof entry !== 'object') {
            return getCityDisplayName(fallbackId);
        }
        if (typeof entry.nameOverride === 'string' && entry.nameOverride.trim().length) {
            return entry.nameOverride.trim();
        }
        if (typeof entry.name === 'string' && entry.name.trim().length) {
            return entry.name.trim();
        }
        const id = Number.isFinite(entry.id) ? entry.id : fallbackId;
        return getCityDisplayName(id);
    }

    getColorForTile(value) {
        if (value === MAP_SQUARE_LAVA) {
            return this.palette.lava;
        }
        if (value === MAP_SQUARE_ROCK) {
            return this.palette.rock;
        }
        if (value >= MAP_SQUARE_BUILDING) {
            return this.palette.building;
        }
        return this.palette.ground;
    }

    isOpen() {
        return Boolean(this.overlay);
    }
}

export default MapModal;
