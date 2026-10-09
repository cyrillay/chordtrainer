#include "synth.h"
#include <cmath>

namespace {
constexpr float kTwoPi = 6.2831853f;

float midiHz(int m) { return 440.f * std::pow(2.f, (m - 69) / 12.f); }

float noise(uint32_t &s) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s & 0xffff) / 32768.f - 1.f;
}

float saw(float ph) { return 2.f * ph - 1.f; }
float tri(float ph) { return 4.f * std::fabs(ph - 0.5f) - 1.f; }
float sq(float ph, float width = 0.5f) { return ph < width ? 1.f : -1.f; }
float sine(float ph) { return std::sin(kTwoPi * ph); }

// Attack, decay to sustain, release, in seconds.
struct Env { float a, d, s, r; };

Env envelopeOf(int patch) {
    switch (patch) {
        case UPRIGHT: return {0.005f, 0.6f, 0.25f, 0.08f};
        case ROUND:   return {0.01f, 0.8f, 0.4f, 0.1f};
        case SUB:     return {0.01f, 1.2f, 0.6f, 0.12f};
        case SLAP:    return {0.002f, 0.25f, 0.2f, 0.05f};
        case EPIANO:  return {0.004f, 1.4f, 0.15f, 0.25f};
        case NYLON:   return {0.003f, 0.9f, 0.05f, 0.15f};
        case DUSTY:   return {0.01f, 1.8f, 0.3f, 0.4f};
        case PAD:     return {0.6f, 1.0f, 0.8f, 0.9f};
        case CLAV:    return {0.002f, 0.18f, 0.1f, 0.05f};
        case ORGAN:   return {0.01f, 0.1f, 0.9f, 0.05f};
        case SAX:     return {0.04f, 0.3f, 0.75f, 0.1f};
        case TRUMPET: return {0.03f, 0.3f, 0.7f, 0.1f};
        case VIBES:   return {0.002f, 1.6f, 0.0f, 0.5f};
        case STRINGS: return {0.5f, 1.0f, 0.85f, 0.8f};
        case HORNS:   return {0.01f, 0.2f, 0.6f, 0.08f};
        case MELODICA:return {0.02f, 0.2f, 0.8f, 0.08f};
        default:      return {0.001f, 0.2f, 0.f, 0.05f};
    }
}

// Low-pass cutoff in Hz, as a multiple of the note for pitched patches.
float cutoffOf(int patch, float freq) {
    switch (patch) {
        case UPRIGHT: case ROUND: return 700.f;
        case SUB: return 300.f;
        case SLAP: return 2200.f;
        case DUSTY: return 1400.f;
        case PAD: return 1600.f;
        case STRINGS: return 2600.f;
        case SAX: return 2600.f;
        case TRUMPET: return 3400.f;
        case HORNS: return 3000.f;
        case MELODICA: return 2400.f;
        case CLAV: return 3500.f;
        default: return freq * 8.f;
    }
}
}  // namespace

void Synth::noteOn(int patch, int midi, float vel, int64_t durSamples, int64_t delay) {
    Voice *slot = nullptr;
    for (auto &v : voices_) if (!v.active) { slot = &v; break; }
    if (!slot) {  // steal the oldest
        slot = &voices_[0];
        for (auto &v : voices_) if (v.age > slot->age) slot = &v;
    }
    Voice &v = *slot;
    v = Voice{};
    v.active = true;
    v.patch = patch;
    v.delay = delay > 0 ? delay : 0;
    v.holdFor = durSamples;
    v.vel = vel;
    v.freq = midi > 0 ? midiHz(midi) : 0.f;
    v.seed = 1234567u + static_cast<uint32_t>(midi * 7919 + patch * 104729);
}

void Synth::allOff() {
    for (auto &v : voices_) v.active = false;
}

float Synth::sample(Voice &v) {
    const float t = v.age / sampleRate_;
    const float dt = 1.f / sampleRate_;
    float s = 0.f;

    // ---- Drums: fixed one-shots ----
    switch (v.patch) {
        case KICK: {
            float f = 48.f + 110.f * std::exp(-t * 28.f);
            v.phase += f * dt; v.phase -= std::floor(v.phase);
            return sine(v.phase) * std::exp(-t * 7.f) * v.vel * 0.9f;
        }
        case SNARE: {
            v.phase += 185.f * dt; v.phase -= std::floor(v.phase);
            float n = noise(v.seed);
            v.hp = n - v.lp; v.lp += 0.35f * (n - v.lp);
            return (sine(v.phase) * std::exp(-t * 30.f) * 0.4f + v.hp * std::exp(-t * 18.f) * 0.5f) * v.vel;
        }
        case HAT: {
            float n = noise(v.seed);
            float h = n - v.lp; v.lp += 0.6f * (n - v.lp);
            return h * std::exp(-t * 60.f) * v.vel * 0.22f;
        }
        case RIDE: {
            float n = noise(v.seed);
            float h = n - v.lp; v.lp += 0.5f * (n - v.lp);
            v.phase += 3150.f * dt; v.phase -= std::floor(v.phase);
            return (h * 0.6f + sq(v.phase) * 0.15f) * std::exp(-t * 9.f) * v.vel * 0.13f;
        }
        case RIM: case STICKS: {
            float f = v.patch == RIM ? 1700.f : 2500.f;
            v.phase += f * dt; v.phase -= std::floor(v.phase);
            return sine(v.phase) * std::exp(-t * 90.f) * v.vel * 0.45f;
        }
        case CRASH: {
            float n = noise(v.seed);
            float h = n - v.lp; v.lp += 0.45f * (n - v.lp);
            v.phase += 4170.f * dt; v.phase -= std::floor(v.phase);
            v.phase2 += 5830.f * dt; v.phase2 -= std::floor(v.phase2);
            return (h * 0.7f + (sq(v.phase) + sq(v.phase2)) * 0.08f) * std::exp(-t * 2.6f) * v.vel * 0.22f;
        }
        case THUNDER: {
            float n = noise(v.seed);
            v.lp += 0.015f * (n - v.lp);
            v.hp += 0.004f * (v.lp - v.hp);
            float env = std::fmin(1.f, t * 12.f) * std::exp(-t * 1.1f) * (0.7f + 0.3f * std::sin(t * 9.f));
            return (v.lp * 5.f + v.hp * 6.f) * env * v.vel;
        }
        case STATIC: {
            float n = noise(v.seed);
            float h = n - v.lp; v.lp += 0.3f * (n - v.lp);
            float gate = (noise(v.seed) > 0.6f) ? 1.f : 0.35f;
            return h * gate * std::exp(-t * 4.f) * v.vel * 0.3f;
        }
        case DING: case CHIME: {
            float f = v.freq > 0 ? v.freq : 1318.5f;
            v.phase += f * dt; v.phase -= std::floor(v.phase);
            v.phase2 += f * 2.76f * dt; v.phase2 -= std::floor(v.phase2);
            float decay = v.patch == DING ? 1.8f : 3.f;
            return (sine(v.phase) + 0.25f * sine(v.phase2) * std::exp(-t * 8.f)) * std::exp(-t * decay) * v.vel * 0.35f;
        }
        case RATTLE: {
            float n = noise(v.seed);
            float gate = std::sin(kTwoPi * 28.f * t) > 0.3f ? 1.f : 0.f;
            v.phase += 220.f * dt; v.phase -= std::floor(v.phase);
            return (n * 0.5f + sq(v.phase) * 0.2f) * gate * std::exp(-t * 5.f) * v.vel * 0.35f;
        }
        case SQUEAK: {
            float f = 2600.f + 1800.f * std::sin(kTwoPi * 9.f * t);
            v.phase += f * dt; v.phase -= std::floor(v.phase);
            return sine(v.phase) * (t < 0.18f ? 1.f : std::exp(-(t - 0.18f) * 40.f)) * v.vel * 0.18f;
        }
        case POP: {
            float n = noise(v.seed);
            return n * std::exp(-t * 120.f) * v.vel * 0.6f;
        }
        case COIN: {
            float f = t < 0.07f ? 987.8f : 1318.5f;
            v.phase += f * dt; v.phase -= std::floor(v.phase);
            return sq(v.phase) * std::exp(-t * 6.f) * v.vel * 0.16f;
        }
        case WHOOSH: {
            float n = noise(v.seed);
            float cut = 0.02f + 0.25f * std::sin(std::fmin(1.f, t * 2.f) * 3.14159f);
            v.lp += cut * (n - v.lp);
            return v.lp * std::sin(std::fmin(1.f, t * 2.f) * 3.14159f) * v.vel * 0.6f;
        }
        case STAMP: {
            float f = 40.f + 90.f * std::exp(-t * 30.f);
            v.phase += f * dt; v.phase -= std::floor(v.phase);
            float n = noise(v.seed); v.lp += 0.2f * (n - v.lp);
            return (sine(v.phase) * 0.9f + v.lp * std::exp(-t * 25.f)) * std::exp(-t * 9.f) * v.vel;
        }
        case TICK: {
            v.phase += 3200.f * dt; v.phase -= std::floor(v.phase);
            return sq(v.phase) * std::exp(-t * 300.f) * v.vel * 0.3f;
        }
        case SNORE: {
            float n = noise(v.seed); v.lp += 0.03f * (n - v.lp);
            v.phase += 70.f * dt; v.phase -= std::floor(v.phase);
            float env = std::sin(std::fmin(1.f, t / 1.4f) * 3.14159f);
            return (v.lp * 3.f + saw(v.phase) * 0.15f) * env * v.vel * 0.6f;
        }
        case BRUSH: {
            float n = noise(v.seed);
            v.lp += 0.2f * (n - v.lp);
            return v.lp * std::exp(-t * 14.f) * v.vel * 0.35f;
        }
        default: break;
    }

    // ---- Pitched: envelope, oscillators, filter ----
    if (!v.released && v.age >= v.holdFor) v.released = true;
    const Env e = envelopeOf(v.patch);
    if (!v.released) {
        if (t < e.a) v.env = t / e.a;
        else v.env = e.s + (1.f - e.s) * std::exp(-(t - e.a) / (e.d * 0.35f));
    } else {
        v.env *= std::exp(-dt / (e.r * 0.3f));
        if (v.env < 0.0005f) { v.active = false; return 0.f; }
    }

    float f = v.freq;
    switch (v.patch) {
        case SAX: case TRUMPET: case MELODICA: case STRINGS:
            f *= 1.f + 0.004f * std::sin(kTwoPi * 5.f * t) * std::fmin(1.f, t * 2.f);  // vibrato
            break;
        default: break;
    }
    v.phase += f * dt; v.phase -= std::floor(v.phase);
    v.phase2 += f * 1.003f * dt; v.phase2 -= std::floor(v.phase2);

    switch (v.patch) {
        case UPRIGHT: s = tri(v.phase) * 0.7f + sine(v.phase) * 0.5f; break;
        case ROUND: case SUB: s = sine(v.phase) + 0.2f * tri(v.phase); break;
        case SLAP: s = saw(v.phase) * 0.6f + sine(v.phase) * 0.6f; break;
        case EPIANO: s = sine(v.phase + 0.18f * sine(v.phase * 2.f) * std::exp(-t * 4.f)) * 0.6f; break;
        case NYLON: s = tri(v.phase) * 0.5f + saw(v.phase) * 0.12f; break;
        case DUSTY: s = sine(v.phase) * 0.45f + tri(v.phase2) * 0.2f; break;
        case PAD: s = (saw(v.phase) + saw(v.phase2)) * 0.18f; break;
        case CLAV: s = sq(v.phase, 0.25f) * 0.3f; break;
        case ORGAN: s = (sine(v.phase) + 0.5f * sine(2.f * v.phase) + 0.3f * sine(3.f * v.phase)) * 0.25f; break;
        case SAX: s = saw(v.phase) * 0.35f + sq(v.phase) * 0.1f + noise(v.seed) * 0.02f; break;
        case TRUMPET: s = saw(v.phase) * 0.35f; break;
        case VIBES: s = sine(v.phase) * 0.45f * (1.f + 0.25f * std::sin(kTwoPi * 5.5f * t)); break;
        case STRINGS: s = (saw(v.phase) + saw(v.phase2)) * 0.13f; break;
        case HORNS: s = (saw(v.phase) + saw(v.phase2)) * 0.18f; break;
        case MELODICA: s = sq(v.phase) * 0.2f; break;
        default: s = sine(v.phase) * 0.3f;
    }
    // One-pole low-pass.
    float cut = cutoffOf(v.patch, v.freq);
    float a = 1.f - std::exp(-kTwoPi * cut * dt);
    v.lp += a * (s - v.lp);
    return v.lp * v.env * v.vel;
}

void Synth::render(float *out, int frames) {
    for (auto &v : voices_) {
        if (!v.active) continue;
        for (int i = 0; i < frames && v.active; i++) {
            if (v.delay > 0) { v.delay--; continue; }
            out[i] += sample(v);
            v.age++;
            if (isOneShot(v.patch) && v.age > static_cast<int64_t>(sampleRate_ * (v.patch == THUNDER ? 4.f : 2.f))) v.active = false;
        }
    }
}
