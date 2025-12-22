
import { Container, Graphics } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT } from './Game';

export class Alien {
    constructor(game) {
        this.game = game;
        this.container = new Container();

        // Random start position within logical bounds
        const x = (Math.random() * GAME_WIDTH * 0.8) + (GAME_WIDTH * 0.1);
        const y = (Math.random() * GAME_HEIGHT * 0.6) + (GAME_HEIGHT * 0.2);

        this.container.x = x;
        this.container.y = y;

        // Initial "depth" (scale)
        this.scale = 0.1;
        this.container.scale.set(this.scale);

        this.speed = 0.005; // Growth rate
        this.isDead = false;
        this.state = 'APPROACHING'; // APPROACHING, HIT, ATTACKED

        this.createGraphics();

        // Make interactive
        this.container.eventMode = 'static';
        this.container.cursor = 'pointer';
        this.container.on('pointerdown', this.onInput, this);
    }

    createGraphics() {
        const gfx = new Graphics();
        // Alien body (Circle for now)
        gfx.circle(0, 0, 50);
        gfx.fill(0x00FF00); // Alien Green

        // Eyes
        gfx.ellipse(-15, -10, 10, 15);
        gfx.fill(0x000000);
        gfx.ellipse(15, -10, 10, 15);
        gfx.fill(0x000000);

        this.graphics = gfx;
        this.container.addChild(gfx);
    }

    onInput() {
        if (this.state === 'APPROACHING') {
            this.hit();
        }
    }

    hit() {
        this.state = 'HIT';
        this.graphics.clear();
        this.graphics.star(0, 0, 5, 60, 20);
        this.graphics.fill(0xFFFF00); // Explosion color
        this.game.onAlienHit(this);

        // Remove after short delay
        setTimeout(() => {
            this.isDead = true;
        }, 200);
    }

    attack() {
        this.state = 'ATTACKED';
        this.graphics.clear();
        this.graphics.circle(0, 0, 60);
        this.graphics.fill(0xFF0000); // Red for damage
        this.game.onTakeDamage(10);
        this.isDead = true;
    }

    update(delta) {
        if (this.state === 'APPROACHING') {
            this.scale += this.speed * delta;
            this.container.scale.set(this.scale);

            // If too close (too big), attack
            if (this.scale >= 2.0) {
                this.attack();
            }
        }
    }
}
