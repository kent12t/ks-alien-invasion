import { CONFIG } from '../config.js';

export class AoERing {
    constructor(x, y, gameContainer) {
        this.x = x;
        this.y = y;
        this.gameContainer = gameContainer;
        this.g = new PIXI.Graphics();
        gameContainer.addChild(this.g);
        this.radius = 10;
        this.maxRadius = CONFIG.AOE_RADIUS;
        this.life = 1.0;
        // Effect should be on top of pirates?
        this.g.zIndex = 2000; // Very high zIndex
    }
    update(delta) {
        this.life -= 0.06 * delta;
        this.radius += (this.maxRadius - this.radius) * (1 - Math.pow(0.75, delta));

        // Draw
        this.g.clear();
        this.g.lineStyle(4, 0xFFD700, this.life);
        this.g.beginFill(0xFFD700, 0.1 * this.life);
        this.g.drawCircle(this.x, this.y, this.radius);
        this.g.endFill();

        if (this.life <= 0) {
            this.g.clear();
            this.gameContainer.removeChild(this.g);
            this.g.destroy();
        }
    }
}
