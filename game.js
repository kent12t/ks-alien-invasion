// Game Configuration
// Game Configuration is now loaded from config.js

// Global App State
let app;
let shadowContainer; // Layer for shadows (bottom)
let gameContainer;   // Layer for sprites (middle)
let uiContainer;     // Layer for UI (top)
let pirates = [];
let explosions = [];
let clickEffects = [];
let score = 0;
let lastSpawnTime = 0;
let soundManager;
const inputQueue = [];
let debugFPS = 60;
let lastFrameTimeMs = 0;

// Asset Storage
const resources = {
    // Arrays of PIXI.Texture
    captainFrames: [],
    minionFrames: [],
    parts: [],
    // Static Fallback Textures
    ship: null,
    kraken: null,
    floor: null,
    loaded: false
};

let bgSprite;

async function initPixi() {
    const canvasElement = document.getElementById('gameCanvas');

    // Create Pixi Application
    app = new PIXI.Application({
        view: canvasElement,
        resizeTo: window,
        backgroundColor: 0x000000, // Black
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1
    });

    // Create Layers (Order matters!)
    shadowContainer = new PIXI.Container();
    // shadowContainer.sortableChildren = true; // Optional, if we want shadows to sort distantly
    app.stage.addChild(shadowContainer);

    gameContainer = new PIXI.Container();
    gameContainer.sortableChildren = true; // Enable Z-Sorting
    app.stage.addChild(gameContainer);

    uiContainer = new PIXI.Container();
    app.stage.addChild(uiContainer);

    // Initial Loading Text
    const loadingStyle = new PIXI.TextStyle({
        fill: '#ffffff',
        fontFamily: 'monospace',
        fontSize: 24
    });
    const loadingText = new PIXI.Text('Loading Assets...', loadingStyle);
    loadingText.anchor.set(0.5);
    loadingText.x = app.screen.width / 2;
    loadingText.y = app.screen.height / 2;
    uiContainer.addChild(loadingText);

    // Setup Inputs
    setupEventListeners();
    soundManager = new SoundManager();

    // Load Assets
    await loadAssets();

    // Start Game
    resources.loaded = true;
    uiContainer.removeChild(loadingText);
    setupDebugUI();

    // Game Loop via Pixi Ticker
    // Game Loop via Pixi Ticker
    app.ticker.add(gameLoop);

    // Init BG if loaded
    if (resources.floor) {
        bgSprite = new PIXI.Sprite(resources.floor);
        bgSprite.anchor.set(0.5);
        resizeBackground();
        app.stage.addChildAt(bgSprite, 0); // Add at index 0 (bottom)
    }

    // Resize Handler for BG
    window.addEventListener('resize', () => {
        if (bgSprite) resizeBackground();
    });
}

function resizeBackground() {
    if (!bgSprite) return;
    const sw = app.screen.width;
    const sh = app.screen.height;
    const tex = bgSprite.texture;

    // Cover Logic
    const scale = Math.max(sw / tex.width, sh / tex.height);
    bgSprite.scale.set(scale);
    bgSprite.x = sw / 2;
    bgSprite.y = sh / 2;
}

async function loadAssets() {
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
            // and we don't want to await 240 HTTP requests strictly if not needed.
            // But to be consistent and prevent pop-in, let's stick to from() but maybe pre-load?
            // Actually, keep Texture.from for sequences to avoid massive load times blocking start
            // unless we want to batch load.
            const texture = PIXI.Texture.from(path);
            targetArray.push(texture);
        }
    };

    if (CONFIG.ANIMATION) {
        // We run these in parallel-ish
        const p1 = loadSequence('CaptainPngSeq', 'captain', CONFIG.ANIMATION.FRAME_COUNT_CAPTAIN, resources.captainFrames);
        const p2 = loadSequence('MinionPngSeq', 'minion', CONFIG.ANIMATION.FRAME_COUNT_MINION, resources.minionFrames);
        await Promise.all([p1, p2]);
    }

    // 3. Parts
    for (let i = 0; i < 14; i++) {
        const t = await PIXI.Texture.from(`assets/part${i}.png`);
        resources.parts.push(t);
    }
}

// Setup Debug UI
let fpsText;
let countText;
function setupDebugUI() {
    const style = new PIXI.TextStyle({
        fill: '#00ff00',
        fontFamily: 'monospace',
        fontSize: 14,
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: '#000000',
        dropShadowBlur: 4,
        dropShadowDistance: 0
    });

    fpsText = new PIXI.Text('FPS: 0', style);
    fpsText.x = 10;
    fpsText.y = 10;
    uiContainer.addChild(fpsText);

    countText = new PIXI.Text('Entities: 0', style);
    countText.x = 10;
    countText.y = 30;
    uiContainer.addChild(countText);
}

// Sound Manager (Same as before)
class SoundManager {
    constructor() {
        this.audioContext = null;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            // console.warn('Web Audio API not supported');
        }
    }

    playShot() {
        if (!this.audioContext) return;
        const o = this.audioContext.createOscillator();
        const g = this.audioContext.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(600, this.audioContext.currentTime);
        o.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + 0.3);
        g.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        o.connect(g);
        g.connect(this.audioContext.destination);
        o.start();
        o.stop(this.audioContext.currentTime + 0.35);
    }

    playExplosion() {
        if (!this.audioContext) return;
        const bufferSize = this.audioContext.sampleRate * 0.5;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * i / bufferSize);
        }
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);
        gain.gain.setValueAtTime(0.8, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        noise.start();
    }
}

function setupEventListeners() {
    function queueInput(x, y) {
        inputQueue.push({ x: x, y: y });
    }
    const c = app.view;
    c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    c.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        queueInput(e.clientX, e.clientY);
    }, { capture: true });
    c.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    c.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault(), { passive: false });

    // Resize Handling
    window.addEventListener('resize', () => {
        // Pixi handles resizeTo: window automatically, but we might need to update center point logic if we cached it
    });
}

// ------------------------------------------------------------------
// PIXI ENTITIES
// ------------------------------------------------------------------

class Pirate {
    constructor() {
        this.type = Math.random() > 0.5 ? 'captain' : 'minion';

        // Shadow Setup (Back Layer)
        this.shadow = new PIXI.Graphics();
        this.shadow.beginFill(0x000000, 0.3); // Black, 30% opacity
        this.shadow.drawEllipse(0, 0, 100, 30); // Base size oval
        this.shadow.endFill();
        shadowContainer.addChild(this.shadow); // Add to Shadow Layer

        // Sprite Setup (Front Layer)
        this.sprite = new PIXI.Sprite();
        this.sprite.anchor.set(0.5, 1.0); // Bottom Center
        gameContainer.addChild(this.sprite);

        // Assets
        this.frames = this.type === 'captain' ? resources.captainFrames : resources.minionFrames;
        this.fallback = this.type === 'captain' ? resources.ship : resources.kraken;
        this.frameCount = this.frames.length;

        // Visual Init
        this.sprite.texture = this.fallback; // Start fallback, replace in update

        // Logic
        this.initLogic();
    }

    initLogic() {
        this.frameIndex = Math.random() * this.frameCount;

        // Fixed Animation Speed: 30 FPS (0.5 frames per 60hz tick)
        this.animSpeed = 0.5;

        this.animDir = 1;

        // Pathing Math (Same as original)
        const stopPerspective = Math.max(0.01, CONFIG.FOCAL_LENGTH + CONFIG.STOP_Z);
        const stopScale = CONFIG.FOCAL_LENGTH / stopPerspective;

        // Define Safe Screen Width
        // margin = positive value to keep them INSIDE the screen
        const margin = CONFIG.SPAWN_MARGIN;
        const safeWidthHalf = (app.screen.width / 2) - margin;
        const maxWorldX = Math.max(0, safeWidthHalf / stopScale);

        this.baseWorldX = (Math.random() - 0.5) * 2 * maxWorldX;
        this.worldX = this.baseWorldX; // Current X

        // Sticky Floor: World Y
        this.worldY = CONFIG.FLOOR_Y;

        // Start far away
        this.z = CONFIG.Z_START;

        // Varied Speed: 0.5x to 1.5x of base speed
        this.speed = CONFIG.Z_SPEED * (0.5 + Math.random() * 1.0);

        this.stopZ = CONFIG.STOP_Z + Math.random() * 50;

        this.screenX = 0;
        this.screenY = 0;
        this.scale = 0;
        this.radius = 0;

        // Random Size Variation: +/- 10%
        this.sizeMultiplier = 0.9 + Math.random() * 0.2;

        // Wiggle / Wander Properties
        this.wanderPhase = Math.random() * Math.PI * 2;
        this.wanderSpeed = 0.02 + Math.random() * 0.03;
        this.wanderAmp = 50 + Math.random() * 100; // Wander width

        // Jump Properties
        this.jumpY = 0; // Height off ground (positive up)
        this.jumpVy = 0;
        this.gravity = 0.8; // Gravity force
        this.isJumping = false;
        this.nextJumpTime = 60 + Math.random() * 200; // Frames until next jump
    }

    update() {
        // z move
        if (this.z > this.stopZ) this.z -= this.speed;
        else this.z = this.stopZ;

        // x wander
        this.wanderPhase += this.wanderSpeed;
        this.worldX = this.baseWorldX + Math.sin(this.wanderPhase) * this.wanderAmp;

        // y jump
        if (this.isJumping) {
            this.jumpY += this.jumpVy;
            this.jumpVy -= this.gravity;
            if (this.jumpY <= 0) {
                this.jumpY = 0;
                this.isJumping = false;
                this.nextJumpTime = 60 + Math.random() * 240;
            }
        } else {
            this.nextJumpTime--;
            if (this.nextJumpTime <= 0) {
                this.isJumping = true;
                this.jumpVy = 15 + Math.random() * 10;
            }
        }

        // Animation
        if (this.frameCount > 0) {
            this.frameIndex += this.animSpeed * this.animDir;
            if (this.frameIndex >= this.frameCount - 1) {
                this.frameIndex = this.frameCount - 1;
                this.animDir = -1;
            } else if (this.frameIndex <= 0) {
                this.frameIndex = 0;
                this.animDir = 1;
            }
        }

        // Projection
        const perspective = Math.max(0.01, CONFIG.FOCAL_LENGTH + this.z);
        this.scale = (CONFIG.FOCAL_LENGTH / perspective) * this.sizeMultiplier;

        const cx = app.screen.width / 2;
        const cy = app.screen.height / 2;

        this.screenX = cx + this.worldX * this.scale;

        // Shadow Y (Always on floor)
        const shadowScreenY = cy + this.worldY * this.scale;

        // Sprite Y (Affected by Jump)
        const effectiveWorldY = this.worldY - this.jumpY;
        this.screenY = cy + effectiveWorldY * this.scale;

        // Update Sprite
        this.sprite.x = this.screenX;
        this.sprite.y = this.screenY;

        // Update Shadow
        this.shadow.x = this.screenX;
        this.shadow.y = shadowScreenY;

        // Shadow Scale: shrinks as they jump higher
        // Base scale matches sprite scale perspective
        // Factor: at jumpY=0 -> 1.0. At jumpY=200 -> 0.5?
        const jumpFactor = Math.max(0.5, 1.0 - (this.jumpY / 300));
        this.shadow.scale.set(this.scale * jumpFactor);

        // Normalize sprite texture size
        const tex = this.getCurrentTexture();
        if (tex) {
            this.sprite.texture = tex;
            const w = tex.width || 1000;
            const h = tex.height || 1000;
            const norm = 500 / Math.max(w, h);
            this.sprite.scale.set(this.scale * norm);
        } else {
            this.sprite.scale.set(this.scale * 0.5);
        }

        // Z-Index for Sorting
        // Pixi sortableChildren + zIndex.
        // High Z-Index = Drawn on Top.
        // We want Close Objects (Low 'z') to be Drawn on Top.
        // So zIndex should be Higher for Lower z.
        // zIndex = -z works perfectly.
        // Shadow should be slightly under sprite
        this.sprite.zIndex = -this.z;
        this.shadow.zIndex = -this.z - 0.1;

        // Visibility
        this.sprite.alpha = 1.0;
        this.shadow.alpha = 1.0;

        // Visual Fog (Depth Tinting)
        if (CONFIG.FOG && CONFIG.FOG.ENABLED) {
            // Calculate Fog Factor (0.0 = Clear, 1.0 = Max Fog)
            let fogFactor = (this.z - CONFIG.FOG.START_Z) / (CONFIG.FOG.END_Z - CONFIG.FOG.START_Z);
            fogFactor = Math.max(0, Math.min(1, fogFactor)); // Clamp 0-1

            // Interpolate Color (White -> FogColor)
            // Since tint multiplies, we want 1.0 (0xFF) -> FogColor (0x00) assuming black fog.
            // If fog is black: value = 1.0 - fogFactor.

            // Simple "Fade to Black" Logic:
            const val = Math.floor(255 * (1.0 - fogFactor));
            const tint = (val << 16) | (val << 8) | val;

            this.sprite.tint = tint;

            // Shadow is already black alpha, but we can dim it further or leave it.
            // Let's tint it too so it fades out completely in pitch black
            this.shadow.tint = tint;
        }
    }

    getCurrentTexture() {
        if (this.frameCount > 0) {
            const idx = Math.floor(this.frameIndex);
            if (this.frames[idx]) return this.frames[idx];
        }
        return this.fallback;
    }

    destroy() {
        gameContainer.removeChild(this.sprite);
        this.sprite.destroy();
        shadowContainer.removeChild(this.shadow);
        this.shadow.destroy();
    }
}

class AoERing {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.g = new PIXI.Graphics();
        gameContainer.addChild(this.g);
        this.radius = 10;
        this.maxRadius = CONFIG.AOE_RADIUS;
        this.life = 1.0;
        // Effect should be on top of pirates?
        this.g.zIndex = 2000; // Very high zIndex
    }
    update() {
        this.life -= 0.06;
        this.radius += (this.maxRadius - this.radius) * 0.25;

        // Draw
        this.g.clear();
        this.g.lineStyle(4, 0xFFD700, this.life);
        this.g.beginFill(0xFFD700, 0.1 * this.life);
        this.g.drawCircle(this.x, this.y, this.radius);
        this.g.endFill();

        if (this.life <= 0) {
            this.g.clear();
            gameContainer.removeChild(this.g);
            this.g.destroy();
        }
    }
}

class Explosion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.particles = [];
        this.container = new PIXI.Container();
        this.container.zIndex = 2000; // Foreground
        gameContainer.addChild(this.container);

        const partCount = 8 + Math.floor(Math.random() * 6);
        for (let i = 0; i < partCount; i++) {
            // Random texture
            let tex = null;
            if (resources.parts.length > 0) {
                tex = resources.parts[Math.floor(Math.random() * resources.parts.length)];
            }
            if (tex) {
                const s = new PIXI.Sprite(tex);
                s.anchor.set(0.5);

                // Configurable Random Size
                const size = CONFIG.PARTICLE_SIZE_MIN + Math.random() * (CONFIG.PARTICLE_SIZE_MAX - CONFIG.PARTICLE_SIZE_MIN);
                s.width = size;
                s.height = size;

                // particle physics props
                const speed = CONFIG.PARTICLE_SPEED_MIN + Math.random() * (CONFIG.PARTICLE_SPEED_MAX - CONFIG.PARTICLE_SPEED_MIN);
                const angle = Math.random() * 6.28;

                s.userData = {
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 5,
                    rotSpeed: (Math.random() - 0.5) * 0.2,
                    dead: false
                };

                this.container.addChild(s);
                this.particles.push(s);
            }
        }
    }

    update() {
        let active = 0;
        for (let p of this.particles) {
            const d = p.userData;
            if (d.dead) continue;

            p.x += d.vx;
            p.y += d.vy;
            d.vy += 0.3; // Gravity
            p.rotation += d.rotSpeed;

            p.scale.x -= 0.025;
            p.scale.y -= 0.025;

            if (p.scale.x <= 0) {
                p.scale.set(0);
                d.dead = true;
                p.visible = false;
            } else {
                active++;
            }
        }

        if (active === 0) {
            this.destroy();
        } else {
            // Sync container pos
            this.container.x = this.x;
            this.container.y = this.y;
        }
    }

    destroy() {
        if (this.container.parent) {
            gameContainer.removeChild(this.container);
            this.container.destroy({ children: true });
        }
        this.particles = [];
    }
}


function processInputs() {
    while (inputQueue.length > 0) {
        const input = inputQueue.shift();
        const x = input.x;
        const y = input.y;

        clickEffects.push(new AoERing(x, y));
        if (soundManager) soundManager.playShot();

        const hitRadiusSq = CONFIG.AOE_RADIUS * CONFIG.AOE_RADIUS;
        let hitCount = 0;

        // Check hits
        // Reverse iterate for splicing safely
        for (let i = pirates.length - 1; i >= 0; i--) {
            const p = pirates[i];

            // Range checks
            if (p.z > CONFIG.MAX_HIT_Z || p.z < CONFIG.MIN_HIT_Z) continue;

            const dx = x - p.screenX;
            // Approx Center Y (since screenY is Bottom/Feet)
            // Sprite is roughly 400-500 unscaled height. Scaled height is ~400*scale.
            // Center is screenY - 200*scale.
            const spriteCenterY = p.screenY - (200 * p.scale);
            const dy = y - spriteCenterY;

            if (dx * dx + dy * dy < hitRadiusSq) {
                // Hit!
                pirates.splice(i, 1);
                explosions.push(new Explosion(p.screenX, spriteCenterY));
                p.destroy(); // Remove Pixi Sprite
                hitCount++;
                score++;
            }
        }

        if (hitCount > 0 && soundManager) soundManager.playExplosion();
    }

    // Update Score
    const scoreDisplay = document.getElementById('score');
    if (scoreDisplay) scoreDisplay.textContent = `pirates defeated: ${score}`;
}

// ------------------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------------------

function gameLoop(delta) {
    if (!resources.loaded) return;

    // Process Inputs
    processInputs();

    // Spawning
    const now = performance.now();
    if (now - lastSpawnTime > CONFIG.SPAWN_RATE) {
        pirates.push(new Pirate());
        lastSpawnTime = now;
        if (CONFIG.SPAWN_RATE > 500) CONFIG.SPAWN_RATE -= 10;
    }

    // Update Pirates
    for (let p of pirates) {
        p.update();
    }

    // FX
    for (let i = explosions.length - 1; i >= 0; i--) {
        const ex = explosions[i];
        ex.update();
        if (ex.particles.length === 0) explosions.splice(i, 1);
    }

    for (let i = clickEffects.length - 1; i >= 0; i--) {
        const ce = clickEffects[i];
        ce.update();
        if (ce.life <= 0) clickEffects.splice(i, 1);
    }

    // Background Gradient?
    // Pixi background color handles the clear.
    // Horizon line?
    // We can add a Graphics object for that, but let's keep it simple for now.

    // Debug Stats
    if (fpsText) fpsText.text = `FPS: ${Math.round(app.ticker.FPS)}`;
    if (countText) countText.text = `Entities: ${pirates.length}`;
}

// Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPixi);
} else {
    initPixi();
}
