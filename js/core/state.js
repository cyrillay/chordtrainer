// Shared mutable state for the app.
export const state = {
  currentChord: null,
  chordQueue: [],
  audioContext: null,
  analyser: null,
  micStream: null,
  isListening: false,        // mic active
  heardPitchClasses: new Set(),
  heardHistory: [],
  lastSuccessTime: 0,
  animationFrame: null,
  debugEnabled: false,

  // MIDI input
  midiAccess: null,
  midiEnabled: false,
  midiHeldNotes: new Set(),  // raw MIDI note numbers currently held

  // Dynamic mode (metronome-driven progression)
  dynamic: {
    enabled: false,
    bpm: 80,
    running: false,
    beatIndex: 0,             // 0..barBeats-1 within the current bar
    intervalId: null,
    correctThisBar: false,
    muted: false,
    barBeats: 4,              // beats per bar — also chord-change interval
    accent: true,             // whether to play an accent on beat 0
    barStarted: false         // skips the first downbeat so the chord doesn't change instantly on start
  },

  sensitivity: {
    silenceGate: -55,
    peakThreshold: 30,
    harmonicTolerance: 40,
    stabilityPct: 40,
    maxFundamentals: 6,
    fundamentalCutoff: 24,
    historyLength: 8
  }
};

export const DEFAULT_SENSITIVITY = { ...state.sensitivity };
