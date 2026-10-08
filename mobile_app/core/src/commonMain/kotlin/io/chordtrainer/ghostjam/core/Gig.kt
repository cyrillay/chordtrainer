// One set with the band: the timeline (bars, slots, when each note sounds)
// and the judging of what you play. Pure logic on one clock, "song time" in
// milliseconds, where 0 is the downbeat of the count-in bar as you hear it.
// The app converts audio frames and MIDI timestamps to song time.
// Ported from the play loop of jam/js/main.js and the scheduler of band.js.

package io.chordtrainer.ghostjam.core

import kotlin.math.floor

// A sound for the engine: when it starts and how long it rings, in song ms.
data class Sound(val atMs: Double, val durMs: Double, val patch: Patch, val midi: Int, val vel: Double)

data class Graded(val slot: Int, val chord: Chord, val result: SlotResult, val gained: Int)

class Gig(
    val style: StyleId,
    val tempo: Int,
    val chords: List<Chord>,
    val barsPerChord: Int = 1,
    choruses: Int? = 2,      // null: endless
) {
    val groove = STYLES.getValue(style)
    val beatMs = 60_000.0 / tempo
    val barMs = beatMs * 4
    val totalSlots: Int? = choruses?.let { chords.size * it }
    // The count-in bar, then every slot.
    val totalBars: Int? = totalSlots?.let { 1 + it * barsPerChord }
    val scorer = Scorer()

    private val judges = mutableMapOf<Int, SlotJudge>()
    private val held = mutableSetOf<Int>()
    var finalized = 0; private set

    // Slot k starts after the count-in bar. The chord is meant on the
    // downbeat, or on the off-beat after it in reggae (anchor).
    fun slotStart(k: Int) = (1 + k * barsPerChord) * barMs
    fun slotEnd(k: Int) = slotStart(k) + barsPerChord * barMs
    private val anchorMs get() = groove.anchor * beatMs
    fun target(k: Int) = slotStart(k) + anchorMs
    fun chordOf(k: Int) = chords[k % chords.size]
    private fun inSet(k: Int) = k >= 0 && (totalSlots == null || k < totalSlots)

    // Which slot a moment belongs to, anticipation included.
    fun slotAt(t: Double): Int =
        floor((t - anchorMs + Window.ANTIC * beatMs - barMs) / (barsPerChord * barMs)).toInt()

    // The slot on screen at song time t (no anticipation).
    fun shownSlot(t: Double): Int = floor((t - barMs) / (barsPerChord * barMs)).toInt()

    fun judgeFor(k: Int): SlotJudge? {
        if (!inSet(k)) return null
        return judges.getOrPut(k) { SlotJudge(chordOf(k), target(k), slotEnd(k) + anchorMs, beatMs) }
    }

    // A key went down at song time t. Returns its role for the key colour.
    fun noteOn(midi: Int, t: Double): Role {
        held += midi
        val k = slotAt(t)
        val j = judgeFor(k)
        val pcs = held.map { it % 12 }.toSet()
        return when {
            j != null && !j.done -> j.noteOn(midi % 12, t, pcs)
            k >= 0 -> toneRole(chordTargets(chordOf(k)), midi % 12)
            else -> Role.TONE
        }
    }

    fun noteOff(midi: Int) { held -= midi }

    // Grade every slot whose window has closed by song time t.
    fun update(t: Double): List<Graded> {
        val out = mutableListOf<Graded>()
        while (inSet(finalized)) {
            val k = finalized
            if (t < slotEnd(k) + anchorMs - Window.ANTIC * beatMs) break
            val res = judgeFor(k)!!.result()
            judges.remove(k)
            out += Graded(k, chordOf(k), res, scorer.add(res))
            finalized++
        }
        return out
    }

    val over: Boolean get() = totalSlots != null && finalized >= totalSlots

    // Everything that sounds in bar `bar`, at the band's current energy.
    fun soundsForBar(bar: Int, energy: Int, rng: Rng): List<Sound> {
        val steps = groove.steps
        val stepMs = barMs / steps
        val t0 = bar * barMs
        val at = { s: Int -> t0 + s * stepMs + if (steps == 16 && s % 2 == 1) groove.shuffle * stepMs else 0.0 }
        if (bar == 0) return countIn(style).map { Sound(at(it.step), stepMs, it.patch, 0, it.vel) }
        if (totalBars != null && bar >= totalBars) return finale(t0)

        val k = (bar - 1) / barsPerChord
        val chord = chordOf(k)
        val nextK = bar / barsPerChord
        val next = if (totalBars == null || bar + 1 < totalBars) chordOf(nextK) else chord
        val ev = barEvents(style, chord, next, energy, rng)
        val out = mutableListOf<Sound>()
        ev.drums.forEach { out += Sound(at(it.step), stepMs, it.patch, 0, it.vel) }
        ev.bass.forEach { e -> e.notes.forEach { out += Sound(at(e.step), e.dur * stepMs, groove.bass, it, 0.9) } }
        ev.keys.forEach { e -> e.notes.forEach { out += Sound(at(e.step), e.dur * stepMs, groove.keys, it, 0.6) } }
        val guest = GUESTS.getValue(style).patch
        ev.guest.forEach { e -> e.notes.forEach { out += Sound(at(e.step), e.dur * stepMs, guest, it, 0.6) } }
        return out
    }

    // The band lands on the top of the form and lets it ring.
    private fun finale(t0: Double): List<Sound> {
        val home = chords[0]
        return listOf(Sound(t0, barMs, Patch.KICK, 0, 1.0), Sound(t0, barMs * 0.8, groove.bass, bassRoot(home), 0.9)) +
            keysVoicing(home).map { Sound(t0, barMs, groove.keys, it, 0.6) }
    }

    // Song time when the set is over and the last chord has rung.
    val endMs: Double? get() = totalBars?.let { (it + 1) * barMs }
}
