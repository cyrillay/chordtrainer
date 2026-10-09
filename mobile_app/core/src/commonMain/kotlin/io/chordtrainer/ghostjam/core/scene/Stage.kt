// The set itself, played in the attic: the band on a makeshift stage, the
// neon sign, the chord to play, the beat, the timing gauge and the shouts.
// Ghosts walk on as the band heats up and fade out when you miss.

package io.chordtrainer.ghostjam.core.scene

import io.chordtrainer.ghostjam.core.Graded
import io.chordtrainer.ghostjam.core.Grade
import io.chordtrainer.ghostjam.core.JamRun
import io.chordtrainer.ghostjam.core.Landed
import io.chordtrainer.ghostjam.core.MAX_ENERGY
import io.chordtrainer.ghostjam.core.Role
import io.chordtrainer.ghostjam.core.STYLES
import io.chordtrainer.ghostjam.core.NOTE_DISPLAY
import io.chordtrainer.ghostjam.core.ACH_BY_ID
import io.chordtrainer.ghostjam.core.Progress
import io.chordtrainer.ghostjam.core.multiplier
import io.chordtrainer.ghostjam.core.pix.Font
import io.chordtrainer.ghostjam.core.pix.GhostId
import io.chordtrainer.ghostjam.core.pix.Pal
import io.chordtrainer.ghostjam.core.pix.Pixmap
import io.chordtrainer.ghostjam.core.pix.Pixmap.Companion.withAlpha
import io.chordtrainer.ghostjam.core.pix.Spr
import io.chordtrainer.ghostjam.core.pix.ghost
import io.chordtrainer.ghostjam.core.pix.hash
import io.chordtrainer.ghostjam.core.pix.sprite
import io.chordtrainer.ghostjam.core.scene.Lang.FR
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sin

private class Shout(val word: String, val pts: Int, val spicy: Int, val grade: Grade, val at: Double)

class Stage(val text: Text, val progress: Progress) : Scene() {
    var run: JamRun? = null
    var songMs = -500.0
    private val particles = Particles()
    private val shouts = mutableListOf<Shout>()
    private val bubbles = mutableListOf<Bubble>()
    private var shakeUntil = 0.0
    private var flashUntil = 0.0
    private var flashColor = Pal.bone
    private var now = 0.0
    private var shownSlot = -99
    private var popAt = 0.0
    private var stampAt = -1.0
    private var toastQueue = ArrayDeque<String>()
    private var toastAt = -10.0
    private var toast: String? = null

    fun reset() { shouts.clear(); bubbles.clear(); particles.list.clear(); shownSlot = -99; stampAt = -1.0; toastQueue.clear(); toast = null }

    // What just happened, from the app's game loop.
    fun graded(list: List<Graded>) {
        val r = run ?: return
        for (g in list) {
            val words = text.shouts.getValue(g.result.grade.name)
            shouts += Shout(words[hash(g.slot * 31 + r.gig.scorer.score) .let { abs(it) } % words.size], g.gained, if (g.result.bonus > 0) g.result.colours else 0, g.result.grade, now)
            when (g.result.grade) {
                Grade.PERFECT -> { flashUntil = now + 0.12; flashColor = Pal.goldLight; particles.burst(pmW / 2, 46, now, 14, Pal.gold, 60.0, kind = 3); fx += Fx.Haptic(false) }
                Grade.MISS -> { shakeUntil = now + 0.25; flashUntil = now + 0.15; flashColor = Pal.red; fx += Fx.Haptic(true) }
                else -> {}
            }
            val combo = r.gig.scorer.combo
            if (combo == 8 || combo == 16 || combo == 32) say(GhostId.MARCO, listOf("YEAH!", "OH YES!", "SMOKIN'!")[minOf(2, combo / 16)])
            if (g.result.grade == Grade.MISS && hash(g.slot) % 3 == 0) say(GhostId.DEZ, "…")
        }
        for (id in r.earned) if (id !in toastQueue && id != toast && id !in shownToasts) { toastQueue.addLast(id); shownToasts += id }
    }
    private val shownToasts = mutableSetOf<String>()

    fun landed(l: Landed) { lastHitAt = now; lastOffset = l.offsetBeats }
    private var lastHitAt = -10.0
    private var lastOffset = 0.0
    private var pmW = 360

    private val spots = mutableMapOf<GhostId, Pair<Int, Int>>()
    private fun say(id: GhostId, s: String) {
        val (x, y) = spots[id] ?: return
        bubbles += Bubble(s, x + 9, y + 4, now + 1.4)
    }

    override fun draw(pm: Pixmap, t: Double) {
        now = t
        pmW = pm.w
        val r = run ?: return
        val g = r.gig
        val style = STYLES.getValue(g.style)
        val col = grooveColor(g.style)
        val x0 = (pm.w - 360) / 2
        val ms = songMs
        val beatPos = if (ms < 0) 0.0 else ms / g.beatMs
        val beatFrac = beatPos - kotlin.math.floor(beatPos)
        val pulse = exp(-beatFrac * 6).toFloat()           // 1 on the beat, fading
        val bar = if (ms < 0) -1 else (ms / g.barMs).toInt()
        val beat = if (ms < 0) -1 else ((ms % g.barMs) / g.beatMs).toInt()
        val energy = g.scorer.energy

        pm.ox = 0; pm.oy = 0
        if (t < shakeUntil) { pm.ox = (sin(t * 90) * 3).toInt(); pm.oy = (sin(t * 70) * 2).toInt() }

        // The room, darker, lights on the band.
        pm.attic(t, 146)
        pm.wash(withAlpha(Pal.black, 0.45f))
        pm.wash(withAlpha(col, 0.05f + 0.06f * pulse * (energy + 1) / 4f))

        // Stage: two crates of planks.
        pm.rect(0, 140, pm.w, 6, Pal.woodLight); pm.rect(0, 140, pm.w, 1, Pal.goldLight.let { withAlpha(it, 0.4f) })
        for (k in 0 until pm.w step 18) pm.vline(k, 141, 145, Pal.woodDark)

        // The band. Who is on stage depends on the energy.
        val bandY = 110
        val members = listOf(
            Triple(GhostId.DEZ, x0 + 60, true),
            Triple(GhostId.LENNY, x0 + 122, true),
            Triple(GhostId.MARCO, x0 + 216, energy >= 1),
            Triple(GhostId.entries[guestGhost(g.style)], x0 + 282, energy >= MAX_ENERGY),
        )
        for ((i, m) in members.withIndex()) {
            val (id, gx, on) = m
            pm.cone(gx + 9, 0, 140, 22, withAlpha(col, if (on) 0.10f + 0.08f * pulse else 0.02f))
            val bounce = if (on) (pulse * (1 + energy)).toInt() else 0
            val gy = bandY - bounce
            spots[id] = gx to gy
            when (i) {
                0 -> pm.drumKit(gx + 14, bandY + 14, pulse)
                1 -> pm.uprightBass(gx + 14, bandY + 4, if (beat % 2 == 0) 0 else 1)
                2 -> pm.rhodes(gx - 6, bandY + 10)
                3 -> {}
            }
            pm.ghost(id, gx, gy - 10, t, level = maxOf(3, progress.memory(id)), alpha = if (on) 1f else 0.18f)
            if (i == 3 && on) pm.guestInstrument(g.style, gx + 8, gy + 4, t)
        }

        // The crowd: little ghosts in front of the stage, more of them as the
        // band heats up, jumping on the beat.
        val crowd = 6 + energy * 6 + minOf(12, g.scorer.combo / 2)
        for (c in 0 until crowd) {
            val cx = (hash(c * 13) and 0x7FFFFFFF) % pm.w
            val jumpy = if ((c + beat) % 3 == 0) (pulse * (1 + energy)).toInt() else 0
            val cy = 141 + (hash(c * 7) and 3) - jumpy
            val cc = listOf(Pal.cyan, Pal.pink, Pal.orange, Pal.lime, Pal.violet, Pal.ecto)[c % 6]
            pm.rect(cx, cy, 6, 5, withAlpha(cc, 0.55f)); pm.rect(cx + 1, cy - 1, 4, 1, withAlpha(cc, 0.55f))
            pm.set(cx + 1, cy + 1, Pal.bone); pm.set(cx + 4, cy + 1, Pal.bone)
        }

        // Neon sign.
        val flick = hash((t * 8).toInt()) % 17 != 0
        val signY = 6
        pm.glow(pm.w / 2, signY + 6, 60, withAlpha(Pal.pink, 0.25f))
        val signX = pm.w / 2 - Font.width("GHOST JAM", 2) / 2
        Font.draw(pm, "G", signX, signY, if (flick) Pal.pink else Pal.redDark, 2)
        Font.draw(pm, "HOST ", signX + 12, signY, Pal.pink, 2)
        Font.draw(pm, "J", signX + Font.width("GHOST ", 2) + 2, signY, if (hash((t * 5).toInt() + 3) % 23 != 0) Pal.pink else Pal.redDark, 2)
        Font.draw(pm, "AM", signX + Font.width("GHOST J", 2) + 2, signY, Pal.pink, 2)
        val meta = "${r.cfg.tune.name.uppercase()} · ${NOTE_DISPLAY[io.chordtrainer.ghostjam.core.noteToPitchClass(r.cfg.key)]} · ${g.tempo} BPM" +
            if (style.anchor > 0) " · ${text.playOnTheAnd}" else ""
        Font.drawCentered(pm, meta, pm.w / 2, signY + 17, withAlpha(Pal.dim, 0.9f))

        // HUD.
        Font.draw(pm, text.score, 6, 6, Pal.dim)
        Font.draw(pm, "${g.scorer.score}", 6, 15, Pal.bone, 2)
        val combo = g.scorer.combo
        if (combo > 0) {
            val hot = combo >= 12
            Font.draw(pm, "${text.combo} $combo  ×${multiplier(combo)}", 6, 32, if (hot) Pal.orange else if (combo >= 4) Pal.gold else Pal.dim)
            if (hot && hash((t * 20).toInt()) % 2 == 0) particles.add(Particle(10.0 + hash((t * 30).toInt()).mod(60), 32.0, 0.0, -25.0, t, 0.5, Pal.orange))
        }
        val rec = progress.record(g.style)
        Font.draw(pm, text.hi, pm.w - 6 - Font.width(text.hi), 6, Pal.dim)
        val recS = "${maxOf(rec, g.scorer.score)}"
        Font.draw(pm, recS, pm.w - 6 - Font.width(recS), 15, if (g.scorer.score > rec && rec > 0) Pal.gold else Pal.ink)
        Font.draw(pm, text.stop, pm.w - 6 - Font.width(text.stop), 30, withAlpha(Pal.dim, 0.7f))
        hot(pm.w - 40, 26, 40, 14) { fx += Fx.Go(Place.ROOM) }
        // The alarm clock sits in the corner, as everywhere.
        pm.alarmClock(6, 44)

        // The chord to play, the next ones.
        val k = g.shownSlot(ms)
        val inSet = k >= 0 && (g.totalSlots == null || k < g.totalSlots!!)
        if (k != shownSlot) { shownSlot = k; popAt = t }
        val big = when {
            bar == 0 -> "${beat + 1}"
            inSet -> g.chordOf(k).symbol
            ms < 0 -> "·"
            else -> ""
        }
        val pop = if (t - popAt < 0.08) 5 else 4
        val bigCol = if (bar == 0) Pal.gold else Pal.bone
        Font.drawCentered(pm, big, pm.w / 2, 40 - (pop - 4) * 3, bigCol, pop, shadow = Pal.redDark)
        if (bar == 0) pm.drumSticks(pm.w / 2 - 70, 50, pulse)
        // Next chord card, lit during the last beat before it lands.
        val nextK = if (k < 0) 0 else k + 1
        if (g.totalSlots == null || nextK < g.totalSlots!!) {
            val changeAt = g.slotStart(nextK)
            val soon = changeAt - ms <= g.beatMs
            val nx = pm.w / 2 + 70
            pm.rect(nx, 38, 52, 30, withAlpha(Pal.pupil, 0.8f)); pm.frame(nx, 38, 52, 30, if (soon) Pal.cyan else Pal.line)
            Font.draw(pm, text.next, nx + 4, 41, if (soon) Pal.cyan else Pal.dim)
            Font.draw(pm, g.chordOf(nextK).symbol, nx + 4, 51, if (soon) Pal.cyan else Pal.ink, 2)
            val then = (nextK + 1..nextK + 2).filter { g.totalSlots == null || it < g.totalSlots!! }.joinToString("  ") { g.chordOf(it).symbol }
            Font.draw(pm, then, nx + 2, 71, withAlpha(Pal.dim, 0.6f))
        }

        // Beat bulbs.
        for (b in 0..3) {
            val on = beat == b
            val c = if (on) (if (b == 0) Pal.pink else Pal.gold) else Pal.line
            pm.disc(pm.w / 2 - 21 + b * 14, 76, 3, c)
            if (on) pm.glow(pm.w / 2 - 21 + b * 14, 76, 9, withAlpha(c, 0.6f * pulse))
        }

        // Timing gauge: early | perfect | good | late. The cursor is your last hit.
        val gx = pm.w / 2 - 70; val gy = 86; val gw = 140
        fun at(o: Double) = gx + ((o + 0.5) / 2.0 * gw).toInt()
        pm.rect(gx, gy, gw, 4, withAlpha(Pal.pink, 0.4f))
        pm.rect(at(-0.25), gy, at(0.25) - at(-0.25), 4, Pal.gold)
        pm.rect(at(0.25), gy, at(1.0) - at(0.25), 4, withAlpha(Pal.lime, 0.6f))
        pm.rect(at(1.0), gy, gx + gw - at(1.0), 4, withAlpha(Pal.orange, 0.5f))
        Font.draw(pm, text.early, gx, gy + 6, withAlpha(Pal.dim, 0.7f))
        Font.draw(pm, text.late, gx + gw - Font.width(text.late), gy + 6, withAlpha(Pal.dim, 0.7f))
        if (t - lastHitAt < 2.5) {
            val cx = at(lastOffset.coerceIn(-0.5, 1.5))
            pm.rect(cx - 1, gy - 3, 3, 10, Pal.bone)
            val msOff = (lastOffset * g.beatMs).toInt()
            Font.drawCentered(pm, "${if (msOff > 0) "+" else ""}$msOff MS", pm.w / 2, gy + 6, Pal.ink)
        }

        // Energy lamps.
        Font.draw(pm, "${"ÉNERGIE".takeIf { text.lang == FR } ?: "ENERGY"}", 6, 128, withAlpha(Pal.dim, 0.7f))
        for (e in 0..MAX_ENERGY) pm.rect(6 + e * 7, 137, 5, 3, if (e <= energy) col else Pal.line)

        // Shouts rise and fade over the band.
        shouts.removeAll { t - it.at > 1.2 }
        for (s in shouts) {
            val age = t - s.at
            val y = 100 - (age * 18).toInt()
            val c = when (s.grade) { Grade.PERFECT -> Pal.gold; Grade.GOOD -> Pal.lime; Grade.LATE -> Pal.orange; Grade.MISS -> Pal.red }
            val a = (1 - age / 1.2).toFloat()
            Font.drawCentered(pm, s.word, pm.w / 2, y, withAlpha(c, a), 2, shadow = withAlpha(Pal.black, a * 0.7f))
            if (s.pts > 0) Font.drawCentered(pm, "+${s.pts}", pm.w / 2, y + 16, withAlpha(Pal.bone, a))
            if (s.spicy > 0) Font.drawCentered(pm, "${text.spicy} ×${s.spicy}", pm.w / 2, y + 25, withAlpha(Pal.red, a))
        }

        // Keyboard strip: the keys you hold, coloured by what they are.
        pm.keyboard(r.keys, 0, pm.h - 30, pm.w, 30)

        particles.draw(pm, t)
        bubbles.removeAll { t > it.until }
        bubbles.forEach { pm.bubble(it, t) }

        // An achievement unlocked mid-set: a Polaroid slides in.
        if (toast == null && toastQueue.isNotEmpty() && t - toastAt > 0.5) { toast = toastQueue.removeFirst(); toastAt = t; fx += Fx.Sound(Sfx.CHIME) }
        toast?.let { id ->
            val age = t - toastAt
            if (age > 3.2) { toast = null; toastAt = t } else {
                val a = ACH_BY_ID.getValue(id)
                val slide = if (age < 0.25) ((0.25 - age) * 400).toInt() else if (age > 2.9) ((age - 2.9) * 400).toInt() else 0
                polaroidToast(pm, if (text.lang == FR) a.nameFr else a.name, pm.w - 76 + slide, 44, t)
            }
        }

        if (t < flashUntil) pm.wash(withAlpha(flashColor, 0.18f))
        pm.ox = 0; pm.oy = 0
        pm.vignette(0.45f)
    }

    private fun guestGhost(style: io.chordtrainer.ghostjam.core.StyleId) = when (style) {
        io.chordtrainer.ghostjam.core.StyleId.SWING -> GhostId.JOE.ordinal
        io.chordtrainer.ghostjam.core.StyleId.BOSSA -> GhostId.RICO.ordinal
        io.chordtrainer.ghostjam.core.StyleId.LOFI -> GhostId.NOODLES.ordinal
        io.chordtrainer.ghostjam.core.StyleId.BALLAD -> GhostId.MAESTRO.ordinal
        io.chordtrainer.ghostjam.core.StyleId.FUNK -> GhostId.TONY.ordinal
        io.chordtrainer.ghostjam.core.StyleId.REGGAE -> GhostId.PAT.ordinal
    }

    private fun polaroidToast(pm: Pixmap, name: String, x: Int, y: Int, t: Double) {
        pm.rect(x, y, 70, 64, Pal.paper)
        pm.rect(x + 4, y + 4, 62, 40, Pal.sky)
        pm.ghost(GhostId.KEV, x + 26, y + 8, t, level = 4)
        pm.sprite(Spr.star, x + 8, y + 8, Pal.gold); pm.sprite(Spr.star, x + 56, y + 30, Pal.gold)
        Font.wrap(name.uppercase(), 64).take(2).forEachIndexed { i, l -> Font.drawCentered(pm, l, x + 35, y + 47 + i * 8, Pal.pupil) }
    }
}

fun Pixmap.drumSticks(x: Int, y: Int, hit: Float) {
    val lift = ((1 - hit) * 6).toInt()
    line(x, y, x + 10, y - 8 - lift, Pal.paper); line(x + 20, y, x + 10, y - 8 - lift, Pal.paper)
}

// A piano strip from C2 to C7, filling the width.
fun Pixmap.keyboard(keys: Map<Int, Role>, x: Int, y: Int, kw: Int, kh: Int) {
    val low = 36; val high = 96
    val black = setOf(1, 3, 6, 8, 10)
    val whites = (low..high).filter { it % 12 !in black }
    val w = kw.toFloat() / whites.size
    fun roleColor(r: Role?) = when (r) { Role.TONE -> Pal.cyan; Role.COLOUR -> Pal.gold; Role.WRONG -> Pal.red; null -> null }
    rect(x, y - 1, kw, kh + 1, Pal.pupil)
    whites.forEachIndexed { i, m ->
        val c = roleColor(keys[m])
        rect(x + (i * w).toInt() + 1, y, w.toInt() - 1, kh, c ?: Pal.bone)
        if (c != null) glow(x + (i * w).toInt() + w.toInt() / 2, y, 10, withAlpha(c, 0.6f))
    }
    for (m in low..high) if (m % 12 in black) {
        val i = whites.indexOfLast { it < m } + 1
        val c = roleColor(keys[m])
        rect(x + (i * w - w * 0.3f).toInt(), y, (w * 0.6f).toInt().coerceAtLeast(2), kh * 6 / 10, c ?: Pal.pupil)
    }
    // C markers so you can find your place.
    whites.forEachIndexed { i, m -> if (m % 12 == 0) set(x + (i * w).toInt() + 2, y + kh - 3, Pal.paperDark) }
}
