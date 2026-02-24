import { CONFIG } from '../config.js';
import { resources } from '../managers/AssetManager.js';

export class Explosion {
    constructor(x, y, gameContainer) {
        this.x = x;
        this.y = y;
        this.gameContainer = gameContainer;
        this.particles = [];
        this.container = new PIXI.Container();
        this.container.zIndex = 2000; // Foreground
        gameContainer.addChild(this.container);

        const partCount = 8 + Math.floor(Math.random() * 6);
        for (let i = 0; i < partCount; i++) {
            // Random texture – ensure it is a valid texture with baseTexture
            let tex = null;
            if (resources.parts.length > 0) {
                const candidate = resources.parts[Math.floor(Math.random() * resources.parts.length)];
                if (candidate && candidate.baseTexture) tex = candidate;
            }
            if (tex) {
                const s = new PIXI.Sprite(tex);
                s.anchor.set(0.5);

                // Configurable Random Size
                const size = CONFIG.PARTICLE_SIZE_MIN + Math.random() * (CONFIG.PARTICLE_SIZE_MAX - CONFIG.PARTICLE_SIZE_MIN);
                s.width = size;
                s.height = size;

                // particle physics props
                const speed = CONFIG.PARTICLE_SPEED_MIN + Math.random() * (CONFIG.PARTICLE_SPEED_MAX - CONFIG.PARTICLE_SPEED_MIN);
                const angle = Math.random() * 6.28;

                s.userData = {
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 5,
                    rotSpeed: (Math.random() - 0.5) * 0.2,
                    dead: false
                };

                this.container.addChild(s);
                this.particles.push(s);
            }
        }
    }

    update(delta) {
        let active = 0;
        for (let p of this.particles) {
            const d = p.userData;
            if (d.dead) continue;

            p.x += d.vx * delta;
            p.y += d.vy * delta;
            d.vy += 0.3 * delta; // Gravity
            p.rotation += d.rotSpeed * delta;

            p.scale.x -= 0.025 * delta;
            p.scale.y -= 0.025 * delta;

            if (p.scale.x <= 0) {
                p.scale.set(0);
                d.dead = true;
                p.visible = false;
            } else {
                active++;
            }
        }

        if (active === 0) {
            this.destroy();
        } else {
            // Sync container pos
            this.container.x = this.x;
            this.container.y = this.y;
        }
    }

    destroy() {
        if (this.container.parent) {
            this.gameContainer.removeChild(this.container);
            this.container.destroy({ children: true });
        }
        this.particles = [];
    }
}
