package io.chordtrainer.ghostjam.core

import io.chordtrainer.ghostjam.core.pix.GhostId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProgressTest {
    @Test fun savesAndLoads() {
        val p = Progress().apply {
            ecto = 321; sets = 7; offsetMs = 12.5
            secrets += listOf("bat", "storm"); achievements += "firstGig"
            records["LOFI"] = 9300; setsByGroove[StyleId.LOFI] = 5
        }
        val q = Progress.load(p.save())
        assertEquals(321, q.ecto); assertEquals(7, q.sets); assertEquals(12.5, q.offsetMs)
        assertEquals(setOf("bat", "storm"), q.secrets.toSet()); assertEquals(setOf("firstGig"), q.achievements.toSet())
        assertEquals(9300, q.record(StyleId.LOFI)); assertEquals(5, q.setsByGroove[StyleId.LOFI])
        assertEquals(0, Progress.load(null).ecto)
    }

    @Test fun groovesOpenByPlayingOrBuying() {
        val p = Progress()
        assertTrue(p.unlocked(StyleId.LOFI)); assertFalse(p.unlocked(StyleId.BALLAD))
        p.sets = 2
        assertTrue(p.unlocked(StyleId.BALLAD)); assertFalse(p.unlocked(StyleId.BOSSA))
        assertFalse(p.buy(StyleId.SWING))
        p.ecto = Progress.GROOVE_PRICE
        assertTrue(p.buy(StyleId.SWING)); assertTrue(p.unlocked(StyleId.SWING)); assertEquals(0, p.ecto)
    }

    @Test fun ghostsRememberByPlaying() {
        val p = Progress()
        assertEquals(1, p.memory(GhostId.DEZ))
        p.sets = 3; assertEquals(3, p.memory(GhostId.DEZ))
        p.sets = 12; assertEquals(5, p.memory(GhostId.LENNY))
    }

    @Test fun aFinishedSetPaysAndCounts() {
        val p = Progress()
        val tune = tunesFor(StyleId.LOFI).first()
        val run = JamRun(SetConfig(StyleId.LOFI, tune, "C", 80, 1), p, 21, 0)
        run.update(1e9)
        val res = run.finish(true)
        assertEquals(1, p.sets)
        assertTrue("firstGig" in res.newAch && "ghostTown" in res.newAch)
        assertTrue(res.ecto >= 50)
    }
}
