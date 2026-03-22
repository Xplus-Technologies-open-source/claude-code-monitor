/**
 * soundEngine.js — Procedural ambient sounds using Web Audio API.
 * Generates sounds for file create, modify, and delete events.
 * No external audio files — all synthesized.
 */

// @ts-check

(function () {
  let audioCtx = null;
  let enabled = false;
  let volume = 0.3;
  let initialized = false;

  registerModule('soundEngine', {
    init() {
      // AudioContext requires user gesture to initialize
      document.addEventListener('click', initAudioOnce, { once: true });
      document.addEventListener('keydown', initAudioOnce, { once: true });
    },

    handleMessage(msg) {
      if (msg.type === 'settings-update') {
        enabled = msg.payload.soundEnabled || false;
        volume = (msg.payload.soundVolume || 30) / 100;
      }

      if (msg.type === 'file-event' && enabled && audioCtx) {
        switch (msg.payload.type) {
          case 'created':
            playCreateSound();
            break;
          case 'modified':
            playModifySound();
            break;
          case 'deleted':
            playDeleteSound();
            break;
        }
      }
    },
  });

  function initAudioOnce() {
    if (initialized) return;
    try {
      audioCtx = new AudioContext();
      initialized = true;
    } catch (e) {
      // Web Audio not available
    }
  }

  /**
   * File created: Rising sine tone (pleasant chime).
   * 440Hz → 880Hz over 120ms with exponential decay.
   */
  function playCreateSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    gain.gain.setValueAtTime(volume * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * File modified: Short subtle click (white noise burst).
   * 30ms burst of filtered noise.
   */
  function playModifySound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    // Create noise buffer
    const bufferSize = audioCtx.sampleRate * 0.03; // 30ms
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 4000;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    source.start(now);
  }

  /**
   * File deleted: Falling tone (descending pitch).
   * 440Hz → 220Hz over 150ms.
   */
  function playDeleteSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);

    gain.gain.setValueAtTime(volume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }
})();
