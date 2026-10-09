# Ghost Jam Hotel (Android)

The native game version of Ghost Jam (`/jam/` on the site). A haunted hotel
where every floor is a club: you play the chords on a MIDI keyboard, the ghost
band plays the rest, and the deeper you go the further back in time you get.
The game design document lives outside the repo (the site is served from the
repo root by GitHub Pages, so anything here is public and would spoil the
story).

It is a separate project from the static site: nothing here is loaded by the
web pages, and the web Ghost Jam keeps its own code.

## Status

**M0, the technical spike: done and tried on a phone.** Rules ported with
their tests, Oboe audio, USB and Bluetooth MIDI, latency calibration.

**M1, Room 7: the art and the attic.**

- The whole game is pixel art drawn in pure Kotlin (`core/.../pix`): a
  software framebuffer of about 360×180, a hand-made 5×7 font (accents and
  ♭ ♯ ° ø included), the twelve ghosts with their props and memory levels.
  The phone scales it up by a whole number, no smoothing.
- Room 7 (`scene/Room.kt`) is the hub: piano (set list), alarm clock stuck
  on 23:59 (tune in), Kev and the MIDI cable (Bluetooth), the radio (the
  band plays lo-fi quietly), the out-of-order elevator, the poster, the
  Polaroids, the jar of ectoplasm, the storm outside.
- Secrets in the room, played or touched, and the keyboard is listened to
  outside a set (`Ears.kt`). Not listed anywhere on purpose.
- The set (`scene/Stage.kt`): the band on stage with their instruments,
  ghosts joining as the energy rises, a crowd, the neon sign, the timing
  gauge, shouts, the drums answering every chord you land, Polaroids for
  achievements, a results chalkboard with the ectoplasm dripping in.
- The 28 achievements of the web, ported with their tests. Grooves unlock
  by playing (or with ectoplasm). Ghosts get their colour back as you play.
- Scenes render to PNG in the JVM tests (`core/build/snapshots/`), so the
  art can be checked without a phone.

## Build

Needs JDK 17+, the Android SDK (platform 36, build tools) and NDK
27.2.12479018 with CMake 3.22.1.

```sh
cd mobile_app
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew :core:jvmTest          # rules, tests, and PNG snapshots of every scene
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
| `core/.../JamRun.kt` | One set as the game sees it: gig, achievements, results, ectoplasm. |
| `core/.../Achievements.kt` | The 28 achievements, as `jam/js/achievements.js`. |
| `core/.../Ears.kt` | Easter eggs heard at the piano. |
| `core/.../Progress.kt` | The save: ectoplasm, sets, secrets, records, unlocks. |
| `core/.../pix/` | Framebuffer, pixel font, sprites, the twelve ghosts. |
| `core/.../scene/` | Room 7, the set list, the stage, results, tune in, Polaroids. |
| `app/src/main/cpp/` | Oboe engine (`engine.cpp`), synth (`synth.cpp`), JNI. |
| `app/.../audio/AudioEngine.kt` | Schedules sounds, converts between the clocks. |
| `app/.../midi/MidiInput.kt` | USB and Bluetooth LE keyboards. |
| `app/.../game/Game.kt` | The frame loop: keys, scheduling, scenes, effects. |
| `app/.../ui/GameView.kt` | Shows the pixmap, scaled by a whole number; taps. |

## Keeping in step with the web

The rules started as a port of `jam/js/`. When the tunes or their tags change
on the site, regenerate the Kotlin list from the repo root:

```sh
node mobile_app/codegen/gen-tunes.mjs
```

Rule changes are made by hand in both places, with the tests in
`core/src/commonTest` mirroring `tests/jam.test.js`.

## Copy

English and French, in `core/.../scene/Text.kt`, drawn in the pixel font.
Very little text, short sentences, no dashes between clauses, like the site.
The ghosts' one-liners stay in English: they died in English bars.
