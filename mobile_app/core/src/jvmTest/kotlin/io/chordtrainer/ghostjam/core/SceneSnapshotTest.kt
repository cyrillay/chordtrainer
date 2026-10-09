package io.chordtrainer.ghostjam.core

import io.chordtrainer.ghostjam.core.pix.Pixmap
import io.chordtrainer.ghostjam.core.scene.Env
import io.chordtrainer.ghostjam.core.scene.Lang
import io.chordtrainer.ghostjam.core.scene.Room
import io.chordtrainer.ghostjam.core.scene.Stage
import io.chordtrainer.ghostjam.core.scene.Setup
import io.chordtrainer.ghostjam.core.scene.ResultsBoard
import io.chordtrainer.ghostjam.core.scene.TuneIn
import io.chordtrainer.ghostjam.core.scene.Polaroids
import io.chordtrainer.ghostjam.core.scene.attic
import io.chordtrainer.ghostjam.core.scene.Text
import kotlin.test.Test
import kotlin.test.assertTrue

class SceneSnapshotTest {
    private fun progress(sets: Int) = Progress().apply { this.sets = sets; ecto = sets * 40; repeat(sets.coerceAtMost(3)) { achievements += "a$it" } }

    @Test fun room() {
        for ((name, sets) in listOf("room-first-night" to 0, "room-later" to 8)) {
            val env = Env().apply { midiName = if (sets > 0) "Digital Piano" else null; radioOn = sets > 0 }
            val room = Room(Text(Lang.FR), progress(sets), env)
            val pm = Pixmap(380, 180)
            room.render(pm, 1.3)
            Snapshots.save(pm, name)
            assertTrue(pm.px.any { it != pm.px[0] })
        }
    }

    // Plays a set perfectly for `slots` chords and renders the stage then.
    private fun stageAt(style: StyleId, slots: Int, name: String, lang: Lang = Lang.FR) {
        val tune = TUNES.first { it.fits(style) && it.tokens.size == 4 }
        val prog = progress(3)
        val run = JamRun(SetConfig(style, tune, "C", STYLES.getValue(style).tempo.def, 4), prog, 21, 0)
        val stage = Stage(Text(lang), prog).also { it.run = run }
        val g = run.gig
        var secs = 0.0
        for (k in 0 until slots) {
            val c = g.chordOf(k)
            val t = g.target(k) + 12
            val notes = keysVoicingFor(c)
            notes.forEach { m -> run.key(m, true, 80, t)?.let { stage.landed(it) } }
            if (k < slots - 1) notes.forEach { run.key(it, false, 0, t + 100) }
            secs += 1.0
            stage.graded(run.update(g.slotEnd(k) + 1))
        }
        stage.songMs = g.slotStart(slots - 1) + g.beatMs * 1.2
        val pm = Pixmap(380, 180)
        stage.render(pm, secs + 0.05)
        Snapshots.save(pm, name)
    }

    private fun keysVoicingFor(c: Chord) = keysVoicing(c).map { it + 12 }

    @Test fun stage() {
        stageAt(StyleId.LOFI, 13, "stage-lofi")
        stageAt(StyleId.FUNK, 3, "stage-funk-early", Lang.EN)
    }

    @Test fun screens() {
        val prog = progress(5).apply { ecto = 160; records["LOFI"] = 9300; achievements += listOf("firstGig", "dilla") }
        Pixmap(380, 180).also { Setup(Text(Lang.FR), prog).render(it, 2.0); Snapshots.save(it, "setup") }
        val board = ResultsBoard(Text(Lang.FR), prog)
        board.show(Results("S", 12450, mapOf(Grade.PERFECT to 14, Grade.GOOD to 2, Grade.LATE to 0, Grade.MISS to 0), 16, 120, listOf("firstGig", "golden"), true, true), 0.0)
        Pixmap(380, 180).also { stageBackground(it); board.render(it, 5.0); Snapshots.save(it, "results") }
        val tune = TuneIn(Text(Lang.FR)).apply { clicks = 11; taps = 6; beat = 10.4 }
        Pixmap(380, 180).also { tune.render(it, 3.0); Snapshots.save(it, "tune-in") }
        Pixmap(380, 180).also { val w = Polaroids(Text(Lang.FR), prog); w.render(it, 1.0); w.tap(80, 40); w.render(it, 1.1); Snapshots.save(it, "polaroids") }
    }

    private fun stageBackground(pm: Pixmap) { pm.attic(0.0) }
}
