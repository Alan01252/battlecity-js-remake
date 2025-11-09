import * as PIXICore from 'pixi.js';
import pixiTilemap, { installTilemap } from '../pixi-tilemap';

const PIXI = { ...PIXICore };

installTilemap(PIXI);

if (PIXI.settings) {
    PIXI.settings.CREATE_IMAGE_BITMAP = false;
    if (PIXI.SCALE_MODES) {
        PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
    }
}

if (typeof window !== 'undefined') {
    window.PIXI = PIXI;
}

export default PIXI;
