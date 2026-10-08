# Ghost Jam Hotel (Android)

The native game version of Ghost Jam (`/jam/` on the site). A haunted hotel
where every floor is a club: you play the chords on a MIDI keyboard, the ghost
band plays the rest, and the deeper you go the further back in time you get.
The game design document lives outside the repo (the site is served from the
repo root by GitHub Pages, so anything here is public and would spoil the
story).

It is a separate project from the static site: nothing here is loaded by the
web pages, and the web Ghost Jam keeps its own code.

## Status: M0, the technical spike

- [x] `core`: the web Ghost Jam's rules ported to Kotlin (judge, scoring,
      the six grooves, the guests, the 104 tunes of the Chords trainer) with
      the web tests ported alongside, plus the set timeline (`Gig`).
- [x] Audio: C++ engine on Oboe (AAudio, low latency, exclusive), notes
      scheduled by audio frame, the band synthesized like on the web.
- [x] MIDI: USB and Bluetooth LE keyboards through `android.media.midi`,
      keys judged with their MIDI timestamps.
- [x] Clock: audio frames, `System.nanoTime()` and song time tied together
      with the stream's presentation timestamp.
- [x] Tune in: the latency calibration (tap on the click, median offset).
- [x] Three screens to try it: Room 7, Jam, Tune in. French and English.
- [ ] Tried on a real phone with a real keyboard. Not done yet: the
      container that built it has no device. Target: under 20 ms perceived
      latency over USB.

Not in M0 (see the milestones in the design document): the floors, the
story, the twelve ghosts, the new mechanics, achievements, ectoplasm.

## Build

Needs JDK 17+, the Android SDK (platform 36, build tools) and NDK
27.2.12479018 with CMake 3.22.1.

```sh
cd mobile_app
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew :core:jvmTest          # the ported rules and their tests
./gradlew :app:assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:lintDebug
```

Install on a phone with `adb install -r app/build/outputs/apk/debug/app-debug.apk`,
plug in a USB keyboard (USB-C OTG) or press Bluetooth on Room 7.

## Layout

| Path | What |
|------|------|
| `core/` | Kotlin Multiplatform (JVM only for now, iOS joins later). Pure game rules, no Android. |
| `core/.../Theory.kt` | Notes, qualities, roman numerals, `Tune`. |
| `core/.../Judge.kt` | `SlotJudge`, `Scorer`: same rules and numbers as `jam/js/judge.js`. |
| `core/.../Grooves.kt` | The six grooves, guests and tiers, as `jam/js/styles.js`. |
| `core/.../Gig.kt` | One set: slots, what sounds when, judging in song time. |
| `core/.../Tunes.kt` | Generated. Do not edit. |
| `app/src/main/cpp/` | Oboe engine (`engine.cpp`), synth (`synth.cpp`), JNI. |
| `app/.../audio/AudioEngine.kt` | Schedules sounds, converts between the clocks. |
| `app/.../midi/MidiInput.kt` | USB and Bluetooth LE keyboards. |
| `app/.../game/` | `JamController` (runs a set), `Calibration`, `Prefs`. |
| `app/.../ui/` | Compose screens and the pixel ghost. |

## Keeping in step with the web

The rules started as a port of `jam/js/`. When the tunes or their tags change
on the site, regenerate the Kotlin list from the repo root:

```sh
node mobile_app/scripts/gen-tunes.mjs
```

Rule changes are made by hand in both places, with the tests in
`core/src/commonTest` mirroring `tests/jam.test.js`.

## Copy

English and French (`res/values`, `res/values-fr`). Very little text, short
sentences, no dashes between clauses, like the site.
