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
        this.musicSource = null; // Track Web Audio music source
        this.musicGain = null;   // Dedicated gain for BGM
        // Flag to mute all alien related sounds (death, grunts, footsteps)
        this.alienMuted = false;
        this.explosionNoiseBuffer = null;
        this.activeSources = new Set(); // Track playing sources for emergency stop
        this.audioBuffers = {}; // Map of preloaded audio buffers
        this.timelineEvents = new Set(); // Track played scheduled events
        this.manualPause = false; // Flag to prevent context resume during game pause

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

            this.alienGain = this.audioContext.createGain();
            this.alienGain.connect(this.sfxGain);

            this.musicGain = this.audioContext.createGain();
            this.musicGain.gain.value = this.volumes.music;
            this.musicGain.connect(this.masterGain);

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

        // Track source so we can force-stop it on game end
        this.activeSources.add(source);
        source.onended = () => this.activeSources.delete(source);

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

    /**
     * Marks all scheduled events before the given time as "played" so they don't
     * all trigger at once when the game clock jumps forward (scrubbing/ending).
     */
    skipTimelineTo(gameTime, scheduledSounds = {}) {
        if (!this.audioContext) return;
        for (const timeStr of Object.keys(scheduledSounds)) {
            const triggerTime = parseFloat(timeStr);
            if (gameTime >= triggerTime) {
                this.timelineEvents.add(timeStr);
            }
        }
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
            } else if (type === 'music' && this.musicGain) {
                this.musicGain.gain.setValueAtTime(this.volumes.music, t);
            }
        }
    }

    resumeAudioContext() {
        if (this.manualPause) return;
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

    playBackgroundMusic(assetName, startTime = 0) {
        if (!this.audioContext || !this.audioBuffers[assetName]) return;

        // Stop existing if any
        if (this.musicSource) {
            try { this.musicSource.stop(); } catch (e) {}
        }

        this.musicSource = this.audioContext.createBufferSource();
        this.musicSource.buffer = this.audioBuffers[assetName];
        this.musicSource.loop = false;
        this.musicSource.connect(this.musicGain);

        // Calculate offset if we ever need it (e.g. scrubbing), though usually 0
        this.musicSource.start(0, startTime);

        this.fadeInMusic(2.0);
    }

    fadeInMusic(duration = 2.0) {
        if (!this.musicGain || !this.audioContext) return;
        this.musicFading = true;
        const now = this.audioContext.currentTime;
        const targetVol = this.volumes.music;

        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(0, now);
        this.musicGain.gain.linearRampToValueAtTime(targetVol, now + duration);

        setTimeout(() => { this.musicFading = false; }, duration * 1000);
    }

    fadeOutMusic(duration = 2.0) {
        if (!this.musicGain || !this.audioContext) return;
        this.musicFading = true;
        const now = this.audioContext.currentTime;

        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.linearRampToValueAtTime(0.01, now + duration);

        setTimeout(() => {
            this.musicFading = false;
            if (this.musicSource) {
                try { this.musicSource.stop(); } catch (e) {}
                this.musicSource = null;
            }
        }, duration * 1000);
    }

    stopMusic() {
        this.manualPause = false;
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Force stop all one-shot SFX immediately
        for (const source of this.activeSources) {
            try { source.stop(); } catch (e) {}
        }
        this.activeSources.clear();

        if (this.musicSource) {
            try { this.musicSource.stop(); } catch (e) {}
            this.musicSource = null;
        }

        if (this.footstepSource) {
            try { this.footstepSource.stop(); } catch (e) { /* ignore */ }
            this.footstepSource = null;
        }
    }

    /** Freeze the music exactly where it is (for pause). */
    pauseMusic() {
        this.musicFading = false;
        // BGM is now part of AudioContext, so audioContext.suspend() handles it.

        if (this.audioContext) {
            this.manualPause = true;
            this.audioContext.suspend();
        }

        if (this.footstepSource) {
            // Silence footsteps
            this.footstepGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.05);
        }
    }

    /** Resume from where pauseMusic() left off. */
    resumeMusic() {
        if (this.audioContext) {
            this.manualPause = false;
            this.audioContext.resume();
        }

        // Restore footstep gain — the normal updateFootstepVolume will take over next frame
        if (this.footstepGain && this.audioContext) {
            this.footstepGain.gain.setTargetAtTime(
                this.volumes.sfx,
                this.audioContext.currentTime,
                0.2
            );
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
        // Mute alien grunt/death bus immediately
        if (this.alienGain) {
            this.alienGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        }
        // Stop footstep source if running
        if (this.footstepSource) {
            try { this.footstepSource.stop(); } catch (e) { /* ignore */ }
            this.footstepSource = null;
        }
    }
}
