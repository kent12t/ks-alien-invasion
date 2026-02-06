import { resources } from '../managers/AssetManager.js';
import { CONFIG } from '../config.js';

export class Spaceship {
    constructor(app, gameContainer) {
        this.app = app;
        this.sprite = new PIXI.Sprite();
        this.sprite.anchor.set(0.5);
        // zIndex will be managed by update() based on Z depth
        this.sprite.zIndex = -4000;

        gameContainer.addChild(this.sprite);

        this.frames = resources.spaceshipFrames;
        this.frameCount = this.frames.length;
        this.frameIndex = 0;
        this.animSpeed = 0.5; // 30fps

        // Pathing / State
        this.state = 'entering'; // entering, idle, leaving

        // 3D World Coordinates
        // Target: Center (0), High up?
        // User said: "settled down in the center just behind the fog"
        // Fog starts at CONFIG.FOG.START_Z (300).
        // So target Z should be maybe 400?
        this.targetZ = 450;

        // Start: Camera side (Left).
        // High Z (far) or Low Z (close)? "From camera side" implies close usually.
        // Let's start "behind" or "next to" camera.
        // Screen Left is -Width/2.
        // Let's start at worldX = -2000 (way left), z = -200 (close).

        this.worldX = -1500;
        this.worldY = 0; // Center Y relative to horizon?
        // Actually Pirate uses FLOOR_Y = 400.
        // Spaceship should be flying. So worldY should be "up".
        // If +y is down, negative worldY is up.
        this.worldY = -300;

        this.z = -200; // Start close

        this.x = 0; // Screen X (calc in update)
        this.y = 0; // Screen Y (calc in update)

        // Entrance Props
        this.entranceTimer = 0;
        this.entranceDuration = 300; // 5 seconds @ 60fps
    }

    update(dt) {
        // Animation
        this.frameIndex += this.animSpeed;
        if (this.frameIndex >= this.frameCount) this.frameIndex = 0;
        this.sprite.texture = this.frames[Math.floor(this.frameIndex)] || this.frames[0];

        // Logic
        if (this.state === 'entering') {
            this.entranceTimer++;
            const t = Math.min(1, this.entranceTimer / this.entranceDuration);
            // Ease out cubic
            const ease = 1 - Math.pow(1 - t, 3);

            // Move X from -1500 to 0
            this.worldX = -1500 + (0 - (-1500)) * ease;

            // Move Z from -200 to targetZ (450)
            this.z = -200 + (this.targetZ - (-200)) * ease;

            // DAMPENED WIGGLE: Amplitude fades to 0 as t approaches 1
            const dampen = (1 - ease);

            // Wiggle: "Goofy" side-to-side (Left to Right movement is linear, wiggle adds offsets)
            // Left to Right is handled by worldX interpolation.
            // Add extra sine wave oscillation on top for "drunk" looping feel.

            // Y Wiggle: Up and down
            this.worldY = -300 + Math.sin(this.entranceTimer * 0.1) * 80 * dampen;

            // X Wiggle: Side to side (fading out)
            this.worldX += Math.cos(this.entranceTimer * 0.15) * 40 * dampen;

            // Rotation wiggle (fading out, reduced clamp)
            // "dont roatate so much, a little is ok" -> reduced amplitude 0.2 -> 0.1
            this.sprite.rotation = Math.sin(this.entranceTimer * 0.1) * 0.1 * dampen;

            if (t >= 1) {
                this.state = 'idle';
                this.worldX = 0;
                this.z = this.targetZ;
                this.worldY = -300; // Reset Y to base hover Y
                this.sprite.rotation = 0;

                // Sync "tick" for idle hover so it doesn't jump
                // Idle uses sin(tick * 0.05). 
                // We want sin(tick * 0.05) to start near 0 (since worldY resets to -300).
                // So tick should be 0 (phase 0) or PI (phase 0).
                this.tick = 0;
            }
        } else if (this.state === 'idle') {
            // Hover
            this.tick = (this.tick || 0) + 1;
            // Fade in the hover effect over first ~60 frames
            const fade = Math.min(1, this.tick / 60);

            this.worldY = -300 + Math.sin(this.tick * 0.05) * 30 * fade; // Faster hover
            this.z = this.targetZ; // Stay put
            this.sprite.rotation = Math.sin(this.tick * 0.02) * 0.05 * fade; // Slight idle tilt
        } else if (this.state === 'leaving') {
            // "It goes out from the right side, not the back."
            // Move World X positive.
            this.worldX += 20; // Fast exit right
            // Maybe slight curve up?
            this.worldY -= 2;

            // Banking for turn
            this.sprite.rotation = 0.2;
        }

        // Projection (Same as Pirate)
        const perspective = Math.max(0.01, CONFIG.FOCAL_LENGTH + this.z);
        const scale = CONFIG.FOCAL_LENGTH / perspective;

        const cx = this.app.screen.width / 2;
        const cy = this.app.screen.height / 2;

        this.x = cx + this.worldX * scale;
        this.y = cy + this.worldY * scale;

        this.sprite.x = this.x;
        this.sprite.y = this.y;

        // Base scale for spaceship? 0.8 in original
        this.sprite.scale.set(scale * 1.5); // Make it big enough?

        // Depth Sorting
        this.sprite.zIndex = -this.z;

        // Fog
        if (CONFIG.FOG && CONFIG.FOG.ENABLED) {
            let fogFactor = (this.z - CONFIG.FOG.START_Z) / (CONFIG.FOG.END_Z - CONFIG.FOG.START_Z);
            fogFactor = Math.max(0, Math.min(1, fogFactor));
            const val = Math.floor(255 * (1.0 - fogFactor));
            const tint = (val << 16) | (val << 8) | val;
            this.sprite.tint = tint;
        }
    }
}
