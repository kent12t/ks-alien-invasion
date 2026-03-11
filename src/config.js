// Game Configuration
// Adjust these values to tune the game balance and feel.

export const CONFIG = {
    // Spawning
    SPAWN_RATE: 800,           // Time in ms between spawns (decreases over time)
    SPAWN_MARGIN: 100,         // Safe zone margin (pixels) to keep pirates inside screen edge facing front

    // Gameplay & Interaction
    AOE_RADIUS: 250,           // Radius of the tap/explosion effect
    PARTICLE_SIZE_MIN: 80,     // Min size of explosion parts
    PARTICLE_SIZE_MAX: 150,     // Max size of explosion parts
    PARTICLE_SPEED_MIN: 12,      // Min velocity of flying parts
    PARTICLE_SPEED_MAX: 20,     // Max velocity of flying parts
    COLORS: {
        EXPLOSION: '#ffffff',
        AOE_RING: 'rgba(216, 255, 41, 0.82)'
    },

    // 2.5D Projection Settings
    FOCAL_LENGTH: 400,         // Controls perspective distortion (lower = more extreme)
    MIN_SCALE: 0.1,            // Minimum size scale for objects far away

    // World Dimensions (World Units)
    FLOOR_Y: 250,              // Vertical position of the floor (relative to center)

    // Z-Depth Settings (Distance from Camera)
    Z_START: 1500,             // Starting distance (Spawn point) - Further away means smaller at spawn
    Z_SPEED: 5,                // Base movement speed towards camera
    ALIEN_BASE_SIZE: 300,     // Base size for alien normalization (was 420)

    // Fog / Atmosphere
    FOG: {
        ENABLED: true,
        START_Z: 300,          // Distances closer than this are fully visible
        END_Z: 1600,           // Further away due to increased Z_START
        TINT_COLOR: 0x000000   // Color to fade towards (0x000000 = Dark/Night)
    },

    // Interaction Zones
    MAX_HIT_Z: 100,           // Beyond this distance, pirates cannot be hit
    MIN_HIT_Z: -2000,           // Behind this distance, pirates are ignored (behind camera)
    STOP_Z: -150,               // The "Front Line" where pirates stop and congregate

    // Animation Assets
    ANIMATION: {
        FRAME_COUNT_CAPTAIN: 121,
        FRAME_COUNT_MINION: 121,
        FRAME_COUNT_SPACESHIP: 259
    },

    // Game Director / Timeline
    TIMELINE: {
        GAME_LENGTH: 90,             // Total active game time
        SPACESHIP_AUDIO_START: 0,
        ALIEN_SPAWN_START: 0,
        ALIEN_SPAWN_END: 80,
        ALIEN_KILL_TRIGGER: 85,
        GAME_END: 93
    },

    SCHEDULED_SOUNDS: {
        "10.0": "rex1",
        "30.0": "rex2",
        "50.0": "rex3",
        "70.0": "rex4"
    },

    WAVES: [
        { start: 0, end: 23, count: 40, type: 'minion_only', label: 'Wave 1' },
        { start: 23, end: 43, count: 60, type: 'minion_only', label: 'Wave 2' },
        { start: 43, end: 80, count: 50, type: 'boss_wave', label: 'Wave 3' }
    ],

    BOSS: {
        HP: 20,
        SCALE: 1.6,
        HIT_BOUNCE: 1.2,
        Y_OFFSET: -50  // Moves the boss higher on the screen
    },

    // Audio & Ambiance
    AUDIO: {
        MAX_FOOTSTEP_ALIENS: 30,       // Alien count at which footsteps reach max volume
        MAX_FOOTSTEP_VOLUME: 3.0,      // The max volume of the footprint footsteps
        GRUNT_CHANCE_PER_ALIEN: 0.0003, // Per-frame chance an alien will scream/grunt (adjust based on FPS)
        SPEECH_VOLUME: 4.5,             // Volume for scheduled speech clips (rex1-4)
        BGM_VOLUME: 0.7                // Background music volume (louder as requested)
    },

    // Overlays
    OVERLAYS: {
        GAME_DURATION: 90,             // Total active game time
        SEQUENTIAL_INTERVAL: 7.5,      // 90 / 12 = 7.5s
        ASSETS: [
            'assets/overlays/overlay_a.webp',
            'assets/overlays/overlay_b.webp',
            'assets/overlays/overlay_c.webp',
            'assets/overlays/overlay_d.webp',
            'assets/overlays/overlay_e.webp',
            'assets/overlays/overlay_f.webp',
            'assets/overlays/overlay_g.webp',
            'assets/overlays/overlay_h.webp',
            'assets/overlays/overlay_i.webp',
            'assets/overlays/overlay_j.webp',
            'assets/overlays/overlay_k.webp',
            'assets/overlays/overlay_l.webp'
        ]
    },

    // Spaceship Props
    SPACESHIP: {
        WORLD_Y: -100,                 // Lowered from -300 to be closer to the action
        TARGET_Z: 450,
        SCALE: 0.6                     // Increased from ~0.4 for better visibility
    }
};
