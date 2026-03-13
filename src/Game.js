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
        this.overlayContainer = null;

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
        this.waveSpawnCount = 0;
        this.bossSpawned = false;
        this.bossDefeated = false;

        this.alienKillTriggered = false;

        // Pause / scrub
        this.pausedAtGameTime = 0; // gameTime value frozen when paused

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
        this.pauseUI = null;

        this.bgSprite = null;
        this.overlaySprite = null;
        this.currentOverlayIndex = 0;
        this.nextOverlaySwapTime = 0;
    }

    async init() {
        const canvasElement = document.getElementById('gameCanvas');

        // Create Pixi Application
        this.app = new PIXI.Application({
            view: canvasElement,
            resizeTo: document.getElementById('gameScreen'),
            backgroundColor: 0x000000, // Black
            antialias: true,
            autoDensity: true,
            resolution: window.devicePixelRatio || 1
        });

        // Ensure touch-action is none to eliminate delay
        canvasElement.style.touchAction = 'none';
        canvasElement.style.userSelect = 'none';
        canvasElement.style.webkitUserSelect = 'none';
        canvasElement.style.webkitTouchCallout = 'none';

        // Create Layers
        this.shadowContainer = new PIXI.Container();
        this.app.stage.addChild(this.shadowContainer);

        this.gameContainer = new PIXI.Container();
        this.gameContainer.sortableChildren = true;
        this.app.stage.addChild(this.gameContainer);

        this.uiContainer = new PIXI.Container();
        this.app.stage.addChild(this.uiContainer);

        this.overlayContainer = new PIXI.Container();
        this.app.stage.addChild(this.overlayContainer);

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
            'assets/audio/spaceship.wav',
            'assets/audio/rex1.mp3',
            'assets/audio/rex2.mp3',
            'assets/audio/rex3.mp3',
            'assets/audio/rex4.mp3',
            'assets/audio/bgm_edited90s.wav'
        ];
        if (this.soundManager) {
            await this.soundManager.preloadAudio(audioAssets);
        }

        // Start Game
        this.uiContainer.removeChild(loadingText);
        this.setupDebugUI();
        this.setupGameUI();
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

        // Init Overlay
        if (resources.overlays && resources.overlays.length > 0) {
            this.overlaySprite = new PIXI.Sprite(resources.overlays[0]);
            this.overlaySprite.anchor.set(0.5);
            this.overlaySprite.visible = true;
            this.resizeOverlay();
            this.overlayContainer.addChild(this.overlaySprite);
        }

        // UDP → WebSocket bridge (only available when served via server.js)
        this.setupUDPBridge();

        // Init Spaceship (Visible in IDLE, starts stationary)
        this.spaceship = new Spaceship(this.app, this.gameContainer);

        // Game Loop
        this.app.ticker.add((delta) => this.gameLoop(delta));
    }

    startGame() {
        this.gameState = 'ACTIVE';
        if (this.pauseUI) this.pauseUI.visible = false;
        this.gameStartTime = Date.now();
        this.gameTime = 0;

        this.bossSpawned = false;
        this.bossDefeated = false;
        this.currentWaveIndex = -1;
        this.waveSpawnCount = 0;
        this.alienKillTriggered = false;
        this.score = 0;

        this.clearEntities();

        this.pirates = [];
        this.explosions = [];
        this.clickEffects = [];
        this.inputQueue = [];

        // Restart audio
        if (this.soundManager) {
            this.soundManager.stopMusic();
            this.musicStarted = true;
            this.musicFadingOut = false;
            this.soundManager.playBackgroundMusic('bgm_edited90s', 0);
            this.soundManager.startFootsteps();
            this.soundManager.resetTimeline();
        }

        if (this.spaceship) {
            this.spaceship.startHovering();
        }

        // Start Overlays
        if (this.overlaySprite) {
            this.overlaySprite.visible = true;
            this.currentOverlayIndex = 0; // Starts at overlay_a
            this.overlaySprite.texture = resources.overlays[this.currentOverlayIndex];
        }
    }

    returnToIdle() {
        this.gameState = 'IDLE';
        if (this.pauseUI) this.pauseUI.visible = false;

        this.clearEntities();

        if (this.spaceship) {
            this.spaceship.stopHovering();
        }

        this.pirates = [];
        this.explosions = [];
        this.clickEffects = [];
        this.inputQueue = [];

        if (this.soundManager) {
            this.soundManager.stopMusic();
        }

        if (this.overlaySprite) {
            this.overlaySprite.visible = true;
            this.currentOverlayIndex = 0;
            this.overlaySprite.texture = resources.overlays[0]; // Reset to overlay_a
            this.resizeOverlay();
        }
    }

    clearEntities() {
        // Clean up shadow container
        while (this.shadowContainer.children.length > 0) {
            this.shadowContainer.removeChildAt(0).destroy(true);
        }

        // Clean up game container except spaceship
        for (let i = this.gameContainer.children.length - 1; i >= 0; i--) {
            const child = this.gameContainer.children[i];
            if (this.spaceship && child === this.spaceship.sprite) {
                continue;
            }
            child.destroy(true);
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

    resizeOverlay() {
        if (!this.overlaySprite) return;
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;
        const tex = this.overlaySprite.texture;

        const scale = Math.max(sw / tex.width, sh / tex.height);
        this.overlaySprite.scale.set(scale);
        this.overlaySprite.x = sw / 2;
        this.overlaySprite.y = sh / 2;
    }

    setupEventListeners() {
        const c = this.app.view;

        // Track which pointers are currently held down so pointermove can fire as taps
        this.activePointers = new Set();

        // touchstart: preventDefault only — no queueing (avoids double input with pointerdown)
        c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false, capture: true });

        c.addEventListener('pointerdown', (e) => {
            // Explicitly claim this pointer for this element to prevent browser gesture cancellation (like pinch-zoom)
            if (c.setPointerCapture) {
                c.setPointerCapture(e.pointerId);
            }

            e.preventDefault();
            // Coordinates relative to canvas so they stay correct with black-bar letterboxing
            const rect = c.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Resume audio context synchronously (fire-and-forget) on every interaction
            if (this.soundManager) {
                this.soundManager.resumeAudioContext();
            }

            if (this.gameState === 'IDLE') {
                return;
            }

            this.activePointers.add(e.pointerId);
            this.inputQueue.push({ x, y });
        }, { passive: false, capture: true });

        // pointermove: every position update while a pointer is held = another tap
        c.addEventListener('pointermove', (e) => {
            if (!this.activePointers.has(e.pointerId)) return;
            if (this.gameState !== 'ACTIVE') return;

            const rect = c.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.inputQueue.push({ x, y });
        }, { passive: true, capture: true });

        // pointerup / pointercancel: stop treating this pointer as active
        c.addEventListener('pointerup', (e) => {
            if (c.releasePointerCapture) {
                c.releasePointerCapture(e.pointerId);
            }
            this.activePointers.delete(e.pointerId);
        }, { passive: true, capture: true });

        c.addEventListener('pointercancel', (e) => {
            if (c.releasePointerCapture) {
                c.releasePointerCapture(e.pointerId);
            }
            this.activePointers.delete(e.pointerId);
        }, { passive: true, capture: true });

        c.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false, capture: true });
        c.addEventListener('touchend', (e) => e.preventDefault(), { passive: false, capture: true });
        c.addEventListener('contextmenu', (e) => e.preventDefault(), { passive: false, capture: true });

        // Block ctrl+scroll / trackpad pinch-to-zoom (fires as wheel with ctrlKey)
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey) e.preventDefault();
        }, { passive: false, capture: true });

        // Block Safari native pinch-to-zoom (gesture events are Safari-only)
        document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false, capture: true });
        document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false, capture: true });
        document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false, capture: true });

        window.addEventListener('resize', () => {
            if (this.bgSprite) this.resizeBackground();
            this.resizeOverlay();
            if (this.pauseUI) {
                this.pauseUI.x = this.app.screen.width / 2;
                this.pauseUI.y = this.app.screen.height - 40;
            }
        });

        window.addEventListener('keydown', (e) => {
            // Debug toggle
            if (e.key === '1') {
                this.showDebug = !this.showDebug;
                if (this.uiContainer) this.uiContainer.visible = this.showDebug;
            }

            // Space: start from IDLE, or toggle pause during play
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.soundManager) this.soundManager.resumeAudioContext();
                if (this.gameState === 'IDLE') {
                    this.startGame();
                } else if (this.gameState === 'ACTIVE' || this.gameState === 'PAUSED') {
                    this.togglePause();
                }
                return;
            }

            // 9 = skip to end / trigger kill-all and return to IDLE
            if (e.key === '9' && (this.gameState === 'ACTIVE' || this.gameState === 'PAUSED')) {
                this.endGame();
            }
        });
    }

    /**
     * Connects to the server's WebSocket endpoint and listens for UDP-triggered commands.
     * Falls back silently when not running through server.js (e.g. raw file:// or plain http-server).
     *
     * Supported commands:
     *   { command: "start" }  — start the game (same as clicking)
     *   { command: "reset" }  — force return to IDLE
     */
    setupUDPBridge() {
        // Only attempt when served over http/https (not file://)
        if (!window.location.protocol.startsWith('http')) {
            console.log('[UDP Bridge] Skipping — not running over HTTP.');
            return;
        }

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}`;

        let reconnectDelay = 1000;
        const maxDelay = 16000;

        const connect = () => {
            const ws = new WebSocket(wsUrl);

            ws.addEventListener('open', () => {
                console.log('[UDP Bridge] WebSocket connected to', wsUrl);
                reconnectDelay = 1000; // reset back-off on success
            });

            ws.addEventListener('message', (event) => {
                let payload;
                try {
                    payload = JSON.parse(event.data);
                } catch {
                    console.warn('[UDP Bridge] Non-JSON message ignored:', event.data);
                    return;
                }

                console.log('[UDP Bridge] Received command:', payload.command);

                switch (payload.command) {
                    case 'start':
                        // Start the game from IDLE
                        if (this.gameState === 'IDLE') {
                            if (this.soundManager) this.soundManager.resumeAudioContext();
                            this.startGame();
                        }
                        break;

                    case 'pause':
                        // Toggle pause/resume; also starts from IDLE
                        if (this.soundManager) this.soundManager.resumeAudioContext();
                        if (this.gameState === 'IDLE') {
                            this.startGame();
                        } else if (this.gameState === 'ACTIVE' || this.gameState === 'PAUSED') {
                            this.togglePause();
                        }
                        break;

                    case 'end':
                    case '9':
                        // Skip to end / trigger kill-all / return to IDLE
                        if (this.gameState === 'ACTIVE' || this.gameState === 'PAUSED') {
                            this.endGame();
                        }
                        break;

                    default:
                        console.warn('[UDP Bridge] Unknown command:', payload.command);
                }
            });

            ws.addEventListener('close', () => {
                console.log(`[UDP Bridge] WebSocket closed. Reconnecting in ${reconnectDelay}ms…`);
                setTimeout(connect, reconnectDelay);
                reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
            });

            ws.addEventListener('error', (err) => {
                // Error fires before close, so we just log it
                console.warn('[UDP Bridge] WebSocket error (will reconnect):', err.type);
            });
        };

        connect();
    }

    /**
     * Toggles between ACTIVE and PAUSED.
     * While paused the game loop skips all simulation updates so the scene freezes.
     */
    togglePause() {
        if (this.gameState === 'ACTIVE') {
            this.pausedAtGameTime = this.gameTime;
            this.gameState = 'PAUSED';
            if (this.pauseUI) this.pauseUI.visible = true;
            // Freeze audio exactly where it is
            if (this.soundManager) this.soundManager.pauseMusic();
            console.log(`[Game] Paused at ${this.pausedAtGameTime.toFixed(2)}s`);
        } else if (this.gameState === 'PAUSED') {
            // Shift gameStartTime so the clock continues from pausedAtGameTime
            this.gameStartTime = Date.now() - this.pausedAtGameTime * 1000;
            this.gameState = 'ACTIVE';
            if (this.pauseUI) this.pauseUI.visible = false;
            // Resume audio from the exact position it was frozen at
            if (this.soundManager) this.soundManager.resumeMusic();
            console.log(`[Game] Resumed from ${this.pausedAtGameTime.toFixed(2)}s`);
        }
    }

    /**
     * Immediately triggers the kill-all sequence (starting at 85s) and
     * then returns to IDLE naturally after the explosion window.
     * Bound to keyboard key '9' and UDP commands 'end' / '9'.
     */
    endGame() {
        if (this.gameState === 'PAUSED') {
            // Unfreeze first so entities are visible for explosions
            this.gameStartTime = Date.now() - this.pausedAtGameTime * 1000;
            this.gameState = 'ACTIVE';
        }

        // Fast-forward the clock to the kill trigger point.
        // This triggers the ALIEN_KILL_TRIGGER logic (85s) in the next frame.
        const triggerTime = CONFIG.TIMELINE.ALIEN_KILL_TRIGGER;
        this.gameStartTime = Date.now() - triggerTime * 1000;
        this.gameTime = triggerTime;
        this.alienKillTriggered = false; // Re-arm so the trigger fires

        // Cleanup audio: skip past earlier scheduled lines, but don't mute yet
        // so we can still hear the final explosion/death symphony.
        if (this.soundManager) {
            this.soundManager.skipTimelineTo(triggerTime, CONFIG.SCHEDULED_SOUNDS);
            this.soundManager.stopMusic(); // Stops BGM and active SFX (grunts etc)
        }

        console.log(`[Game] endGame() — skipping to ${triggerTime}s for kill-all sequence`);
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

    setupGameUI() {
        this.pauseUI = new PIXI.Container();
        this.pauseUI.visible = false;

        // 1. Draw Pause Icon (Two sharp bars)
        const icon = new PIXI.Graphics();
        icon.beginFill(0xff0000);
        // Left bar
        icon.drawRoundedRect(-22, -15, 8, 30, 2);
        // Right bar
        icon.drawRoundedRect(-6, -15, 8, 30, 2);
        icon.endFill();

        // 2. Pause Text
        const pauseStyle = new PIXI.TextStyle({
            fill: '#ff0000',
            fontFamily: 'monospace',
            fontSize: 28,
            fontWeight: 'bold',
            dropShadow: true,
            dropShadowColor: '#000000',
            dropShadowBlur: 4,
            dropShadowDistance: 0
        });

        const text = new PIXI.Text('PAUSED', pauseStyle);
        text.anchor.set(0, 0.5);
        text.x = 10; // Offset from icon

        this.pauseUI.addChild(icon);
        this.pauseUI.addChild(text);

        // Position at bottom middle
        this.pauseUI.x = this.app.screen.width / 2;
        this.pauseUI.y = this.app.screen.height - 40;

        this.app.stage.addChild(this.pauseUI);
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

        if (this.spaceship) {
            this.spaceship.update(delta);
        }

        // Both IDLE and PAUSED skip all simulation logic
        if (this.gameState === 'IDLE' || this.gameState === 'PAUSED') {
            return;
        }

        this.gameTime = (now - this.gameStartTime) / 1000;

        // Kill trigger (85s)
        if (this.gameTime >= CONFIG.TIMELINE.ALIEN_KILL_TRIGGER && !this.alienKillTriggered) {
            this.alienKillTriggered = true;
            const livingPirates = this.pirates.length;

            for (let i = this.pirates.length - 1; i >= 0; i--) {
                const p = this.pirates[i];

                if (p.isBoss) {
                    // Massive bombastic explosion for the Boss at the end
                    const spriteCenterY = p.screenY - (200 * p.scale);
                    for (let k = 0; k < 30; k++) {
                        const ex = p.screenX + (Math.random() - 0.5) * 400 * p.scale;
                        const ey = spriteCenterY + (Math.random() - 0.5) * 400 * p.scale;
                        this.explosions.push(new Explosion(ex, ey, this.gameContainer));
                    }
                } else {
                    this.explosions.push(new Explosion(p.screenX, p.screenY, this.gameContainer));
                }

                p.destroy();
            }
            this.pirates = [];

            if (this.soundManager) {
                // If we forced the end via the '9' key, alienMuted will already be true.
                // In that case, we skip the final explosion/death symphony for a cleaner exit.
                if (!this.soundManager.alienMuted && livingPirates > 0) {
                    this.soundManager.playExplosion();
                    this.soundManager.playAlienDeath(0);
                }
                // Ensure everything is muted going forward
                this.soundManager.muteAlienSounds();
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

        // Timeline Sounds
        if (this.soundManager) {
            this.soundManager.updateTimeline(this.gameTime, CONFIG.SCHEDULED_SOUNDS, CONFIG.AUDIO.SPEECH_VOLUME);
        }

        // Update Overlays
        this.updateOverlay(now);
    }

    spawnLogic(now) {
        if (this.gameTime >= CONFIG.TIMELINE.ALIEN_SPAWN_END) return;

        // Wave Logic
        let currentWave = null;
        let waveIndex = -1;
        for (let i = 0; i < CONFIG.WAVES.length; i++) {
            const w = CONFIG.WAVES[i];
            if (this.gameTime >= w.start && this.gameTime < w.end) {
                currentWave = w;
                waveIndex = i;
                break;
            }
        }

        if (currentWave) {
            // New Wave Transition
            if (this.currentWaveIndex !== waveIndex) {
                this.currentWaveIndex = waveIndex;
                this.waveSpawnCount = 0;
                this.lastSpawnTime = now; // Reset timer for the new wave
            }

            // Check Boss
            if (currentWave.type === 'boss_wave' && !this.bossSpawned) {
                this.bossSpawned = true;
                const boss = new Pirate(this.app, this.gameContainer, this.shadowContainer, true);
                this.pirates.push(boss);
            }

            // Dynamic Minion Spawning
            const waveDuration = currentWave.end - currentWave.start;
            const spawnInterval = (waveDuration * 1000) / currentWave.count;

            if (now - this.lastSpawnTime > spawnInterval && this.waveSpawnCount < currentWave.count) {
                this.lastSpawnTime = now;
                const p = new Pirate(this.app, this.gameContainer, this.shadowContainer, false);
                this.pirates.push(p);
                this.waveSpawnCount++;
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
                        hitCount++; // Provide hit feedback/score
                        if (p.hp <= 0) {
                            // Boss HP is 0, but he should NOT die yet (killed = false)
                            killed = false;
                            this.bossDefeated = true;
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

    updateOverlay(now) {
        if (this.gameState !== 'ACTIVE' || !this.overlaySprite || resources.overlays.length === 0) return;

        // Sequence through overlays A-L (indices 0-11)
        // Interval is 90 / 12 = 7.5 seconds
        const newIndex = Math.min(
            resources.overlays.length - 1,
            Math.floor(this.gameTime / CONFIG.OVERLAYS.SEQUENTIAL_INTERVAL)
        );

        if (newIndex !== this.currentOverlayIndex) {
            this.currentOverlayIndex = newIndex;
            this.overlaySprite.texture = resources.overlays[this.currentOverlayIndex];
            this.resizeOverlay();
        }
    }
}
