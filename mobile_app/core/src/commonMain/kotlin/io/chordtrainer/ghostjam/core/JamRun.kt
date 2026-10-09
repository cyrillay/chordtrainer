// One set as the game sees it: the Gig (timing, judging), the achievements
// tracker, and what the stage needs to show. No audio, no Android: the app
// feeds it times and keys and plays the sounds it asks for.

package io.chordtrainer.ghostjam.core

import kotlin.math.ceil

data class SetConfig(val style: StyleId, val tune: Tune, val key: String, val tempo: Int, val choruses: Int?)

data class Results(
    val rank: String, val score: Int, val counts: Map<Grade, Int>, val bestCombo: Int,
    val ecto: Int, val newAch: List<String>, val newRecord: Boolean, val complete: Boolean,
)

class JamRun(val cfg: SetConfig, val progress: Progress, val hour: Int, val encore: Int) {
    val chords = cfg.tune.chordsIn(cfg.key)
    val gig = Gig(cfg.style, cfg.tempo, chords, 1, cfg.choruses)
    private val tracker = JamTracker(cfg.style, chords.size)
    val keys = mutableMapOf<Int, Role>()
    val earned = mutableListOf<String>()       // achievements unlocked this set, in order
    var lastLanded: Landed? = null; private set
    var results: Results? = null; private set
    private var energy = gig.scorer.energy

    // A key. Returns the landing (to answer it with the drums) if any.
    fun key(midi: Int, down: Boolean, vel: Int, t: Double): Landed? {
        if (!down) { gig.noteOff(midi); keys -= midi; return null }
        tracker.note()
        val r = gig.noteOn(midi, t, vel)
        keys[midi] = r.role
        r.landed?.let { lastLanded = it }
        return r.landed
    }

    // Grades what closed by song time t.
    fun update(t: Double): List<Graded> {
        val graded = gig.update(t)
        for (g in graded) {
            grant(tracker.chord(g.play))
            if (gig.scorer.energy != energy) { energy = gig.scorer.energy; grant(tracker.energy(energy)) }
            if (energy >= MAX_ENERGY) grant(listOf("fullBand"))
        }
        return graded
    }

    private fun grant(ids: List<String>) {
        for (id in ids) if (id !in progress.achievements && id !in earned) earned += id
    }

    // The drums answer a chord you nailed: on the downbeat if it is still
    // ahead, else on the next eighth, like a drummer catching your hit.
    fun accent(l: Landed, nowMs: Double): List<Sound> {
        val eighth = gig.beatMs / 2
        val at = if (l.targetMs > nowMs + 20) l.targetMs else l.targetMs + ceil((maxOf(nowMs + 20, l.atMs) - l.targetMs) / eighth) * eighth
        val out = gig.groove.accent.map { Sound(at, 80.0, it, 0, 0.9) }.toMutableList()
        if (gig.scorer.energy >= MAX_ENERGY && cfg.style != StyleId.REGGAE) out += Sound(at, 300.0, Patch.CRASH, 0, 0.6)
        return out
    }

    // End of the set (or the player ran off). Updates the progress.
    fun finish(complete: Boolean): Results {
        results?.let { return it }
        val s = gig.scorer
        grant(tracker.finish(complete, s.rank, hour, encore))
        val record = progress.record(cfg.style)
        val newRecord = complete && s.score > record
        var ecto = 0
        if (complete) {
            progress.sets++
            progress.setsByGroove[cfg.style] = (progress.setsByGroove[cfg.style] ?: 0) + 1
            if (newRecord) progress.records[cfg.style.name] = s.score
            grant(listOf("firstGig"))
            if (s.rank == "S") grant(listOf("busted"))
            val grooves = progress.setsByGroove.keys.size
            if (grooves >= 6) grant(listOf("passport"))
            if (s.rank == "S") {
                progress.secrets += "S-${cfg.style.name}"
                if (StyleId.entries.all { "S-${it.name}" in progress.secrets }) grant(listOf("worldTour"))
            }
            ecto = s.score / 200 + s.bestCombo + earned.size * 25
        }
        progress.achievements += earned
        progress.ecto += ecto
        return Results(s.rank, s.score, s.counts.toMap(), s.bestCombo, ecto, earned.toList(), newRecord, complete).also { results = it }
    }
}
