export default class SoundManager {
    constructor() {
        this.audioContext = null;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            // console.warn('Web Audio API not supported');
        }
        this.backgroundMusic = null;
        this.musicFading = false;
    }

    resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    playShot() {
        if (!this.audioContext) return;
        const t = this.audioContext.currentTime;

        // Pick a random note from a pentatonic scale for melodic variety
        const notes = [523, 587, 659, 784, 880, 1047, 1175, 1319];
        const baseFreq = notes[Math.floor(Math.random() * notes.length)];
        const waveforms = ['sine', 'triangle', 'square'];
        const wave = waveforms[Math.floor(Math.random() * waveforms.length)];

        // Main tone - melodic zap
        const osc1 = this.audioContext.createOscillator();
        osc1.type = wave;
        osc1.frequency.setValueAtTime(baseFreq, t);
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.25, t + 0.15);

        // Harmonics layer - slightly detuned for richness
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(baseFreq * 1.5, t);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, t + 0.12);

        // Gain envelope - punchy attack, quick decay
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

        // Subtle click/transient for punch
        const click = this.audioContext.createOscillator();
        click.type = 'square';
        click.frequency.setValueAtTime(1800 + Math.random() * 400, t);
        click.frequency.exponentialRampToValueAtTime(200, t + 0.03);
        const clickGain = this.audioContext.createGain();
        clickGain.gain.setValueAtTime(0.3, t);
        clickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioContext.destination);
        click.connect(clickGain);
        clickGain.connect(this.audioContext.destination);

        osc1.start(t);
        osc1.stop(t + 0.2);
        osc2.start(t);
        osc2.stop(t + 0.15);
        click.start(t);
        click.stop(t + 0.05);
    }

    playExplosion() {
        if (!this.audioContext) return;
        const t = this.audioContext.currentTime;

        // Randomize each explosion
        const pitch = 60 + Math.random() * 80; // 60-140 Hz base
        const filterFreq = 600 + Math.random() * 800; // 600-1400 Hz
        const duration = 0.4 + Math.random() * 0.3; // 0.4-0.7s

        // Tonal boom layer - deep sine thump
        const boom = this.audioContext.createOscillator();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(pitch, t);
        boom.frequency.exponentialRampToValueAtTime(20, t + duration);
        const boomGain = this.audioContext.createGain();
        boomGain.gain.setValueAtTime(0.9, t);
        boomGain.gain.exponentialRampToValueAtTime(0.01, t + duration);
        boom.connect(boomGain);
        boomGain.connect(this.audioContext.destination);
        boom.start(t);
        boom.stop(t + duration + 0.05);

        // Mid crunch layer - distorted square for impact
        const crunch = this.audioContext.createOscillator();
        crunch.type = 'sawtooth';
        const crunchFreq = pitch * (2 + Math.random() * 2);
        crunch.frequency.setValueAtTime(crunchFreq, t);
        crunch.frequency.exponentialRampToValueAtTime(30, t + duration * 0.6);
        const crunchGain = this.audioContext.createGain();
        crunchGain.gain.setValueAtTime(0.4, t);
        crunchGain.gain.exponentialRampToValueAtTime(0.01, t + duration * 0.5);
        const crunchFilter = this.audioContext.createBiquadFilter();
        crunchFilter.type = 'lowpass';
        crunchFilter.frequency.setValueAtTime(filterFreq, t);
        crunchFilter.frequency.exponentialRampToValueAtTime(100, t + duration * 0.5);
        crunch.connect(crunchFilter);
        crunchFilter.connect(crunchGain);
        crunchGain.connect(this.audioContext.destination);
        crunch.start(t);
        crunch.stop(t + duration * 0.6 + 0.05);

        // Noise burst layer - textured debris
        const bufferSize = Math.floor(this.audioContext.sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-4 * i / bufferSize);
        }
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.setValueAtTime(0.7, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + duration);
        const noiseFilter = this.audioContext.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(filterFreq * 1.5, t);
        noiseFilter.frequency.exponentialRampToValueAtTime(200, t + duration);
        noiseFilter.Q.value = 0.8;
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.audioContext.destination);
        noise.start(t);
    }

    playBackgroundMusic(musicAudio, startTime = 65) {
        if (!musicAudio) return;
        this.backgroundMusic = musicAudio;
        this.backgroundMusic.volume = 0;
        this.backgroundMusic.currentTime = startTime;
        
        // Called from user gesture handler, so play() is allowed by browser
        const playPromise = this.backgroundMusic.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.fadeInMusic(2.0); // 2 second fade in
            }).catch(() => {
                // Silently handle if playback still blocked
            });
        }
    }

    fadeInMusic(duration = 2.0) {
        if (!this.backgroundMusic) return;
        this.musicFading = true;
        const startVolume = 0;
        const endVolume = 0.5; // Max volume at 50%
        const startTime = Date.now();
        
        const fade = () => {
            if (!this.backgroundMusic || !this.musicFading) return;
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1.0);
            this.backgroundMusic.volume = startVolume + (endVolume - startVolume) * progress;
            
            if (progress < 1.0) {
                requestAnimationFrame(fade);
            } else {
                this.musicFading = false;
            }
        };
        fade();
    }

    fadeOutMusic(duration = 2.0) {
        if (!this.backgroundMusic) return;
        this.musicFading = true;
        const startVolume = this.backgroundMusic.volume;
        const endVolume = 0;
        const startTime = Date.now();
        
        const fade = () => {
            if (!this.backgroundMusic) return;
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1.0);
            this.backgroundMusic.volume = startVolume + (endVolume - startVolume) * progress;
            
            if (progress < 1.0) {
                requestAnimationFrame(fade);
            } else {
                this.musicFading = false;
                if (this.backgroundMusic) {
                    this.backgroundMusic.pause();
                }
            }
        };
        fade();
    }

    stopMusic() {
        if (this.backgroundMusic) {
            this.musicFading = false;
            this.backgroundMusic.pause();
            this.backgroundMusic.currentTime = 0;
        }
    }
}
