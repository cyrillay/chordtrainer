// Notes, chord qualities and roman numerals. Ported from js/core/theory.js
// and js/training/progressions.js on the web site.

package io.chordtrainer.ghostjam.core

val NOTE_NAMES = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
val NOTE_DISPLAY = listOf("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")

fun noteToPitchClass(name: String): Int = NOTE_NAMES.indexOf(name)

enum class Quality(val intervals: List<Int>, val suffix: String) {
    MAJ(listOf(0, 4, 7), ""),
    MIN(listOf(0, 3, 7), "m"),
    DIM(listOf(0, 3, 6), "°"),
    AUG(listOf(0, 4, 8), "+"),
    MAJ7(listOf(0, 4, 7, 11), "M7"),
    MIN7(listOf(0, 3, 7, 10), "m7"),
    DOM7(listOf(0, 4, 7, 10), "7"),
    M7B5(listOf(0, 3, 6, 10), "ø"),
    MMAJ7(listOf(0, 3, 7, 11), "mM7"),
}

// A chord in no particular voicing: a root pitch class and a quality.
data class Chord(val root: Int, val quality: Quality) {
    val pcs: List<Int> get() = quality.intervals.map { (root + it) % 12 }
    val symbol: String get() = NOTE_DISPLAY[root] + quality.suffix
}

fun buildChord(root: String, quality: Quality) = Chord(noteToPitchClass(root), quality)

enum class Mode { MAJOR, MINOR }

// Major-scale degree intervals (semitones from tonic).
private val SCALE_INTERVALS = listOf(0, 2, 4, 5, 7, 9, 11)

// Longest first so prefix matching is greedy.
private val ROMANS = listOf(
    Triple("VII", 7, true), Triple("vii", 7, false),
    Triple("III", 3, true), Triple("iii", 3, false),
    Triple("VI", 6, true), Triple("vi", 6, false),
    Triple("IV", 4, true), Triple("iv", 4, false),
    Triple("II", 2, true), Triple("ii", 2, false),
    Triple("V", 5, true), Triple("v", 5, false),
    Triple("I", 1, true), Triple("i", 1, false),
)

private data class Roman(val accidental: Int, val degree: Int, val upper: Boolean, val suffix: String)

private fun parseRoman(token: String): Roman {
    var i = 0
    var accidental = 0
    if (token.startsWith("b")) { accidental = -1; i++ } else if (token.startsWith("#")) { accidental = 1; i++ }
    val hit = ROMANS.firstOrNull { token.startsWith(it.first, i) }
        ?: return Roman(accidental, 0, false, "")
    return Roman(accidental, hit.second, hit.third, token.substring(i + hit.first.length))
}

private fun suffixToQuality(suffix: String, upper: Boolean): Quality = when (suffix) {
    "Δ" -> if (upper) Quality.MAJ7 else Quality.MMAJ7
    "ø" -> Quality.M7B5
    "o" -> Quality.DIM
    "7" -> if (upper) Quality.DOM7 else Quality.MIN7
    "7+9", "+9" -> Quality.DOM7
    else -> if (upper) Quality.MAJ else Quality.MIN
}

fun romanToChord(token: String, keyRoot: String): Chord? {
    val r = parseRoman(token)
    if (r.degree == 0) return null
    val pc = (noteToPitchClass(keyRoot) + SCALE_INTERVALS[r.degree - 1] + r.accidental + 12) % 12
    return Chord(pc, suffixToQuality(r.suffix, r.upper))
}

// The mode is the case of the last plain I or i: what the ear hears as home.
fun progressionMode(tokens: List<String>): Mode {
    for (t in tokens.asReversed()) {
        val r = parseRoman(t)
        if (r.degree == 1 && r.accidental == 0) return if (r.upper) Mode.MAJOR else Mode.MINOR
    }
    return Mode.MAJOR
}

// A tune from the Chords trainer, tagged with the grooves it suits.
data class Tune(val name: String, val tokens: List<String>, val family: String, val styles: List<StyleId>) {
    val mode: Mode get() = progressionMode(tokens)
    fun chordsIn(key: String): List<Chord> = tokens.mapNotNull { romanToChord(it, key) }
    fun fits(style: StyleId) = style in styles
}

fun tunesFor(style: StyleId) = TUNES.filter { it.fits(style) }
