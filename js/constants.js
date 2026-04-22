// Shared constants. Grouped so tuning the app happens here, not in scattered magic numbers.

// ---- Audio / pitch detection ----
export const SAMPLE_RATE = 44100;
// 8192 gives ~5.4 Hz resolution — enough for chord-level polyphony and ~2× cheaper
// on the main thread than the previous 16384, which mattered on mobile.
export const FFT_SIZE = 8192;
export const FFT_SMOOTHING = 0.7;
// Skip every other animation frame (~30 Hz analysis). Chord detection stabilises
// over several frames anyway, and halving the FFT cost frees the main thread.
export const ANALYSIS_FRAME_STRIDE = 2;
export const PIANO_LOW_HZ = 55;   // ~A1
export const PIANO_HIGH_HZ = 4200; // ~C8
export const PITCH_IGNORE_LOW_HZ = 50;
export const PITCH_IGNORE_HIGH_HZ = 4500;
export const PEAK_TOP_N = 20;
export const HARMONIC_MAX = 8;

// ---- Display / queue ----
export const QUEUE_SIZE = 3;
export const PIANO_OCTAVES = 3;
export const PIANO_START_OCTAVE = 3;

// ---- Guitar fretboard ----
export const TUNING = [40, 45, 50, 55, 59, 64]; // low E to high e (MIDI)
export const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
export const NUM_FRETS_VISIBLE = 5;
export const MAX_FRET = 14;
export const HAND_SPAN_BACK = 2;
export const HAND_SPAN_FWD = 4;

// ---- Metronome / dynamic mode ----
export const BAR_BEATS = 4;

// ---- Timing ----
export const MIC_SUCCESS_DELAY_MS = 700;
export const MIDI_SUCCESS_DELAY_MS = 200;
export const STREAK_RESET_MS = 10000;
export const SUCCESS_DEDUP_MS = 1500;
export const REGENERATE_DEBOUNCE_MS = 80;

// ---- LocalStorage keys ----
export const LS = {
  SENSITIVITY: 'chordTrainer.sensitivity',
  INSTRUMENT: 'chordTrainer.instrument',
  REWARDS: 'chordTrainer.rewards',
  REWARDS_ENABLED: 'chordTrainer.rewardsEnabled',
  DISABLED_PROGS: 'chordTrainer.disabledProgressions',
  CUSTOM_PROGS: 'chordTrainer.customProgressions',
};
