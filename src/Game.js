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

        this.gameState = 'IDLE';
        this.score = 0;
        this.lastSpawnTime = 0;
        this.gameStartTime = 0;
        this.gameTime = -1; // Second counter
        this.currentWaveIndex = -1;
        this.bossSpawned = false;
        this.bossDefeated = false;

        this.spaceshipAudioExiting = false;
        this.spaceshipLeavingTriggered = false;
        this.alienKillTriggered = false;

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

        // Preload Audio Assets
        const audioAssets = [
            'assets/audio/RAAAW.aac',
            'assets/audio/VRAAAGH.aac',
            'assets/audio/YA-AA.aac',
            'assets/audio/alien_death.aac',
            'assets/audio/ckckck.aac',
            'assets/audio/long_gurgles.aac',
            'assets/audio/steps_v1.wav',
            'assets/audio/laser.aac',
            'assets/audio/spaceship.wav'
        ];
        if (this.soundManager) {
            await this.soundManager.preloadAudio(audioAssets);
        }

        // Start Game
        this.uiContainer.removeChild(loadingText);
        this.setupDebugUI();
        this.uiContainer.visible = false;

        // Init Game entities
        this.gameState = 'IDLE';

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

    startGame() {
        this.gameState = 'ACTIVE';
        this.gameStartTime = Date.now();
        this.gameTime = 0;

        this.bossSpawned = false;
        this.bossDefeated = false;
        this.currentWaveIndex = -1;
        this.spaceshipLeavingTriggered = false;
        this.spaceshipAudioExiting = false;
        this.alienKillTriggered = false;
        this.score = 0;

        // Clean up any remaining entities cleanly
        while (this.shadowContainer.children.length > 0) {
            this.shadowContainer.removeChildAt(0).destroy(true);
        }
        while (this.gameContainer.children.length > 0) {
            this.gameContainer.removeChildAt(0).destroy(true);
        }

        this.spaceship = null;
        this.pirates = [];
        this.explosions = [];
        this.clickEffects = [];
        this.inputQueue = [];

        // Restart audio
        if (this.soundManager) {
            this.soundManager.stopMusic();
            this.musicStarted = true;
            this.musicFadingOut = false;
            if (resources.music) {
                this.soundManager.playBackgroundMusic(resources.music, 0);
            }
            this.soundManager.startFootsteps();

            // Spaceship audio starts at 0s:
            this.soundManager.playSpaceship();
        }
    }

    returnToIdle() {
        this.gameState = 'IDLE';

        while (this.shadowContainer.children.length > 0) {
            this.shadowContainer.removeChildAt(0).destroy(true);
        }
        while (this.gameContainer.children.length > 0) {
            this.gameContainer.removeChildAt(0).destroy(true);
        }

        this.spaceship = null;
        this.pirates = [];
        this.explosions = [];
        this.clickEffects = [];
        this.inputQueue = [];

        if (this.soundManager) {
            this.soundManager.stopMusic();
        }
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
            }

            if (this.gameState === 'IDLE') {
                this.startGame();
                return;
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
        if (this.lastFrameTimeMs) {
            this.debugFPS = 1000 / (now - this.lastFrameTimeMs);
        }
        this.lastFrameTimeMs = now;

        if (this.showDebug) {
            this.fpsText.text = `FPS: ${Math.round(this.debugFPS)}`;
            this.countText.text = `Entities: ${this.pirates.length + this.explosions.length}`;
        }

        if (this.gameState === 'IDLE') {
            return;
        }

        this.gameTime = (now - this.gameStartTime) / 1000;

        // Visual start (0.5s)
        if (this.gameTime >= CONFIG.TIMELINE.SPACESHIP_VISUAL_START && !this.spaceship) {
            this.spaceship = new Spaceship(this.app, this.gameContainer);
        }

        // Kill trigger (85s)
        if (this.gameTime >= CONFIG.TIMELINE.ALIEN_KILL_TRIGGER && !this.alienKillTriggered) {
            this.alienKillTriggered = true;
            const livingPirates = this.pirates.length;

            for (let i = this.pirates.length - 1; i >= 0; i--) {
                const p = this.pirates[i];
                this.explosions.push(new Explosion(p.screenX, p.screenY, this.gameContainer));
                p.destroy();
            }
            this.pirates = [];

            if (this.soundManager) {
                if (livingPirates > 0) {
                    this.soundManager.playExplosion();
                    this.soundManager.playAlienDeath(0);
                }
                // Fully mute all alien related sounds (footsteps, grunts, death, etc.)
                this.soundManager.muteAlienSounds();
            }
        }

        // Spaceship exit audio (86s)
        if (this.gameTime >= CONFIG.TIMELINE.SPACESHIP_EXIT_AUDIO_START && !this.spaceshipAudioExiting) {
            this.spaceshipAudioExiting = true;
            if (this.soundManager) {
                this.soundManager.playSpaceshipLeaving();
            }
        }

        // Spaceship exit visual (87s)
        if (this.gameTime >= CONFIG.TIMELINE.SPACESHIP_EXIT_VISUAL_START && this.spaceship && !this.spaceshipLeavingTriggered) {
            this.spaceshipLeavingTriggered = true;
            this.spaceship.state = 'leaving';

            if (this.soundManager && !this.musicFadingOut) {
                this.musicFadingOut = true;
                this.soundManager.fadeOutMusic(3.0);
            }
        }

        // END GAME (90s)
        if (this.gameTime >= CONFIG.TIMELINE.GAME_END) {
            this.returnToIdle();
            return;
        }

        // Logic
        this.spawnLogic(now);
        this.processInputs();

        if (this.spaceship) {
            this.spaceship.update(delta);
        }

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

        // Alien Audio Ambiance & Footsteps
        if (this.soundManager) {
            // Update footstep intensity based on current numbers
            this.soundManager.updateFootstepVolume(this.pirates.length, CONFIG.AUDIO.MAX_FOOTSTEP_ALIENS, CONFIG.AUDIO.MAX_FOOTSTEP_VOLUME);

            // Randomly play grunts based on how many are on screen
            if (this.pirates.length > 0 && Math.random() < (this.pirates.length * CONFIG.AUDIO.GRUNT_CHANCE_PER_ALIEN)) {
                // Pick a random alien on screen to act as the "source" for panning
                const p = this.pirates[Math.floor(Math.random() * this.pirates.length)];

                // Calculate simple stereo pan based on screen position (-1 to 1)
                const panX = (p.screenX / this.app.screen.width) * 2 - 1;
                this.soundManager.playAlienGrunt(panX);
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
                const p = new Pirate(this.app, this.gameContainer, this.shadowContainer, false);
                this.pirates.push(p);
            }
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

            if (hitCount > 0 && this.soundManager) {
                this.soundManager.playExplosion();
                this.soundManager.playAlienDeath((x / this.app.screen.width) * 2 - 1); // Pan based on click
            }
        }
    }
}
