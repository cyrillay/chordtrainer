// Ported from tests/jam.test.js.

package io.chordtrainer.ghostjam.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GroovesTest {
    @Test fun everyGroovePlaysEveryProgressionChordInRange() {
        for ((id, style) in STYLES) {
            assertEquals(4, countIn(id).size)
            for (tune in TUNES.take(40)) {
                val chords = tune.chordsIn("F#")
                chords.forEachIndexed { i, chord ->
                    for (energy in 0..MAX_ENERGY) {
                        val ev = barEvents(id, chord, chords[(i + 1) % chords.size], energy) { 0.3 }
                        for (d in ev.drums) assertTrue(d.step in 0 until style.steps, "$id drum step")
                        for (n in ev.bass) {
                            assertTrue(n.step in 0 until style.steps, "$id bass step")
                            assertTrue(n.notes[0] in 26..56, "$id bass ${n.notes[0]} on ${chord.symbol}")
                        }
                        for (k in ev.keys) assertTrue(k.step + k.dur <= style.steps, "$id keys overflow")
                        for (g in ev.guest) {
                            assertTrue(g.step >= 0 && g.step + g.dur <= style.steps, "$id guest overflow")
                            GUESTS.getValue(id).range?.let { r -> g.notes.forEach { assertTrue(it in r, "$id guest $it") } }
                        }
                        if (energy == 0) assertEquals(0, ev.keys.size)
                        assertEquals(energy == MAX_ENERGY, ev.guest.isNotEmpty(), "$id guest at $energy")
                    }
                }
            }
        }
    }

    @Test fun drumPatternsMatchTheirGrid() {
        for (style in STYLES.values) {
            for (levels in style.drums.values) {
                assertEquals(4, levels.size)
                for (p in levels) assertEquals(style.steps, p.length, "${style.id}: $p")
            }
            assertTrue(style.tempo.min <= style.tempo.def && style.tempo.def <= style.tempo.max)
        }
    }

    @Test fun bassRootLowKeysAroundMiddleC() {
        for (root in listOf("C", "F#", "B", "E")) assertTrue(bassRoot(buildChord(root, Quality.MAJ)) in 28 until 40)
        val v = keysVoicing(buildChord("D", Quality.MIN7))
        assertEquals(3, v.size)
        assertTrue(v.all { it in 53 until 65 })
    }

    @Test fun bandTiers() {
        assertEquals(MAX_ENERGY + 1, TIERS.size)
        assertEquals(listOf(Part.DRUMS, Part.BASS), partsAt(0).toList())
        assertEquals(listOf(Part.DRUMS, Part.BASS, Part.KEYS), partsAt(1).toList())
        assertEquals(listOf(Part.DRUMS, Part.BASS, Part.KEYS), partsAt(2).toList())
        assertEquals(listOf(Part.DRUMS, Part.BASS, Part.KEYS, Part.GUEST), partsAt(3).toList())
        assertEquals(4, partsAt(99).size)
    }

    @Test fun everyGrooveHasItsGuestAndLinesSpellTheChord() {
        assertEquals(STYLES.size, GUESTS.values.map { it.name }.toSet().size)
        val dm7 = buildChord("D", Quality.MIN7)
        val g7 = buildChord("G", Quality.DOM7)
        val dm7Pcs = setOf(2, 5, 9, 0)
        for (id in StyleId.entries) {
            for (r in listOf(0.0, 0.4, 0.8)) {
                val ev = guestEvents(id, dm7, g7) { r }
                assertTrue(ev.isNotEmpty())
                for (m in ev.dropLast(1).flatMap { it.notes }) assertTrue(m % 12 in dm7Pcs, "$id $m")
            }
        }
        val first = guestEvents(StyleId.SWING, dm7, dm7) { 0.0 }[0].notes[0] % 12
        assertTrue(first in listOf(5, 0))
    }

    @Test fun reggaeOnTheOffBeat() {
        assertEquals(0.5, STYLES.getValue(StyleId.REGGAE).anchor)
        for (s in STYLES.values) {
            if (s.id != StyleId.REGGAE) assertEquals(0.0, s.anchor)
            assertTrue(s.accent.isNotEmpty())
        }
    }

    @Test fun everyTuneSuitsAGrooveAndEveryGrooveHasTunes() {
        for (t in TUNES) assertTrue(t.styles.isNotEmpty(), t.name)
        for (s in StyleId.entries) assertTrue(tunesFor(s).size >= 10, "$s")
        val byName = { n: String -> TUNES.first { it.name == n } }
        assertEquals(listOf(StyleId.SWING), byName("Rhythm").styles)
        assertTrue(!byName("La Folia").fits(StyleId.FUNK))
        assertTrue(byName("Dorian vamp").fits(StyleId.FUNK))
        assertEquals(Mode.MINOR, byName("Dogleg (dropback)").mode)
    }
}
