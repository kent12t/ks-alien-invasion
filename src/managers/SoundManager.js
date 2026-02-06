export default class SoundManager {
    constructor() {
        this.audioContext = null;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            // console.warn('Web Audio API not supported');
        }
    }

    playShot() {
        if (!this.audioContext) return;
        const o = this.audioContext.createOscillator();
        const g = this.audioContext.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(600, this.audioContext.currentTime);
        o.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + 0.3);
        g.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        o.connect(g);
        g.connect(this.audioContext.destination);
        o.start();
        o.stop(this.audioContext.currentTime + 0.35);
    }

    playExplosion() {
        if (!this.audioContext) return;
        const bufferSize = this.audioContext.sampleRate * 0.5;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * i / bufferSize);
        }
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        const gain = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.audioContext.destination);
        gain.gain.setValueAtTime(0.8, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
        noise.start();
    }
}
