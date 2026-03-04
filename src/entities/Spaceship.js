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
        this.state = 'idle'; // Started as idle directly
        this.isHovering = false; // Only hover when game starts

        // 3D World Coordinates
        this.targetZ = CONFIG.SPACESHIP.TARGET_Z;
        this.worldX = 0;
        this.worldY = CONFIG.SPACESHIP.WORLD_Y;
        this.z = this.targetZ;

        this.x = 0; // Screen X (calc in update)
        this.y = 0; // Screen Y (calc in update)

        // Entrance Props
        this.tick = 0;
        this.frameIndex = 0;
    }

    startHovering() {
        this.isHovering = true;
    }

    stopHovering() {
        this.isHovering = false;
        this.tick = 0;
        this.worldX = 0;
        this.worldY = CONFIG.SPACESHIP.WORLD_Y;
        this.z = this.targetZ;
        this.sprite.rotation = 0;
    }

    update(dt) {
        // Animation
        this.frameIndex += this.animSpeed * dt;
        if (this.frameIndex >= this.frameCount) this.frameIndex = 0;
        // Ensure we have a valid texture before assigning to avoid null baseTexture errors
        const nextTexture = this.frames[Math.floor(this.frameIndex)];
        if (nextTexture && nextTexture.baseTexture) {
            this.sprite.texture = nextTexture;
        } else if (this.frames[0] && this.frames[0].baseTexture) {
            this.sprite.texture = this.frames[0];
        } else {
            // Fallback: keep existing texture or assign a placeholder if needed
            console.warn('Spaceship: No valid texture available for frame', this.frameIndex);
        }

        // Logic
        if (this.isHovering) {
            // Hover
            this.tick += dt;
            // Fade in the hover effect over first ~60 frames
            const fade = Math.min(1, this.tick / 60);

            this.worldY = CONFIG.SPACESHIP.WORLD_Y + Math.sin(this.tick * 0.05) * 30 * fade; // Faster hover
            this.z = this.targetZ; // Stay put
            this.sprite.rotation = Math.sin(this.tick * 0.02) * 0.05 * fade; // Slight idle tilt
        } else {
            // Static idle
            this.worldY = CONFIG.SPACESHIP.WORLD_Y;
            this.z = this.targetZ;
            this.worldX = 0;
            this.sprite.rotation = 0;
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
        this.sprite.scale.set(scale * 0.4); // Make it big enough?

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
