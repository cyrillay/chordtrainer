// The six grooves. Each style turns one bar of one chord into note events for
// the drums, the bass, the keys and the guest. Pure data, no audio: the audio
// engine plays whatever these return. Ported from jam/js/styles.js.
//
// A bar is split into steps (16 sixteenths, or 12 triplet eighths for the
// swing feel). Drum patterns are strings, one character per step: 'x' hit,
// 'o' soft hit, '.' rest, one pattern per band energy (0 thin to 3 busy).
//
// anchor: where in the bar you play each chord, in beats from the downbeat.
// Reggae is 0.5: the skank sits on the off-beat.

package io.chordtrainer.ghostjam.core

typealias Rng = () -> Double

private fun <T> pick(items: List<T>, rng: Rng): T = items[(rng() * items.size).toInt().coerceIn(0, items.size - 1)]

enum class StyleId { SWING, BOSSA, LOFI, BALLAD, FUNK, REGGAE }

// Instruments the engine knows. The ids are shared with the C++ synth.
enum class Patch { STICKS, KICK, SNARE, HAT, RIDE, RIM, BRUSH, UPRIGHT, ROUND, SUB, SLAP, EPIANO, NYLON, DUSTY, PAD, CLAV, ORGAN, SAX, TRUMPET, VIBES, STRINGS, HORNS, MELODICA }

data class Tempo(val min: Int, val max: Int, val def: Int)

class Style(
    val id: StyleId, val name: String, val steps: Int, val shuffle: Double, val tempo: Tempo,
    val bass: Patch, val keys: Patch, val anchor: Double, val accent: List<Patch>,
    val drums: Map<Patch, List<String>>, val crackle: Boolean = false,
)

val STYLES: Map<StyleId, Style> = listOf(
    Style(StyleId.SWING, "Swing", 12, 0.0, Tempo(90, 200, 132), Patch.UPRIGHT, Patch.EPIANO, 0.0, listOf(Patch.KICK, Patch.SNARE), mapOf(
        Patch.RIDE to listOf("x..x.xx..x.x", "x..x.xx..x.x", "x..x.xx..x.x", "x..x.xx..x.x"),
        Patch.HAT to listOf("...x.....x..", "...x.....x..", "...x.....x..", "...x.....x.."),
        Patch.KICK to listOf("............", "o.....o.....", "o..o..o..o..", "o..o..o..o.o"),
        Patch.SNARE to listOf("............", "............", ".....o.....o", "..o..o..o..o"),
    )),
    Style(StyleId.BOSSA, "Bossa", 16, 0.0, Tempo(100, 160, 128), Patch.ROUND, Patch.NYLON, 0.0, listOf(Patch.KICK, Patch.RIM), mapOf(
        Patch.KICK to listOf("x.......x.......", "x..xx..xx..xx..x", "x..xx..xx..xx..x", "x..xx..xx..xx..x"),
        Patch.RIM to listOf("x..x..x...x..x..", "x..x..x...x..x..", "x..x..x...x..x..", "x..x..x...x..x.."),
        Patch.HAT to listOf("................", "o.o.o.o.o.o.o.o.", "oooooooooooooooo", "oxooxooxoxooxooo"),
    )),
    Style(StyleId.LOFI, "Lo-fi", 16, 0.22, Tempo(65, 95, 80), Patch.SUB, Patch.DUSTY, 0.0, listOf(Patch.KICK, Patch.SNARE), mapOf(
        Patch.KICK to listOf("x.........x.....", "x.........x.....", "x......x..x.....", "x......x.xx...x."),
        Patch.SNARE to listOf("....x.......x...", "....x.......x...", "....x.......x..o", "....x..o....x.o."),
        Patch.HAT to listOf("x...x...x...x...", "x.x.x.x.x.x.x.x.", "x.xox.x.x.xox.x.", "xoxoxoxoxoxoxoxo"),
    ), crackle = true),
    Style(StyleId.BALLAD, "Ballad", 16, 0.0, Tempo(50, 80, 66), Patch.ROUND, Patch.PAD, 0.0, listOf(Patch.KICK, Patch.BRUSH), mapOf(
        Patch.BRUSH to listOf("x...x...x...x...", "x...x...x...x...", "x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.x."),
        Patch.RIM to listOf("................", "....x.......x...", "....x.......x...", "....x.......x..."),
        Patch.KICK to listOf("................", "x...............", "x.......x.......", "x.......x.....o."),
    )),
    Style(StyleId.FUNK, "Funk", 16, 0.06, Tempo(85, 120, 102), Patch.SLAP, Patch.CLAV, 0.0, listOf(Patch.KICK, Patch.SNARE), mapOf(
        Patch.KICK to listOf("x.........x.....", "x.....x...x..x..", "x.x...x...x..x..", "x.x...x..xx..x.."),
        Patch.SNARE to listOf("....x.......x...", "....x.......x...", "....x..o.o..x..o", ".o..x..o.o..x.oo"),
        Patch.HAT to listOf("x.x.x.x.x.x.x.x.", "xoxoxoxoxoxoxoxo", "xoxoxoxoxoxoxoxo", "xoxoxoxoxoxoxoxx"),
    )),
    Style(StyleId.REGGAE, "Reggae", 16, 0.12, Tempo(66, 90, 76), Patch.SUB, Patch.ORGAN, 0.5, listOf(Patch.KICK, Patch.RIM), mapOf(
        Patch.KICK to listOf("........x.......", "........x.......", "........x.......", "........x......."),
        Patch.RIM to listOf("........x.......", "........x.......", "........x.......", "....o...x.....o."),
        Patch.HAT to listOf("..x...x...x...x.", "x.x.x.x.x.x.x.x.", "x.xxx.x.x.xxx.x.", "xoxxxoxoxoxxxoxo"),
    )),
).associateBy { it.id }

// ---- Pitch helpers ----

private const val BASS_LOW = 28   // E1
private const val KEYS_LOW = 53   // F3

private fun fifthOf(c: Chord) = c.quality.intervals.firstOrNull { it in 6..8 } ?: 7
private fun thirdOf(c: Chord) = c.quality.intervals[1]
private fun seventhOf(c: Chord) = c.quality.intervals.getOrNull(3) ?: 12

// Root of the chord in the bass register (E1 to D#2).
fun bassRoot(c: Chord) = BASS_LOW + ((c.root - BASS_LOW % 12) + 12) % 12
private fun bassTone(c: Chord, interval: Int) = bassRoot(c) + interval

// The fifth just below the root when it fits in the register, else above.
private fun lowFifth(c: Chord): Int {
    val m = bassTone(c, fifthOf(c))
    return if (m - 12 >= BASS_LOW) m - 12 else m
}

// Close voicing between F3 and E4, rootless when the chord has a 7th.
fun keysVoicing(c: Chord): List<Int> {
    var pcs = c.pcs
    if (pcs.size == 4) pcs = pcs.drop(1)
    return pcs.map { KEYS_LOW + ((it - KEYS_LOW % 12) + 12) % 12 }.sorted()
}

// ---- Events ----

data class NoteEvent(val step: Int, val dur: Int, val notes: List<Int>)
data class Hit(val step: Int, val patch: Patch, val vel: Double)
data class BarEvents(val steps: Int, val drums: List<Hit>, val bass: List<NoteEvent>, val keys: List<NoteEvent>, val guest: List<NoteEvent>)

private fun n(step: Int, midi: Int, dur: Int) = NoteEvent(step, dur, listOf(midi))

private fun walkingBass(c: Chord, next: Chord, rng: Rng): List<NoteEvent> {
    val root = bassRoot(c)
    val second = root + pick(listOf(thirdOf(c), fifthOf(c)), rng)
    val third = root + pick(listOf(fifthOf(c), seventhOf(c), thirdOf(c)), rng)
    // Beat four leans into the next root from a semitone above or below.
    val target = bassRoot(next)
    val approach = listOf(target - 1, target + 1, target + 13, target + 11).sortedBy { kotlin.math.abs(it - third) }[0]
    return listOf(n(0, root, 3), n(3, second, 3), n(6, third, 3), n(9, approach, 3))
}

private fun bassLine(id: StyleId, c: Chord, next: Chord, rng: Rng): List<NoteEvent> = when (id) {
    StyleId.SWING -> walkingBass(c, next, rng)
    StyleId.BOSSA -> listOf(n(0, bassRoot(c), 6), n(6, lowFifth(c), 2), n(8, lowFifth(c), 6), n(14, bassRoot(c), 2))
    StyleId.LOFI -> listOf(
        n(0, bassRoot(c), 7), n(10, bassRoot(c), 3),
        n(14, pick(listOf(lowFifth(c), bassRoot(next) - 1 + if (rng() < 0.5) 0 else 2), rng), 2),
    )
    StyleId.BALLAD -> listOf(n(0, bassRoot(c), 8), n(8, lowFifth(c), 8))
    StyleId.FUNK -> listOf(
        n(0, bassRoot(c), 2), n(3, bassRoot(c) + 12, 1), n(6, bassRoot(c), 1), n(7, bassRoot(c), 1),
        n(10, bassTone(c, pick(listOf(if (seventhOf(c) == 12) 10 else seventhOf(c), fifthOf(c)), rng)), 1),
        n(11, bassRoot(c) + 12, 1), n(14, bassTone(c, fifthOf(c)), 1),
    )
    StyleId.REGGAE -> listOf(n(2, bassRoot(c), 2), n(4, bassRoot(c), 2), n(6, lowFifth(c), 3), n(10, bassTone(c, thirdOf(c)), 2), n(12, bassRoot(c), 3))
}

private fun r(vararg pairs: Int) = pairs.toList().chunked(2).map { it[0] to it[1] }

private fun keysRhythm(id: StyleId, rng: Rng): List<Pair<Int, Int>> = when (id) {
    StyleId.SWING -> pick(listOf(r(0, 4, 5, 1), r(2, 1, 5, 3), r(0, 2, 8, 1, 11, 1), r(5, 1, 8, 3)), rng)
    StyleId.BOSSA -> r(0, 2, 3, 2, 6, 2, 10, 2, 12, 2)
    StyleId.LOFI -> r(0, 14)
    StyleId.BALLAD -> r(0, 16)
    StyleId.FUNK -> pick(listOf(r(2, 1, 7, 1, 10, 1, 15, 1), r(3, 1, 6, 1, 11, 1, 14, 1)), rng)
    StyleId.REGGAE -> r(2, 1, 6, 1, 10, 1, 14, 1)
}

// ---- Band tiers ----
// Drums and bass, then keys, then the band heats up, then the guest.

enum class Part { DRUMS, BASS, KEYS, GUEST }

data class Tier(val part: Part?, val name: String)

val TIERS = listOf(Tier(null, "Drums and bass"), Tier(Part.KEYS, "Keys"), Tier(null, "The band"), Tier(Part.GUEST, "Guest"))
val MAX_ENERGY = TIERS.size - 1

fun partsAt(energy: Int): Set<Part> {
    val e = energy.coerceIn(0, MAX_ENERGY)
    return linkedSetOf(Part.DRUMS, Part.BASS) + TIERS.subList(1, e + 1).mapNotNull { it.part }
}

// ---- Guests: one per groove ----
// LINE plays one note at a time in range, CHORD plays the chord an octave up.

enum class GuestKind { LINE, CHORD }

class Guest(val name: String, val patch: Patch, val kind: GuestKind, val range: IntRange? = null, val octave: Int = 0, val rhythms: List<List<Pair<Int, Int>>>)

val GUESTS: Map<StyleId, Guest> = mapOf(
    StyleId.SWING to Guest("Sax", Patch.SAX, GuestKind.LINE, 58..74, rhythms = listOf(r(0, 2, 2, 1, 3, 2, 5, 1, 6, 5), r(2, 1, 3, 2, 5, 1, 6, 3, 9, 2, 11, 1), r(0, 6, 8, 1, 9, 3))),
    StyleId.BOSSA to Guest("Trumpet", Patch.TRUMPET, GuestKind.LINE, 62..76, rhythms = listOf(r(0, 6, 6, 2, 8, 8), r(2, 4, 6, 2, 10, 6), r(0, 3, 3, 3, 6, 10))),
    StyleId.LOFI to Guest("Vibes", Patch.VIBES, GuestKind.LINE, 67..82, rhythms = listOf(r(0, 4, 6, 2, 10, 6), r(4, 4, 10, 2, 12, 4), r(0, 8))),
    StyleId.BALLAD to Guest("Strings", Patch.STRINGS, GuestKind.CHORD, octave = 12, rhythms = listOf(r(0, 16))),
    StyleId.FUNK to Guest("Horns", Patch.HORNS, GuestKind.CHORD, octave = 12, rhythms = listOf(r(0, 1, 3, 1, 10, 1, 14, 2), r(6, 1, 7, 1, 10, 2), r(0, 2, 11, 1, 14, 1))),
    StyleId.REGGAE to Guest("Melodica", Patch.MELODICA, GuestKind.LINE, 67..81, rhythms = listOf(r(2, 2, 6, 2, 10, 4), r(0, 6, 8, 2, 10, 2, 14, 2), r(2, 1, 3, 1, 6, 6, 14, 2))),
)

private fun tonesIn(c: Chord, range: IntRange): List<Int> {
    val pcs = c.pcs.toSet()
    return range.filter { it % 12 in pcs }
}

// The 3rd or 7th nearest to near: the notes that spell the chord.
private fun guideTone(c: Chord, range: IntRange, near: Double): Int {
    val guides = setOf((c.root + thirdOf(c)) % 12, (c.root + seventhOf(c)) % 12)
    return tonesIn(c, range).filter { it % 12 in guides }.sortedBy { kotlin.math.abs(it - near) }[0]
}

// One bar of the guest's part.
fun guestEvents(id: StyleId, chord: Chord, next: Chord?, rng: Rng): List<NoteEvent> {
    val g = GUESTS.getValue(id)
    val rhythm = pick(g.rhythms, rng)
    if (g.kind == GuestKind.CHORD) {
        val notes = (listOf(bassRoot(chord) + 24) + keysVoicing(chord)).map { it + g.octave }
        return rhythm.map { (step, dur) -> NoteEvent(step, dur, notes) }
    }
    // A line: start on a guide tone mid-range, wander through the chord
    // tones, and lead into the next chord when the bar ends on it.
    val range = g.range!!
    val pool = tonesIn(chord, range)
    val mid = (range.first + range.last) / 2.0
    var note = guideTone(chord, range, mid)
    val steps = STYLES.getValue(id).steps
    return rhythm.mapIndexed { i, (step, dur) ->
        if (i > 0) {
            val last = i == rhythm.size - 1
            if (last && next != null && next != chord && step + dur >= steps) {
                note = guideTone(next, range, note.toDouble())
            } else {
                val at = pool.indexOf(note)
                val move = pick(listOf(-2, -1, 1, 1, 2), rng) * if (note > mid + 4) -1 else 1
                note = pool[(at + move).coerceIn(0, pool.size - 1)]
            }
        }
        NoteEvent(step, dur, listOf(note))
    }
}

// Everything one bar needs.
fun barEvents(id: StyleId, chord: Chord, next: Chord?, energy: Int = 1, rng: Rng): BarEvents {
    val style = STYLES.getValue(id)
    val e = energy.coerceIn(0, MAX_ENERGY)
    val parts = partsAt(e)
    val drums = mutableListOf<Hit>()
    for ((patch, levels) in style.drums) {
        levels[e].forEachIndexed { s, ch ->
            if (ch == 'x') drums += Hit(s, patch, 1.0) else if (ch == 'o') drums += Hit(s, patch, 0.45)
        }
    }
    val bass = bassLine(id, chord, next ?: chord, rng)
    val voicing = keysVoicing(chord)
    val keys = if (Part.KEYS in parts) keysRhythm(id, rng).map { (step, dur) -> NoteEvent(step, dur, voicing) } else emptyList()
    val guest = if (Part.GUEST in parts) guestEvents(id, chord, next, rng) else emptyList()
    return BarEvents(style.steps, drums, bass, keys, guest)
}

// Four stick clicks before the band comes in.
fun countIn(id: StyleId): List<Hit> {
    val beat = STYLES.getValue(id).steps / 4
    return (0 until 4).map { Hit(it * beat, Patch.STICKS, if (it == 0) 1.0 else 0.7) }
}
