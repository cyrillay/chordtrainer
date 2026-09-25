"""Soundtrack synth: piano-ish chords, guitar plucks, success chimes, metronome ticks."""
import json, wave
import numpy as np

SR = 44100
DUR = 20.0
APP_START = 3.0
out = np.zeros((int(SR * DUR) + SR, 2))
rng = np.random.default_rng(3)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    n = min(len(sig), len(out) - i)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    out[i:i + n, 0] += sig[:n] * gain * l
    out[i:i + n, 1] += sig[:n] * gain * r


def piano(m, hold=0.7, vel=1.0, tail=1.6):
    f = mtof(m)
    n = int((hold + tail) * SR)
    t = np.arange(n) / SR
    # slightly inharmonic partials with faster decay for upper ones
    sig = np.zeros(n)
    for k, a in enumerate([1, .55, .32, .18, .1, .06, .035], start=1):
        fk = f * k * np.sqrt(1 + 0.0004 * k * k)
        if fk > 16000:
            break
        sig += a * np.sin(2 * np.pi * fk * t + rng.random() * 6) * np.exp(-t * (0.9 + 0.9 * k) * (f / 400) ** 0.4)
    env = np.minimum(1, t / 0.004)
    rel = np.where(t > hold, np.exp(-(t - hold) * 5.5), 1.0)
    ham = np.exp(-t * 60) * rng.standard_normal(n) * 0.04  # hammer
    return (sig * env * rel + ham) * vel * (0.9 if m < 60 else 0.75)


def pluck(m, dur=2.2, vel=1.0):
    """Karplus-Strong string."""
    f = mtof(m)
    N = int(SR / f)
    buf = rng.uniform(-1, 1, N)
    n = int(dur * SR)
    y = np.zeros(n)
    for i in range(n):
        y[i] = buf[i % N]
        buf[i % N] = 0.996 * 0.5 * (buf[i % N] + buf[(i + 1) % N])
    y *= np.exp(-np.arange(n) / SR * 1.2)
    return y * vel * 0.55


def chime(t0, freqs=(659.25, 830.61, 987.77), gain=0.22):
    for i, f in enumerate(freqs):
        n = int(0.9 * SR)
        t = np.arange(n) / SR
        s = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 12)) \
            * np.minimum(1, t / 0.01) * np.exp(-t * 5.5)
        add(s, t0 + i * 0.05, pan=(i - 1) * 0.3, gain=gain)


def tick(t0, accent=False):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    f = 1760 if accent else 1320
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 70) + rng.standard_normal(n) * np.exp(-t * 300) * 0.3
    add(s, t0, gain=0.22 if accent else 0.15)


def chord(notes, t0, hold=0.65, stagger=0.03, vel=0.8, bass=True, pan_spread=0.5):
    for i, m in enumerate(notes):
        add(piano(m, hold - i * stagger, vel), t0 + i * stagger, pan=(i / max(1, len(notes) - 1) - .5) * pan_spread)
    if bass:
        add(piano(notes[0] - 12, hold, vel * 0.8), t0, gain=0.9)


# --- Hook: Cmaj7, F#m7, Bbsus4 stabs
chord([60, 64, 67, 71], 0.5, hold=0.45, stagger=0.0, vel=0.9)
chord([54, 57, 61, 64], 1.0, hold=0.45, stagger=0.0, vel=0.9)
chord([58, 63, 65, 70], 1.5, hold=0.9, stagger=0.0, vel=0.95)

# --- App demo: chords actually played in the captured session
played = json.load(open('chords.json'))
for i, c in enumerate(played):
    t0 = APP_START + c['t']
    if t0 < APP_START + 8.0:
        chord(c['v'], t0)
    else:  # guitar scene: strum
        notes = [c['v'][0] - 12] + c['v']
        for j, m in enumerate(notes):
            add(pluck(m), t0 + j * 0.028, pan=(j / len(notes) - .5) * .6, gain=0.9)
    chime(t0 + 0.03 * (len(c['v']) - 1) + 0.2)

# --- Features: metronome ticks under "Metronome mode"
for k in range(4):
    tick(15.75 + k * 0.33, accent=(k == 0))

# --- CTA: lush final chord + chime
chord([48, 55, 62, 64, 67, 71], 17.45, hold=2.0, stagger=0.045, vel=0.85, bass=True, pan_spread=0.8)
chime(18.6, freqs=(783.99, 987.77, 1174.66, 1567.98), gain=0.15)

# --- simple stereo room: a few decaying early reflections
rev = np.zeros_like(out)
for d, g in [(0.023, .35), (0.041, .3), (0.067, .25), (0.093, .2), (0.131, .16), (0.173, .12), (0.229, .09), (0.31, .06)]:
    k = int(d * SR)
    rev[k:, 0] += out[:-k, 1] * g
    rev[k:, 1] += out[:-k, 0] * g
mix = out + rev * 0.8
mix = mix[:int(SR * DUR)]
# fade out tail
fo = int(0.6 * SR)
mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.4) * 0.89
with wave.open('audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('ok', len(played), 'chords')
