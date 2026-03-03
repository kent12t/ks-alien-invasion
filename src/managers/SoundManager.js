import { CONFIG } from '../config.js';

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

        // --- Volume Mixing Configuration ---
        this.volumes = {
            master: 1.0,
            music: CONFIG.AUDIO.BGM_VOLUME || 0.2,
            sfx: 0.8
        };

        this.masterGain = null;
        this.sfxGain = null;
        this.footstepGain = null; // Dedicated bus for footsteps
        // We'll also keep a reference to the footstep source for possible stop
        this.footstepSource = null;
        // Flag to mute all alien related sounds (death, grunts, footsteps)
        this.alienMuted = false;
        this.explosionNoiseBuffer = null;
        this.audioBuffers = {}; // Map of preloaded audio buffers
        this.timelineEvents = new Set(); // Track played scheduled events

        if (this.audioContext) {
            // Setup master and sfx busses
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.volumes.master;
            this.masterGain.connect(this.audioContext.destination);

            this.sfxGain = this.audioContext.createGain();
            this.sfxGain.gain.value = this.volumes.sfx;
            this.sfxGain.connect(this.masterGain);

            this.footstepGain = this.audioContext.createGain();
            this.footstepGain.gain.value = 0; // Starts silent
            this.footstepGain.connect(this.sfxGain);

            // Pre-generate noise buffer for explosions to save CPU
            this.explosionNoiseBuffer = this.createNoiseBuffer(0.7); // max duration

            // Background loops
            this.footstepSource = null;
        }
    }

    // Generate noise buffer once
    createNoiseBuffer(duration) {
        if (!this.audioContext) return null;
        const bufferSize = Math.floor(this.audioContext.sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-4 * i / bufferSize);
        }
        return buffer;
    }

    // --- Media Asset Preloading ---
    async preloadAudio(fileUrls) {
        if (!this.audioContext) return;
        const promises = fileUrls.map(async (url) => {
            try {
                const res = await fetch(url);
                const arrayBuffer = await res.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                // Extract filename without extension (e.g., 'alien_death.aac' -> 'alien_death')
                const name = url.split('/').pop().split('.')[0];
                this.audioBuffers[name] = audioBuffer;
            } catch (err) {
                console.warn(`Failed to preload audio: ${url}`, err);
            }
        });
        await Promise.all(promises);
    }

    // Play a preloaded sound asset
    playAsset(name, options = {}) {
        if (!this.audioContext || !this.audioBuffers[name]) return;
        const source = this.audioContext.createBufferSource();
        source.buffer = this.audioBuffers[name];

        let lastNode = source;

        // Apply Panning if requested
        if (options.pan !== undefined && this.audioContext.createStereoPanner) {
            const panner = this.audioContext.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, options.pan)); // clamp -1 to 1
            lastNode.connect(panner);
            lastNode = panner;
        }

        // Apply specific gain if requested
        if (options.volume !== undefined) {
            const gain = this.audioContext.createGain();
            gain.gain.value = options.volume;
            lastNode.connect(gain);
            lastNode = gain;
        }

        lastNode.connect(this.sfxGain);
        source.start(0);
        return source;
    }

    // --- Alien Specific Audio Logic ---
    playAlienDeath(panX = 0) {
        // Skip if alien sounds are muted
        if (this.alienMuted) return;
        this.playAsset('alien_death', { pan: panX, volume: 0.8 });
    }

    playAlienGrunt(panX = 0) {
        // Skip if alien sounds are muted
        if (this.alienMuted) return;
        const grunts = ['RAAAW', 'VRAAAGH', 'YA-AA', 'ckckck', 'long_gurgles'];
        const randomGrunt = grunts[Math.floor(Math.random() * grunts.length)];
        this.playAsset(randomGrunt, { pan: panX, volume: 0.6 });
    }

    // Footstep Loop Management
    startFootsteps() {
        if (!this.audioContext || !this.audioBuffers['steps_v1']) return;
        if (this.footstepSource) return; // Already going

        this.footstepSource = this.audioContext.createBufferSource();
        this.footstepSource.buffer = this.audioBuffers['steps_v1'];
        this.footstepSource.loop = true;
        this.footstepSource.connect(this.footstepGain);
        this.footstepSource.start(0);
    }

    updateFootstepVolume(alienCount, maxAliens = 50, maxVolume = 4) {
        if (!this.footstepGain || !this.audioContext) return;

        let targetVolume = 0;
        if (alienCount > 0) {
            // Give footsteps a much louder baseline so even 1 alien is clearly audible
            const baseVolumeRatio = 0.25; // Minimum 25% of maxVolume if >= 1 alien

            // Calculate a curve for the remaining volume scaling
            const scaleRatio = Math.min(1, alienCount / maxAliens);
            const curvedRatio = Math.pow(scaleRatio, 1.1);

            const volumeRatio = baseVolumeRatio + (1 - baseVolumeRatio) * curvedRatio;
            targetVolume = volumeRatio * maxVolume;
        }

        // Smooth transition
        this.footstepGain.gain.setTargetAtTime(targetVolume, this.audioContext.currentTime, 0.5);
    }

    /**
     * Updates the audio timeline. Checks if any scheduled sounds should be triggered.
     * @param {number} gameTime - Current elapsed game time in seconds.
     * @param {Object} scheduledSounds - Key-value pairs of time: 'assetName'.
     * @param {number} volume - Optional volume to play the asset at.
     */
    updateTimeline(gameTime, scheduledSounds = {}, volume = 1.0) {
        if (!this.audioContext) return;

        for (const [timeStr, assetName] of Object.entries(scheduledSounds)) {
            const triggerTime = parseFloat(timeStr);
            if (gameTime >= triggerTime && !this.timelineEvents.has(timeStr)) {
                this.timelineEvents.add(timeStr);
                this.playAsset(assetName, { volume });
            }
        }
    }

    resetTimeline() {
        this.timelineEvents.clear();
        this.alienMuted = false;
    }

    // Update mixing volume dynamically
    setVolume(type, value) {
        if (this.volumes[type] !== undefined) {
            this.volumes[type] = Math.max(0, Math.min(1, value)); // clamp 0-1
            const t = this.audioContext ? this.audioContext.currentTime : 0;

            if (type === 'master' && this.masterGain) {
                this.masterGain.gain.setValueAtTime(this.volumes.master, t);
                if (this.backgroundMusic && !this.musicFading) {
                    this.backgroundMusic.volume = this.volumes.music * this.volumes.master;
                }
            } else if (type === 'sfx' && this.sfxGain) {
                this.sfxGain.gain.setValueAtTime(this.volumes.sfx, t);
            } else if (type === 'music' && this.backgroundMusic && !this.musicFading) {
                this.backgroundMusic.volume = this.volumes.music * this.volumes.master;
            }
        }
    }

    resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    playShot() {
        if (!this.audioContext) return;
        const now = performance.now();
        if (now - (this._lastShotTime || 0) < 80) return; // max ~12 laser sounds/sec
        this._lastShotTime = now;
        this.playAsset('laser', { volume: 0.7 });
    }

    playSpaceship() {
        if (!this.audioContext) return;
        this.playAsset('spaceship', { volume: 1.0 });
    }

    playSpaceshipLeaving() {
        if (!this.audioContext || !this.audioBuffers['spaceship']) return;
        const source = this.audioContext.createBufferSource();
        source.buffer = this.audioBuffers['spaceship'];

        const gainNode = this.audioContext.createGain();
        const t = this.audioContext.currentTime;

        // Start full volume
        gainNode.gain.setValueAtTime(1.0, t);

        // Fade out during the last 1 second of the 3 second window
        gainNode.gain.setValueAtTime(1.0, t + 2.5);
        gainNode.gain.linearRampToValueAtTime(0.01, t + 3.0);

        source.connect(gainNode);
        gainNode.connect(this.sfxGain);

        // Start now, play for 3 seconds total
        source.start(t);
        source.stop(t + 3.0);
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
        boomGain.connect(this.sfxGain);
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
        crunchGain.connect(this.sfxGain);
        crunch.start(t);
        crunch.stop(t + duration * 0.6 + 0.05);

        // Noise burst layer - textured debris (reuse pre-generated buffer)
        if (this.explosionNoiseBuffer) {
            const noise = this.audioContext.createBufferSource();
            noise.buffer = this.explosionNoiseBuffer;
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
            noiseGain.connect(this.sfxGain);
            noise.start(t);
        }
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
        // Adjust start according to global music/master volume
        const startVolume = 0;
        const endVolume = this.volumes.music * this.volumes.master;
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
        if (this.footstepSource) {
            this.footstepSource.stop();
            this.footstepSource = null;
        }
    }

    // ----- Alien Audio Control -----
    muteAlienSounds() {
        if (!this.audioContext) return;
        // Set mute flag
        this.alienMuted = true;
        // Mute footstep gain immediately
        if (this.footstepGain) {
            this.footstepGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        }
        // Stop footstep source if running
        if (this.footstepSource) {
            try { this.footstepSource.stop(); } catch (e) { /* ignore */ }
            this.footstepSource = null;
        }
    }
}
