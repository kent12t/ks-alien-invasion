// Game Configuration
// Adjust these values to tune the game balance and feel.

const CONFIG = {
    // Spawning
    SPAWN_RATE: 1000,           // Time in ms between spawns (decreases over time)
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
    FLOOR_Y: 400,              // Vertical position of the floor (relative to center)

    // Z-Depth Settings (Distance from Camera)
    Z_START: 900,             // Starting distance (Spawn point)
    Z_SPEED: 5,                // Base movement speed towards camera

    // Fog / Atmosphere
    FOG: {
        ENABLED: true,
        START_Z: 300,          // Distances closer than this are fully visible
        END_Z: 1000,           // Distances further than this are fully darkened
        TINT_COLOR: 0x000000   // Color to fade towards (0x000000 = Dark/Night)
    },

    // Interaction Zones
    MAX_HIT_Z: 100,           // Beyond this distance, pirates cannot be hit
    MIN_HIT_Z: -2000,           // Behind this distance, pirates are ignored (behind camera)
    STOP_Z: -150,               // The "Front Line" where pirates stop and congregate

    // Animation Assets
    ANIMATION: {
        FRAME_COUNT_CAPTAIN: 121, // 0 to 120
        FRAME_COUNT_MINION: 121,  // Number of frames in MinionPngSeq
    }
};
