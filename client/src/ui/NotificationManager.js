class NotificationManager {
    constructor(options = {}) {
        this.maxVisible = Number.isFinite(options.maxVisible) ? Math.max(1, options.maxVisible) : 5;
        this.defaultTimeout = Number.isFinite(options.timeout) ? options.timeout : 5000;
        this.notifications = new Set();
        this.injectStyles();
        this.container = this.createContainer();
    }

    injectStyles() {
        if (typeof document === 'undefined') {
            return;
        }
        if (document.getElementById('battlecity-toast-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'battlecity-toast-styles';
        style.textContent = `
            #battlecity-toast-container {
                position: fixed;
                inset: auto 24px 24px auto;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                gap: 12px;
                width: min(340px, 92vw);
                z-index: 1200;
                pointer-events: none;
            }
            .battlecity-toast {
                background: rgba(16, 20, 32, 0.92);
                border-radius: 12px;
                border: 1px solid rgba(82, 104, 176, 0.35);
                box-shadow: 0 18px 40px rgba(5, 9, 20, 0.55);
                padding: 12px 16px 12px 18px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                color: #ecf2ff;
                pointer-events: auto;
                cursor: pointer;
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 160ms ease, transform 160ms ease;
            }
            .battlecity-toast[data-visible="true"] {
                opacity: 1;
                transform: translateY(0);
            }
            .battlecity-toast__title {
                font-weight: 600;
                letter-spacing: 0.3px;
                font-size: 14px;
            }
            .battlecity-toast__body {
                font-size: 13px;
                line-height: 1.45;
                opacity: 0.9;
            }
            .battlecity-toast[data-variant="success"] {
                border-color: rgba(82, 176, 125, 0.5);
            }
            .battlecity-toast[data-variant="warn"] {
                border-color: rgba(220, 156, 72, 0.5);
            }
            .battlecity-toast[data-variant="error"] {
                border-color: rgba(220, 92, 92, 0.5);
            }
        `;
        document.head.appendChild(style);
    }

    createContainer() {
        if (typeof document === 'undefined') {
            return null;
        }
        let container = document.getElementById('battlecity-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'battlecity-toast-container';
            const gameContainer = document.getElementById('game');
            if (gameContainer) {
                gameContainer.appendChild(container);
            } else {
                document.body.appendChild(container);
            }
        }
        return container;
    }

    normaliseMessage(message) {
        if (message === null || message === undefined) {
            return '';
        }
        if (Array.isArray(message)) {
            return message.filter((entry) => entry !== null && entry !== undefined)
                .map((entry) => `${entry}`)
                .join(' ');
        }
        return `${message}`;
    }

    notify(options = {}) {
        if (!this.container) {
            return null;
        }
        const title = options.title ? `${options.title}` : '';
        const message = this.normaliseMessage(options.message);
        const variant = options.variant || options.level || 'info';
        const timeout = Number.isFinite(options.timeout) ? options.timeout : this.defaultTimeout;

        while (this.notifications.size >= this.maxVisible) {
            const oldest = this.notifications.values().next().value;
            if (!oldest) {
                break;
            }
            this.dismiss(oldest);
        }

        const toast = document.createElement('div');
        toast.className = 'battlecity-toast';
        toast.dataset.variant = variant;

        if (title) {
            const heading = document.createElement('div');
            heading.className = 'battlecity-toast__title';
            heading.textContent = title;
            toast.appendChild(heading);
        }

        if (message) {
            const body = document.createElement('div');
            body.className = 'battlecity-toast__body';
            body.textContent = message;
            toast.appendChild(body);
        }

        const handleClick = () => this.dismiss(toast);
        toast.addEventListener('click', handleClick);

        this.container.appendChild(toast);
        this.notifications.add(toast);

        requestAnimationFrame(() => {
            toast.dataset.visible = 'true';
        });

        if (timeout > 0) {
            toast.__battlecityTimeout = window.setTimeout(() => this.dismiss(toast), timeout);
        }

        return toast;
    }

    dismiss(toast) {
        if (!toast || !this.notifications.has(toast)) {
            return;
        }
        this.notifications.delete(toast);
        toast.dataset.visible = 'false';
        if (toast.__battlecityTimeout) {
            window.clearTimeout(toast.__battlecityTimeout);
        }
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 180);
    }

    clear() {
        Array.from(this.notifications).forEach((toast) => this.dismiss(toast));
    }
}

export default NotificationManager;
