package io.chordtrainer.ghostjam.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GigTest {
    private val cMaj = buildChord("C", Quality.MAJ)
    private val g7 = buildChord("G", Quality.DOM7)

    @Test fun slotsFollowTheCountIn() {
        val gig = Gig(StyleId.LOFI, 120, listOf(cMaj, g7), choruses = 1)
        assertEquals(500.0, gig.beatMs)
        assertEquals(2000.0, gig.slotStart(0))
        assertEquals(4000.0, gig.slotStart(1))
        assertEquals(2, gig.totalSlots)
        assertEquals(3, gig.totalBars)
        // Half a beat early still belongs to the slot.
        assertEquals(0, gig.slotAt(1760.0))
        assertEquals(-1, gig.slotAt(1740.0))
    }

    @Test fun aSetPlayedPerfectlyRanksS() {
        val gig = Gig(StyleId.LOFI, 120, listOf(cMaj, g7), choruses = 1)
        for (m in listOf(64, 67)) gig.noteOn(m, 2010.0)
        gig.noteOff(64); gig.noteOff(67)
        val landing = listOf(65, 71).map { gig.noteOn(it, 3990.0, 90) }.last().landed
        assertEquals(1, landing?.slot)
        val graded = gig.update(10_000.0)
        assertEquals(listOf(Grade.PERFECT, Grade.PERFECT), graded.map { it.result.grade })
        assertEquals(listOf(65, 71), graded[1].play.voicing)
        assertTrue(gig.over)
        assertEquals("S", gig.scorer.rank)
    }

    @Test fun nothingPlayedIsAMissOnceTheWindowCloses() {
        val gig = Gig(StyleId.LOFI, 120, listOf(cMaj), choruses = 1)
        assertEquals(0, gig.update(3700.0).size)
        assertEquals(Grade.MISS, gig.update(3760.0).single().result.grade)
    }

    @Test fun reggaeIsJudgedOnTheAnd() {
        val gig = Gig(StyleId.REGGAE, 60, listOf(cMaj), choruses = 1)
        assertEquals(4500.0, gig.target(0))
        for (m in listOf(64, 67)) gig.noteOn(m, 4500.0)
        assertEquals(Grade.PERFECT, gig.update(100_000.0).single().result.grade)
    }

    @Test fun barsScheduleCountInThenBandThenFinale() {
        val gig = Gig(StyleId.SWING, 120, listOf(cMaj), choruses = 1)
        assertTrue(gig.soundsForBar(0, 1) { 0.5 }.all { it.patch == Patch.STICKS })
        val bar1 = gig.soundsForBar(1, 1) { 0.5 }
        assertTrue(bar1.all { it.atMs >= 2000.0 && it.atMs < 4000.0 })
        assertTrue(bar1.any { it.patch == Patch.UPRIGHT })
        assertTrue(gig.soundsForBar(2, 1) { 0.5 }.any { it.patch == Patch.KICK })
    }
}
