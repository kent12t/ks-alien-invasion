import { CONFIG } from '../config.js';

export const resources = {
    // Arrays of PIXI.Texture
    captainFrames: [],
    minionFrames: [],
    spaceshipFrames: [],
    // Physics / Interaction
    parts: [],
    // Overlays
    overlays: [],
    // Static Fallback Textures
    ship: null,
    kraken: null,
    floor: null,
    // Music
    music: null,
    loaded: false
};

export async function loadAssets() {
    // 1. Textures for Static
    // Use PIXI.Assets.load to ensure dimensions are ready for resize logic
    resources.ship = await PIXI.Assets.load('assets/pirate_ship.png');
    resources.kraken = await PIXI.Assets.load('assets/kraken.png');
    resources.floor = await PIXI.Assets.load('assets/FloorBG.png');

    // 2. Texture Sequences
    const loadSequence = async (folder, prefix, count, targetArray) => {
        for (let i = 0; i < count; i++) {
            const indexStr = i.toString().padStart(5, '0');
            const path = `assets/${folder}/${prefix}_${indexStr}.png`;
            // For sequences, Texture.from is faster/easier as exact frame timing isn't critical
            const texture = PIXI.Texture.from(path);
            targetArray.push(texture);
        }
    };

    if (CONFIG.ANIMATION) {
        // We run these in parallel-ish
        const p1 = loadSequence('CaptainPngSeq', 'captain', CONFIG.ANIMATION.FRAME_COUNT_CAPTAIN, resources.captainFrames);
        const p2 = loadSequence('MinionPngSeq', 'minion', CONFIG.ANIMATION.FRAME_COUNT_MINION, resources.minionFrames);
        const p3 = loadSequence('SpaceShip', 'JustSpaceship', CONFIG.ANIMATION.FRAME_COUNT_SPACESHIP, resources.spaceshipFrames);
        await Promise.all([p1, p2, p3]);
    }

    // 3. Parts
    for (let i = 0; i < 14; i++) {
        const t = await PIXI.Texture.from(`assets/part${i}.png`);
        resources.parts.push(t);
    }

    // 4. Overlays
    for (const path of CONFIG.OVERLAYS.ASSETS) {
        const t = await PIXI.Assets.load(path);
        resources.overlays.push(t);
    }

    resources.loaded = true;
}
