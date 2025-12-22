import { Container, Ticker } from 'pixi.js';
import { StageManager } from './StageManager';
import { InputManager } from './InputManager';
import { UI } from './UI';

export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

export class Game {
    constructor(app) {
        this.app = app;
        this.stage = app.stage;

        this.rootContainer = new Container();
        this.stage.addChild(this.rootContainer);

        this.gameContainer = new Container();
        this.rootContainer.addChild(this.gameContainer);

        this.inputManager = new InputManager(this);
        this.stageManager = new StageManager(this);
        this.ui = new UI(this);

        this.sprites = []; // Active aliens
        this.score = 0;
        this.health = 100;
        this.isRunning = false;

        this.resize();
        window.addEventListener('resize', this.resize.bind(this));

        // Start flow
        this.ui.showStartScreen();
    }

    resize() {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        const scale = Math.min(screenWidth / GAME_WIDTH, screenHeight / GAME_HEIGHT);

        this.rootContainer.scale.set(scale);

        // Center the game
        this.rootContainer.x = (screenWidth - GAME_WIDTH * scale) / 2;
        this.rootContainer.y = (screenHeight - GAME_HEIGHT * scale) / 2;
    }

    start() {
        this.isRunning = true;
        this.ui.showHUD();
        this.app.ticker.add(this.update, this);
        this.stageManager.start();
        this.ui.updateScore(this.score);
        this.ui.updateHealth(this.health);
    }

    restart() {
        // Clear existing aliens
        for (const alien of this.sprites) {
            this.gameContainer.removeChild(alien.container);
        }
        this.sprites = [];

        // Reset Stats
        this.score = 0;
        this.health = 100;

        // Remove old ticker listener if any (to avoid duplicates if called multiple times, though start() adds it)
        this.app.ticker.remove(this.update, this);

        // Start again
        this.start();
    }

    update(ticker) {
        if (!this.isRunning) return;

        const delta = ticker.deltaTime;
        this.stageManager.update(delta);

        // Update all aliens
        for (let i = this.sprites.length - 1; i >= 0; i--) {
            const alien = this.sprites[i];
            alien.update(delta);

            if (alien.isDead) {
                this.removeAlien(i);
            }
        }
    }

    spawnAlien(alien) {
        this.sprites.push(alien);
        this.gameContainer.addChild(alien.container);
    }

    removeAlien(index) {
        const alien = this.sprites[index];
        this.gameContainer.removeChild(alien.container);
        this.sprites.splice(index, 1);
    }

    onAlienHit(alien) {
        this.score += 10;
        this.ui.updateScore(this.score);
        // Play hit sound or visual effect here
    }

    onTakeDamage(damage) {
        this.health -= damage;
        this.ui.updateHealth(this.health);
        if (this.health <= 0) {
            this.gameOver();
        }
    }

    gameOver() {
        this.isRunning = false;
        this.app.ticker.remove(this.update, this);
        this.ui.showGameOver();
        // Stop spawning
    }
}
