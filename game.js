
// Game Configuration
const CONFIG = {
    SPAWN_RATE: 2000,
    AOE_RADIUS: 250,  // Slightly larger for better feel
    COLORS: {
        EXPLOSION: '#ffffff',
        AOE_RING: 'rgba(255, 200, 50, 0.5)'
    },
    Z_START: 3000,     // Start further back
    Z_SPEED: 8,        // Faster approach
    FOCAL_LENGTH: 400,
    MIN_SCALE: 0.1,
    FLOOR_Y: 400,      // World units below eye level (camera height)
    MAX_HIT_Z: 1200,   // Pirates beyond this Z are immune (too far)
    MIN_HIT_Z: -200,   // Don't hit things behind camera
    STOP_Z: 100,       // Pirates stop at this Z depth (front of screen)
    ANIMATION: {
        FRAME_COUNT_CAPTAIN: 121, // 0 to 120
        FRAME_COUNT_MINION: 121
    }
};

// Asset Manager
const assets = {
    // Statics (Fallback)
    ship: new Image(),
    kraken: new Image(),

    // Sequences
    captainFrames: [],
    minionFrames: [],

    parts: [],
    loaded: 0
};

function loadAssets() {
    // Load Static Fallbacks
    assets.ship.src = 'assets/pirate_ship.png';
    assets.kraken.src = 'assets/kraken.png';

    // Helper to load sequence
    // Folder: assets/CaptainPngSeq/captain_00000.png
    const loadSequence = (folderName, prefix, count, targetArray) => {
        for (let i = 0; i < count; i++) {
            const img = new Image();
            // Pad index to 5 digits: 0 -> 00000
            const indexStr = i.toString().padStart(5, '0');
            img.src = `assets/${folderName}/${prefix}_${indexStr}.png`;
            targetArray.push(img);
        }
    };

    if (CONFIG.ANIMATION) {
        loadSequence('CaptainPngSeq', 'captain', CONFIG.ANIMATION.FRAME_COUNT_CAPTAIN, assets.captainFrames);
        loadSequence('MinionPngSeq', 'minion', CONFIG.ANIMATION.FRAME_COUNT_MINION, assets.minionFrames);
    }

    // Load Part Images
    const partCount = 14;
    for (let i = 0; i < partCount; i++) {
        const img = new Image();
        img.src = `assets/part${i}.png`;
        assets.parts.push(img);
    }
}

// Sound Manager (Simplified)
class SoundManager {
    constructor() {
        this.audioContext = null;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
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

        // Low pass filter for "thud" sound
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

// Game State
let gameState = 'playing';
let canvas, ctx;
let pirates = [];
let explosions = [];
let clickEffects = [];
let score = 0;
let lastSpawnTime = 0;
let soundManager;
const inputQueue = [];

// UI Elements
const scoreDisplay = document.getElementById('score');

// Initialize Canvas
function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setupEventListeners();
    loadAssets();
}

// Setup Event Listeners
function setupEventListeners() {
    if (!canvas) return;

    function queueInput(x, y) {
        inputQueue.push({ x: x, y: y, t: performance.now() });
    }

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
    }, { passive: false, capture: true });

    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        queueInput(e.clientX, e.clientY);
    }, { passive: false, capture: true });

    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { passive: false });
}

// Pirate Class (Sprite Sequence Animation)
class Pirate {
    constructor() {
        this.type = Math.random() > 0.5 ? 'captain' : 'minion';

        // Select Frames or Fallback
        const frames = this.type === 'captain' ? assets.captainFrames : assets.minionFrames;
        const staticFallback = this.type === 'captain' ? assets.ship : assets.kraken;

        this.frames = frames;
        this.fallback = staticFallback;
        this.frameCount = frames.length;

        // Animation State
        this.frameIndex = Math.random() * this.frameCount; // Random start
        this.animSpeed = 0.3 + Math.random() * 0.2; // Speed
        this.animDir = 1;

        // Horizontal spread
        this.worldX = (Math.random() - 0.5) * 3000;
        this.worldY = CONFIG.FLOOR_Y;
        this.z = CONFIG.Z_START;
        this.speed = CONFIG.Z_SPEED * (0.9 + Math.random() * 0.4);
        this.stopZ = CONFIG.STOP_Z + Math.random() * 50;

        this.screenX = 0;
        this.screenY = 0;
        this.scale = 0;
        this.radius = 0;
    }

    update() {
        // 1. Position Update
        if (this.z > this.stopZ) {
            this.z -= this.speed;
        } else {
            this.z = this.stopZ;
        }

        // 2. Animation Update (Ping-Pong)
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

        const perspective = Math.max(0.01, CONFIG.FOCAL_LENGTH + this.z);
        this.scale = CONFIG.FOCAL_LENGTH / perspective;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        this.screenX = centerX + this.worldX * this.scale;
        this.screenY = centerY + this.worldY * this.scale;

        // Size calculation
        const baseSize = 500;
        this.radius = (baseSize * this.scale) / 2;
    }

    draw() {
        if (this.scale <= 0) return;

        ctx.save();
        ctx.translate(this.screenX, this.screenY);
        ctx.scale(this.scale, this.scale);

        // Determine image to draw
        let img = this.fallback;

        if (this.frameCount > 0) {
            const currentFrame = this.frames[Math.floor(this.frameIndex)];
            if (currentFrame && currentFrame.complete && currentFrame.naturalWidth > 0) {
                img = currentFrame;
            }
        }

        const w = img.width || 300;
        const h = img.height || 300;
        const normScale = 500 / Math.max(w, h);

        ctx.drawImage(img, -w * normScale / 2, -h * normScale, w * normScale, h * normScale);

        ctx.restore();
    }
}

// Visual Effect: AoE Ring
class AoERing {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 10;
        this.maxRadius = CONFIG.AOE_RADIUS;
        this.life = 1.0;
    }

    update() {
        this.life -= 0.06; // Faster decay
        this.radius += (this.maxRadius - this.radius) * 0.25;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.strokeStyle = '#ffd700'; // Gold
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 215, 0, 0.1)';
        ctx.fill();
        ctx.restore();
    }
}

// Visual Effect: Monster Parts Explosion
class Explosion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.particles = [];

        const partCount = 8 + Math.floor(Math.random() * 6);
        for (let i = 0; i < partCount; i++) {
            // Pick random part image
            const img = assets.parts.length > 0
                ? assets.parts[Math.floor(Math.random() * assets.parts.length)]
                : null;

            const angle = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 8;

            this.particles.push({
                img: img,
                x: 0,
                y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 5, // Upward burst
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.2,
                scale: 0.5 + Math.random() * 0.5,
                life: 1.0
            });
        }
    }

    update() {
        for (let p of this.particles) {
            if (p.dead) continue;

            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3; // Gravity
            p.rotation += p.rotSpeed;

            // Shrink to 0 instead of fade
            p.scale -= 0.025;
            if (p.scale <= 0) {
                p.scale = 0;
                p.dead = true;
            }
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y); // Center at explosion point

        for (let p of this.particles) {
            if (p.dead || !p.img) continue;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(p.scale, p.scale);
            // No globalAlpha fade - keep opacity 1.0 until gone

            const size = 60; // Base part size
            ctx.drawImage(p.img, -size / 2, -size / 2, size, size);

            ctx.restore();
        }
        ctx.restore();
    }

    isDead() {
        return this.particles.every(p => p.dead);
    }
}


function processQueuedInput(x, y) {
    clickEffects.push(new AoERing(x, y));
    if (soundManager) soundManager.playShot();

    const hitRadiusSq = CONFIG.AOE_RADIUS * CONFIG.AOE_RADIUS;
    let hitCount = 0;

    // Iterate backward to allow splicing
    for (let i = pirates.length - 1; i >= 0; i--) {
        const p = pirates[i];

        // Z-DEPTH CHECK: Only hit if within valid range
        if (p.z > CONFIG.MAX_HIT_Z || p.z < CONFIG.MIN_HIT_Z) {
            continue; // Too far or too close (behind)
        }

        const dx = x - p.screenX;
        // Adjust dy to target center (since we draw anchored at bottom)
        // Approximate center is screenY - (height/2)
        // But our circle check is rough, using screenY (feet) is closer to where user taps for "ground" usually.
        // Let's check distance to the drawn sprite center approx:
        // Sprite height is ~400 * scale. Center is ~200 * scale up.
        const spriteCenterY = p.screenY - (200 * p.scale);
        const dy = y - spriteCenterY;

        const distSq = dx * dx + dy * dy;

        if (distSq < hitRadiusSq) {
            pirates.splice(i, 1);
            explosions.push(new Explosion(p.screenX, spriteCenterY));
            hitCount++;
            score++;
            scoreDisplay.textContent = `pirates defeated: ${score}`;
        }
    }

    if (hitCount > 0 && soundManager) soundManager.playExplosion();
}

function gameLoop() {
    if (!canvas || !ctx) return;

    // Inputs
    while (inputQueue.length > 0) {
        const input = inputQueue.shift();
        processQueuedInput(input.x, input.y);
    }

    // Background
    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#000022');
    gradient.addColorStop(1, '#001133');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Horizon Line
    const centerY = canvas.height / 2;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.strokeStyle = '#ffffff33';
    ctx.stroke();

    // Pseudo-floor (grid)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;
    // ... (grid lines optional, keeping clean for now)
    ctx.restore();

    // 1. Update & Spawning
    const now = performance.now();
    if (now - lastSpawnTime > CONFIG.SPAWN_RATE) {
        pirates.push(new Pirate());
        lastSpawnTime = now;
        if (CONFIG.SPAWN_RATE > 500) CONFIG.SPAWN_RATE -= 10;
    }

    // Update all first (so Z is current)
    for (let p of pirates) {
        p.update();
    }

    // 2. Sort logic: Painter's Algorithm
    // Draw farthest items (High Z) FIRST. Draw nearest (Low Z) LAST.
    // Sort Descending Z: [1000, 500, 100...]
    pirates.sort((a, b) => b.z - a.z);

    // 3. Draw (Forward: Index 0 is Farthest, draw it first)
    for (let p of pirates) {
        p.draw();
    }

    // FX
    [explosions, clickEffects].forEach(list => {
        for (let i = list.length - 1; i >= 0; i--) {
            list[i].update();
            list[i].draw();
            if (list[i].life <= 0) list.splice(i, 1);
        }
    });

    requestAnimationFrame(gameLoop);
}

// Start Game
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initCanvas();
        soundManager = new SoundManager();
        requestAnimationFrame(gameLoop);
    });
} else {
    initCanvas();
    soundManager = new SoundManager();
    requestAnimationFrame(gameLoop);
}
