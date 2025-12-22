import { Alien } from './Alien';

export class StageManager {
    constructor(game) {
        this.game = game;
        this.currentStage = 1;
        this.spawnTimer = 0;
        this.spawnInterval = 120; // Frames (approx 2 sec at 60fps)
        this.difficultyMultiplier = 1;
    }

    start() {
        this.spawnTimer = 0;
        this.currentStage = 1;
    }

    update(delta) {
        this.spawnTimer += delta;

        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnAlien();
            this.spawnTimer = 0;
        }

        // Simple progression based on score
        if (this.game.score > 100 && this.currentStage === 1) {
            this.setStage(2);
        } else if (this.game.score > 300 && this.currentStage === 2) {
            this.setStage(3);
        }
    }

    spawnAlien() {
        const alien = new Alien(this.game);
        // Increase speed based on stage
        alien.speed *= this.difficultyMultiplier;
        this.game.spawnAlien(alien);
    }

    setStage(stage) {
        this.currentStage = stage;
        this.game.ui.showMessage(`Stage ${stage}`);

        switch (stage) {
            case 2:
                this.spawnInterval = 90;
                this.difficultyMultiplier = 1.5;
                break;
            case 3:
                this.spawnInterval = 60; // 1 sec
                this.difficultyMultiplier = 2.0;
                break;
        }
    }
}
