// Ported from the achievements part of tests/jam.test.js.

package io.chordtrainer.ghostjam.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AchievementsTest {
    private fun landed(
        grade: Grade = Grade.PERFECT, offsetBeats: Double = 0.0, offsetMs: Double = 0.0, colours: Int = 0,
        voicing: List<Int>? = listOf(60, 64, 67), velocities: List<Int>? = listOf(80, 80, 80),
        colourIntervals: List<Int> = emptyList(), quality: Quality = Quality.MAJ,
    ) = ChordPlay(grade, offsetBeats, offsetMs, colours, voicing, velocities, 0, colourIntervals, quality)

    private fun run(tr: JamTracker, cs: List<ChordPlay>) = cs.flatMap { tr.chord(it) }

    @Test fun idsAreUniqueAndSecretsHaveHints() {
        assertEquals(ACH.size, ACH.map { it.id }.toSet().size)
        assertEquals(28, ACH.size)
        for (a in ACH) if (a.vis != Vis.VISIBLE) assertTrue(a.hint.isNotEmpty() && a.hintFr.isNotEmpty(), a.id)
    }

    @Test fun feelStreaks() {
        var tr = JamTracker(StyleId.SWING, 100)
        assertFalse("dilla" in run(tr, List(7) { landed(Grade.GOOD, 0.5) }))
        assertTrue("dilla" in tr.chord(landed(Grade.GOOD, 0.5)))
        tr = JamTracker(StyleId.SWING, 100)
        val push = List(4) { landed(offsetBeats = -0.1) } + landed(offsetBeats = 0.1) + List(4) { landed(offsetBeats = -0.1) }
        assertFalse("pushing" in run(tr, push))
        tr = JamTracker(StyleId.SWING, 100)
        assertTrue("atomic" in run(tr, listOf(10.0, -14.0, 3.0, 0.0).map { landed(offsetMs = it) }))
    }

    @Test fun onTheOneOnlyInFunk() {
        assertFalse("onTheOne" in run(JamTracker(StyleId.SWING, 100), List(8) { landed() }))
        assertTrue("onTheOne" in run(JamTracker(StyleId.FUNK, 100), List(8) { landed() }))
    }

    @Test fun touch() {
        val tr = JamTracker(StyleId.SWING, 100)
        assertTrue("ghostNotes" in tr.chord(landed(velocities = listOf(20, 30, 35))))
        assertTrue("wakeDead" in tr.chord(landed(velocities = listOf(120, 127, 115))))
        assertFalse("ghostNotes" in tr.chord(landed(Grade.MISS, velocities = listOf(20, 30, 35))))
    }

    @Test fun voicings() {
        var tr = JamTracker(StyleId.SWING, 100)
        assertTrue("shells" in run(tr, List(8) { landed(voicing = listOf(64, 70), velocities = listOf(80, 80)) }))
        val shape = { low: Int -> landed(voicing = listOf(low, low + 4, low + 7)) }
        tr = JamTracker(StyleId.SWING, 100)
        assertTrue("planing" in run(tr, listOf(shape(60), shape(62), shape(65), shape(67))))
        tr = JamTracker(StyleId.SWING, 100)
        assertFalse("planing" in run(tr, listOf(shape(60), shape(62), landed(voicing = listOf(60, 63, 67)), shape(67))))
        assertTrue(smoothMove(listOf(60, 64, 67), listOf(59, 65, 69)))
        assertFalse(smoothMove(listOf(60, 64, 67), listOf(60, 64, 70)))
        tr = JamTracker(StyleId.SWING, 100)
        val ii = listOf(62, 65, 69, 72); val v = listOf(62, 65, 67, 71); val i = listOf(60, 64, 67, 71)
        assertTrue("butter" in run(tr, listOf(ii, v, i, i, ii, v, i, i).map { landed(voicing = it, velocities = it.map { 80 }) }))
    }

    @Test fun colour() {
        val tr = JamTracker(StyleId.SWING, 2)
        assertTrue("hotSauce" in tr.chord(landed(colours = 3)))
        val ids = tr.chord(landed(quality = Quality.DOM7, colours = 2, colourIntervals = listOf(1, 8)))
        assertTrue("altered" in ids)
        assertTrue("sauceAll" in ids)
    }

    @Test fun choruses() {
        var tr = JamTracker(StyleId.BALLAD, 2)
        var ids = run(tr, listOf(landed(velocities = listOf(50, 40, 55)), landed(velocities = listOf(30, 30, 30))))
        assertTrue("golden" in ids && "lullaby" in ids)
        tr = JamTracker(StyleId.SWING, 2)
        ids = run(tr, listOf(landed(voicing = listOf(40, 44, 47)), landed(Grade.GOOD, voicing = listOf(41, 45, 47))))
        assertTrue("basement" in ids && "golden" !in ids)
    }

    @Test fun storiesAndEnd() {
        val tr = JamTracker(StyleId.SWING, 4)
        assertEquals(emptyList(), tr.energy(MAX_ENERGY))
        tr.energy(0)
        assertEquals(listOf("lazarus"), tr.energy(MAX_ENERGY))
        assertEquals(listOf("stageFright"), JamTracker(StyleId.SWING, 4).finish(false, "D", 20, 0))
        val t2 = JamTracker(StyleId.SWING, 4)
        run(t2, List(4) { landed(Grade.MISS, voicing = null) })
        assertEquals(listOf("ghostTown"), t2.finish(true, "D", 20, 0))
        val t3 = JamTracker(StyleId.SWING, 4)
        t3.note()
        run(t3, List(4) { landed(colours = 1) })
        val end = t3.finish(true, "S", 3, 2)
        assertTrue("encore" in end && "lastOrders" in end && "seance" in end && "ghostTown" !in end)
    }

    @Test fun earsHearTheEggs() {
        val e = Ears()
        assertEquals(listOf(Egg.TRITONE), e.key(60, true) + e.key(66, true))
        e.key(60, false); e.key(66, false)
        val bday = listOf(67, 67, 69, 67, 72, 71).flatMap { e.key(it, true).also { _ -> e.key(it, false) } }
        assertTrue(Egg.BIRTHDAY in bday)
        val ears = Ears()
        listOf(70, 74, 77, 80).forEach { ears.key(it, true) }          // B♭7
        listOf(70, 74, 77, 80).forEach { ears.key(it, false) }
        val home = listOf(60, 64, 67).flatMap { ears.key(it, true) }    // C
        assertTrue(Egg.BACKDOOR in home)
        val w = Ears()
        assertTrue(Egg.TRISTAN in listOf(53, 59, 63, 68).flatMap { w.key(it, true) })
    }
}
