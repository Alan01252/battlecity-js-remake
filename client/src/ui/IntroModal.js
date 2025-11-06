class IntroModal {
    constructor(options = {}) {
        this.onStart = typeof options.onStart === 'function' ? options.onStart : null;
        this.heading = options.heading || 'Battle City Remastered';
        this.blurb = options.blurb || 'Roll into the war for control of the city. Team up, build, and rain steel.';
        this.buttonLabel = options.buttonLabel || 'Play Now';
        this.root = null;
        this.button = null;
        this.ensureStyles();
        this.createOverlay();
    }

    ensureStyles() {
        if (document.getElementById('intro-modal-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'intro-modal-styles';
        style.textContent = `
            .intro-modal-overlay {
                position: fixed;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: radial-gradient(circle at top, rgba(12, 18, 36, 0.92), rgba(4, 6, 10, 0.94));
                z-index: 10000;
                pointer-events: auto;
            }
            .intro-modal-panel {
                max-width: 520px;
                width: calc(100vw - 64px);
                background: rgba(18, 22, 34, 0.9);
                border: 1px solid rgba(75, 95, 140, 0.6);
                border-radius: 16px;
                padding: 48px 40px;
                color: #f5f8ff;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                text-align: center;
                box-shadow: 0 32px 56px rgba(0, 0, 0, 0.55);
                display: grid;
                gap: 28px;
            }
            .intro-modal-heading {
                font-size: clamp(28px, 5vw, 40px);
                font-weight: 700;
                margin: 0;
                letter-spacing: 0.6px;
                text-transform: uppercase;
            }
            .intro-modal-copy {
                margin: 0;
                font-size: 16px;
                line-height: 1.6;
                color: rgba(218, 227, 255, 0.85);
            }
            .intro-modal-button {
                align-self: center;
                border: none;
                border-radius: 999px;
                padding: 16px 44px;
                font-size: 18px;
                font-weight: 600;
                letter-spacing: 0.8px;
                text-transform: uppercase;
                color: #0b1022;
                background: linear-gradient(135deg, #ffda5d, #ff8a3d);
                cursor: pointer;
                transition: transform 0.18s ease, box-shadow 0.18s ease;
                box-shadow: 0 12px 24px rgba(255, 136, 61, 0.35);
            }
            .intro-modal-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 16px 28px rgba(255, 136, 61, 0.45);
            }
            .intro-modal-button:active {
                transform: translateY(1px);
                box-shadow: 0 10px 18px rgba(255, 136, 61, 0.4);
            }
        `;
        document.head.appendChild(style);
    }

    createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'intro-modal-overlay';

        const panel = document.createElement('div');
        panel.className = 'intro-modal-panel';

        const heading = document.createElement('h1');
        heading.className = 'intro-modal-heading';
        heading.textContent = this.heading;

        const blurb = document.createElement('p');
        blurb.className = 'intro-modal-copy';
        blurb.textContent = this.blurb;

        const button = document.createElement('button');
        button.className = 'intro-modal-button';
        button.type = 'button';
        button.textContent = this.buttonLabel;
        button.addEventListener('click', () => this.handleStart(), { once: true });

        panel.appendChild(heading);
        panel.appendChild(blurb);
        panel.appendChild(button);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        this.root = overlay;
        this.button = button;
    }

    async handleStart() {
        if (this.button) {
            this.button.disabled = true;
        }
        try {
            if (this.onStart) {
                await this.onStart();
            }
        } catch (error) {
            console.warn('[intro] Failed to handle start action', error?.message || error);
        } finally {
            this.destroy();
        }
    }

    destroy() {
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        this.root = null;
        this.button = null;
    }
}

export default IntroModal;

