import { getCityDisplayName } from '../utils/citySpawns';

class LobbyManager {
    constructor(game, options = {}) {
        this.game = game;
        this.socketListener = null;
        this.lastSnapshot = null;
        this.waiting = false;
        this.waitingCity = null;
        this.waitingRole = null;
        this.visible = false;
        this.inGame = false;
        this.identityManager = null;
        this.identityBusy = false;
        this.identityFormVisible = false;
        this.identityInput = null;
        this.identityForm = null;
        this.identitySummary = null;
        this.identityToggle = null;
        this.identityFeedback = null;
        this.identitySave = null;
        this.identityCancel = null;
        this.identitySignOut = null;
        this.googleContainer = null;
        this.googleButtonTarget = null;
        this.googleFeedback = null;
        this.googleScriptPromise = null;
        this.googleInitialized = false;
        this.googleBusy = false;
        this.isActivated = options.autoShow !== false;

        this.onLobbySnapshot = (snapshot) => this.updateSnapshot(snapshot);
        this.onLobbyUpdate = (snapshot) => this.updateSnapshot(snapshot);
        this.onLobbyAssignment = (assignment) => this.handleAssignment(assignment);
        this.onLobbyDenied = (payload) => this.handleDenial(payload);
        this.onSocketConnected = () => this.handleConnected();
        this.onSocketDisconnected = (reason) => this.handleDisconnected(reason);
        this.onLobbyEvicted = (payload) => this.handleEviction(payload);

        this.injectStyles();
        this.createOverlay();
        if (this.isActivated) {
            this.show();
        } else {
            this.hide();
        }
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
            .lobby-btn--secondary {
                background: #181d2a;
                border-color: #2f374a;
                color: #d4daec;
            }
            .lobby-btn:hover:not(:disabled) {
                background: #2a3245;
                border-color: #4f5d7c;
            }
            .lobby-btn--secondary:hover:not(:disabled) {
                background: #232b3d;
                border-color: #42506d;
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
            .lobby-identity {
                display: flex;
                flex-direction: column;
                gap: 6px;
                align-items: flex-end;
                min-width: 220px;
            }
            .lobby-identity-summary {
                font-size: 13px;
                color: #9aa3b8;
                text-align: right;
            }
            .lobby-identity-form {
                display: none;
                flex-direction: column;
                gap: 8px;
                width: 100%;
            }
            .lobby-identity-form.visible {
                display: flex;
            }
            .lobby-identity-controls {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
                flex-wrap: wrap;
            }
            .lobby-identity-signout {
                color: #f6b6b6;
            }
            .lobby-identity-signout:hover:not(:disabled) {
                background: #2c1b1b;
                border-color: #6b2a2a;
                color: #ffd6d6;
            }
            .lobby-google {
                display: none;
                flex-direction: column;
                gap: 6px;
                align-items: flex-end;
                width: 100%;
            }
            .lobby-google.visible {
                display: flex;
            }
            .lobby-google.busy {
                opacity: 0.6;
                pointer-events: none;
            }
            .lobby-google-button > div {
                display: inline-flex;
            }
            .lobby-google-feedback {
                font-size: 12px;
                color: #9aa3b8;
                text-align: right;
                min-height: 16px;
            }
            .lobby-google-feedback[data-type="error"] {
                color: #ff8484;
            }
            .lobby-google-feedback[data-type="success"] {
                color: #7fe3a0;
            }
            .lobby-identity-input {
                width: 100%;
                padding: 8px 10px;
                border: 1px solid #384156;
                border-radius: 4px;
                background: #0f131d;
                color: #e1e6f6;
                font-size: 13px;
            }
            .lobby-identity-input:focus {
                outline: none;
                border-color: #5c9eff;
                box-shadow: 0 0 0 1px rgba(92, 158, 255, 0.25);
            }
            .lobby-identity-actions {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            .lobby-identity-feedback {
                font-size: 12px;
                min-height: 16px;
                color: #9aa3b8;
                text-align: right;
            }
            .lobby-identity-feedback[data-type="error"] {
                color: #ff8080;
            }
            .lobby-identity-feedback[data-type="success"] {
                color: #7be17d;
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

        const identityContainer = document.createElement('div');
        identityContainer.className = 'lobby-identity';

        this.identitySummary = document.createElement('div');
        this.identitySummary.className = 'lobby-identity-summary';
        this.identitySummary.textContent = 'Playing as Guest';

        const identityControls = document.createElement('div');
        identityControls.className = 'lobby-identity-controls';

        this.identityToggle = document.createElement('button');
        this.identityToggle.type = 'button';
        this.identityToggle.className = 'lobby-btn lobby-btn--secondary';
        this.identityToggle.textContent = 'Set display name';
        this.identityToggle.addEventListener('click', () => this.toggleIdentityForm(true));

        this.identitySignOut = document.createElement('button');
        this.identitySignOut.type = 'button';
        this.identitySignOut.className = 'lobby-btn lobby-btn--secondary lobby-identity-signout';
        this.identitySignOut.textContent = 'Sign out';
        this.identitySignOut.style.display = 'none';
        this.identitySignOut.addEventListener('click', () => this.handleIdentitySignOut());

        identityControls.appendChild(this.identityToggle);
        identityControls.appendChild(this.identitySignOut);

        this.googleContainer = document.createElement('div');
        this.googleContainer.className = 'lobby-google';
        this.googleButtonTarget = document.createElement('div');
        this.googleButtonTarget.className = 'lobby-google-button';
        this.googleFeedback = document.createElement('div');
        this.googleFeedback.className = 'lobby-google-feedback';
        this.googleFeedback.dataset.type = 'info';
        this.googleFeedback.textContent = '';
        this.googleContainer.appendChild(this.googleButtonTarget);
        this.googleContainer.appendChild(this.googleFeedback);

        this.identityForm = document.createElement('form');
        this.identityForm.className = 'lobby-identity-form';
        this.identityForm.addEventListener('submit', (event) => {
            event.preventDefault();
            this.handleIdentitySubmit();
        });

        this.identityInput = document.createElement('input');
        this.identityInput.type = 'text';
        this.identityInput.maxLength = 32;
        this.identityInput.autocomplete = 'off';
        this.identityInput.placeholder = 'Enter display name';
        this.identityInput.className = 'lobby-identity-input';

        const identityButtons = document.createElement('div');
        identityButtons.className = 'lobby-identity-actions';

        this.identitySave = document.createElement('button');
        this.identitySave.type = 'submit';
        this.identitySave.className = 'lobby-btn';
        this.identitySave.textContent = 'Save';

        this.identityCancel = document.createElement('button');
        this.identityCancel.type = 'button';
        this.identityCancel.className = 'lobby-btn lobby-btn--secondary';
        this.identityCancel.textContent = 'Cancel';
        this.identityCancel.addEventListener('click', () => this.toggleIdentityForm(false));

        identityButtons.appendChild(this.identitySave);
        identityButtons.appendChild(this.identityCancel);

        this.identityFeedback = document.createElement('div');
        this.identityFeedback.className = 'lobby-identity-feedback';
        this.identityFeedback.dataset.type = 'info';

        this.identityForm.appendChild(this.identityInput);
        this.identityForm.appendChild(identityButtons);
        this.identityForm.appendChild(this.identityFeedback);

        identityContainer.appendChild(this.identitySummary);
        identityContainer.appendChild(identityControls);
        identityContainer.appendChild(this.googleContainer);
        identityContainer.appendChild(this.identityForm);

        actions.appendChild(identityContainer);

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

    attachIdentityManager(identityManager) {
        this.identityManager = identityManager || null;
        this.configureGoogleIdentity();
        if (this.identityManager && typeof this.identityManager.getIdentity === 'function') {
            const identity = this.identityManager.getIdentity();
            this.updateIdentityDisplay(identity);
        } else {
            this.updateIdentityDisplay(null);
        }
    }

    updateIdentityDisplay(identity) {
        const name = identity && typeof identity.name === 'string' ? identity.name.trim() : '';
        const manager = this.identityManager;
        const googleEnabled = !!(manager && typeof manager.isGoogleAuthEnabled === 'function' && manager.isGoogleAuthEnabled());
        const usingGoogle = !!(identity && identity.provider === 'google');
        if (this.identitySummary) {
            if (usingGoogle && name.length) {
                this.identitySummary.textContent = `Signed in as ${name}`;
            } else if (name.length) {
                this.identitySummary.textContent = `Playing as ${name}`;
            } else if (googleEnabled) {
                this.identitySummary.textContent = 'Register with Google or set a display name to continue.';
            } else {
                this.identitySummary.textContent = 'Set a display name to appear to other players.';
            }
        }
        if (this.identityToggle) {
            let toggleLabel = 'Set display name';
            if (name.length) {
                toggleLabel = 'Update name';
            }
            this.identityToggle.textContent = toggleLabel;
            this.identityToggle.disabled = this.identityFormVisible || this.identityBusy;
        }
        const hasIdentity = !!(identity && identity.id);
        if (this.identitySignOut) {
            this.identitySignOut.style.display = hasIdentity ? 'inline-flex' : 'none';
            this.identitySignOut.disabled = this.identityBusy || !hasIdentity;
        }
        if (this.identityInput && !this.identityFormVisible) {
            this.identityInput.value = name;
        }
        this.updateGoogleDisplay(identity);
    }

    configureGoogleIdentity() {
        if (!this.googleContainer) {
            return;
        }
        const manager = this.identityManager;
        const enabled = !!(manager && typeof manager.isGoogleAuthEnabled === 'function' && manager.isGoogleAuthEnabled());
        if (!enabled) {
            this.googleContainer.classList.remove('visible');
            this.setGoogleFeedback('', 'info');
            this.refreshGoogleInteractivity();
            return;
        }
        this.googleContainer.classList.add('visible');
        this.ensureGoogleClient();
        this.refreshGoogleInteractivity();
    }

    ensureGoogleClient() {
        if (typeof window === 'undefined') {
            return;
        }
        const googleApi = window.google && window.google.accounts && window.google.accounts.id
            ? window.google.accounts.id
            : null;
        if (googleApi) {
            this.initializeGoogleButton();
            return;
        }
        if (this.googleScriptPromise) {
            this.googleScriptPromise.then(() => this.initializeGoogleButton()).catch((error) => {
                this.setGoogleFeedback(error?.message || 'Google sign-in unavailable.', 'error');
            });
            return;
        }
        this.googleScriptPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-google-identity]');
            if (existing) {
                const handleLoad = () => resolve(window.google);
                const handleError = () => reject(new Error('Failed to load Google identity script.'));
                existing.addEventListener('load', handleLoad, { once: true });
                existing.addEventListener('error', handleError, { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.dataset.googleIdentity = 'true';
            script.onload = () => resolve(window.google);
            script.onerror = () => reject(new Error('Failed to load Google identity script.'));
            document.head.appendChild(script);
        });
        this.googleScriptPromise.then(() => this.initializeGoogleButton()).catch((error) => {
            this.setGoogleFeedback(error?.message || 'Google sign-in unavailable.', 'error');
        });
    }

    initializeGoogleButton() {
        if (!this.googleContainer) {
            return;
        }
        const manager = this.identityManager;
        if (!manager || typeof manager.getGoogleClientId !== 'function') {
            this.setGoogleFeedback('Google sign-in unavailable.', 'error');
            return;
        }
        const clientId = manager.getGoogleClientId();
        if (!clientId) {
            this.setGoogleFeedback('Google sign-in is not configured.', 'error');
            return;
        }
        if (typeof window === 'undefined' || !window.google || !window.google.accounts || !window.google.accounts.id) {
            this.setGoogleFeedback('Google sign-in unavailable.', 'error');
            return;
        }
        if (!this.googleInitialized) {
            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: (response) => this.handleGoogleCredential(response),
            });
            this.googleInitialized = true;
        }
        if (this.googleButtonTarget) {
            this.googleButtonTarget.innerHTML = '';
            window.google.accounts.id.renderButton(this.googleButtonTarget, {
                theme: 'outline',
                size: 'medium',
                text: 'signup_with',
                width: 240,
            });
        }
        const identity = manager && typeof manager.getIdentity === 'function'
            ? manager.getIdentity()
            : null;
        if (identity && identity.provider === 'google') {
            this.setGoogleFeedback('Registered with Google.', 'success');
        } else if (!this.googleBusy && !this.identityBusy && !this.identityFormVisible) {
            this.setGoogleFeedback('Register with Google to save your progress.', 'info');
        }
    }

    async handleGoogleCredential(response) {
        if (!response || typeof response.credential !== 'string') {
            this.setGoogleFeedback('Unable to read Google response.', 'error');
            return;
        }
        if (!this.identityManager || typeof this.identityManager.authenticateWithGoogle !== 'function') {
            this.setGoogleFeedback('Google sign-in unavailable.', 'error');
            return;
        }
        this.setGoogleBusy(true);
        this.setGoogleFeedback('Registering with Google...', 'info');
        try {
            const identity = await this.identityManager.authenticateWithGoogle(response.credential);
            this.updateIdentityDisplay(identity);
            this.setStatus(`Signed in as ${identity.name} via Google.`, { type: 'success' });
            this.setGoogleFeedback('Registered with Google.', 'success');
        } catch (error) {
            const message = error && error.message ? error.message : 'Google sign-in failed.';
            this.setGoogleFeedback(message, 'error');
        } finally {
            this.setGoogleBusy(false);
        }
    }

    handleIdentitySignOut() {
        if (!this.identityManager || typeof this.identityManager.clearIdentity !== 'function') {
            return;
        }
        this.identityManager.clearIdentity();
        this.updateIdentityDisplay(null);
        this.showIdentityFeedback('You are playing as a guest.', 'info');
        this.setStatus('Playing as guest.', { type: 'info' });
    }

    setGoogleFeedback(message, type = 'info') {
        if (!this.googleFeedback) {
            return;
        }
        this.googleFeedback.textContent = message || '';
        this.googleFeedback.dataset.type = type || 'info';
    }

    setGoogleBusy(isBusy) {
        this.googleBusy = !!isBusy;
        this.refreshGoogleInteractivity();
    }

    refreshGoogleInteractivity() {
        if (!this.googleContainer) {
            return;
        }
        const disabled = this.googleBusy || this.identityBusy || this.identityFormVisible;
        if (disabled) {
            this.googleContainer.classList.add('busy');
        } else {
            this.googleContainer.classList.remove('busy');
        }
    }

    updateGoogleDisplay(identity) {
        if (!this.googleContainer) {
            return;
        }
        const manager = this.identityManager;
        const enabled = !!(manager && typeof manager.isGoogleAuthEnabled === 'function' && manager.isGoogleAuthEnabled());
        if (!enabled) {
            this.googleContainer.classList.remove('visible');
            this.setGoogleFeedback('', 'info');
            this.refreshGoogleInteractivity();
            return;
        }
        this.googleContainer.classList.add('visible');
        if (!this.googleInitialized) {
            this.ensureGoogleClient();
            return;
        }
        if (identity && identity.provider === 'google') {
            this.setGoogleFeedback('Registered with Google.', 'success');
        } else if (!this.googleBusy && !this.identityBusy && !this.identityFormVisible) {
            this.setGoogleFeedback('Register with Google to save your progress.', 'info');
        }
    }

    toggleIdentityForm(force) {
        if (!this.identityForm) {
            return;
        }
        const shouldShow = typeof force === 'boolean' ? force : !this.identityFormVisible;
        this.identityFormVisible = shouldShow;
        if (shouldShow) {
            this.identityForm.classList.add('visible');
            if (this.identityToggle) {
                this.identityToggle.disabled = true;
            }
            if (this.identityInput) {
                const identity = this.identityManager && typeof this.identityManager.getIdentity === 'function'
                    ? this.identityManager.getIdentity()
                    : null;
                const currentName = identity && identity.name ? identity.name : this.identityInput.value;
                this.identityInput.value = currentName || '';
                this.identityInput.disabled = false;
                setTimeout(() => {
                    if (this.identityInput) {
                        this.identityInput.focus();
                        this.identityInput.select();
                    }
                }, 0);
            }
            this.showIdentityFeedback('', 'info');
        } else {
            this.identityForm.classList.remove('visible');
            if (this.identityInput) {
                this.identityInput.disabled = false;
            }
            if (this.identityToggle) {
                this.identityToggle.disabled = this.identityBusy;
            }
            if (!this.identityBusy) {
                this.showIdentityFeedback('', 'info');
            }
        }
        this.refreshGoogleInteractivity();
    }

    setIdentityBusy(isBusy) {
        this.identityBusy = !!isBusy;
        if (this.identityInput) {
            this.identityInput.disabled = this.identityBusy;
        }
        if (this.identitySave) {
            this.identitySave.disabled = this.identityBusy;
        }
        if (this.identityCancel) {
            this.identityCancel.disabled = this.identityBusy;
        }
        if (this.identityToggle) {
            this.identityToggle.disabled = this.identityBusy || this.identityFormVisible;
        }
        if (this.identitySignOut) {
            const currentIdentity = this.identityManager && typeof this.identityManager.getIdentity === 'function'
                ? this.identityManager.getIdentity()
                : null;
            const hasIdentity = !!(currentIdentity && currentIdentity.id);
            this.identitySignOut.disabled = this.identityBusy || !hasIdentity;
        }
        this.refreshGoogleInteractivity();
    }

    showIdentityFeedback(message, type = 'info') {
        if (!this.identityFeedback) {
            return;
        }
        this.identityFeedback.textContent = message || '';
        this.identityFeedback.dataset.type = type || 'info';
    }

    async handleIdentitySubmit() {
        if (this.identityBusy) {
            return;
        }
        const nameValue = this.identityInput ? this.identityInput.value : '';
        const trimmed = typeof nameValue === 'string' ? nameValue.trim() : '';
        if (!trimmed.length) {
            this.showIdentityFeedback('Please enter a name.', 'error');
            if (this.identityInput) {
                this.identityInput.focus();
            }
            return;
        }
        if (!this.identityManager || typeof this.identityManager.saveName !== 'function') {
            this.showIdentityFeedback('Registration is currently unavailable.', 'error');
            return;
        }
        this.setIdentityBusy(true);
        this.showIdentityFeedback('Saving...', 'info');
        try {
            const identity = await this.identityManager.saveName(trimmed);
            this.showIdentityFeedback('Name saved.', 'success');
            this.updateIdentityDisplay(identity);
            this.toggleIdentityForm(false);
            this.setStatus(`Registered as ${identity.name}.`, { type: 'success' });
        } catch (error) {
            const message = error && error.message ? error.message : 'Unable to save name.';
            this.showIdentityFeedback(message, 'error');
        } finally {
            this.setIdentityBusy(false);
            if (!this.identityFormVisible) {
                this.showIdentityFeedback('', 'info');
            }
        }
    }

    show() {
        this.isActivated = true;
        if (this.overlay) {
            this.overlay.classList.add('visible');
        }
        this.visible = true;
        if (this.identityManager && typeof this.identityManager.getIdentity === 'function') {
            this.updateIdentityDisplay(this.identityManager.getIdentity());
        }
        if (this.game?.music && typeof this.game.music.playLobby === 'function' && !this.inGame) {
            this.game.music.playLobby();
        }
    }

    hide() {
        if (this.overlay) {
            this.overlay.classList.remove('visible');
        }
        this.visible = false;
        if (this.identityFormVisible) {
            this.toggleIdentityForm(false);
        }
        if (this.game?.music && typeof this.game.music.stop === 'function') {
            this.game.music.stop();
        }
    }

    isInGame() {
        return this.inGame;
    }

    activate() {
        if (this.isActivated) {
            return;
        }
        this.isActivated = true;
        this.show();
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
    }

    handleEviction(details) {
        this.waiting = false;
        this.waitingCity = null;
        this.waitingRole = null;
        this.inGame = false;

        const reason = typeof details?.reason === 'string' ? details.reason : 'orb';
        const cityId = Number.isFinite(details?.city) ? Number(details.city) : null;
        const attackerId = Number.isFinite(details?.attackerCity) ? Number(details.attackerCity) : null;
        const points = Number.isFinite(details?.points) ? Number(details.points) : null;

        const cityName = cityId !== null ? getCityDisplayName(cityId) : 'your city';
        const attackerName = attackerId !== null ? getCityDisplayName(attackerId) : null;

        const fragments = [];
        if (reason === 'death') {
            if (attackerName) {
                fragments.push(`${attackerName} eliminated you.`);
            } else {
                fragments.push('You were eliminated in combat.');
            }
        } else if (attackerName) {
            fragments.push(`${attackerName} destroyed ${cityName}.`);
        } else {
            fragments.push(`An enemy orb destroyed ${cityName}.`);
        }
        if (reason !== 'death' && points !== null && points > 0) {
            fragments.push(`They earned ${points} points.`);
        }

        if (this.isActivated) {
            this.show();
        }
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
        if (this.isActivated) {
            this.show();
        }
        this.setStatus('Connected. Choose a city to enter.', { type: 'info' });
        this.requestSnapshot();
    }

    handleDisconnected(reason) {
        this.inGame = false;
        this.waiting = false;
        this.waitingCity = null;
        this.waitingRole = null;
        if (this.isActivated) {
            this.show();
        }
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
