import { Text, TextStyle, Container, Graphics } from 'pixi.js';
import { GAME_WIDTH, GAME_HEIGHT } from './Game';

export class UI {
    constructor(game) {
        this.game = game;
        this.container = new Container();
        this.game.rootContainer.addChild(this.container);

        const styleOptions = {
            fontFamily: 'Arial',
            fontSize: 32,
            fill: '#ffffff',
            stroke: { color: '#000000', width: 4 },
        };
        const style = new TextStyle(styleOptions);

        // HUD Container
        this.hudContainer = new Container();
        this.container.addChild(this.hudContainer);

        this.scoreText = new Text({ text: 'Score: 0', style });
        this.scoreText.x = 20;
        this.scoreText.y = 20;
        this.hudContainer.addChild(this.scoreText);

        this.healthText = new Text({ text: 'Health: 100', style: { ...styleOptions, fill: '#ff0000' } });
        this.healthText.x = 20;
        this.healthText.y = 70;
        this.hudContainer.addChild(this.healthText);

        // Screens
        this.startScreen = this.createScreen('ALIEN INVASION', 'START', () => this.game.start());
        this.gameOverScreen = this.createScreen('GAME OVER', 'RESTART', () => this.game.restart());

        this.container.addChild(this.startScreen);
        this.container.addChild(this.gameOverScreen);

        this.hideAll();
    }

    createScreen(titleText, buttonText, onButtonPress) {
        const container = new Container();

        // Background shim
        const bg = new Graphics();
        bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        bg.fill({ color: 0x000000, alpha: 0.7 });
        container.addChild(bg);

        const title = new Text({
            text: titleText,
            style: {
                fontFamily: 'Arial',
                fontSize: 100,
                fill: '#ffff00',
                stroke: { color: '#000000', width: 8 }
            }
        });
        title.anchor.set(0.5);
        title.x = GAME_WIDTH / 2;
        title.y = GAME_HEIGHT / 3;
        container.addChild(title);

        const button = this.createButton(buttonText, onButtonPress);
        button.x = GAME_WIDTH / 2;
        button.y = GAME_HEIGHT / 2 + 100;
        container.addChild(button);

        container.visible = false;
        return container;
    }

    createButton(text, callback) {
        const btnContainer = new Container();
        btnContainer.eventMode = 'static';
        btnContainer.cursor = 'pointer';

        const bg = new Graphics();
        bg.roundRect(-150, -50, 300, 100, 20);
        bg.fill(0x00AA00);
        bg.stroke({ width: 4, color: 0xffffff });

        const btnText = new Text({
            text,
            style: {
                fontFamily: 'Arial',
                fontSize: 48,
                fill: '#ffffff'
            }
        });
        btnText.anchor.set(0.5);

        btnContainer.addChild(bg, btnText);

        btnContainer.on('pointerdown', callback);
        btnContainer.on('pointerover', () => bg.tint = 0x00FF00);
        btnContainer.on('pointerout', () => bg.tint = 0xFFFFFF);

        return btnContainer;
    }

    showStartScreen() {
        this.hideAll();
        this.startScreen.visible = true;
        this.hudContainer.visible = false;
    }

    showGameOver() {
        this.hideAll();
        this.gameOverScreen.visible = true;
        this.hudContainer.visible = true;
    }

    showHUD() {
        this.hideAll();
        this.hudContainer.visible = true;
    }

    hideAll() {
        this.startScreen.visible = false;
        this.gameOverScreen.visible = false;
        this.hudContainer.visible = false;
    }

    updateScore(score) {
        this.scoreText.text = `Score: ${score}`;
    }

    updateHealth(health) {
        this.healthText.text = `Health: ${health}`;
    }

    showMessage(text, duration = 2000) {
        // Optional: Implement generic toast message if needed
    }
}
