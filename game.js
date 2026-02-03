// Game Configuration
const REFERENCE_HEIGHT = 1080; // sizes tuned for this height; now scaled by window height
const BOX_SIZE_RATIOS = {
    BIG: 500 / REFERENCE_HEIGHT,
    MEDIUM: 350 / REFERENCE_HEIGHT,
    SMALL: 225 / REFERENCE_HEIGHT
};

function getBoxSizes() {
    const h = (typeof canvas !== 'undefined' && canvas) ? canvas.height : REFERENCE_HEIGHT;
    return {
        BIG: h * BOX_SIZE_RATIOS.BIG,
        MEDIUM: h * BOX_SIZE_RATIOS.MEDIUM,
        SMALL: h * BOX_SIZE_RATIOS.SMALL
    };
}

const CONFIG = {
    SPAWN_RATE: 3000, // milliseconds between spawns (slower for huge boxes)
    COLORS: {
        BOX: '#ff0000',
        EXPLOSION: '#ffffff'
    },
    PHYSICS: {
        FRICTION: 0.98,
        BOUNCE: 0.3,         // Much lower bounce - settles quickly
        GRAVITY: 0.6,
        MIN_VELOCITY: 0.5,   // Higher threshold to stop jittering
        HOP_FORCE: 12,
        HOP_INTERVAL: 1500,
        HORIZONTAL_SPEED: 4
    }
};

// Sound Manager - generates harmonic, zen-like sounds using Web Audio API
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.reverbNode = null;
        this.dryGain = null;
        this.wetGain = null;
        
        // Pentatonic scale only - always harmonious, no dissonance
        // C D E G A - the most zen, meditative scale
        this.scale = {
            // Octave 3 (deep, resonant)
            C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.00, A3: 220.00,
            // Octave 4 (warm, grounded)
            C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
            // Octave 5 (bright, clear)
            C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00,
            // Octave 6 (crystalline)
            C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.00
        };
        
        this.init();
    }
    
    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.setupReverb();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }
    
    // Create algorithmic reverb impulse response
    setupReverb() {
        if (!this.audioContext) return;
        
        // Create convolver for reverb
        this.reverbNode = this.audioContext.createConvolver();
        
        // Generate impulse response programmatically (2 seconds, stereo)
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * 2; // 2 second reverb tail
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                // Exponential decay with some randomness for natural sound
                const decay = Math.exp(-3 * i / length);
                // Filtered noise for smoother reverb
                channelData[i] = (Math.random() * 2 - 1) * decay;
            }
        }
        
        this.reverbNode.buffer = impulse;
        
        // Dry/wet mix nodes
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        
        this.dryGain.connect(this.audioContext.destination);
        this.reverbNode.connect(this.wetGain);
        this.wetGain.connect(this.audioContext.destination);
    }
    
    // Helper: pick random element from array
    randomPick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    
    // Helper: slight random pitch variation (±1.5% - subtle for zen feel)
    varyPitch(freq) {
        return freq * (0.985 + Math.random() * 0.03);
    }
    
    // Play a harmonic tone with overtones for richness
    // wetAmount: 0 = dry, 1 = full reverb
    playHarmonicTone(frequency, duration, volume = 0.3, wetAmount = 0.3, startTime = 0) {
        if (!this.audioContext) return;
        
        const now = this.audioContext.currentTime + startTime;
        
        // Create main oscillator + harmonics for richness
        const oscillators = [];
        const gains = [];
        
        // Harmonic series: fundamental, octave (2x), fifth (3x), two octaves (4x)
        const harmonics = [
            { ratio: 1, vol: 1 },        // Fundamental
            { ratio: 2, vol: 0.5 },      // Octave
            { ratio: 3, vol: 0.25 },     // Fifth above octave
            { ratio: 4, vol: 0.125 },    // Two octaves
        ];
        
        // Master gain for this note
        const masterGain = this.audioContext.createGain();
        
        harmonics.forEach(h => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.frequency.value = frequency * h.ratio;
            osc.type = 'sine';
            gain.gain.value = volume * h.vol;
            
            osc.connect(gain);
            gain.connect(masterGain);
            
            oscillators.push(osc);
            gains.push(gain);
        });
        
        // Soft attack, long release for zen feel
        const attackTime = 0.02;
        const releaseStart = duration * 0.3;
        
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(1, now + attackTime);
        masterGain.gain.setValueAtTime(1, now + releaseStart);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        // Route through dry/wet mix
        if (this.dryGain && this.wetGain && this.reverbNode) {
            const dryAmount = 1 - wetAmount * 0.5;
            this.dryGain.gain.setValueAtTime(dryAmount, now);
            this.wetGain.gain.setValueAtTime(wetAmount, now);
            
            masterGain.connect(this.dryGain);
            masterGain.connect(this.reverbNode);
        } else {
            masterGain.connect(this.audioContext.destination);
        }
        
        // Start and stop all oscillators
        oscillators.forEach(osc => {
            osc.start(now);
            osc.stop(now + duration + 0.1);
        });
    }
    
    // Simple tone without harmonics (for quick sounds)
    playTone(frequency, duration, volume = 0.3, wetAmount = 0.2, startTime = 0) {
        if (!this.audioContext) return;
        
        const now = this.audioContext.currentTime + startTime;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.frequency.value = frequency;
        osc.type = 'sine';
        
        // Soft envelope
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        osc.connect(gain);
        
        // Route through reverb mix
        if (this.dryGain && this.wetGain && this.reverbNode) {
            this.dryGain.gain.setValueAtTime(1 - wetAmount * 0.5, now);
            this.wetGain.gain.setValueAtTime(wetAmount, now);
            gain.connect(this.dryGain);
            gain.connect(this.reverbNode);
        } else {
            gain.connect(this.audioContext.destination);
        }
        
        osc.start(now);
        osc.stop(now + duration + 0.1);
    }
    
    // Zen boop - soft, harmonic tap sounds
    playBoop() {
        if (!this.audioContext) return;
        
        // Consonant intervals only - fifths, octaves, fourths
        const patterns = [
            { notes: [this.scale.G5], wet: 0.2 },
            { notes: [this.scale.C5, this.scale.G5], wet: 0.25 },
            { notes: [this.scale.E5, this.scale.A5], wet: 0.2 },
            { notes: [this.scale.D5, this.scale.A5], wet: 0.25 },
            { notes: [this.scale.G5, this.scale.D6], wet: 0.3 },
        ];
        
        const pattern = this.randomPick(patterns);
        pattern.notes.forEach((note, i) => {
            setTimeout(() => {
                this.playTone(this.varyPitch(note), 0.15, 0.08, pattern.wet);
            }, i * 40);
        });
    }
    
    // Pop sound - destroying small boxes, bright and clear
    playPop(size = 'medium') {
        if (!this.audioContext) return;
        
        // Pentatonic chords - always harmonious
        const chordSets = {
            'big': {
                chords: [
                    [this.scale.C3, this.scale.G3, this.scale.C4],   // Open fifth + octave
                    [this.scale.G3, this.scale.D4, this.scale.G4],   // Power chord
                    [this.scale.A3, this.scale.E4, this.scale.A4],   // Open fifth
                ],
                wet: 0.6,  // More reverb for big
                duration: 0.8
            },
            'medium': {
                chords: [
                    [this.scale.C4, this.scale.G4, this.scale.C5],
                    [this.scale.D4, this.scale.A4, this.scale.D5],
                    [this.scale.E4, this.scale.G4, this.scale.E5],
                ],
                wet: 0.4,
                duration: 0.5
            },
            'small': {
                chords: [
                    [this.scale.C5, this.scale.G5, this.scale.C6],
                    [this.scale.E5, this.scale.A5, this.scale.E6],
                    [this.scale.G5, this.scale.D6, this.scale.G6],
                ],
                wet: 0.25,
                duration: 0.3
            }
        };
        
        const set = chordSets[size] || chordSets['medium'];
        const chord = this.randomPick(set.chords);
        
        chord.forEach((freq, i) => {
            setTimeout(() => {
                this.playHarmonicTone(this.varyPitch(freq), set.duration, 0.12, set.wet);
            }, i * 25);
        });
    }
    
    // Impact sound - hitting boxes, with reverb for big ones
    playImpact(size = 'medium') {
        if (!this.audioContext) return;
        
        const impactSets = {
            'big': {
                // Deep, resonant descending patterns
                patterns: [
                    [this.scale.C4, this.scale.G3, this.scale.C3],
                    [this.scale.G4, this.scale.D4, this.scale.G3],
                    [this.scale.A4, this.scale.E4, this.scale.A3],
                ],
                wet: 0.7,  // Heavy reverb for big impact
                duration: 0.6,
                volume: 0.18
            },
            'medium': {
                patterns: [
                    [this.scale.G4, this.scale.D4, this.scale.G4],
                    [this.scale.A4, this.scale.E4, this.scale.A4],
                    [this.scale.C5, this.scale.G4, this.scale.C4],
                ],
                wet: 0.4,
                duration: 0.4,
                volume: 0.14
            },
            'small': {
                patterns: [
                    [this.scale.E5, this.scale.C5],
                    [this.scale.G5, this.scale.D5],
                    [this.scale.A5, this.scale.E5],
                ],
                wet: 0.25,
                duration: 0.25,
                volume: 0.1
            }
        };
        
        const set = impactSets[size] || impactSets['medium'];
        const notes = this.randomPick(set.patterns);
        
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playHarmonicTone(this.varyPitch(freq), set.duration, set.volume / (i * 0.3 + 1), set.wet);
            }, i * 50);
        });
    }
    
    // Explosion - ascending zen chimes, more reverb for big boxes
    playExplosion(size = 'big') {
        if (!this.audioContext) return;
        
        // Pentatonic runs - always sound good together
        const patterns = [
            [this.scale.C4, this.scale.D4, this.scale.E4, this.scale.G4, this.scale.A4, this.scale.C5],
            [this.scale.G3, this.scale.A3, this.scale.C4, this.scale.D4, this.scale.E4, this.scale.G4],
            [this.scale.A3, this.scale.C4, this.scale.D4, this.scale.E4, this.scale.G4, this.scale.A4],
            [this.scale.D4, this.scale.E4, this.scale.G4, this.scale.A4, this.scale.C5, this.scale.D5],
            [this.scale.E4, this.scale.G4, this.scale.A4, this.scale.C5, this.scale.D5, this.scale.E5],
        ];
        
        const wetAmount = size === 'big' ? 0.7 : size === 'medium' ? 0.5 : 0.3;
        const duration = size === 'big' ? 0.5 : size === 'medium' ? 0.35 : 0.25;
        
        const scaleRun = this.randomPick(patterns);
        
        scaleRun.forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(this.varyPitch(freq), duration, 0.08, wetAmount);
            }, i * 35);
        });
    }
    
    // Splat sound - box splitting, harmonic shimmer
    playSplat() {
        if (!this.audioContext) return;
        
        // Shimmering split sounds - octaves and fifths
        const patterns = [
            [this.scale.C4, this.scale.G4, this.scale.C5],
            [this.scale.G4, this.scale.D5, this.scale.G5],
            [this.scale.D4, this.scale.A4, this.scale.D5],
            [this.scale.A4, this.scale.E5, this.scale.A5],
            [this.scale.E4, this.scale.G4, this.scale.E5],
        ];
        
        const notes = this.randomPick(patterns);
        
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playHarmonicTone(this.varyPitch(freq), 0.4, 0.1, 0.5);
            }, i * 30);
        });
    }
}

// Game State
let gameState = 'playing'; // Always playing - endless game
let canvas, ctx;
let slimeBoxes = [];
let explosions = [];
let score = 0;
let lastSpawnTime = 0;
let animationId;
let startTime;
let screenShake = { x: 0, y: 0, intensity: 0 };
let hitEffects = [];
let tapBursts = [];
let slimePops = []; // monster "burst" when hit – expanding circle in slime color
let soundManager;

// Gun modes: 'tap' | 'auto' | 'rocket'
let gunMode = 'tap';
const AUTO_SHOT_INTERVAL_MS = 100; // 10 shots per second
const activePointers = {}; // pointerId -> { x, y, lastShotTime }

// Rocket launcher: hold 3s to fire, AoE + force push
const ROCKET_CHARGE_MS = 3000;
const ROCKET_AOE_RATIO = 0.28;   // AoE radius = this fraction of canvas height
const ROCKET_PUSH_FORCE = 28;
let rocketCharging = null;       // null | { pointerId, startTime, x, y }

// HIGH-PRIORITY INPUT QUEUE - inputs are stored here and processed at start of each frame
// This ensures no inputs are lost during heavy rendering
const inputQueue = [];

// Pre-calculated constants for speed
const TWO_PI = Math.PI * 2;

// UI Elements
const gameScreen = document.getElementById('gameScreen');
const scoreDisplay = document.getElementById('score');
let gunModeTapBtn, gunModeAutoBtn, gunModeRocketBtn;

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
    
    // Setup event listeners after canvas is initialized
    setupEventListeners();
}

// Gun mode: set mode and update box icons
function setGunMode(mode) {
    gunMode = mode;
    if (gunModeTapBtn) gunModeTapBtn.classList.toggle('active', mode === 'tap');
    if (gunModeAutoBtn) gunModeAutoBtn.classList.toggle('active', mode === 'auto');
    if (gunModeRocketBtn) gunModeRocketBtn.classList.toggle('active', mode === 'rocket');
    if (mode !== 'rocket') rocketCharging = null;
}

// Setup Event Listeners
function setupEventListeners() {
    if (!canvas) return;
    
    gunModeTapBtn = document.getElementById('gunModeTap');
    gunModeAutoBtn = document.getElementById('gunModeAuto');
    if (gunModeTapBtn) {
        gunModeTapBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setGunMode('tap');
        });
    }
    if (gunModeAutoBtn) {
        gunModeAutoBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setGunMode('auto');
        });
    }
    gunModeRocketBtn = document.getElementById('gunModeRocket');
    if (gunModeRocketBtn) {
        gunModeRocketBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setGunMode('rocket');
        });
    }
    setGunMode(gunMode); // sync active state of box icons
    
    // QUEUE INPUT - absolute minimum work, just store x,y and timestamp
    function queueInput(x, y) {
        inputQueue.push({ x: x, y: y, t: performance.now() });
    }
    
    // TOUCH EVENTS - prevent default (scroll/zoom); multi-touch is handled via pointerdown
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
    }, { passive: false, capture: true });
    
    // POINTER EVENTS - single source for all inputs (touch, pen, mouse)
    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (gunMode === 'tap') {
            queueInput(e.clientX, e.clientY);
        } else if (gunMode === 'auto') {
            activePointers[e.pointerId] = { x: e.clientX, y: e.clientY, lastShotTime: performance.now() };
            queueInput(e.clientX, e.clientY);
        } else if (gunMode === 'rocket' && !rocketCharging) {
            rocketCharging = { pointerId: e.pointerId, startTime: performance.now(), x: e.clientX, y: e.clientY };
        }
    }, { passive: false, capture: true });
    
    canvas.addEventListener('pointermove', (e) => {
        if (gunMode === 'auto' && activePointers[e.pointerId]) {
            activePointers[e.pointerId].x = e.clientX;
            activePointers[e.pointerId].y = e.clientY;
        }
        if (gunMode === 'rocket' && rocketCharging && rocketCharging.pointerId === e.pointerId) {
            rocketCharging.x = e.clientX;
            rocketCharging.y = e.clientY;
        }
    }, { passive: true, capture: true });
    
    canvas.addEventListener('pointerup', (e) => {
        delete activePointers[e.pointerId];
        if (rocketCharging && rocketCharging.pointerId === e.pointerId) rocketCharging = null;
    }, { passive: true, capture: true });
    
    canvas.addEventListener('pointercancel', (e) => {
        delete activePointers[e.pointerId];
        if (rocketCharging && rocketCharging.pointerId === e.pointerId) rocketCharging = null;
    }, { passive: true, capture: true });
    
    // Prevent default behaviors that could cause delays
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { passive: false });
}

// SlimeBox Class
class SlimeBox {
    constructor(x, y, size, vx = 0, vy = 0) {
        this.x = x;
        this.y = y;
        // Add ±5% size variation for visual variety
        this.size = size * (0.95 + Math.random() * 0.1);
        this.vx = vx;
        this.vy = vy;
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.targetRotation = 0;
        this.squash = 1;
        this.squashSpeed = 0;
        this.opacity = 1;
        this.lastHopTime = performance.now();
        this.hopInterval = CONFIG.PHYSICS.HOP_INTERVAL + Math.random() * 1000; // Randomize hop timing
        this.wasHit = false; // Track if box was just hit
        
        // Determine type based on size (sizes from getBoxSizes() are % of window height)
        const sizes = getBoxSizes();
        if (size >= sizes.BIG * 0.9) {
            this.type = 'big';
            this.color = '#ff8800'; // Orange/yellow for huge cubes
            this.highlightColor = 'rgba(255, 200, 100, 0.5)';
            this.borderColor = 'rgba(255, 150, 0, 0.8)';
        } else if (size >= sizes.MEDIUM * 0.9) {
            this.type = 'medium';
            this.color = '#ff0000'; // Red for medium cubes
            this.highlightColor = 'rgba(255, 150, 150, 0.5)';
            this.borderColor = 'rgba(200, 0, 0, 0.8)';
        } else {
            this.type = 'small';
            this.color = '#0088ff'; // Blue for small cubes
            this.highlightColor = 'rgba(100, 150, 255, 0.5)';
            this.borderColor = 'rgba(0, 100, 200, 0.8)';
        }
        
        // SIZE-BASED MOVEMENT - big boxes are slow and casual, small boxes are fast and bouncy
        if (this.type === 'big') {
            this.hopForce = 8 + Math.random() * 3;          // Lower jumps
            this.hopInterval = 3000 + Math.random() * 2000; // 3-5 seconds between hops (lazy)
            this.moveSpeed = 1.5 + Math.random() * 1;       // Very slow horizontal
            this.restChance = 0.4;                          // 40% chance to just rest instead of hop
            this.bounceDecay = 0.15;                        // Almost no bounce - heavy, settles fast
            this.floorFriction = 0.99;                      // Very low friction - slides freely
            this.bounceKillThreshold = 2;                   // Kill small bounces
        } else if (this.type === 'medium') {
            this.hopForce = 10 + Math.random() * 4;
            this.hopInterval = 1800 + Math.random() * 1000;
            this.moveSpeed = 3 + Math.random() * 1.5;
            this.restChance = 0.15;
            this.bounceDecay = 0.4;                         // Medium bounce
            this.floorFriction = 0.99;                      // Low friction
            this.bounceKillThreshold = 1.5;
        } else { // small - fast, energetic, and bouncy like a rubber ball
            this.hopForce = 12 + Math.random() * 20;        // Wild variation: 12-32 (some jump VERY high)
            this.hopInterval = 600 + Math.random() * 600;   // 0.6-1.2 seconds (more frequent)
            this.moveSpeed = 5 + Math.random() * 2;
            this.restChance = 0;
            this.bounceDecay = 0.65;                        // Very bouncy - like a rubber ball
            this.floorFriction = 0.995;                     // Almost no friction
            this.bounceKillThreshold = 0.8;                 // Let small bounces continue
            this.varyJumpHeight = true;                     // Flag to vary each jump
        }
        
        this.isResting = false;
        this.restEndTime = 0;
        
        // PRE-CALCULATE hit radius squared for fast collision detection
        this.hitRadius = (this.size / 2) * 1.5;
        this.hitRadiusSq = this.hitRadius * this.hitRadius;
        
        // Initial velocity if spawning - based on size
        if (vx === 0 && vy === 0) {
            const angle = Math.random() * TWO_PI;
            const speed = this.moveSpeed * 0.5;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        }
    }
    
    update() {
        const now = performance.now();
        
        // Apply gravity (slime falls to floor)
        this.vy += CONFIG.PHYSICS.GRAVITY;
        
        // Auto-hop behavior - boxes bounce left and right
        const floorY = canvas.height - this.size / 2;
        // Small boxes can hop even with some velocity (they're energetic), big boxes need to settle
        const velocityThreshold = this.type === 'small' ? 8 : this.type === 'medium' ? 5 : 3;
        const isOnFloor = Math.abs(this.y - floorY) < 10 && Math.abs(this.vy) < velocityThreshold;
        
        // Check if resting period is over
        if (this.isResting && now > this.restEndTime) {
            this.isResting = false;
        }
        
        // Only auto-hop if not recently hit, not resting, and hop interval passed
        if (isOnFloor && !this.wasHit && !this.isResting && now - this.lastHopTime > this.hopInterval) {
            
            // Chance to rest instead of hopping (big boxes rest more)
            if (Math.random() < this.restChance) {
                this.isResting = true;
                this.restEndTime = now + 1500 + Math.random() * 2000; // Rest for 1.5-3.5 seconds
                this.lastHopTime = now;
                // Just settle down, no hop
                this.vx *= 0.3;
            } else {
                // Just pick a random direction for each hop - simple and natural
                const horizontalDirection = Math.random() > 0.5 ? 1 : -1;
                
                // Calculate jump force - small boxes vary wildly each jump
                let jumpForce = this.hopForce;
                if (this.type === 'small') {
                    // Small boxes: random jump height each time (some super high!)
                    // Force 40+ will reach near ceiling on most screens
                    jumpForce = 10 + Math.random() * 35; // 10-45 force = huge variation
                }
                
                // Actual hop
                this.vx = horizontalDirection * this.moveSpeed;
                this.vy = -jumpForce;
                this.lastHopTime = now;
                
                // Squash effect on hop
                this.squash = this.type === 'big' ? 0.5 : this.type === 'medium' ? 0.6 : 0.7;
                this.squashSpeed = 0.1;
            }
        }
        
        // No artificial pushing - let physics and random hops handle movement naturally
        
        // Update position
        this.x += this.vx;
        this.y += this.vy;
        
        // Floor collision (slime bounces on floor)
        if (this.y >= floorY) {
            this.y = floorY;
            if (this.vy > 0) {
                // Use size-based bounce decay
                this.vy *= -this.bounceDecay;
                
                // Kill tiny bounces based on size threshold
                if (Math.abs(this.vy) < this.bounceKillThreshold) {
                    this.vy = 0;
                }
            }
            // Size-based floor friction
            this.vx *= this.floorFriction;
            
            // Squash effect on landing
            if (Math.abs(this.vy) > 1) {
                this.squash = this.type === 'big' ? 0.5 : this.type === 'medium' ? 0.65 : 0.75;
                this.squashSpeed = 0.08;
            }
        }
        
        // Wall collisions - bounce back using size-based speed
        if (this.x <= this.size / 2) {
            this.vx = this.moveSpeed * (0.8 + Math.random() * 0.4); // Bounce right
            this.x = this.size / 2;
        } else if (this.x >= canvas.width - this.size / 2) {
            this.vx = -this.moveSpeed * (0.8 + Math.random() * 0.4); // Bounce left
            this.x = canvas.width - this.size / 2;
        }
        
        // Ceiling collision
        if (this.y <= this.size / 2) {
            this.y = this.size / 2;
            this.vy *= -this.bounceDecay;
        }
        
        // Apply friction (less on horizontal for smooth left-right movement)
        this.vx *= CONFIG.PHYSICS.FRICTION;
        this.vy *= CONFIG.PHYSICS.FRICTION;
        
        // Stop very slow vertical movement, but keep horizontal momentum
        if (Math.abs(this.vy) < CONFIG.PHYSICS.MIN_VELOCITY) this.vy = 0;
        // Don't stop horizontal movement completely - keep bouncing left-right
        
        // Update rotation only if box was hit (spin effect)
        if (this.wasHit) {
            // Continue rotating (rotationSpeed was set when hit)
            this.rotation += this.rotationSpeed;
            // Slow down rotation over time
            this.rotationSpeed *= 0.96;
            
            // Stop rotation when on floor and rotation is slow enough
            const floorY = canvas.height - this.size / 2;
            const isOnFloor = Math.abs(this.y - floorY) < 10;
            if (isOnFloor && Math.abs(this.rotationSpeed) < 0.02) {
                this.rotationSpeed = 0;
                this.rotation = 0; // Snap back to no rotation
                this.wasHit = false; // Reset hit flag - now it can bounce normally again
            }
        } else {
            // No rotation during normal movement
            this.rotation = 0;
            this.rotationSpeed = 0;
        }
        
        // Update squash animation
        if (this.squash < 1) {
            this.squash += this.squashSpeed;
            this.squashSpeed *= 0.9;
            if (this.squash > 1) this.squash = 1;
        }
        
        // Keep on screen (already handled above, but keep as safety)
        this.x = Math.max(this.size / 2, Math.min(canvas.width - this.size / 2, this.x));
        this.y = Math.max(this.size / 2, Math.min(canvas.height - this.size / 2, this.y));
    }
    
    draw() {
        if (!ctx) return; // Safety check
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.scale(1, this.squash);
        
        // Main box - color based on type
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        
        // Inner highlight for depth
        ctx.fillStyle = this.highlightColor;
        ctx.fillRect(-this.size / 3, -this.size / 3, this.size * 2 / 3, this.size * 2 / 3);
        
        // Outer border for definition
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);
        
        ctx.restore();
    }
    
    isHit(x, y) {
        // FAST hit detection using squared distance (no sqrt needed)
        const dx = x - this.x;
        const dy = y - this.y;
        // Compare squared distance to squared radius - much faster than sqrt
        return (dx * dx + dy * dy) < this.hitRadiusSq;
    }
    
    split() {
        const newBoxes = [];
        
        if (this.type === 'big') {
            // Split into 2 medium boxes
            const newSize = getBoxSizes().MEDIUM;
            const angle1 = Math.random() * TWO_PI;
            const cos1 = Math.cos(angle1);
            const sin1 = Math.sin(angle1);
            const halfSize = this.size / 2;
            const speed = 4;
            
            newBoxes.push(new SlimeBox(
                this.x + cos1 * halfSize,
                this.y + sin1 * halfSize,
                newSize,
                cos1 * speed,
                sin1 * speed
            ));
            
            // angle2 = angle1 + PI, so cos/sin are just negated
            newBoxes.push(new SlimeBox(
                this.x - cos1 * halfSize,
                this.y - sin1 * halfSize,
                newSize,
                -cos1 * speed,
                -sin1 * speed
            ));
        } else if (this.type === 'medium') {
            // Split into 2 small boxes
            const newSize = getBoxSizes().SMALL;
            const angle1 = Math.random() * TWO_PI;
            const cos1 = Math.cos(angle1);
            const sin1 = Math.sin(angle1);
            const halfSize = this.size / 2;
            const speed = 3;
            
            newBoxes.push(new SlimeBox(
                this.x + cos1 * halfSize,
                this.y + sin1 * halfSize,
                newSize,
                cos1 * speed,
                sin1 * speed
            ));
            
            // angle2 = angle1 + PI, so cos/sin are just negated
            newBoxes.push(new SlimeBox(
                this.x - cos1 * halfSize,
                this.y - sin1 * halfSize,
                newSize,
                -cos1 * speed,
                -sin1 * speed
            ));
        }
        
        return newBoxes;
    }
}

// Hit Effect Class: multiple expanding circles (rings) at impact
class HitEffect {
    constructor(x, y, scale = 1) {
        this.x = x;
        this.y = y;
        this.scale = scale;
        this.rings = [
            { radius: 0, maxRadius: 20 * scale, life: 1, decay: 0.12 / scale },
            { radius: 0, maxRadius: 45 * scale, life: 1, decay: 0.07 / scale },
            { radius: 0, maxRadius: 75 * scale, life: 1, decay: 0.045 / scale }
        ];
        this._dead = false;
    }
    
    update() {
        let allDead = true;
        for (const ring of this.rings) {
            if (ring.life <= 0) continue;
            ring.life -= ring.decay;
            ring.radius = ring.maxRadius * (1 - ring.life);
            if (ring.life > 0) allDead = false;
        }
        this._dead = allDead;
    }
    
    draw() {
        ctx.save();
        const lw = Math.max(2, 3 * Math.min(this.scale, 2));
        for (const ring of this.rings) {
            if (ring.life <= 0) continue;
            ctx.strokeStyle = `rgba(255, 255, 255, ${ring.life * 0.9})`;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.arc(this.x, this.y, ring.radius, 0, TWO_PI);
            ctx.stroke();
        }
        ctx.restore();
    }
    
    isDead() {
        return this._dead !== undefined ? this._dead : this.rings.every(r => r.life <= 0);
    }
}

// Slime pop: monster "explodes" when hit – expanding filled circle in slime color, then fades
class SlimePopEffect {
    constructor(x, y, size, color, scale = 1) {
        this.x = x;
        this.y = y;
        this.startSize = size * scale;
        this.color = color;
        this.life = 1;
        this.decay = 0.09;
        this.radius = this.startSize / 2;
    }
    
    update() {
        this.life -= this.decay;
        this.radius = (this.startSize / 2) * (1 + (1 - this.life) * 1.5); // expand to ~2.5x
    }
    
    draw() {
        if (this.life <= 0) return;
        ctx.save();
        const [r, g, b] = this.hexToRgb(this.color);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${this.life * 0.85})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
    }
    
    hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    
    isDead() {
        return this.life <= 0;
    }
}

// Tap Burst Class - small circle burst on every tap/click
class TapBurst {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 600; // Increased from 300 for far scale effect
        this.life = 1.0;
        this.decay = 0.016; // Reduced from 0.1 - lasts ~1 second at 60fps (1/60 ≈ 0.016)
        this.particles = [];
        
        // Create small circle particles - more particles for better effect
        const particleCount = 16 + Math.floor(Math.random() * 12);
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 / particleCount) * i + Math.random() * 0.5;
            const speed = 8 + Math.random() * 12; // Increased speed for far scale
            this.particles.push({
                x: 0,
                y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 4 + Math.random() * 6,
                opacity: 1
            });
        }
    }
    
    update() {
        this.life -= this.decay;
        // Use easing for smoother expansion - starts fast, slows down
        const easedLife = 1 - Math.pow(1 - (1 - this.life), 2);
        this.radius = this.maxRadius * easedLife;
        
        // Update particles - slower decay so they travel further
        for (let particle of this.particles) {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= 0.96; // Slower decay - particles travel further
            particle.vy *= 0.96;
            particle.opacity = this.life * 0.8; // Fade out gradually
        }
    }
    
    draw() {
        ctx.save();
        
        // Main circle burst - bigger and more visible with fade
        const mainOpacity = Math.max(0, this.life * 0.9);
        ctx.strokeStyle = `rgba(255, 255, 255, ${mainOpacity})`;
        ctx.lineWidth = 4; // Slightly thicker for visibility
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner circle for depth - appears earlier
        if (this.radius > 30) {
            const innerOpacity = Math.max(0, this.life * 0.6);
            ctx.strokeStyle = `rgba(255, 255, 255, ${innerOpacity})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Outer glow circle for far scale effect
        if (this.radius > 100 && this.life > 0.3) {
            const glowOpacity = Math.max(0, (this.life - 0.3) * 0.3);
            ctx.strokeStyle = `rgba(255, 255, 255, ${glowOpacity})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 1.1, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Small particles - more visible
        for (let particle of this.particles) {
            const particleOpacity = Math.max(0, particle.opacity);
            ctx.fillStyle = `rgba(255, 255, 255, ${particleOpacity})`;
            ctx.beginPath();
            ctx.arc(this.x + particle.x, this.y + particle.y, particle.size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

// Explosion Class (scale > 1 = more particles, faster, bigger, longer = flamboyant)
class Explosion {
    constructor(x, y, scale = 1) {
        this.x = x;
        this.y = y;
        this.scale = scale;
        this.particles = [];
        this.life = 1.0;
        this.decay = 0.015 / scale; // bigger explosion lasts longer
        
        const particleCount = Math.floor((20 + Math.random() * 15) * scale);
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 / particleCount) * i + (Math.random() - 0.5) * 0.8;
            const speed = (4 + Math.random() * 6) * scale;
            const size = (4 + Math.random() * 10) * scale;
            const shapeRand = Math.random();
            const shape = shapeRand < 0.33 ? 'circle' : shapeRand < 0.66 ? 'triangle' : 'square';
            
            this.particles.push({
                x: 0,
                y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: size,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.3,
                shape: shape,
                opacity: 1,
                scale: 1
            });
        }
    }
    
    update() {
        this.life -= this.decay;
        
        for (let particle of this.particles) {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= 0.96;
            particle.vy *= 0.96;
            particle.rotation += particle.rotationSpeed;
            particle.opacity = this.life;
            particle.scale = 0.5 + this.life * 0.5; // Shrink as it fades
        }
    }
    
    draw() {
        ctx.save();
        ctx.strokeStyle = CONFIG.COLORS.EXPLOSION;
        ctx.lineWidth = 2;
        
        for (let particle of this.particles) {
            ctx.save();
            ctx.translate(this.x + particle.x, this.y + particle.y);
            ctx.rotate(particle.rotation);
            ctx.scale(particle.scale, particle.scale);
            ctx.globalAlpha = particle.opacity;
            
            ctx.beginPath();
            
            if (particle.shape === 'circle') {
                ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
            } else if (particle.shape === 'triangle') {
                ctx.moveTo(0, -particle.size / 2);
                ctx.lineTo(-particle.size / 2, particle.size / 2);
                ctx.lineTo(particle.size / 2, particle.size / 2);
                ctx.closePath();
            } else { // square
                ctx.rect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
            }
            
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

// Spawn Functions - spawn across the whole screen height
// Big boxes spawn with slow, casual movement
function spawnFromLeft() {
    if (!canvas || canvas.width === 0) return;
    const big = getBoxSizes().BIG;
    const y = big / 2 + Math.random() * (canvas.height - big);
    const box = new SlimeBox(big / 2, y, big, 1.5 + Math.random(), -1 - Math.random());
    slimeBoxes.push(box);
}

function spawnFromRight() {
    if (!canvas || canvas.width === 0) return;
    const big = getBoxSizes().BIG;
    const y = big / 2 + Math.random() * (canvas.height - big);
    const box = new SlimeBox(canvas.width - big / 2, y, big, -1.5 - Math.random(), -1 - Math.random());
    slimeBoxes.push(box);
}

function spawnFromCenter() {
    if (!canvas || canvas.width === 0) return;
    const big = getBoxSizes().BIG;
    const y = big / 2 + Math.random() * (canvas.height - big);
    const direction = Math.random() > 0.5 ? 1 : -1;
    const box = new SlimeBox(canvas.width / 2, y, big, direction * (1.5 + Math.random()), -1 - Math.random());
    slimeBoxes.push(box);
}

function spawnBox() {
    const spawnType = Math.random();
    if (spawnType < 0.33) {
        spawnFromLeft();
    } else if (spawnType < 0.66) {
        spawnFromRight();
    } else {
        spawnFromCenter();
    }
}

// Rocket launcher: AoE hit + force push all slimes away from impact
function fireRocket(impactX, impactY) {
    if (!canvas || !ctx) return;
    const radius = canvas.height * ROCKET_AOE_RATIO * 4; // 4x range
    const radiusSq = radius * radius;

    // Collect boxes in AoE (with index for safe splice order)
    const inRadius = [];
    for (let i = 0; i < slimeBoxes.length; i++) {
        const box = slimeBoxes[i];
        const dx = box.x - impactX;
        const dy = box.y - impactY;
        const distSq = dx * dx + dy * dy;
        if (distSq < radiusSq) {
            const dist = Math.sqrt(distSq) || 1e-6;
            inRadius.push({ box, i, dist, dx, dy });
        }
    }

    // 1) Apply force push away from impact (stronger when closer)
    for (const { box, dist, dx, dy } of inRadius) {
        const dirX = dx / dist;
        const dirY = dy / dist;
        const force = ROCKET_PUSH_FORCE * (1 - dist / radius);
        box.vx += dirX * force;
        box.vy += dirY * force;
    }

    // 2) Apply damage: split or pop (process high index first so splice is valid)
    inRadius.sort((a, b) => b.i - a.i);
    for (const { box, i } of inRadius) {
        const newBoxes = box.split();
        if (newBoxes.length > 0) {
            slimeBoxes.splice(i, 1);
            for (const nb of newBoxes) {
                const ndx = nb.x - impactX;
                const ndy = nb.y - impactY;
                const ndist = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
                const push = ROCKET_PUSH_FORCE * (1 - ndist / radius);
                nb.vx += (ndx / ndist) * push;
                nb.vy += (ndy / ndist) * push;
                nb.wasHit = true;
                nb.rotationSpeed = (Math.random() - 0.5) * 0.4;
                slimeBoxes.push(nb);
            }
            score += 1;
        } else {
            slimeBoxes.splice(i, 1);
            score += 1;
        }
    }

    // Flamboyant rocket: expanding circles + particle bursts + central "ground zero" pop
    const rocketScale = 3.5;
    slimePops.push(new SlimePopEffect(impactX, impactY, 80, '#ffaa44', rocketScale * 0.6)); // amber burst at center
    explosions.push(new Explosion(impactX, impactY, rocketScale));
    hitEffects.push(new HitEffect(impactX, impactY, 2.5));
    for (let i = 0; i < 3; i++) {
        const off = 25 + Math.random() * 40;
        const a = (Math.PI * 2 / 3) * i + Math.random() * 0.5;
        explosions.push(new Explosion(
            impactX + Math.cos(a) * off,
            impactY + Math.sin(a) * off,
            rocketScale * (0.5 + Math.random() * 0.4)
        ));
    }
    screenShake.intensity = Math.max(screenShake.intensity, 22);
    if (soundManager) {
        soundManager.playExplosion('big');
        soundManager.playImpact('big');
    }
    if (scoreDisplay) {
        scoreDisplay.textContent = `slimes popped: ${score}`;
        scoreDisplay.style.transform = 'scale(1.2)';
        setTimeout(() => { scoreDisplay.style.transform = 'scale(1)'; }, 100);
    }
}

// Draw rocket charge UX: box outline at crosshair, blink slow → fast → explode
function drawRocketChargeUX() {
    if (!rocketCharging || !ctx) return;
    const now = performance.now();
    const elapsed = now - rocketCharging.startTime;
    const x = rocketCharging.x;
    const y = rocketCharging.y;

    // Blink: 0–1s slow, 1–2s medium, 2–3s rapid (blink, blinkblink, blinkblinkblinkblink)
    let periodMs = 500;
    if (elapsed > 2000) periodMs = 80;
    else if (elapsed > 1000) periodMs = 180;
    const visible = (elapsed % periodMs) < periodMs / 2;
    if (!visible) return;

    const size = 22;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    ctx.restore();
}

// Input Handling
function getEventPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

// Process a single input - called from input queue processing
// Optimized: hit detection first, everything else deferred
function processQueuedInput(x, y) {
    if (gameState !== 'playing') return;
    
    // Visual feedback - tap burst (will be rendered next frame)
    tapBursts.push(new TapBurst(x, y));
    
    // Defer sound to not block input processing
    if (soundManager) setTimeout(() => soundManager.playBoop(), 0);
    
    // Small screen shake on every tap
    screenShake.intensity = Math.max(screenShake.intensity, 2);
    
    // Adjust for screen shake in hit detection
    const adjustedX = x - screenShake.x;
    const adjustedY = y - screenShake.y;
    
    // HIT DETECTION - the critical path, must be fast
    const len = slimeBoxes.length;
    for (let i = len - 1; i >= 0; i--) {
        const box = slimeBoxes[i];
        if (box.isHit(adjustedX, adjustedY)) {
            const hitX = box.x;
            const hitY = box.y;
            const hitType = box.type;
            const hitSize = box.size;
            const hitColor = box.color;
            
            // Monster "explodes" when hit – expanding circle in slime color
            slimePops.push(new SlimePopEffect(hitX, hitY, hitSize, hitColor, 1.1));
            
            // CRITICAL: Update game state immediately (score, box removal/split)
            const newBoxes = box.split();
            if (newBoxes.length > 0) {
                for (let j = 0; j < newBoxes.length; j++) {
                    newBoxes[j].wasHit = true;
                    newBoxes[j].rotationSpeed = (Math.random() - 0.5) * 0.4;
                }
                slimeBoxes.splice(i, 1);
                slimeBoxes.push(...newBoxes);
                score += 1;
            } else {
                slimeBoxes.splice(i, 1);
                score += 1;
            }
            
            // Monster explosion for tap/auto: always trigger, flamboyant by slime size
            const explosionScale = hitType === 'big' ? 1.6 : hitType === 'medium' ? 1.3 : 1.1;
            explosions.push(new Explosion(hitX, hitY, explosionScale));
            hitEffects.push(new HitEffect(hitX, hitY, explosionScale));
            
            setTimeout(() => {
                if (soundManager) {
                    soundManager.playImpact(hitType);
                    soundManager.playExplosion(hitType);
                    if (newBoxes.length > 0) soundManager.playSplat();
                    else soundManager.playPop('small');
                }
                const shakeIntensity = hitType === 'big' ? 12 : hitType === 'medium' ? 8 : 5;
                screenShake.intensity = Math.max(screenShake.intensity, shakeIntensity);
                scoreDisplay.textContent = `slimes popped: ${score}`;
                scoreDisplay.style.transform = 'scale(1.2)';
                setTimeout(() => { scoreDisplay.style.transform = 'scale(1)'; }, 100);
            }, 0);
            
            break; // Only hit one box per input
        }
    }
}

// Legacy function kept for compatibility
function handleClick(e) {
    if (gameState !== 'playing') return;
    const pos = getEventPos(e);
    processQueuedInput(pos.x, pos.y);
}

// Game Loop
function gameLoop(timestamp) {
    if (gameState !== 'playing') return;
    if (!canvas || !ctx) return; // Safety check
    
    // PROCESS INPUT QUEUE FIRST - highest priority before any rendering
    const queueLen = inputQueue.length;
    if (queueLen > 0) {
        for (let i = 0; i < queueLen; i++) {
            const input = inputQueue[i];
            processQueuedInput(input.x, input.y);
        }
        inputQueue.length = 0;
    }
    
    // Auto gun mode: 10 shots/sec per held pointer (press and hold + drag)
    if (gunMode === 'auto') {
        const now = performance.now();
        for (const pointerId in activePointers) {
            const p = activePointers[pointerId];
            if (now - p.lastShotTime >= AUTO_SHOT_INTERVAL_MS) {
                processQueuedInput(p.x, p.y);
                p.lastShotTime = now;
            }
        }
    }

    // Rocket launcher: fire when hold reaches 3s
    if (gunMode === 'rocket' && rocketCharging) {
        const now = performance.now();
        if (now - rocketCharging.startTime >= ROCKET_CHARGE_MS) {
            fireRocket(rocketCharging.x, rocketCharging.y);
            rocketCharging = null;
        }
    }
    
    // Update screen shake - more dramatic effect
    if (screenShake.intensity > 0) {
        // More pronounced shake with smoother decay
        const shakeAmount = screenShake.intensity;
        screenShake.x = (Math.random() - 0.5) * shakeAmount * 2;
        screenShake.y = (Math.random() - 0.5) * shakeAmount * 2;
        screenShake.intensity *= 0.88; // Slightly slower decay for more noticeable shake
        if (screenShake.intensity < 0.05) {
            screenShake.intensity = 0;
            screenShake.x = 0;
            screenShake.y = 0;
        }
    }
    
    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Reset all context settings
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
    
    // Apply screen shake transform
    ctx.save();
    ctx.translate(screenShake.x, screenShake.y);
    
    // Continuous spawning - endless game
    const currentTime = performance.now();
    if (currentTime - lastSpawnTime > CONFIG.SPAWN_RATE) {
        spawnBox();
        lastSpawnTime = currentTime;
    }
    
    // Update boxes
    for (let box of slimeBoxes) {
        box.update();
    }
    
    // Draw boxes (inside screen shake transform)
    for (let box of slimeBoxes) {
        box.draw();
    }
    
    // Update and draw explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        explosion.update();
        explosion.draw();
        if (explosion.isDead()) {
            explosions.splice(i, 1);
        }
    }
    
    // Update and draw hit effects (expanding circles)
    for (let i = hitEffects.length - 1; i >= 0; i--) {
        const effect = hitEffects[i];
        effect.update();
        effect.draw();
        if (effect.isDead()) {
            hitEffects.splice(i, 1);
        }
    }
    
    // Update and draw slime pops (monster burst when hit)
    for (let i = slimePops.length - 1; i >= 0; i--) {
        const pop = slimePops[i];
        pop.update();
        pop.draw();
        if (pop.isDead()) {
            slimePops.splice(i, 1);
        }
    }
    
    ctx.restore(); // End screen shake transform
    
    // Update and draw tap bursts (screen coordinates)
    for (let i = tapBursts.length - 1; i >= 0; i--) {
        const burst = tapBursts[i];
        burst.update();
        burst.draw();
        if (burst.isDead()) {
            tapBursts.splice(i, 1);
        }
    }

    // Rocket charge UX: ring + countdown (hold 3s)
    drawRocketChargeUX();
    
    animationId = requestAnimationFrame(gameLoop);
}

// Game Control Functions
function startGame() {
    gameState = 'playing';
    slimeBoxes = [];
    explosions = [];
    hitEffects = [];
    tapBursts = [];
    slimePops = [];
    score = 0;
    startTime = performance.now();
    lastSpawnTime = startTime;
    screenShake = { x: 0, y: 0, intensity: 0 };
    rocketCharging = null;
    
    scoreDisplay.textContent = `slimes popped: ${score}`;
    
    // Spawn first box immediately
    spawnBox();
    
    // Start game loop
    animationId = requestAnimationFrame(gameLoop);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initCanvas();
        soundManager = new SoundManager();
        startGame();
    });
} else {
    initCanvas();
    soundManager = new SoundManager();
    startGame();
}
