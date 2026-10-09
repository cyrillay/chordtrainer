// Furniture and effects shared by the scenes: the attic itself, the piano,
// the alarm clock stuck on 23:59, speech bubbles, particles, the storm.

package io.chordtrainer.ghostjam.core.scene

import io.chordtrainer.ghostjam.core.pix.Font
import io.chordtrainer.ghostjam.core.pix.Pal
import io.chordtrainer.ghostjam.core.pix.Pixmap
import io.chordtrainer.ghostjam.core.pix.Pixmap.Companion.withAlpha
import io.chordtrainer.ghostjam.core.pix.Segments
import io.chordtrainer.ghostjam.core.pix.Spr
import io.chordtrainer.ghostjam.core.pix.hash
import io.chordtrainer.ghostjam.core.pix.hashF
import io.chordtrainer.ghostjam.core.pix.sprite
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

// ---- The attic: plank walls under an A-frame roof ----

fun Pixmap.attic(t: Double, floorY: Int = 150) {
    clear(Pal.wall)
    // Vertical planks with knots.
    var x = 0
    var i = 0
    while (x < w) {
        val pw = 9 + hash(i) % 4
        rect(x, 0, 1, floorY, Pal.wallDark)
        if (hash(i * 7) % 3 == 0) rect(x + 2, 0, pw - 3, floorY, Pal.wallLight.let { withAlpha(it, 0.35f) })
        if (hash(i * 13) % 4 == 0) disc(x + pw / 2, 20 + hash(i * 3) % 100, 1, Pal.wallDark)
        x += pw; i++
    }
    // The roof slopes in from both sides.
    val mid = w / 2
    for (y in 0 until 70) {
        val reach = mid - 40 - (y * 2.2).toInt()
        if (reach > 0) {
            rect(0, y, reach, 1, Pal.deep)
            rect(w - reach, y, reach, 1, Pal.deep)
        }
    }
    // Beams along the slopes and one across.
    for (k in 0..1) {
        line(mid - 40, 0, mid - 40 - 154, 70, Pal.beam); line(mid - 40, 1, mid - 40 - 154, 71, Pal.beamLight)
        line(mid + 40, 0, mid + 40 + 154, 70, Pal.beam); line(mid + 40, 1, mid + 40 + 154, 71, Pal.beamLight)
    }
    rect(0, 70, w, 5, Pal.beam)
    rect(0, 70, w, 1, Pal.beamLight)
    for (bx in 0 until w step 46) rect(bx + 20, 75, 4, floorY - 75, withAlpha(Pal.beam, 0.6f))
    // Floor boards.
    rect(0, floorY, w, h - floorY, Pal.floor)
    rect(0, floorY, w, 2, Pal.woodDark)
    for (fy in floorY + 6 until h step 7) rect(0, fy, w, 1, Pal.woodDark)
    for (k in 0 until w / 23) rect((k * 23 + (k % 3) * 7) % w, floorY + 2 + (k % 4) * 7, 1, 6, Pal.woodDark)
    // A cobweb in the top-left corner of the room.
    for (r in 4..16 step 6) for (a in 0..6) {
        val ang = a * PI / 12
        set(mid - 46 - (cos(ang) * r).toInt() + 6, 76 + (sin(ang) * r).toInt(), withAlpha(Pal.dim, 0.5f))
    }
}

// ---- Round window with the night outside ----

class Storm {
    var flashUntil = 0.0
    fun strike(t: Double) { flashUntil = t + 0.35 }
    // A natural strike every so often.
    fun natural(t: Double): Boolean = (t % 37.0) in 21.0..21.05
    fun flash(t: Double): Float = if (t < flashUntil) (((flashUntil - t) / 0.35).toFloat()) else 0f
}

fun Pixmap.window(cx: Int, cy: Int, r: Int, t: Double, moonPhase: Double, storm: Storm, velvet: Boolean) {
    disc(cx, cy, r + 3, Pal.woodDark)
    disc(cx, cy, r + 1, Pal.woodLight)
    val f = storm.flash(t)
    disc(cx, cy, r, if (f > 0.5f) Pal.bone else Pal.sky)
    // Stars twinkle.
    for (k in 0 until 14) {
        val sx = cx - r + hash(k) % (2 * r); val sy = cy - r + hash(k * 5) % (2 * r)
        if ((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy) < (r - 2) * (r - 2) && ((t * 3).toInt() + k) % 5 != 0) set(sx, sy, Pal.dim)
    }
    // The moon, phased like the real one tonight.
    val mx = cx + r / 3; val my = cy - r / 3
    disc(mx, my, 5, Pal.moon)
    // Waxing: lit on the right, the shadow slides off to the left.
    val full = 1 - kotlin.math.abs(moonPhase - 0.5) * 2
    val shift = (11 * full).toInt() * if (moonPhase < 0.5) -1 else 1
    if (kotlin.math.abs(shift) < 11) disc(mx + shift, my, 5, Pal.sky)
    // On a full moon, someone stands against it.
    if (velvet) { rect(mx - 1, my - 2, 3, 5, Pal.pink); set(mx, my - 3, Pal.pink) }
    // Rain.
    for (k in 0 until 26) {
        val rx = cx - r + ((hash(k) % (2 * r)) + (t * 30).toInt()) % (2 * r)
        val ry = cy - r + ((hash(k * 3) % (2 * r)) + (t * 90).toInt()) % (2 * r)
        if ((rx - cx) * (rx - cx) + (ry - cy) * (ry - cy) < r * r - 4) { set(rx, ry, withAlpha(Pal.cyan, 0.5f)); set(rx - 1, ry - 2, withAlpha(Pal.cyan, 0.3f)) }
    }
    // Lightning bolt.
    if (f > 0.3f) {
        var lx = cx - 4; var ly = cy - r
        while (ly < cy + r - 4) { val nx = lx + (hash(ly + (storm.flashUntil * 10).toInt()) % 7) - 3; line(lx, ly, nx, ly + 4, Pal.bone); lx = nx; ly += 4 }
    }
    // Cross bars.
    hline(cx - r, cx + r, cy, Pal.woodLight); vline(cx, cy - r, cy + r, Pal.woodLight)
}

// ---- The bare bulb on its cord ----

fun Pixmap.bulb(cx: Int, t: Double, on: Boolean, tint: Int = Pal.warm): Pair<Int, Int> {
    val swing = sin(t * 0.9) * 3
    val bx = cx + swing.toInt(); val by = 40
    line(cx, 0, bx, by - 3, Pal.metal)
    rect(bx - 2, by - 3, 5, 3, Pal.metal)
    if (on) {
        glow(bx, by + 2, 90, withAlpha(tint, 0.30f))
        glow(bx, by + 2, 30, withAlpha(tint, 0.45f))
    }
    disc(bx, by + 2, 3, if (on) Pal.bone else Pal.metal)
    if (on) set(bx - 1, by + 1, Pal.goldLight)
    return bx to by
}

// ---- The upright piano, with the alarm clock on top ----

fun Pixmap.piano(x: Int, y: Int, t: Double, midiOn: Boolean, candle: Boolean = true) {
    val w0 = 74
    rect(x, y, w0, 44, Pal.wood)
    rect(x, y, w0, 2, Pal.woodLight)
    rect(x + 3, y + 5, w0 - 6, 18, Pal.woodDark)
    // Carved panel and the brand plate.
    frame(x + 6, y + 7, w0 - 12, 14, Pal.woodLight)
    Font.drawCentered(this, "HOTEL", x + w0 / 2, y + 11, Pal.gold)
    // Keys.
    rect(x - 2, y + 26, w0 + 4, 9, Pal.woodLight)
    rect(x, y + 27, w0, 7, Pal.bone)
    for (k in 0 until w0 step 3) vline(x + k, y + 27, y + 33, Pal.paperDark)
    for (k in 0 until w0 / 3) if (k % 7 !in setOf(2, 6)) rect(x + k * 3 + 2, y + 27, 2, 4, Pal.pupil)
    // Legs and pedals.
    rect(x + 2, y + 35, 4, 19, Pal.woodDark); rect(x + w0 - 6, y + 35, 4, 19, Pal.woodDark)
    rect(x + w0 / 2 - 6, y + 50, 3, 2, Pal.gold); rect(x + w0 / 2 + 3, y + 50, 3, 2, Pal.gold)
    // Sheet music on the stand.
    rect(x + 22, y - 12, 26, 13, Pal.paper)
    for (l in 0..2) hline(x + 24, x + 45, y - 9 + l * 3, Pal.paperDark)
    Spr.note.let { sprite(it, x + 28, y - 11, Pal.pupil) }
    // MIDI socket on the side: green when a keyboard is in, red when not.
    rect(x + w0, y + 30, 3, 3, Pal.metal)
    set(x + w0 + 1, y + 31, if (midiOn) Pal.lime else if ((t * 2).toInt() % 2 == 0) Pal.red else Pal.redDark)
    // A candle that flickers.
    if (candle) {
        rect(x + 62, y - 7, 3, 7, Pal.paper)
        val fl = (sin(t * 13) + sin(t * 7.3)).toFloat()
        glow(x + 63, y - 10, 10, withAlpha(Pal.orange, 0.4f + 0.1f * fl))
        set(x + 63, y - 9, Pal.goldLight); set(x + 63, y - 10 + if (fl > 0.6f) -1 else 0, Pal.orange)
    }
}

// The alarm clock. The colon never blinks.
fun Pixmap.alarmClock(x: Int, y: Int, glowOn: Boolean = true) {
    rect(x, y, 27, 13, Pal.pupil)
    frame(x, y, 27, 13, Pal.metal)
    rect(x + 2, y - 2, 3, 2, Pal.metal); rect(x + 22, y - 2, 3, 2, Pal.metal)
    if (glowOn) glow(x + 13, y + 6, 18, withAlpha(Pal.red, 0.25f))
    Segments.draw(this, "23:59", x + 3, y + 3, Pal.red, withAlpha(Pal.red, 0.12f), scale = 1)
}

// ---- Speech bubbles ----

class Bubble(val text: String, val x: Int, val y: Int, val until: Double, val color: Int = Pal.pupil)

fun Pixmap.bubble(b: Bubble, t: Double) {
    if (t > b.until) return
    val lines = Font.wrap(b.text, 90)
    val bw = lines.maxOf { Font.width(it) } + 8
    val bh = lines.size * 9 + 5
    val bx = (b.x - bw / 2).coerceIn(2, w - bw - 2)
    val by = b.y - bh - 5
    rect(bx + 1, by, bw - 2, bh, Pal.bone); rect(bx, by + 1, bw, bh - 2, Pal.bone)
    rect(b.x - 1, by + bh, 3, 2, Pal.bone); set(b.x, by + bh + 2, Pal.bone)
    lines.forEachIndexed { i, s -> Font.drawCentered(this, s, bx + bw / 2, by + 3 + i * 9, b.color) }
}

// ---- Particles: dust, notes, ectoplasm, sparks ----

class Particle(var x: Double, var y: Double, val vx: Double, val vy: Double, val born: Double, val life: Double, val color: Int, val kind: Int = 0)

class Particles {
    val list = mutableListOf<Particle>()
    fun add(p: Particle) { if (list.size < 300) list += p }
    fun burst(x: Int, y: Int, t: Double, n: Int, color: Int, speed: Double = 40.0, kind: Int = 0) {
        repeat(n) { k ->
            val a = hashF(k * 31 + (t * 1000).toInt()) * 2 * PI
            val s = speed * (0.4 + hashF(k * 17 + (t * 777).toInt()))
            add(Particle(x.toDouble(), y.toDouble(), cos(a) * s, sin(a) * s - 20, t, 0.5 + hashF(k) * 0.6, color, kind))
        }
    }
    fun draw(pm: Pixmap, t: Double) {
        list.removeAll { t - it.born > it.life }
        for (p in list) {
            val age = t - p.born
            val x = (p.x + p.vx * age).toInt()
            val y = (p.y + p.vy * age + 40 * age * age).toInt()
            val a = (1 - age / p.life).toFloat()
            when (p.kind) {
                1 -> pm.sprite(Spr.note, x, (p.y + p.vy * age).toInt(), p.color, a)
                2 -> pm.sprite(Spr.drop, x, y, p.color, a)
                3 -> pm.sprite(Spr.star, x, y, p.color, a)
                else -> pm.set(x, y, withAlpha(p.color, a))
            }
        }
    }
}

// Dust motes drifting in a light.
fun Pixmap.dust(cx: Int, cy: Int, r: Int, t: Double) {
    for (k in 0 until 24) {
        val x = cx - r + ((hash(k) % (2 * r)) + (sin(t * 0.3 + k) * 6).toInt())
        val y = cy - r + (((hash(k * 7) % (2 * r)) + (t * (2 + k % 3)).toInt()) % (2 * r))
        set(x, y, withAlpha(Pal.warm, 0.35f + 0.25f * sin(t + k).toFloat()))
    }
}

// The moon's age as a fraction of the cycle: 0 new, 0.5 full.
fun moonPhase(epochDays: Double): Double {
    val synodic = 29.530588853
    val ref = 10956.77    // 2000-01-06 18:14 UTC, a new moon
    val f = ((epochDays - ref) / synodic) % 1.0
    return if (f < 0) f + 1 else f
}
