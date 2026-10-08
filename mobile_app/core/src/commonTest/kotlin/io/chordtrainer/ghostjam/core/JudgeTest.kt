// Ported from tests/jam.test.js: the same cases must give the same answers
// on the phone as on the web.

package io.chordtrainer.ghostjam.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class JudgeTest {
    private fun req(c: Chord) = chordTargets(c).required.sorted()

    private fun play(j: SlotJudge, pcs: List<Int>, t: Double) {
        val held = mutableSetOf<Int>()
        for (pc in pcs) { held += pc; j.noteOn(pc, t, held) }
    }

    @Test fun triadsNeedThirdAndFifthSeventhsNeedThirdAndSeventh() {
        assertEquals(listOf(4, 7), req(buildChord("C", Quality.MAJ)))
        assertEquals(listOf(0, 5), req(buildChord("D", Quality.MIN7)))
        assertEquals(listOf(5, 11), req(buildChord("G", Quality.DOM7)))
        // Half-diminished keeps its b5: it is what makes the chord.
        assertEquals(listOf(2, 5, 9), req(buildChord("B", Quality.M7B5)))
    }

    @Test fun colourTonesAreNeverWrong() {
        val g7 = chordTargets(buildChord("G", Quality.DOM7))
        assertEquals(Role.COLOUR, toneRole(g7, 9))
        assertEquals(Role.COLOUR, toneRole(g7, 8))
        assertEquals(Role.TONE, toneRole(g7, 7))
        assertEquals(Role.WRONG, toneRole(g7, 0))
    }

    @Test fun grading() {
        val chord = buildChord("C", Quality.MAJ)
        fun mk() = SlotJudge(chord, 1000.0, 3000.0, 500.0)
        var j = mk(); play(j, listOf(0, 4, 7), 1050.0); assertEquals(Grade.PERFECT, j.result().grade)
        j = mk(); play(j, listOf(4, 7), 900.0); assertEquals(Grade.PERFECT, j.result().grade)
        j = mk(); play(j, listOf(4, 7), 780.0); assertEquals(Grade.GOOD, j.result().grade)
        j = mk(); play(j, listOf(4, 7), 1400.0); assertEquals(Grade.GOOD, j.result().grade)
        j = mk(); play(j, listOf(4, 7), 2200.0); assertEquals(Grade.LATE, j.result().grade)
        j = mk(); play(j, listOf(4), 1000.0); assertEquals(Grade.MISS, j.result().grade)
        j = mk(); assertEquals(Grade.MISS, j.result().grade)
    }

    @Test fun wrongNotesCostTheGradeColoursEarnABonus() {
        val chord = buildChord("D", Quality.MIN7)
        var j = SlotJudge(chord, 0.0, 2000.0, 500.0)
        play(j, listOf(1, 5, 0), 0.0)
        assertEquals(Grade.GOOD, j.result().grade)
        j = SlotJudge(chord, 0.0, 2000.0, 500.0)
        play(j, listOf(5, 0, 4), 0.0)
        val r = j.result()
        assertEquals(Grade.PERFECT, r.grade)
        assertEquals(1, r.colours)
        assertTrue(r.bonus > 0)
    }

    @Test fun windowsLetYouAnticipateByHalfABeat() {
        val j = SlotJudge(buildChord("C", Quality.MAJ), 1000.0, 3000.0, 500.0)
        assertTrue(j.owns(760.0))
        assertFalse(j.owns(740.0))
        assertFalse(j.owns(2760.0))
    }

    @Test fun scorerComboMultiplierAndEnergy() {
        val s = Scorer()
        val perfect = SlotResult(Grade.PERFECT, 0.0, 0, 0, 300, 0)
        repeat(4) { s.add(perfect) }
        assertEquals(4, s.combo)
        assertEquals(2, multiplier(4))
        assertEquals(2, s.energy)
        s.add(SlotResult(Grade.MISS, null, 0, 0, 0, 0))
        assertEquals(0, s.combo)
        assertEquals(1, s.energy)
        assertEquals(3, nextEnergy(2, Grade.PERFECT, 8))
        assertEquals(MAX_ENERGY, nextEnergy(3, Grade.PERFECT, 40))
        assertEquals(3, MAX_ENERGY)
        assertEquals(3, nextEnergy(3, Grade.GOOD, 2))
        assertEquals(0, nextEnergy(0, Grade.MISS, 0))
        assertTrue(s.rank in listOf("S", "A", "B", "C", "D"))
    }

    @Test fun timingZonesMatchTheGradingWindows() {
        assertNull(timingZone(null))
        assertEquals(Zone.PERFECT, timingZone(0.0))
        assertEquals(Zone.PERFECT, timingZone(-0.2))
        assertEquals(Zone.PERFECT, timingZone(0.25))
        assertEquals(Zone.EARLY, timingZone(-0.4))
        assertEquals(Zone.GOOD, timingZone(0.6))
        assertEquals(Zone.LATE, timingZone(1.4))
    }
}
