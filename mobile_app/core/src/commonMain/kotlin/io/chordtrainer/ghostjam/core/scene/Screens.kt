// The smaller screens: the results chalkboard, tuning in with the alarm
// clock, and the wall of Polaroids (the achievements).

package io.chordtrainer.ghostjam.core.scene

import io.chordtrainer.ghostjam.core.ACH
import io.chordtrainer.ghostjam.core.ACH_BY_ID
import io.chordtrainer.ghostjam.core.Grade
import io.chordtrainer.ghostjam.core.Progress
import io.chordtrainer.ghostjam.core.Results
import io.chordtrainer.ghostjam.core.Vis
import io.chordtrainer.ghostjam.core.pix.Font
import io.chordtrainer.ghostjam.core.pix.GhostId
import io.chordtrainer.ghostjam.core.pix.Pal
import io.chordtrainer.ghostjam.core.pix.Pixmap
import io.chordtrainer.ghostjam.core.pix.Pixmap.Companion.withAlpha
import io.chordtrainer.ghostjam.core.pix.Segments
import io.chordtrainer.ghostjam.core.pix.Spr
import io.chordtrainer.ghostjam.core.pix.ghost
import io.chordtrainer.ghostjam.core.pix.hash
import io.chordtrainer.ghostjam.core.pix.sprite
import kotlin.math.min
import kotlin.math.sin

// ---- Results: a chalkboard behind the bar ----

class ResultsBoard(val text: Text, val progress: Progress) : Scene() {
    var results: Results? = null
    private var shownAt = -1.0
    private var stamped = false
    private var dropped = 0

    fun show(r: Results, t: Double) { results = r; shownAt = t; stamped = false; dropped = 0 }

    override fun draw(pm: Pixmap, t: Double) {
        val r = results ?: return
        val age = t - shownAt
        pm.wash(withAlpha(Pal.black, 0.55f))
        val x0 = (pm.w - 260) / 2; val y0 = 10
        // Chalkboard in a wooden frame.
        pm.rect(x0 - 4, y0 - 4, 268, 168, Pal.woodLight)
        pm.rect(x0, y0, 260, 160, Pixmap.rgb(0x1E2B24))
        for (k in 0 until 40) pm.set(x0 + hash(k) .mod(260), y0 + hash(k * 3).mod(160), withAlpha(Pal.bone, 0.08f))
        val chalk = withAlpha(Pal.bone, 0.9f)

        // The rank lands like a stamp.
        val stampT = 0.5
        if (age > stampT && !stamped) { stamped = true; fx += Fx.Sound(Sfx.STAMP); fx += Fx.Haptic(true) }
        if (age > stampT) {
            val s = if (age - stampT < 0.1) 9 else 7
            val col = when (r.rank) { "S" -> Pal.gold; "A" -> Pal.lime; "B" -> Pal.cyan; "C" -> Pal.orange; else -> Pal.red }
            if (r.rank == "S") pm.glow(x0 + 50, y0 + 50, 40, withAlpha(Pal.gold, 0.4f))
            Font.drawCentered(pm, r.rank, x0 + 50, y0 + 26 - (s - 7) * 3, col, s)
            if (r.rank == "S") pm.sprite(Spr.crown, x0 + 47, y0 + 16, Pal.gold, scale = 2)
        }
        // Score counts up.
        val shown = (r.score * min(1.0, age / 1.2)).toInt()
        Font.draw(pm, text.score, x0 + 100, y0 + 14, withAlpha(Pal.bone, 0.6f))
        Font.draw(pm, "$shown", x0 + 100, y0 + 24, chalk, 3)
        if (r.newRecord && age > 1.3 && ((t * 3).toInt() % 2 == 0)) Font.draw(pm, text.newHi, x0 + 100, y0 + 50, Pal.gold)
        // Tally marks per grade, chalk style.
        val rows = listOf(Grade.PERFECT to Pal.gold, Grade.GOOD to Pal.lime, Grade.LATE to Pal.orange, Grade.MISS to Pal.red)
        rows.forEachIndexed { i, (g, c) ->
            val y = y0 + 70 + i * 12
            val n = r.counts[g] ?: 0
            Font.draw(pm, text.grade(g), x0 + 100, y, withAlpha(c, 0.9f))
            val tally = min(n, ((age - 0.8) * 20).toInt().coerceAtLeast(0))
            for (k in 0 until min(tally, 25)) {
                val tx = x0 + 180 + (k / 5) * 14 + (k % 5) * 2
                if (k % 5 == 4) pm.line(tx - 9, y + 5, tx, y + 1, chalk) else pm.vline(tx, y, y + 6, chalk)
            }
            if (n > 25) Font.draw(pm, "+${n - 25}", x0 + 236, y, chalk)
        }
        Font.draw(pm, "${text.combo} ${r.bestCombo}", x0 + 14, y0 + 82, chalk)
        // Ectoplasm drips into the jar.
        val jx = x0 + 22; val jy = y0 + 100
        pm.rect(jx, jy, 20, 26, withAlpha(Pal.bone, 0.15f)); pm.frame(jx, jy, 20, 26, withAlpha(Pal.bone, 0.5f))
        pm.rect(jx + 3, jy - 3, 14, 3, Pal.metal)
        val filled = min(1.0, (age - 1.0).coerceAtLeast(0.0) / 1.5)
        val lvl = (filled * 22).toInt()
        pm.rect(jx + 1, jy + 25 - lvl, 18, lvl, Pal.ecto)
        if (filled in 0.01..0.99) {
            pm.sprite(Spr.drop, jx + 7, jy - 12 + ((t * 40).toInt() % 12), Pal.ecto)
            if ((t * 10).toInt() != dropped) { dropped = (t * 10).toInt(); if (dropped % 3 == 0) fx += Fx.Sound(Sfx.TICK) }
        }
        Font.draw(pm, "+${(r.ecto * filled).toInt()} ${text.ecto}", x0 + 48, y0 + 112, Pal.ecto)

        // Polaroids of what you unlocked, pinned to the board.
        r.newAch.take(3).forEachIndexed { i, id ->
            if (age > 2.0 + i * 0.5) {
                val a = ACH_BY_ID.getValue(id)
                val px = x0 + 108 + i * 50 + (hash(i) % 3); val py = y0 + 116 + (hash(i * 5) % 3)
                pm.rect(px, py, 48, 42, Pal.paper)
                pm.rect(px + 3, py + 3, 42, 18, Pal.sky)
                pm.sprite(Spr.mini, px + 21, py + 9, GhostId.entries[(i + 1) % 12].color)
                Font.wrap((if (text.lang == Lang.FR) a.nameFr else a.name).uppercase(), 46).take(2).forEachIndexed { k, l -> Font.drawCentered(pm, l, px + 24, py + 23 + k * 9, Pal.pupil) }
            }
        }

        // Buttons.
        val by = y0 + 142
        chalkButton(pm, text.back, x0 + 14, by) { fx += Fx.Go(Place.ROOM) }
        chalkButton(pm, text.again, x0 + 60, by) { fx += Fx.Go(Place.JAM) }
    }

    private fun chalkButton(pm: Pixmap, label: String, x: Int, y: Int, action: () -> Unit) {
        val w = Font.width(label) + 10
        pm.frame(x, y, w, 13, withAlpha(Pal.bone, 0.8f))
        Font.draw(pm, label, x + 5, y + 3, Pal.bone)
        hot(x - 4, y - 4, w + 8, 21, action)
    }
}

// ---- Tune in: hit a key on the click, under the big alarm clock ----

class TuneIn(val text: Text) : Scene() {
    var clicks = 0
    var taps = 0
    var done = false
    var offsetMs: Int? = null
    var beat = 0.0

    override fun draw(pm: Pixmap, t: Double) {
        pm.attic(t)
        pm.wash(withAlpha(Pal.black, 0.7f))
        val cx = pm.w / 2
        // The clock, big. Once the tuning ends, it shows midnight for one frame.
        val glitch = done && ((t * 60).toInt() % 97 == 0)
        pm.rect(cx - 62, 30, 124, 48, Pal.pupil); pm.frame(cx - 62, 30, 124, 48, Pal.metal)
        pm.glow(cx, 54, 70, withAlpha(Pal.red, 0.2f))
        Segments.draw(pm, if (glitch) "00:00" else "23:59", cx - 44, 38, Pal.red, withAlpha(Pal.red, 0.1f), scale = 4)
        // A pendulum keeps the click.
        val swing = sin(beat * kotlin.math.PI).toFloat()
        pm.line(cx, 84, cx + (swing * 30).toInt(), 116, Pal.gold); pm.disc(cx + (swing * 30).toInt(), 117, 3, Pal.gold)
        for (i in 0 until 16) {
            val on = i < clicks
            pm.disc(cx - 75 + i * 10, 132, 2, if (on) (if (i % 4 == 0) Pal.pink else Pal.gold) else Pal.line)
        }
        Font.drawCentered(pm, text.tuneInHint, cx, 14, Pal.ink)
        Font.drawCentered(pm, "$taps", cx, 142, Pal.cyan, 2)
        if (done) {
            val msg = offsetMs?.let { "${text.tuneInDone} ${if (it > 0) "+" else ""}$it MS" } ?: text.tuneInAgain
            Font.drawCentered(pm, msg, cx, 160, if (offsetMs != null) Pal.lime else Pal.orange)
            hot(0, 0, pm.w, pm.h) { fx += Fx.Go(Place.ROOM) }
        }
        pm.vignette(0.5f)
    }
}

// ---- The wall of Polaroids ----

class Polaroids(val text: Text, val progress: Progress) : Scene() {
    private var selected: String? = null
    private var scroll = 0

    override fun draw(pm: Pixmap, t: Double) {
        pm.attic(t)
        pm.wash(withAlpha(Pal.black, 0.5f))
        Font.draw(pm, text.polaroids, 8, 6, Pal.ink, 2)
        Font.draw(pm, "${progress.achievements.size}/${ACH.size}", 8, 22, Pal.dim)
        Font.draw(pm, "X", pm.w - 14, 8, Pal.red)
        hot(pm.w - 26, 0, 26, 22) { fx += Fx.Go(Place.ROOM) }
        val cols = (pm.w - 16) / 34
        ACH.forEachIndexed { i, a ->
            val x = 8 + (i % cols) * 34 + (hash(i) % 3)
            val y = 34 + (i / cols) * 40 - scroll + (hash(i * 7) % 3)
            val got = a.id in progress.achievements
            pm.rect(x, y, 30, 36, if (got) Pal.paper else withAlpha(Pal.paper, 0.35f))
            pm.rect(x + 2, y + 2, 26, 24, if (got) Pal.sky else Pal.pupil)
            if (got) {
                pm.ghost(GhostId.entries[i % 12], x + 6, y + 1, t, level = 5)
                if (a.vis == Vis.ULTRA) pm.sprite(Spr.star, x + 23, y + 3, Pal.gold)
            } else if (a.vis == Vis.VISIBLE) pm.ghost(GhostId.entries[i % 12], x + 6, y + 1, t, level = 1, alpha = 0.6f)
            else Font.drawCentered(pm, "?", x + 15, y + 10, Pal.dim)
            pm.set(x + 15, y - 1, Pal.red)
            hot(x, y, 30, 36) { selected = a.id; fx += Fx.Sound(Sfx.TICK) }
        }
        selected?.let { id ->
            val a = ACH_BY_ID.getValue(id)
            val got = id in progress.achievements
            val fr = text.lang == Lang.FR
            val title = if (got || a.vis == Vis.VISIBLE) (if (fr) a.nameFr else a.name) else "???"
            val body = if (got || a.vis == Vis.VISIBLE) (if (fr) a.descFr else a.desc) else (if (fr) a.hintFr else a.hint)
            pm.rect(0, pm.h - 30, pm.w, 30, withAlpha(Pal.pupil, 0.92f))
            Font.draw(pm, title.uppercase(), 8, pm.h - 26, if (got) Pal.gold else Pal.ink)
            Font.wrap(body.uppercase(), pm.w - 16).take(1).forEach { Font.draw(pm, it, 8, pm.h - 14, Pal.dim) }
        }
    }
}
