import { getCityDisplayName } from '../utils/citySpawns';

class LobbyManager {
    constructor(game) {
        this.game = game;
        this.socketListener = null;
        this.lastSnapshot = null;
        this.waiting = false;
        this.waitingCity = null;
        this.waitingRole = null;
        this.visible = false;
        this.inGame = false;

        this.onLobbySnapshot = (snapshot) => this.updateSnapshot(snapshot);
        this.onLobbyUpdate = (snapshot) => this.updateSnapshot(snapshot);
        this.onLobbyAssignment = (assignment) => this.handleAssignment(assignment);
        this.onLobbyDenied = (payload) => this.handleDenial(payload);
        this.onSocketConnected = () => this.handleConnected();
        this.onSocketDisconnected = (reason) => this.handleDisconnected(reason);
        this.onLobbyEvicted = (payload) => this.handleEviction(payload);

        this.injectStyles();
        this.createOverlay();
        this.show();
        this.setStatus("Connecting to lobby...");
    }

    injectStyles() {
        if (document.getElementById('lobby-overlay-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'lobby-overlay-styles';
        style.textContent = `
            .lobby-overlay {
                position: fixed;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(8, 10, 16, 0.85);
                z-index: 9999;
                pointer-events: auto;
            }
            .lobby-overlay.visible {
                display: flex;
            }
            .lobby-panel {
                background: #131722;
                border: 1px solid #2a3140;
                border-radius: 8px;
                width: min(620px, 92vw);
                max-height: 86vh;
                padding: 24px 28px;
                color: #f5f7ff;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .lobby-header {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .lobby-title {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
            }
            .lobby-subtitle {
                font-size: 14px;
                color: #b3b9c9;
                margin: 0;
            }
            .lobby-city-list {
                flex: 1;
                overflow-y: auto;
                padding-right: 6px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .lobby-city-empty {
                color: #b3b9c9;
                font-size: 14px;
                text-align: center;
                padding: 24px 0;
            }
            .lobby-city-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(22, 27, 38, 0.85);
                border: 1px solid rgba(53, 63, 83, 0.8);
                border-radius: 6px;
                padding: 12px 16px;
                gap: 16px;
            }
            .lobby-city-row.waiting {
                border-color: #5c9eff;
                box-shadow: 0 0 0 1px rgba(92, 158, 255, 0.35);
            }
            .lobby-city-info {
                display: flex;
                flex-direction: column;
                gap: 6px;
                min-width: 0;
            }
            .lobby-city-name {
                font-size: 16px;
                font-weight: 600;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .lobby-city-meta {
                font-size: 13px;
                color: #9aa3b8;
            }
            .lobby-city-actions {
                display: flex;
                gap: 8px;
            }
            .lobby-btn {
                background: #1f2534;
                color: #e1e6f6;
                border: 1px solid #384156;
                border-radius: 4px;
                padding: 8px 14px;
                font-size: 13px;
                cursor: pointer;
                transition: background 0.15s, border-color 0.15s, transform 0.15s;
            }
            .lobby-btn:hover:not(:disabled) {
                background: #2a3245;
                border-color: #4f5d7c;
            }
            .lobby-btn:active:not(:disabled) {
                transform: translateY(1px);
            }
            .lobby-btn:disabled {
                opacity: 0.45;
                cursor: default;
            }
            .lobby-actions {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            .lobby-action-group {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
            .lobby-status {
                font-size: 13px;
                color: #b3b9c9;
                min-height: 18px;
            }
            .lobby-status[data-type="error"] {
                color: #ff8080;
            }
            .lobby-status[data-type="warn"] {
                color: #ffc977;
            }
            .lobby-status[data-type="success"] {
                color: #7be17d;
            }
        `;
        document.head.appendChild(style);
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'lobby-overlay';

        const panel = document.createElement('div');
        panel.className = 'lobby-panel';

        const header = document.createElement('div');
        header.className = 'lobby-header';

        const title = document.createElement('h1');
        title.className = 'lobby-title';
        title.textContent = 'City Lobby';

        const subtitle = document.createElement('p');
        subtitle.className = 'lobby-subtitle';
        subtitle.textContent = 'Choose a city to join as mayor or recruit. Everyone starts at the same time.';

        header.appendChild(title);
        header.appendChild(subtitle);

        this.cityListContainer = document.createElement('div');
        this.cityListContainer.className = 'lobby-city-list';

        const actions = document.createElement('div');
        actions.className = 'lobby-actions';

        const leftGroup = document.createElement('div');
        leftGroup.className = 'lobby-action-group';

        this.autoButton = document.createElement('button');
        this.autoButton.type = 'button';
        this.autoButton.className = 'lobby-btn';
        this.autoButton.textContent = 'Auto Assign';
        this.autoButton.addEventListener('click', () => this.handleAutoJoin());

        this.refreshButton = document.createElement('button');
        this.refreshButton.type = 'button';
        this.refreshButton.className = 'lobby-btn';
        this.refreshButton.textContent = 'Refresh';
        this.refreshButton.addEventListener('click', () => this.requestSnapshot());

        leftGroup.appendChild(this.autoButton);
        leftGroup.appendChild(this.refreshButton);

        actions.appendChild(leftGroup);

        this.statusNode = document.createElement('div');
        this.statusNode.className = 'lobby-status';
        this.statusNode.dataset.type = 'info';

        panel.appendChild(header);
        panel.appendChild(this.cityListContainer);
        panel.appendChild(actions);
        panel.appendChild(this.statusNode);

        this.overlay.appendChild(panel);
        document.body.appendChild(this.overlay);
    }

    attachSocket(socketListener) {
        if (!socketListener) {
            return;
        }
        if (this.socketListener === socketListener) {
            return;
        }
        if (this.socketListener) {
            this.socketListener.off('lobby:snapshot', this.onLobbySnapshot);
            this.socketListener.off('lobby:update', this.onLobbyUpdate);
            this.socketListener.off('lobby:assignment', this.onLobbyAssignment);
            this.socketListener.off('lobby:denied', this.onLobbyDenied);
            this.socketListener.off('connected', this.onSocketConnected);
            this.socketListener.off('disconnected', this.onSocketDisconnected);
            this.socketListener.off('lobby:evicted', this.onLobbyEvicted);
        }
        this.socketListener = socketListener;
        socketListener.on('lobby:snapshot', this.onLobbySnapshot);
        socketListener.on('lobby:update', this.onLobbyUpdate);
        socketListener.on('lobby:assignment', this.onLobbyAssignment);
        socketListener.on('lobby:denied', this.onLobbyDenied);
        socketListener.on('connected', this.onSocketConnected);
        socketListener.on('disconnected', this.onSocketDisconnected);
        socketListener.on('lobby:evicted', this.onLobbyEvicted);
    }

    show() {
        if (this.overlay) {
            this.overlay.classList.add('visible');
        }
        this.visible = true;
    }

    hide() {
        if (this.overlay) {
            this.overlay.classList.remove('visible');
        }
        this.visible = false;
    }

    isInGame() {
        return this.inGame;
    }

    setStatus(message, options = {}) {
        if (!this.statusNode) {
            return;
        }
        const type = options.type || 'info';
        this.statusNode.dataset.type = type;
        this.statusNode.textContent = message || '';
    }

    updateSnapshot(snapshot) {
        let data = snapshot;
        if (!data) {
            return;
        }
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (error) {
                console.warn('Failed to parse lobby snapshot', error);
                return;
            }
        }
        if (!data || !Array.isArray(data.cities)) {
            return;
        }
        this.lastSnapshot = data;
        this.renderCityList();
        if (!this.waiting) {
            const hasVacancy = data.cities.some((city) => city.openMayor || (city.openRecruits > 0));
            if (!hasVacancy && this.visible) {
                this.setStatus('All cities are currently full. Please wait for an opening.', { type: 'warn' });
            }
        }
    }

    renderCityList() {
        if (!this.cityListContainer) {
            return;
        }
        this.cityListContainer.innerHTML = '';
        if (!this.lastSnapshot || !Array.isArray(this.lastSnapshot.cities) || !this.lastSnapshot.cities.length) {
            const empty = document.createElement('div');
            empty.className = 'lobby-city-empty';
            empty.textContent = 'Waiting for available cities...';
            this.cityListContainer.appendChild(empty);
            return;
        }

        const sortedCities = [...this.lastSnapshot.cities].sort((a, b) => {
            const aId = Number.isFinite(a?.id) ? a.id : 0;
            const bId = Number.isFinite(b?.id) ? b.id : 0;
            return aId - bId;
        });

        sortedCities.forEach((city) => {
            const row = document.createElement('div');
            row.className = 'lobby-city-row';
            row.dataset.cityId = city.id;
            if (this.waiting && this.waitingCity === city.id) {
                row.classList.add('waiting');
            }

            const info = document.createElement('div');
            info.className = 'lobby-city-info';

            const name = document.createElement('div');
            name.className = 'lobby-city-name';
            name.textContent = city.name || `City ${city.id}`;

            const mayorLabel = city.openMayor ? '(open)' : (city.mayorLabel || '(unknown)');
            const capacity = Number.isFinite(city.capacity) ? city.capacity : (1 + (city.maxRecruits ?? 3));
            const playerCount = Number.isFinite(city.playerCount) ? city.playerCount : 0;
            const meta = document.createElement('div');
            meta.className = 'lobby-city-meta';
            const metaParts = [
                `Mayor: ${mayorLabel}`,
                `Players: ${playerCount}/${capacity}`
            ];
            const scoreValue = Number.isFinite(city.score) ? city.score : Number(city.score);
            if (Number.isFinite(scoreValue)) {
                metaParts.push(`Score: ${scoreValue}`);
            }
            const orbsValue = Number.isFinite(city.orbs) ? city.orbs : Number(city.orbs);
            if (Number.isFinite(orbsValue)) {
                metaParts.push(`Orbs: ${orbsValue}`);
            }
            meta.textContent = metaParts.join(' • ');

            info.appendChild(name);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'lobby-city-actions';

            const mayorButton = document.createElement('button');
            mayorButton.type = 'button';
            mayorButton.className = 'lobby-btn';
            mayorButton.textContent = 'Mayor';
            mayorButton.disabled = !city.openMayor || this.waiting;
            mayorButton.addEventListener('click', () => this.handleJoin(city.id, 'mayor'));

            const recruitButton = document.createElement('button');
            recruitButton.type = 'button';
            recruitButton.className = 'lobby-btn';
            recruitButton.textContent = 'Recruit';
            const hasRecruitVacancy = Number.isFinite(city.openRecruits) ? city.openRecruits > 0 : !!city.hasRecruitVacancy;
            recruitButton.disabled = !hasRecruitVacancy || this.waiting;
            recruitButton.addEventListener('click', () => this.handleJoin(city.id, 'recruit'));

            actions.appendChild(mayorButton);
            actions.appendChild(recruitButton);

            row.appendChild(info);
            row.appendChild(actions);

            this.cityListContainer.appendChild(row);
        });

        if (this.autoButton) {
            this.autoButton.disabled = this.waiting;
        }
        if (this.refreshButton) {
            this.refreshButton.disabled = this.waiting;
        }
    }

    handleJoin(cityId, role) {
        if (this.waiting) {
            return;
        }
        if (!this.socketListener || (this.socketListener.io && this.socketListener.io.disconnected)) {
            this.setStatus('Cannot join right now. Connection unavailable.', { type: 'error' });
            return;
        }
        this.waiting = true;
        this.waitingCity = cityId;
        this.waitingRole = role;
        this.setStatus(`Requesting ${role === 'mayor' ? 'mayor' : 'recruit'} slot in city ${cityId}...`);
        this.renderCityList();
        const socketId = this.socketListener.enterGame({ city: cityId, role });
        if (socketId) {
            this.game.player.id = socketId;
        }
    }

    handleAutoJoin() {
        if (this.waiting) {
            return;
        }
        if (!this.socketListener || (this.socketListener.io && this.socketListener.io.disconnected)) {
            this.setStatus('Cannot join right now. Connection unavailable.', { type: 'error' });
            return;
        }
        this.waiting = true;
        this.waitingCity = null;
        this.waitingRole = null;
        this.setStatus('Requesting automatic assignment...');
        this.renderCityList();
        const socketId = this.socketListener.enterGame({ auto: true });
        if (socketId) {
            this.game.player.id = socketId;
        }
    }

    handleAssignment(assignment) {
        this.waiting = false;
        this.waitingCity = null;
        this.waitingRole = null;
        this.inGame = true;
        this.setStatus('Assignment confirmed. Entering city...', { type: 'success' });
        this.renderCityList();
        this.hide();
        if (this.game && this.game.persistence && typeof this.game.persistence.restoreInventory === 'function') {
            this.game.persistence.restoreInventory();
        }
    }

    handleEviction(details) {
        this.waiting = false;
        this.waitingCity = null;
        this.waitingRole = null;
        this.inGame = false;

        const cityId = Number.isFinite(details?.city) ? Number(details.city) : null;
        const attackerId = Number.isFinite(details?.attackerCity) ? Number(details.attackerCity) : null;
        const points = Number.isFinite(details?.points) ? Number(details.points) : null;

        const cityName = cityId !== null ? getCityDisplayName(cityId) : 'your city';
        const attackerName = attackerId !== null ? getCityDisplayName(attackerId) : null;

        const fragments = [];
        if (attackerName) {
            fragments.push(`${attackerName} destroyed ${cityName}.`);
        } else {
            fragments.push(`An enemy orb destroyed ${cityName}.`);
        }
        if (points !== null && points > 0) {
            fragments.push(`They earned ${points} points.`);
        }

        this.show();
        this.setStatus(fragments.join(' '), { type: 'error' });
        this.renderCityList();
        this.requestSnapshot();
    }

    handleDenial(details) {
        this.waiting = false;
        this.inGame = false;
        const requestedCity = details?.requestedCity;
        const message = details?.reason === 'cities_full'
            ? 'All cities are currently full. Please try again in a moment.'
            : 'Selected slot was unavailable. Please choose a different option.';
        const type = details?.reason === 'cities_full' ? 'warn' : 'error';
        if (requestedCity !== undefined && requestedCity !== null) {
            this.waitingCity = requestedCity;
        } else {
            this.waitingCity = null;
        }
        this.waitingRole = null;
        this.setStatus(message, { type });
        this.renderCityList();
        this.requestSnapshot();
    }

    handleConnected() {
        this.inGame = false;
        this.waiting = false;
        this.waitingCity = null;
        this.waitingRole = null;
        this.show();
        this.setStatus('Connected. Choose a city to enter.', { type: 'info' });
        this.requestSnapshot();
    }

    handleDisconnected(reason) {
        this.inGame = false;
        this.waiting = false;
        this.waitingCity = null;
        this.waitingRole = null;
        this.show();
        const label = reason ? `Connection lost (${reason}). Reconnecting...` : 'Connection lost. Reconnecting...';
        this.setStatus(label, { type: 'error' });
    }

    requestSnapshot() {
        if (this.socketListener && typeof this.socketListener.requestLobbySnapshot === 'function') {
            this.socketListener.requestLobbySnapshot();
        }
    }
}

export default LobbyManager;
