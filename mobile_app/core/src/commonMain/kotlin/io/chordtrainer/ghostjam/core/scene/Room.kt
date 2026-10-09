// Room 7, the attic. The hub of the game: everything here can be touched,
// and most things answer. The piano opens the set list, the alarm clock
// tunes you in, Kev holds the cable, the elevator is out of order (for now).
//
// It also hides a few secrets. They are in the code below, not listed here:
// this repo is public and the players should find them.

package io.chordtrainer.ghostjam.core.scene

import io.chordtrainer.ghostjam.core.Egg
import io.chordtrainer.ghostjam.core.Progress
import io.chordtrainer.ghostjam.core.pix.Font
import io.chordtrainer.ghostjam.core.pix.GhostId
import io.chordtrainer.ghostjam.core.pix.Pal
import io.chordtrainer.ghostjam.core.pix.Pixmap
import io.chordtrainer.ghostjam.core.pix.Pixmap.Companion.withAlpha
import io.chordtrainer.ghostjam.core.pix.Spr
import io.chordtrainer.ghostjam.core.pix.ghost
import io.chordtrainer.ghostjam.core.pix.hash
import io.chordtrainer.ghostjam.core.pix.sprite
import kotlin.math.sin

// What the app tells the room each frame.
class Env {
    var hour = 21
    var epochDays = 20_000.0
    var month = 10
    var day = 9
    var midiName: String? = null
    var scanning = false
    var radioOn = false
    var beat = 0.0            // radio beat, for the bobbing
}

class Room(val text: Text, val progress: Progress, val env: Env) : Scene() {
    private val storm = Storm()
    private val particles = Particles()
    private val bubbles = mutableListOf<Bubble>()
    private var lightsOut = false
    private var purpleUntil = 0.0
    private var scaredUntil = 0.0
    private var moonTaps = 0
    private var batFlightAt = -100.0
    private var elevatorShakeUntil = 0.0
    private var noodlesAwakeUntil = 0.0
    private var jump = mutableMapOf<GhostId, Double>()
    private var now = 0.0
    private var birthdayUntil = 0.0

    private val secretFermata = "fermata-attic"
    private val secretBat = "bat"
    private val secretMouse = "mouse"
    private val secretVelvet = "velvet-moon"

    private fun say(text: String, x: Int, y: Int, secs: Double = 2.2) {
        bubbles.removeAll { it.x == x }
        bubbles += Bubble(text, x, y, now + secs)
    }

    private fun secret(id: String) {
        if (progress.secrets.add(id)) { fx += Fx.Secret(id); fx += Fx.Sound(Sfx.CHIME) }
    }

    private fun jumpOf(id: GhostId) = ((jump[id] ?: -9.0) - now).let { if (it > 0) (sin(it * 20) * 3).toInt() else 0 }

    // Keys played at the piano, outside a set.
    fun keys(eggs: List<Egg>, midi: Int) {
        particles.add(Particle(200.0 + (midi % 24) * 2.5, 100.0, 0.0, -18.0, now, 1.6, Pal.pinkSoft, kind = 1))
        for (e in eggs) when (e) {
            Egg.TRITONE -> { storm.strike(now); fx += Fx.Sound(Sfx.THUNDER); fx += Fx.Haptic(true); secret("storm") }
            Egg.CLUSTER -> { scaredUntil = now + 1.2; GhostId.entries.forEach { jump[it] = now + 0.5 }; fx += Fx.Haptic(true); secret("palm") }
            Egg.BIRTHDAY -> { birthdayUntil = now + 6; secret("birthday"); fx += Fx.Sound(Sfx.CHIME) }
            Egg.SHAVE -> { say("TWO BITS!", ghostX(GhostId.DEZ) + 9, 92); jump[GhostId.DEZ] = now + 0.4; secret("shave") }
            Egg.TRISTAN -> { purpleUntil = now + 8; secret("tristan") }
            Egg.BACKDOOR -> { elevatorShakeUntil = now + 1.5; fx += Fx.Sound(Sfx.RATTLE); secret("backdoor") }
            Egg.LOW -> { noodlesAwakeUntil = now + 3; say("!", 58, 136) }
        }
    }

    private fun ghostX(id: GhostId) = when (id) {
        GhostId.DEZ -> x0 + 162; GhostId.LENNY -> x0 + 280; GhostId.MARCO -> x0 + 190; else -> x0
    }

    private var x0 = 0

    override fun draw(pm: Pixmap, t: Double) {
        now = t
        x0 = (pm.w - 360) / 2
        val floorY = 150
        if (storm.natural(t)) { storm.strike(t); fx += Fx.Sound(Sfx.THUNDER) }

        pm.attic(t, floorY)
        val full = moonPhase(env.epochDays).let { it in 0.47..0.53 }

        // Window, top left of the gable.
        val wx = x0 + 128; val wy = 42
        pm.window(wx, wy, 20, t, moonPhase(env.epochDays), storm, velvet = full)
        hot(wx - 20, wy - 20, 40, 40) {
            moonTaps++
            if (full) { secret(secretVelvet); say("…", wx, wy - 18) }
            if (moonTaps == 7) { batFlightAt = now; secret(secretBat); fx += Fx.Sound(Sfx.WHOOSH) }
        }

        // The bat hangs from the cross beam until it leaves.
        val batAge = t - batFlightAt
        if (batAge in 0.0..4.0) {
            val bx = x0 + 60 + (batAge * 70).toInt(); val by = 60 + (sin(batAge * 9) * 10).toInt() - (batAge * 8).toInt()
            pm.sprite(Spr.bat, bx, by, Pal.pupil)
        } else if (moonTaps < 7) pm.sprite(Spr.batFold, x0 + 60, 75, Pal.pupil)

        // Calendar: this floor's year.
        val cx = x0 + 8; val cy = 80
        pm.rect(cx, cy, 22, 26, Pal.paper); pm.rect(cx, cy, 22, 6, Pal.red)
        Font.drawCentered(pm, "OCT", cx + 11, cy + 9, Pal.pupil)
        Font.drawCentered(pm, "2026", cx + 11, cy + 18, Pal.pupil)
        pm.set(cx + 5, cy - 1, Pal.metal); pm.set(cx + 16, cy - 1, Pal.metal)

        // The poster: DEAD RINGERS, torn. Clearer as the band remembers.
        val px = x0 + 38; val py = 80
        pm.rect(px, py, 46, 40, Pal.pupil)
        pm.frame(px, py, 46, 40, Pal.line)
        val mem = progress.memory(GhostId.DEZ)
        Font.drawCentered(pm, "DEAD", px + 23, py + 4, withAlpha(Pal.pink, 0.4f + mem * 0.12f))
        Font.drawCentered(pm, "RINGERS", px + 23, py + 13, withAlpha(Pal.pink, 0.4f + mem * 0.12f))
        Font.drawCentered(pm, if (mem >= 3) "NYE 1999" else "NYE 19", px + 23, py + 24, withAlpha(Pal.cyan, 0.3f + mem * 0.12f))
        if (mem < 3) for (k in 0..9) pm.rect(px + 30 + k, py + 22 + k, 46 - 30 - k, 1, Pal.wall)   // torn corner
        hot(px, py, 46, 40) { say(if (mem >= 3) "31·12·1999" else "?", px + 23, py) }

        // Polaroids on a string, right of the poster: one per achievement.
        val got = progress.achievements.size
        val gx0 = px + 52
        pm.line(gx0, 80, gx0 + 20, 84, Pal.paperDark); pm.line(gx0 + 20, 84, gx0 + 42, 80, Pal.paperDark)
        for (k in 0..2) {
            val qx = gx0 + 2 + k * 14; val qy = 82 + if (k == 1) 3 else 1
            val sway = (sin(t * 1.3 + k) * 0.8).toInt()
            pm.rect(qx + sway, qy, 11, 13, Pal.paper)
            pm.rect(qx + 1 + sway, qy + 1, 9, 8, if (k < got) Pal.sky else Pal.paperDark)
            if (k < got) pm.sprite(Spr.mini, qx + 2 + sway, qy + 2, GhostId.entries[k + 1].color)
            pm.set(qx + 5 + sway, qy - 1, Pal.red)
        }
        hot(gx0, 78, 44, 20) { fx += Fx.Go(Place.POLAROIDS) }

        // Hidden fermata in the planks, near the window.
        val fx0 = x0 + 96; val fy0 = 118
        pm.sprite(Spr.fermata, fx0, fy0, withAlpha(Pal.wallDark, if (secretFermata in progress.secrets) 1f else 0.9f))
        if (secretFermata in progress.secrets) pm.set(fx0 + 3, fy0 + 2, Pal.gold)
        hot(fx0 - 2, fy0 - 2, 11, 7) { secret(secretFermata); particles.burst(fx0 + 3, fy0, now, 8, Pal.gold, kind = 3) }

        // Shelf with the jar of ectoplasm.
        val sx = x0 + 12; val sy = 112
        pm.rect(sx - 4, sy + 14, 30, 3, Pal.woodLight)
        pm.rect(sx, sy, 14, 14, withAlpha(Pal.bone, 0.18f)); pm.frame(sx, sy, 14, 14, withAlpha(Pal.bone, 0.5f))
        pm.rect(sx + 2, sy - 2, 10, 2, Pal.metal)
        val level = (progress.ecto / 25).coerceIn(0, 12)
        pm.rect(sx + 1, sy + 13 - level, 12, level, Pal.ecto)
        if (level > 0) pm.glow(sx + 7, sy + 13 - level / 2, 14, withAlpha(Pal.ecto, 0.35f))
        hot(sx - 4, sy - 4, 30, 22) { say("${progress.ecto} ${text.ecto}", sx + 7, sy - 2) }

        // A worn rug in front of the piano, and what the band left on the floor.
        val rugX = x0 + 196
        pm.rect(rugX, floorY + 6, 92, 14, Pal.redDark)
        pm.frame(rugX + 2, floorY + 8, 88, 10, withAlpha(Pal.gold, 0.5f))
        for (k in 0 until 10) pm.set(rugX + 8 + k * 8, floorY + 13, withAlpha(Pal.gold, 0.6f))
        for (k in 0 until 92 step 3) pm.set(rugX + k, floorY + 20, Pal.paperDark)
        pm.sprite(Spr.can, x0 + 176, floorY - 4, Pal.bone)
        pm.sprite(Spr.canDown, x0 + 296, floorY + 10, Pal.bone)
        pm.rect(x0 + 150, floorY + 14, 10, 7, Pal.paper); pm.hline(x0 + 151, x0 + 158, floorY + 16, Pal.paperDark); pm.hline(x0 + 151, x0 + 157, floorY + 18, Pal.paperDark)

        // Mattress and Noodles, asleep (or briefly not).
        val mx = x0 + 32; val my = floorY - 6
        pm.rect(mx, my, 56, 8, Pal.paperDark); pm.rect(mx, my, 56, 2, Pal.paper)
        pm.rect(mx + 2, my - 3, 14, 4, Pal.paper)
        val awake = t < noodlesAwakeUntil
        pm.ghost(GhostId.NOODLES, mx + 14, my - 19 + if (awake) -4 else 0, if (awake) t else 0.0, level = maxOf(2, progress.memory(GhostId.NOODLES)))
        if (!awake) for (k in 0..2) {
            val zt = (t * 0.6 + k / 3.0) % 1.0
            pm.sprite(Spr.zzz, mx + 32 + (zt * 10).toInt(), my - 20 - (zt * 22).toInt(), withAlpha(Pal.bone, (1 - zt).toFloat()))
        }
        hot(mx + 10, my - 20, 30, 24) {
            noodlesAwakeUntil = now + 2.5
            say(GHOST_LINES.getValue("NOODLES"), mx + 23, my - 22)
            fx += Fx.Sound(Sfx.SNORE)
        }

        // The bulb, and the light it throws.
        val purple = t < purpleUntil
        val red = env.hour == 3
        val tint = when { purple -> Pal.violet; red -> Pal.red; else -> Pal.warm }
        val (bx, by) = pm.bulb(x0 + 214, t, !lightsOut, tint)
        if (!lightsOut) pm.dust(bx, by + 40, 40, t)
        hot(bx - 8, by - 6, 16, 16) {
            lightsOut = !lightsOut
            fx += Fx.Sound(Sfx.TICK)
            if (lightsOut) secret("lights-out")
        }

        // The piano, the clock on it, the band around it.
        val pianoX = x0 + 204; val pianoY = 98
        val bob = { id: GhostId -> if (env.radioOn) (sin(env.beat * PI2) * 1.5).toInt() else (sin(t * 1.4 + id.ordinal) * 1.5).toInt() }
        // Dez and Marco float behind the piano.
        pm.ghost(GhostId.DEZ, x0 + 162, 96 + bob(GhostId.DEZ) - jumpOf(GhostId.DEZ), t, level = progress.memory(GhostId.DEZ), lookLeft = t < scaredUntil)
        pm.ghost(GhostId.MARCO, x0 + 190, 70 + bob(GhostId.MARCO) - jumpOf(GhostId.MARCO), t, level = progress.memory(GhostId.MARCO))
        pm.piano(pianoX, pianoY, t, env.midiName != null)
        pm.alarmClock(pianoX + 4, pianoY - 13)
        pm.sprite(Spr.bottle, pianoX + 52, pianoY - 10, Pal.bone)
        if (t < birthdayUntil) {
            // A cake shows up for the occasion.
            pm.rect(pianoX + 34, pianoY - 6, 12, 6, Pal.pinkSoft); pm.rect(pianoX + 34, pianoY - 7, 12, 1, Pal.bone)
            pm.rect(pianoX + 39, pianoY - 10, 1, 3, Pal.paper); pm.set(pianoX + 39, pianoY - 11, Pal.orange)
            if (((t * 4).toInt()) % 3 == 0) particles.add(Particle(pianoX + 20.0 + hash((t * 10).toInt()) % 40, 70.0, 0.0, -12.0, t, 1.5, Pal.gold, kind = 1))
        }
        // Lenny leans on the piano's side.
        pm.ghost(GhostId.LENNY, x0 + 280, 100 + bob(GhostId.LENNY) - jumpOf(GhostId.LENNY), t, level = progress.memory(GhostId.LENNY), lookLeft = true)
        hot(pianoX, pianoY - 4, 74, 40) { fx += Fx.Sound(Sfx.DING); fx += Fx.Go(Place.SETUP) }
        hot(pianoX + 2, pianoY - 16, 28, 14) { fx += Fx.Go(Place.TUNE_IN) }
        for ((id, gx, gy) in listOf(Triple(GhostId.DEZ, x0 + 162, 96), Triple(GhostId.MARCO, x0 + 190, 70), Triple(GhostId.LENNY, x0 + 280, 100))) {
            hot(gx + 2, gy + 5, 14, 14) {
                jump[id] = now + 0.4
                val m = progress.memory(id)
                say(if (m >= 3) GHOST_LINES.getValue(id.name) else "…", gx + 9, gy + 4)
            }
        }

        // Kev comes up through the floor hatch with the cable.
        val hx = x0 + 120; val hy = floorY + 8
        pm.rect(hx, hy, 28, 6, Pal.deep); pm.frame(hx - 1, hy - 1, 30, 8, Pal.woodLight)
        val connected = env.midiName != null
        val kevY = hy - 14 + (sin(t * 2) * 1).toInt() - jumpOf(GhostId.KEV)
        pm.ghost(GhostId.KEV, hx + 5, kevY - 5, t, level = progress.memory(GhostId.KEV))
        pm.rect(hx - 1, hy + 1, 30, 7, Pal.floor); pm.rect(hx, hy + 1, 28, 3, Pal.deep)   // the hatch hides his tail
        // The cable runs from Kev to the piano.
        if (connected) pm.line(hx + 22, kevY + 10, pianoX + 75, pianoY + 31, Pal.pupil)
        else { pm.line(hx + 22, kevY + 10, hx + 30, kevY + 2, Pal.pupil); pm.rect(hx + 29, kevY + 1, 3, 3, Pal.metal) }
        hot(hx, kevY - 4, 28, 22) {
            jump[GhostId.KEV] = now + 0.4
            if (connected) say(env.midiName!!.uppercase().take(18), hx + 14, kevY)
            else { say(if (env.scanning) text.searching else GHOST_LINES.getValue("KEV"), hx + 14, kevY); fx += Fx.ScanBluetooth }
        }

        // Radio on a crate, far right.
        val rx = x0 + 302; val ry = floorY - 22
        pm.rect(rx - 2, ry + 12, 24, 10, Pal.woodLight); pm.rect(rx - 2, ry + 15, 24, 1, Pal.woodDark)
        pm.rect(rx, ry, 20, 12, Pal.redDark); pm.frame(rx, ry, 20, 12, Pal.wood)
        pm.dither(rx + 2, ry + 2, 8, 8, Pal.wood)
        pm.disc(rx + 15, ry + 6, 2, if (env.radioOn) Pal.gold else Pal.metal)
        pm.line(rx + 17, ry, rx + 23, ry - 9, Pal.metal)
        if (env.radioOn) {
            pm.glow(rx + 15, ry + 6, 8, withAlpha(Pal.gold, 0.5f))
            if (((t * 3).toInt()) % 2 == 0 && hash((t * 3).toInt()) % 3 == 0) particles.add(Particle(rx + 8.0, ry - 2.0, -6.0, -14.0, t, 1.4, Pal.cyan, kind = 1))
        }
        hot(rx - 2, ry - 8, 26, 30) { fx += Fx.Radio; fx += Fx.Sound(Sfx.STATIC) }

        // The elevator gate, far right wall. Out of order.
        val ex = x0 + 334; val ey = 80
        val shake = if (t < elevatorShakeUntil) (sin(t * 60) * 1.5).toInt() else 0
        pm.rect(ex - 4, ey - 4, 26, floorY - ey + 4, Pal.beam)
        pm.rect(ex, ey, 18, floorY - ey, Pal.deep)
        for (k in 0..5) pm.vline(ex + 1 + k * 3 + shake, ey, floorY - 1, Pal.gold)
        for (k in 0 until (floorY - ey) / 8) { pm.line(ex + shake, ey + k * 8, ex + 17 + shake, ey + k * 8 + 8, withAlpha(Pal.gold, 0.6f)) }
        // Dial: the needle points at the top floor.
        pm.disc(ex + 9, ey - 12, 6, Pal.gold); pm.disc(ex + 9, ey - 12, 5, Pal.pupil)
        pm.line(ex + 9, ey - 12, ex + 9 + if (t < elevatorShakeUntil) (sin(t * 30) * 4).toInt() else 4, ey - 16, Pal.red)
        // Tape across it.
        pm.line(ex - 3, ey + 20, ex + 20, ey + 40, Pal.goldLight); pm.line(ex - 3, ey + 21, ex + 20, ey + 41, Pal.goldLight)
        pm.line(ex + 20, ey + 20, ex - 3, ey + 40, Pal.goldLight); pm.line(ex + 20, ey + 21, ex - 3, ey + 41, Pal.goldLight)
        hot(ex - 4, ey - 18, 26, floorY - ey + 18) { elevatorShakeUntil = now + 0.6; fx += Fx.Sound(Sfx.RATTLE); say(text.outOfOrder, ex + 4, ey + 10) }

        // The mouse peeks out of its hole now and then.
        val holeX = x0 + 98
        pm.rect(holeX, floorY - 5, 6, 5, Pal.deep); pm.rect(holeX + 1, floorY - 6, 4, 1, Pal.deep)
        val mousePhase = t % 29.0
        if (mousePhase in 10.0..13.0) {
            pm.sprite(Spr.mouse, holeX - 4, floorY - 5, Pal.bone)
            hot(holeX - 6, floorY - 10, 14, 12) { secret(secretMouse); fx += Fx.Sound(Sfx.SQUEAK) }
        }

        particles.draw(pm, t)

        // Lights out: only the eyes, the clock and the jar stay.
        if (lightsOut) {
            pm.wash(withAlpha(Pal.black, 0.82f))
            for ((gx, gy) in listOf(x0 + 162 to 96, x0 + 190 to 70, x0 + 280 to 100)) {
                pm.rect(gx + 6, gy + 10, 1, 2, Pal.bone); pm.rect(gx + 12, gy + 10, 1, 2, Pal.bone)
            }
            pm.alarmClock(pianoX + 4, pianoY - 13)
            pm.glow(bx, by + 2, 6, withAlpha(Pal.dim, 0.4f))
            hot(bx - 8, by - 6, 16, 16) { lightsOut = false; fx += Fx.Sound(Sfx.TICK) }
        }
        if (red && !lightsOut) pm.wash(withAlpha(Pal.red, 0.12f))
        val flash = storm.flash(t)
        if (flash > 0f) pm.wash(withAlpha(Pal.bone, flash * 0.5f))

        pm.vignette()

        // Room plate, top left.
        Font.draw(pm, text.room, 6, 6, withAlpha(Pal.dim, 0.8f))
        bubbles.removeAll { t > it.until }
        bubbles.forEach { pm.bubble(it, t) }
    }

    companion object { const val PI2 = 6.283185307179586 }
}

private const val PI = 3.141592653589793
