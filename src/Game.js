import { CONFIG } from './config.js';
import { resources, loadAssets } from './managers/AssetManager.js';
import SoundManager from './managers/SoundManager.js';
import { Spaceship } from './entities/Spaceship.js';
import { Pirate } from './entities/Pirate.js';
import { AoERing } from './entities/AoERing.js';
import { Explosion } from './entities/Explosion.js';

export class Game {
    constructor() {
        this.app = null;
        this.shadowContainer = null;
        this.gameContainer = null;
        this.uiContainer = null;

        this.soundManager = null;
        this.spaceship = null;

        this.pirates = [];
        this.explosions = [];
        this.clickEffects = [];
        this.inputQueue = [];

        this.score = 0;
        this.lastSpawnTime = 0;
        this.gameStartTime = 0;
        this.gameTime = 0; // Second counter
        this.currentWaveIndex = -1;
        this.bossSpawned = false;
        this.bossDefeated = false;

        // Music
        this.musicStarted = false;
        this.musicFadingOut = false;

        // Frame guard: skip first frame to avoid accumulated delta from WebGL context loss
        this.firstFrame = true;

        // Debug
        this.debugFPS = 60;
        this.lastFrameTimeMs = 0;
        this.showDebug = false;
        this.fpsText = null;
        this.countText = null;

        this.bgSprite = null;
    }

    async init() {
        const canvasElement = document.getElementById('gameCanvas');

        // Create Pixi Application
        this.app = new PIXI.Application({
            view: canvasElement,
            resizeTo: window,
            backgroundColor: 0x000000, // Black
            antialias: true,
            autoDensity: true,
            resolution: window.devicePixelRatio || 1
        });

        // Create Layers
        this.shadowContainer = new PIXI.Container();
        this.app.stage.addChild(this.shadowContainer);

        this.gameContainer = new PIXI.Container();
        this.gameContainer.sortableChildren = true;
        this.app.stage.addChild(this.gameContainer);

        this.uiContainer = new PIXI.Container();
        this.app.stage.addChild(this.uiContainer);

        // Loading Screen
        const loadingStyle = new PIXI.TextStyle({
            fill: '#ffffff',
            fontFamily: 'monospace',
            fontSize: 24
        });
        const loadingText = new PIXI.Text('Loading Assets...', loadingStyle);
        loadingText.anchor.set(0.5);
        loadingText.x = this.app.screen.width / 2;
        loadingText.y = this.app.screen.height / 2;
        this.uiContainer.addChild(loadingText);

        // Setup Inputs
        this.setupEventListeners();
        this.soundManager = new SoundManager();

        // Load Assets
        await loadAssets();

        // Start Game
        this.uiContainer.removeChild(loadingText);
        this.setupDebugUI();
        this.uiContainer.visible = false;

        // Init Game entities
        this.gameStartTime = Date.now();
        this.spaceship = new Spaceship(this.app, this.gameContainer);

        // Init BG
        if (resources.floor) {
            this.bgSprite = new PIXI.Sprite(resources.floor);
            this.bgSprite.anchor.set(0.5);
            this.resizeBackground();
            this.app.stage.addChildAt(this.bgSprite, 0);
        }

        // Game Loop
        this.app.ticker.add((delta) => this.gameLoop(delta));
    }

    resizeBackground() {
        if (!this.bgSprite) return;
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;
        const tex = this.bgSprite.texture;

        const scale = Math.max(sw / tex.width, sh / tex.height);
        this.bgSprite.scale.set(scale);
        this.bgSprite.x = sw / 2;
        this.bgSprite.y = sh / 2;
    }

    setupEventListeners() {
        const c = this.app.view;
        c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        c.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            // Capture coordinates immediately before any other work
            const x = e.clientX;
            const y = e.clientY;

            // Resume audio context synchronously (fire-and-forget) on every click
            if (this.soundManager) {
                this.soundManager.resumeAudioContext();

                // Start background music on first click (must be in user gesture)
                if (!this.musicStarted && resources.music) {
                    this.musicStarted = true;
                    this.soundManager.playBackgroundMusic(resources.music, 65);
                }
            }

            this.inputQueue.push({ x, y });
        }, { capture: true });
        c.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
        c.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
        c.addEventListener('contextmenu', (e) => e.preventDefault(), { passive: false });

        window.addEventListener('resize', () => {
            if (this.bgSprite) this.resizeBackground();
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === '1') {
                this.showDebug = !this.showDebug;
                if (this.uiContainer) this.uiContainer.visible = this.showDebug;
            }
        });
    }

    setupDebugUI() {
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

        this.fpsText = new PIXI.Text('FPS: 0', style);
        this.fpsText.x = 10;
        this.fpsText.y = 10;
        this.uiContainer.addChild(this.fpsText);

        this.countText = new PIXI.Text('Entities: 0', style);
        this.countText.x = 10;
        this.countText.y = 30;
        this.uiContainer.addChild(this.countText);
    }

    gameLoop(delta) {
        // First frame guard: force normal delta to prevent fast-forward from WebGL context loss
        if (this.firstFrame) {
            this.firstFrame = false;
            delta = 1.0;
        }

        // Clamp delta to prevent spikes during frame drops
        delta = Math.min(delta, 3.0);
        
        const now = Date.now();
        this.gameTime = (now - this.gameStartTime) / 1000;

        if (this.lastFrameTimeMs) {
            this.debugFPS = 1000 / (now - this.lastFrameTimeMs);
        }
        this.lastFrameTimeMs = now;

        if (this.showDebug) {
            this.fpsText.text = `FPS: ${Math.round(this.debugFPS)}`;
            this.countText.text = `Entities: ${this.pirates.length + this.explosions.length}`;
        }

        // Logic
        this.spawnLogic(now);
        this.processInputs();

        // END GAME SEQUENCE (90s = 1m 30s)
        if (this.gameTime >= 90 && this.spaceship && this.spaceship.state !== 'leaving') {
            // Kill all existing minions/boss
            for (let i = this.pirates.length - 1; i >= 0; i--) {
                const p = this.pirates[i];
                this.explosions.push(new Explosion(p.screenX, p.screenY, this.gameContainer));
                p.destroy();
            }
            this.pirates = []; // Clear array

            // Ship leaves
            this.spaceship.state = 'leaving';

            // Fade out music when ship leaves
            if (this.soundManager && !this.musicFadingOut) {
                this.musicFadingOut = true;
                this.soundManager.fadeOutMusic(3.0); // 3 second fade out
            }
        }

        // Update Entities
        this.spaceship.update(delta); // Or pass gameTime?

        // Pirates
        for (let i = this.pirates.length - 1; i >= 0; i--) {
            const p = this.pirates[i];
            p.update(delta);
            if (p.isBoss) p.drawBossUI();

            // Clean up off-screen
            // Using logic from original? Or better one?
            // Original didn't verify clean up except on hit/kill or if they move past certain point if desired?
            // "if (this.z > this.stopZ)" implies they stop at line.
            // There was no auto-despawn in code unless hit.
        }

        // Explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const e = this.explosions[i];
            e.update(delta);
            if (e.particles.length === 0) {
                this.explosions.splice(i, 1);
            }
        }

        // Click Effects
        for (let i = this.clickEffects.length - 1; i >= 0; i--) {
            const c = this.clickEffects[i];
            c.update(delta);
            if (c.life <= 0) {
                this.clickEffects.splice(i, 1);
            }
        }


    }

    spawnLogic(now) {
        if (this.bossDefeated) return;

        // Wave Logic
        let currentWave = null;
        for (let i = 0; i < CONFIG.WAVES.length; i++) {
            const w = CONFIG.WAVES[i];
            if (this.gameTime >= w.start && this.gameTime < w.end) {
                currentWave = w;
                this.currentWaveIndex = i;
                break;
            }
        }

        if (currentWave) {
            // Check Boss
            if (currentWave.type === 'boss_wave' && !this.bossSpawned) {
                this.bossSpawned = true;
                const boss = new Pirate(this.app, this.gameContainer, this.shadowContainer, true);
                this.pirates.push(boss);
                // Spaceship STAYS until end
            }

            // Minion Spawning
            // If boss wave, we might still spawn minions? Original code didn't specify mixed.
            // Let's assume spawn rate applies to minions always unless it's ONLY boss?
            // "count: 30" -> Maybe limit?

            // Simple timer based spawn
            if (now - this.lastSpawnTime > CONFIG.SPAWN_RATE) {
                this.lastSpawnTime = now;
                // Don't spawn if only boss and boss is alive? 
                // Original code was simpler, let's just stick to:

                // If boss wave, maybe spawn minions too?
                // Let's spawn minion if it's NOT just the boss instant.

                const p = new Pirate(this.app, this.gameContainer, this.shadowContainer, false);
                this.pirates.push(p);
            }
        }

        // END GAME SEQUENCE (90s = 1m 30s)
        if (this.gameTime >= 90 && this.spaceship && this.spaceship.state !== 'leaving') {
            // Kill all existing minions/boss
            for (let i = this.pirates.length - 1; i >= 0; i--) {
                const p = this.pirates[i];
                this.explosions.push(new Explosion(p.screenX, p.screenY, this.gameContainer));
                p.destroy();
            }
            this.pirates = []; // Clear array

            // Ship leaves
            this.spaceship.state = 'leaving';
        }
    }

    processInputs() {
        while (this.inputQueue.length > 0) {
            const input = this.inputQueue.shift();
            const x = input.x;
            const y = input.y;

            this.clickEffects.push(new AoERing(x, y, this.gameContainer));
            if (this.soundManager) this.soundManager.playShot();

            let hitCount = 0;

            // Check hits
            for (let i = this.pirates.length - 1; i >= 0; i--) {
                const p = this.pirates[i];

                // Range checks
                if (p.z > CONFIG.MAX_HIT_Z || p.z < CONFIG.MIN_HIT_Z) continue;

                const dx = x - p.screenX;
                const spriteCenterY = p.screenY - (200 * p.scale);
                const dy = y - spriteCenterY;

                let hitRad = CONFIG.AOE_RADIUS;
                if (p.isBoss) hitRad *= 3.0; // HUGE hitbox for boss

                if (dx * dx + dy * dy < hitRad * hitRad) {
                    // Hit!
                    let killed = false;
                    if (p.isBoss) {
                        p.takeDamage();
                        if (p.hp <= 0) {
                            killed = true;
                            this.bossDefeated = true;
                            // Boss Explosion - Massive Achievement Feeling
                            // "bombastic" -> lots of explosions spread out
                            for (let k = 0; k < 30; k++) {
                                // Spread out more: +/- 200px
                                const ex = p.screenX + (Math.random() - 0.5) * 400 * p.scale;
                                const ey = spriteCenterY + (Math.random() - 0.5) * 400 * p.scale;
                                // Delay some of them?
                                // For now, simple immediate massive cluster.
                                // We could add delay prop to Explosion? 
                                // Or just spawn them all and let physics spread them.
                                this.explosions.push(new Explosion(ex, ey, this.gameContainer));
                            }
                        } else {
                            // Hit effect but not dead - "Bombastic" feedback
                            // Spawn 3-5 small explosions/sparks on hit
                            for (let k = 0; k < 3; k++) {
                                const ex = p.screenX + (Math.random() - 0.5) * 100 * p.scale;
                                const ey = spriteCenterY + (Math.random() - 0.5) * 100 * p.scale;
                                this.explosions.push(new Explosion(ex, ey, this.gameContainer));
                            }
                        }
                    } else {
                        killed = true;
                    }

                    if (killed) {
                        this.pirates.splice(i, 1);
                        this.explosions.push(new Explosion(p.screenX, spriteCenterY, this.gameContainer));
                        p.destroy();
                        hitCount++;
                        this.score++;
                    }
                }
            }

            if (hitCount > 0 && this.soundManager) this.soundManager.playExplosion();
        }
    }
}
