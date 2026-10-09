// The ghost band's instruments, synthesized on the fly like the web version
// (no samples). Every patch is one voice recipe: an oscillator mix, an
// envelope, a low-pass filter, and for drums a pitch sweep or noise.
// Patch ids match the Patch enum in the core module, in the same order.

#pragma once
#include <cstdint>

enum Patch : int {
    STICKS, KICK, SNARE, HAT, RIDE, RIM, BRUSH, CRASH,
    UPRIGHT, ROUND, SUB, SLAP,
    EPIANO, NYLON, DUSTY, PAD, CLAV, ORGAN,
    SAX, TRUMPET, VIBES, STRINGS, HORNS, MELODICA,
    // Sound effects for the rooms: one-shots like the drums.
    THUNDER, STATIC, DING, RATTLE, SQUEAK, CHIME, POP, COIN, WHOOSH, STAMP, TICK, SNORE,
    PATCH_COUNT
};

struct Voice {
    bool active = false;
    int patch = 0;
    int64_t delay = 0;        // samples before it starts
    int64_t age = 0;          // samples since it started
    int64_t holdFor = 0;      // samples until release
    float freq = 0, vel = 0;
    float phase = 0, phase2 = 0;
    float env = 0;
    bool released = false;
    float lp = 0, hp = 0;     // filter state
    uint32_t seed = 22222;
};

inline bool isOneShot(int p) { return p <= CRASH || p >= THUNDER; }

class Synth {
public:
    void setSampleRate(float sr) { sampleRate_ = sr; }
    // Start a note `delay` samples into the next block.
    void noteOn(int patch, int midi, float vel, int64_t durSamples, int64_t delay);
    void allOff();
    // Adds the band into a mono buffer.
    void render(float *out, int frames);

private:
    static constexpr int kVoices = 64;
    Voice voices_[kVoices];
    float sampleRate_ = 48000.f;
    float sample(Voice &v);
};
