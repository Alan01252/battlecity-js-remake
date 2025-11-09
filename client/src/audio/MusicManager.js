const LOBBY_TRACKS = [
    new URL('../../data/music/bc1.ogg', import.meta.url).href,
    new URL('../../data/music/bc2.ogg', import.meta.url).href,
    new URL('../../data/music/bc3.ogg', import.meta.url).href,
    new URL('../../data/music/bc5.ogg', import.meta.url).href,
    new URL('../../data/music/bc6.ogg', import.meta.url).href,
    new URL('../../data/music/bc8.ogg', import.meta.url).href,
    new URL('../../data/music/bc9.ogg', import.meta.url).href,
];

const pickRandomIndex = (length) => {
    if (!Number.isFinite(length) || length <= 0) {
        return 0;
    }
    return Math.floor(Math.random() * length);
};

export default class MusicManager {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.mediaElement = null;
        this.mediaSourceNode = null;
        this.gainNode = null;
        this.trackList = null;
        this.currentIndex = 0;
        this.isPlayingLobby = false;
        this.onTrackEnded = () => this.handleTrackEnded();
    }

    resolveTrackList() {
        if (this.trackList) {
            return this.trackList;
        }
        if (typeof window === 'undefined') {
            this.trackList = [];
            return this.trackList;
        }
        const available = Array.isArray(LOBBY_TRACKS) ? LOBBY_TRACKS.filter(Boolean) : [];
        if (!available.length) {
            console.warn('No lobby music tracks configured; music manager idle.');
        }
        this.trackList = available;
        return this.trackList;
    }

    ensureMediaElement() {
        if (this.mediaElement || typeof window === 'undefined') {
            return;
        }
        const element = new Audio();
        element.preload = 'auto';
        element.loop = false;
        element.crossOrigin = 'anonymous';
        element.addEventListener('ended', this.onTrackEnded);
        this.mediaElement = element;

        const context = this.audioManager?.getContext?.();
        if (context) {
            try {
                this.mediaSourceNode = context.createMediaElementSource(element);
                this.gainNode = context.createGain();
                this.gainNode.gain.value = 0.45;
                this.mediaSourceNode.connect(this.gainNode);
                this.gainNode.connect(context.destination);
            } catch (_error) {
                console.debug('Failed to connect lobby music to AudioContext', _error);
                this.gainNode = null;
                this.mediaSourceNode = null;
                this.mediaElement.volume = 0.45;
            }
        } else {
            this.mediaElement.volume = 0.45;
        }
    }

    async playLobby() {
        const tracks = this.resolveTrackList();
        if (!tracks.length) {
            return;
        }
        this.ensureMediaElement();
        if (!this.mediaElement) {
            return;
        }
        if (!this.isPlayingLobby) {
            this.currentIndex = pickRandomIndex(tracks.length);
        }
        this.isPlayingLobby = true;
        await this.startCurrentTrack();
    }

    async startCurrentTrack() {
        const tracks = this.resolveTrackList();
        if (!this.mediaElement || !tracks.length) {
            return;
        }
        const index = ((this.currentIndex % tracks.length) + tracks.length) % tracks.length;
        const src = tracks[index];
        if (!src) {
            return;
        }
        if (this.audioManager && typeof this.audioManager.resumeContext === 'function') {
            try {
                await this.audioManager.resumeContext();
            } catch (_error) {
                console.debug('Unable to resume AudioContext for lobby music', _error);
            }
        }
        if (this.mediaElement.src !== src) {
            this.mediaElement.src = src;
        }
        try {
            await this.mediaElement.play();
        } catch (_error) {
            console.debug('Lobby music playback blocked', _error);
        }
    }

    handleTrackEnded() {
        if (!this.isPlayingLobby) {
            return;
        }
        const tracks = this.resolveTrackList();
        if (!tracks.length) {
            return;
        }
        this.currentIndex = (this.currentIndex + 1) % tracks.length;
        this.startCurrentTrack();
    }

    stop() {
        this.isPlayingLobby = false;
        if (this.mediaElement) {
            this.mediaElement.pause();
            try {
                this.mediaElement.currentTime = 0;
            } catch (_error) {
                // ignored
            }
        }
    }
}
