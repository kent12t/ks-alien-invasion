import { CONFIG } from '../config.js';
import { resources } from '../managers/AssetManager.js';

export class Pirate {
    constructor(app, gameContainer, shadowContainer, isBoss = false) {
        this.app = app;
        this.gameContainer = gameContainer;
        this.shadowContainer = shadowContainer;

        // Enforce Minion Only for non-bosses
        this.type = isBoss ? 'captain' : 'minion';
        this.isBoss = isBoss;

        // Stats
        this.hp = isBoss ? CONFIG.BOSS.HP : 1;
        this.maxHp = this.hp;

        // Shadow Setup (Back Layer)
        this.shadow = new PIXI.Graphics();
        this.shadow.beginFill(0x000000, 0.3); // Black, 30% opacity
        this.shadow.drawEllipse(0, 0, 60, 20); // Reduced from 100, 30
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
        const safeWidthHalf = (this.app.screen.width / 2) - margin;
        const maxWorldX = Math.max(0, safeWidthHalf / stopScale);

        this.baseWorldX = (Math.random() - 0.5) * 2 * maxWorldX;
        if (this.isBoss) this.baseWorldX = 0; // Boss is centered

        this.worldX = this.baseWorldX; // Current X

        // Sticky Floor: World Y
        this.worldY = this.isBoss ? (CONFIG.FLOOR_Y + (CONFIG.BOSS.Y_OFFSET || 0)) : CONFIG.FLOOR_Y;

        // Start far away
        this.z = CONFIG.Z_START;

        // Varied Speed
        if (this.isBoss) {
            this.speed = CONFIG.Z_SPEED * 0.8;
        } else {
            this.speed = CONFIG.Z_SPEED * (0.5 + Math.random() * 1.0);
        }

        this.stopZ = CONFIG.STOP_Z + Math.random() * 50;
        if (this.isBoss) this.stopZ = CONFIG.STOP_Z; // Boss takes front and center

        this.screenX = 0;
        this.screenY = 0;
        this.scale = 0;
        this.radius = 0;

        // Size Variation
        if (this.isBoss) {
            this.sizeMultiplier = CONFIG.BOSS.SCALE;
        } else {
            this.sizeMultiplier = 0.9 + Math.random() * 0.2;
        }

        // Wiggle / Wander Properties
        this.wanderPhase = Math.random() * Math.PI * 2;
        this.wanderSpeed = 0.02 + Math.random() * 0.03;
        this.wanderAmp = 50 + Math.random() * 100;

        // Jump Properties
        this.jumpY = 0; // Height off ground (positive up)
        this.jumpVy = 0;
        this.gravity = 0.8; // Gravity force
        this.isJumping = false;
        this.nextJumpTime = 60 + Math.random() * 200; // Frames until next jump
    }

    update(delta) {
        // z move
        if (this.z > this.stopZ) this.z -= this.speed * delta;
        else this.z = this.stopZ;

        // x wander
        this.wanderPhase += this.wanderSpeed * delta;
        this.worldX = this.baseWorldX + Math.sin(this.wanderPhase) * this.wanderAmp;

        // y jump
        if (this.isJumping) {
            this.jumpY += this.jumpVy * delta;
            this.jumpVy -= this.gravity * delta;
            if (this.jumpY <= 0) {
                this.jumpY = 0;
                this.isJumping = false;
                this.nextJumpTime = 60 + Math.random() * 240;
            }
        } else {
            this.nextJumpTime -= delta;
            if (this.nextJumpTime <= 0) {
                this.isJumping = true;
                this.jumpVy = 15 + Math.random() * 10;
            }
        }

        // Animation
        if (this.frameCount > 0) {
            this.frameIndex += this.animSpeed * this.animDir * delta;
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

        const cx = this.app.screen.width / 2;
        const cy = this.app.screen.height / 2;

        this.screenX = cx + this.worldX * this.scale;

        // Shadow Y (Always on floor, slightly elevated to meet the bottom of the and normalized sprites)
        const shadowScreenY = cy + (this.worldY - 40) * this.scale;

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
        if (tex && tex.baseTexture) {
            this.sprite.texture = tex;
            const w = tex.width || 1000;
            const h = tex.height || 1000;
            const norm = CONFIG.ALIEN_BASE_SIZE / Math.max(w, h);
            this.sprite.scale.set(this.scale * norm);
        } else if (this.fallback && this.fallback.baseTexture) {
            // Use fallback texture if valid
            this.sprite.texture = this.fallback;
            const w = this.fallback.width || 1000;
            const h = this.fallback.height || 1000;
            const norm = CONFIG.ALIEN_BASE_SIZE / Math.max(w, h);
            this.sprite.scale.set(this.scale * norm);
        } else {
            // No valid texture – keep previous texture and log warning
            console.warn('Pirate: No valid texture available for rendering');
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

    drawBossUI() {
        if (!this.hpBar) {
            this.hpBar = new PIXI.Graphics();
            this.gameContainer.addChild(this.hpBar);
        }

        this.hpBar.clear();
        this.hpBar.zIndex = 2000; // Force on top

        const width = 100 * this.scale;
        const height = 10 * this.scale;
        const x = this.screenX - width / 2;
        const y = this.screenY - (this.sprite.height * this.sprite.anchor.y) - (20 * this.scale);

        // BG
        this.hpBar.beginFill(0x000000);
        this.hpBar.drawRect(x, y, width, height);
        this.hpBar.endFill();

        // FG
        const pct = Math.max(0, this.hp / CONFIG.BOSS.HP);
        const color = pct < 0.3 ? 0xFF0000 : 0x00FF00;
        this.hpBar.beginFill(color);
        this.hpBar.drawRect(x + 1, y + 1, (width - 2) * pct, height - 2);
        this.hpBar.endFill();
    }

    takeDamage() {
        this.hp = Math.max(0, this.hp - 1);
    }

    getCurrentTexture() {
        if (this.frameCount > 0) {
            const idx = Math.floor(this.frameIndex);
            const tex = this.frames[idx];
            if (tex && tex.baseTexture) return tex;
        }
        // Return fallback only if it is a valid texture
        if (this.fallback && this.fallback.baseTexture) return this.fallback;
        return null;
    }

    destroy() {
        this.gameContainer.removeChild(this.sprite);
        this.sprite.destroy();
        this.shadowContainer.removeChild(this.shadow);
        this.shadow.destroy();
        if (this.hpBar) {
            this.gameContainer.removeChild(this.hpBar);
            this.hpBar.destroy();
        }
    }
}
