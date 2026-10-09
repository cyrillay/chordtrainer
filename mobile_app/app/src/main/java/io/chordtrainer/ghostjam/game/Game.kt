// The game loop. Every frame: take the keys the MIDI thread queued, move
// the current scene along (the set, the radio, the tuning), draw it into the
// low-res pixmap, and carry out what the scenes asked for (sounds, haptics,
// going somewhere). Everything runs on the UI thread, once per frame.

package io.chordtrainer.ghostjam.game

import io.chordtrainer.ghostjam.audio.AudioEngine
import io.chordtrainer.ghostjam.core.Ears
import io.chordtrainer.ghostjam.core.Gig
import io.chordtrainer.ghostjam.core.JamRun
import io.chordtrainer.ghostjam.core.Patch
import io.chordtrainer.ghostjam.core.SetConfig
import io.chordtrainer.ghostjam.core.StyleId
import io.chordtrainer.ghostjam.core.tunesFor
import io.chordtrainer.ghostjam.core.pix.Pixmap
import io.chordtrainer.ghostjam.core.scene.Env
import io.chordtrainer.ghostjam.core.scene.Fx
import io.chordtrainer.ghostjam.core.scene.Lang
import io.chordtrainer.ghostjam.core.scene.Place
import io.chordtrainer.ghostjam.core.scene.Polaroids
import io.chordtrainer.ghostjam.core.scene.ResultsBoard
import io.chordtrainer.ghostjam.core.scene.Room
import io.chordtrainer.ghostjam.core.scene.Scene
import io.chordtrainer.ghostjam.core.scene.Setup
import io.chordtrainer.ghostjam.core.scene.Sfx
import io.chordtrainer.ghostjam.core.scene.Stage
import io.chordtrainer.ghostjam.core.scene.Text
import io.chordtrainer.ghostjam.core.scene.TuneIn
import io.chordtrainer.ghostjam.midi.Key
import java.time.LocalDateTime
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.random.Random

class Game(
    private val prefs: Prefs,
    lang: Lang,
    private val haptic: (strong: Boolean) -> Unit,
    private val scanBluetooth: () -> Unit,
) {
    val progress = prefs.load()
    private val text = Text(lang)
    val env = Env()
    private val room = Room(text, progress, env)
    private val setup = Setup(text, progress)
    private val stage = Stage(text, progress)
    private val board = ResultsBoard(text, progress)
    private val tuneIn = TuneIn(text)
    private val polaroids = Polaroids(text, progress)
    private val ears = Ears()
    private val keys = ConcurrentLinkedQueue<Key>()
    private val rng = Random.Default

    var place = Place.ROOM; private set
    var pm = Pixmap(360, 180); private set
    private var startNanos = 0L
    private var t = 0.0

    // The set.
    private var run: JamRun? = null
    private var song: AudioEngine.Song? = null
    private var nextBar = 0
    private var lastCfg: SetConfig? = null
    private var encore = 0

    // The radio in Room 7: the band plays lo-fi, quietly, forever.
    private var radio: Gig? = null
    private var radioSong: AudioEngine.Song? = null
    private var radioBar = 0

    // Tuning in.
    private var tuneSong: AudioEngine.Song? = null
    private val gaps = mutableListOf<Double>()
    private val clickMs = 600.0

    fun onKey(k: Key) { keys.add(k) }

    private fun scene(): Scene = when (place) {
        Place.ROOM -> room
        Place.SETUP -> setup
        Place.JAM -> if (board.results != null) board else stage
        Place.TUNE_IN -> tuneIn
        Place.POLAROIDS -> polaroids
    }

    fun tap(x: Int, y: Int) { scene().tap(x, y) }

    // The system back gesture: back to Room 7, or out of the game from there.
    fun back(): Boolean {
        if (place == Place.ROOM) return false
        go(Place.ROOM)
        return true
    }

    fun frame(nanos: Long, w: Int, h: Int): Pixmap {
        if (startNanos == 0L) startNanos = nanos
        t = (nanos - startNanos) / 1e9
        if (pm.w != w || pm.h != h) pm = Pixmap(w, h)
        val now = LocalDateTime.now()
        env.hour = now.hour; env.month = now.monthValue; env.day = now.dayOfMonth
        env.epochDays = System.currentTimeMillis() / 86_400_000.0

        while (true) route(keys.poll() ?: break)
        when (place) {
            Place.JAM -> updateJam()
            Place.TUNE_IN -> updateTuneIn()
            else -> {}
        }
        updateRadio()

        if (place == Place.JAM && board.results != null) { stage.render(pm, t); board.render(pm, t) }
        else scene().render(pm, t)
        for (s in listOf(room, setup, stage, board, tuneIn, polaroids)) { s.fx.forEach(::apply); s.fx.clear() }
        return pm
    }

    // ---- Keys ----

    private fun route(k: Key) {
        when (place) {
            Place.JAM -> {
                val r = run ?: return
                val s = song ?: return
                if (board.results != null) return
                val at = s.msAt(k.nanos) - progress.offsetMs
                val landed = r.key(k.midi, k.down, k.velocity, at)
                if (landed != null) {
                    stage.landed(landed)
                    r.accent(landed, s.nowMs()).forEach { s.play(it) }
                }
            }
            Place.TUNE_IN -> if (k.down) tuneKey(k)
            Place.ROOM, Place.SETUP -> {
                val eggs = ears.key(k.midi, k.down)
                if (k.down && place == Place.ROOM) room.keys(eggs, k.midi)
            }
            Place.POLAROIDS -> {}
        }
    }

    // ---- The set ----

    private fun startJam(cfg: SetConfig) {
        AudioEngine.start()
        stopRadio()
        encore = if (lastCfg?.tune == cfg.tune && lastCfg?.style == cfg.style) encore + 1 else 0
        lastCfg = cfg
        run = JamRun(cfg, progress, env.hour, encore)
        song = AudioEngine.newSong(400.0)
        nextBar = 0
        stage.reset()
        stage.run = run
        board.results = null
        place = Place.JAM
    }

    private fun updateJam() {
        val r = run ?: return
        val s = song ?: return
        if (board.results != null) return
        val g = r.gig
        val now = s.nowMs()
        while (nextBar * g.barMs < now + g.barMs + 250 && (g.totalBars == null || nextBar <= g.totalBars!!)) {
            g.soundsForBar(nextBar, g.scorer.energy) { rng.nextDouble() }.forEach { s.play(it) }
            nextBar++
        }
        stage.songMs = now
        stage.graded(r.update(now))
        val end = g.endMs
        if (end != null && now >= end) {
            board.show(r.finish(true), t)
            prefs.save(progress)
        }
    }

    private fun leaveJam() {
        val r = run
        if (r != null && board.results == null) { r.finish(false); prefs.save(progress) }
        AudioEngine.clear()
        run = null; song = null
    }

    // ---- Tune in ----

    private fun startTuneIn() {
        AudioEngine.start()
        stopRadio()
        val s = AudioEngine.newSong(600.0)
        tuneSong = s
        gaps.clear()
        for (i in 0 until 16) AudioEngine.click(s, i * clickMs, i % 4 == 0)
        tuneIn.clicks = 0; tuneIn.taps = 0; tuneIn.done = false; tuneIn.offsetMs = null
        place = Place.TUNE_IN
    }

    private fun tuneKey(k: Key) {
        val s = tuneSong ?: return
        val at = s.msAt(k.nanos)
        val i = Math.round(at / clickMs).toInt()
        if (i < 4 || i >= 16) return             // the first bar is for finding the beat
        val gap = at - i * clickMs
        if (kotlin.math.abs(gap) < clickMs / 3) gaps += gap
        tuneIn.taps = gaps.size
    }

    private fun updateTuneIn() {
        val s = tuneSong ?: return
        val now = s.nowMs()
        tuneIn.beat = now / clickMs
        tuneIn.clicks = ((now / clickMs).toInt() + 1).coerceIn(0, 16)
        if (now > 16 * clickMs + 300 && !tuneIn.done) {
            tuneIn.done = true
            tuneSong = null
            if (gaps.size >= 4) {
                val median = gaps.sorted()[gaps.size / 2]
                progress.offsetMs = median
                tuneIn.offsetMs = median.toInt()
                prefs.save(progress)
            }
        }
    }

    // ---- The radio ----

    private fun updateRadio() {
        if (!env.radioOn || place != Place.ROOM) { if (radio != null) stopRadio(); return }
        val g = radio ?: run {
            AudioEngine.start()
            val tune = tunesFor(StyleId.LOFI).random()
            Gig(StyleId.LOFI, 78, tune.chordsIn("C"), 1, null).also { radio = it; radioSong = AudioEngine.newSong(200.0); radioBar = 1 }
        }
        val s = radioSong ?: return
        val now = s.nowMs()
        while (radioBar * g.barMs < now + g.barMs + 250) {
            g.soundsForBar(radioBar, 2) { rng.nextDouble() }.forEach { s.play(it, 0.4) }
            radioBar++
        }
        env.beat = now / g.beatMs
    }

    private fun stopRadio() {
        if (radio != null) AudioEngine.clear()
        radio = null; radioSong = null
    }

    // ---- What the scenes ask for ----

    private fun apply(f: Fx) {
        when (f) {
            is Fx.Sound -> sfx(f.sfx)
            is Fx.Haptic -> haptic(f.strong)
            is Fx.ScanBluetooth -> scanBluetooth()
            is Fx.Radio -> env.radioOn = !env.radioOn
            is Fx.Secret -> prefs.save(progress)
            is Fx.Go -> go(f.to)
        }
    }

    private fun go(to: Place) {
        when {
            to == Place.JAM -> startJam(if (place == Place.SETUP) setup.config else lastCfg ?: setup.config)
            to == Place.TUNE_IN -> startTuneIn()
            else -> {
                if (place == Place.JAM) leaveJam()
                if (place == Place.TUNE_IN) { AudioEngine.clear(); tuneSong = null }
                place = to
            }
        }
    }

    private fun sfx(s: Sfx) {
        AudioEngine.start()
        when (s) {
            Sfx.CHIME -> listOf(84, 88, 91, 96).forEachIndexed { i, m -> AudioEngine.playNow(Patch.CHIME, m, 0.6, 800.0, i * 90.0) }
            Sfx.DING -> AudioEngine.playNow(Patch.DING, 88, 0.7)
            else -> AudioEngine.playNow(Patch.valueOf(s.name), 0, 0.8)
        }
    }
}
