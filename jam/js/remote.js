// Ghost Jam: the piano as a remote control for the menus. One key, pressed
// and released on its own, is a command; a chord (or a key pressed while
// another is held) is just playing and does nothing. Commands go by pitch
// class, so any octave works. Never used while a set is playing: there the
// notes belong to the judge.

// Setup screen, one octave from C.
export const SETUP_KEYS = {
  0: { id: 'play', label: 'Play' },
  1: { id: 'shuffle', label: 'Shuffle' },
  2: { id: 'groovePrev', label: 'Groove ‹' },
  3: { id: 'favourite', label: '★' },
  4: { id: 'grooveNext', label: 'Groove ›' },
  5: { id: 'tunePrev', label: 'Tune ‹' },
  6: { id: 'tempoDown', label: 'Tempo −' },
  7: { id: 'tuneNext', label: 'Tune ›' },
  8: { id: 'tempoUp', label: 'Tempo +' },
  9: { id: 'keyPrev', label: 'Key ‹' },
  10: { id: 'nextFavourite', label: 'Fav ›' },
  11: { id: 'keyNext', label: 'Key ›' },
};

// Results screen.
export const RESULT_KEYS = {
  0: { id: 'again', label: 'Play again' },
  2: { id: 'back', label: 'Change tune' },
};

export class PianoRemote {
  constructor() {
    this.held = new Set();
    this.armed = null;   // the key that opened the gesture, if it can be a command
    this.spoiled = false; // another key joined in: it was a chord
  }

  // enabled: whether a command may start now (a menu is on screen).
  noteOn(midi, enabled) {
    if (this.held.size === 0) {
      this.armed = enabled ? midi : null;
      this.spoiled = false;
    } else {
      this.spoiled = true;
    }
    this.held.add(midi);
  }

  // Returns the pitch class of the command once every key is up, or null.
  noteOff(midi) {
    this.held.delete(midi);
    if (this.held.size) return null;
    const m = this.armed;
    this.armed = null;
    return m === null || this.spoiled ? null : m % 12;
  }
}

// Step through a list with wrap-around.
export const step = (list, current, dir) => {
  const i = list.indexOf(current);
  return list[((i < 0 ? 0 : i + dir) % list.length + list.length) % list.length];
};
