// What counts as playing a chord, how each chord is graded, and the score.
// Ported from jam/js/judge.js: same rules, same numbers.
//
// The band's bass already plays the root, so the root is optional. What you
// must hold are the defining tones: the 3rd and 5th of a triad, the 3rd and
// 7th of a seventh chord (plus the 5th when it is altered). Extensions are
// "colour": never wrong, worth a small bonus.
//
// Times are milliseconds on one clock. A slot runs from start to end; you may
// anticipate it by half a beat, so a note-on belongs to the slot whose window
// [start - antic, end - antic) contains it.

package io.chordtrainer.ghostjam.core

import kotlin.math.abs
import kotlin.math.min

// Extensions allowed on top of each quality, in semitones above the root.
private val COLOURS = mapOf(
    Quality.MAJ to listOf(2, 9, 11),
    Quality.MIN to listOf(2, 5, 9, 10),
    Quality.DIM to listOf(9),
    Quality.AUG to listOf(2, 10, 11),
    Quality.MAJ7 to listOf(2, 6, 9),
    Quality.MIN7 to listOf(2, 5, 9),
    Quality.DOM7 to listOf(1, 2, 3, 6, 8, 9),
    Quality.M7B5 to listOf(2, 5, 8),
    Quality.MMAJ7 to listOf(2, 5, 9),
)

// Fifths that define the chord's sound and so are required.
private val ALTERED_FIFTH = setOf(Quality.DIM, Quality.AUG, Quality.M7B5)

data class Targets(val root: Int, val tones: Set<Int>, val required: Set<Int>, val colours: Set<Int>)

fun chordTargets(chord: Chord): Targets {
    val iv = chord.quality.intervals
    val pc = { i: Int -> (chord.root + i) % 12 }
    val tones = iv.map(pc).toSet()
    val required = mutableSetOf<Int>()
    iv.forEachIndexed { idx, i ->
        if (idx == 0) return@forEachIndexed
        val isFifth = i in 6..8
        if (isFifth && iv.size == 4 && chord.quality !in ALTERED_FIFTH) return@forEachIndexed
        required += pc(i)
    }
    val colours = COLOURS.getValue(chord.quality).map(pc).filter { it !in tones }.toSet()
    return Targets(chord.root, tones, required, colours)
}

enum class Role { TONE, COLOUR, WRONG }

fun toneRole(t: Targets, pc: Int): Role = when (pc) {
    in t.tones -> Role.TONE
    in t.colours -> Role.COLOUR
    else -> Role.WRONG
}

enum class Grade(val points: Int) { PERFECT(300), GOOD(150), LATE(50), MISS(0) }

const val COLOUR_BONUS = 25

// Timing windows, in beats from the chord's downbeat.
object Window { const val ANTIC = 0.5; const val PERFECT = 0.25; const val GOOD = 1.0 }

enum class Zone { PERFECT, EARLY, GOOD, LATE }

fun timingZone(offsetBeats: Double?): Zone? = when {
    offsetBeats == null -> null
    abs(offsetBeats) <= Window.PERFECT -> Zone.PERFECT
    offsetBeats < 0 -> Zone.EARLY
    offsetBeats <= Window.GOOD -> Zone.GOOD
    else -> Zone.LATE
}

data class SlotResult(
    val grade: Grade, val offsetBeats: Double?, val wrong: Int, val colours: Int, val base: Int, val bonus: Int,
)

class SlotJudge(val chord: Chord, val start: Double, val end: Double, val beatMs: Double) {
    val targets = chordTargets(chord)
    var hitAt: Double? = null; private set
    var wrong = 0; private set
    var notes = 0; private set
    private val colours = mutableSetOf<Int>()
    val colourPcs: Set<Int> get() = colours
    var done = false; private set

    val windowStart get() = start - Window.ANTIC * beatMs
    val windowEnd get() = end - Window.ANTIC * beatMs
    fun owns(t: Double) = t >= windowStart && t < windowEnd

    // A key went down at time t; held is every pitch class held right now,
    // this one included. Returns the note's role for live feedback.
    fun noteOn(pc: Int, t: Double, held: Set<Int>): Role {
        notes++
        val role = toneRole(targets, pc)
        if (role == Role.WRONG) wrong++
        if (role == Role.COLOUR) colours += pc
        if (hitAt == null && held.containsAll(targets.required)) hitAt = t
        return role
    }

    // Offset of the hit from the downbeat, in beats (negative = anticipated).
    val offsetBeats: Double? get() = hitAt?.let { (it - start) / beatMs }

    fun result(): SlotResult {
        done = true
        val off = offsetBeats
        val grade = when {
            off == null || wrong >= 3 -> Grade.MISS
            abs(off) <= Window.PERFECT && wrong == 0 -> Grade.PERFECT
            off <= Window.GOOD && wrong <= 1 -> Grade.GOOD
            else -> Grade.LATE
        }
        val bonus = if (grade == Grade.MISS) 0 else min(3, colours.size) * COLOUR_BONUS
        return SlotResult(grade, off, wrong, colours.size, grade.points, bonus)
    }
}

// ---- Scoring across a set ----

fun multiplier(combo: Int) = min(8, 1 + combo / 4)

// Band energy 0..MAX_ENERGY. Every 4 chords in a row takes it one step up,
// a miss one step down.
const val ENERGY_STEP = 4

fun nextEnergy(energy: Int, grade: Grade, combo: Int): Int {
    if (grade == Grade.MISS) return maxOf(0, energy - 1)
    val earned = min(MAX_ENERGY, 1 + combo / ENERGY_STEP)
    return maxOf(energy, earned)
}

class Scorer {
    var score = 0; private set
    var combo = 0; private set
    var bestCombo = 0; private set
    var energy = 1; private set
    val counts = Grade.entries.associateWith { 0 }.toMutableMap()

    fun add(res: SlotResult): Int {
        counts[res.grade] = counts.getValue(res.grade) + 1
        if (res.grade == Grade.MISS) combo = 0 else if (res.grade != Grade.LATE) combo++
        bestCombo = maxOf(bestCombo, combo)
        val gained = (res.base + res.bonus) * multiplier(combo)
        score += gained
        energy = nextEnergy(energy, res.grade, combo)
        return gained
    }

    val total get() = counts.values.sum()

    // Share of chords landed, weighted like a rhythm game.
    val accuracy: Double get() {
        val n = total
        if (n == 0) return 0.0
        val c = counts
        return (c.getValue(Grade.PERFECT) + c.getValue(Grade.GOOD) * 0.75 + c.getValue(Grade.LATE) * 0.4) / n
    }

    val rank: String get() {
        val a = accuracy
        if (total > 0 && counts.getValue(Grade.PERFECT) == total) return "S"
        return when {
            a >= 0.9 -> "A"
            a >= 0.75 -> "B"
            a >= 0.55 -> "C"
            else -> "D"
        }
    }
}
