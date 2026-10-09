// A tiny software framebuffer: the whole game is drawn at low resolution
// (about 320×180) and the phone scales it up with no smoothing, so every
// pixel is a real pixel. Pure Kotlin, so scenes render the same in tests
// (as PNG snapshots) as on the phone. Colours are 0xAARRGGBB.

package io.chordtrainer.ghostjam.core.pix

import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sqrt

class Pixmap(val w: Int, val h: Int) {
    val px = IntArray(w * h)

    // Offset applied to every draw call: screen shake, camera.
    var ox = 0
    var oy = 0

    fun clear(c: Int) = px.fill(c or ALPHA)

    // Alpha-blended pixel.
    fun set(x: Int, y: Int, c: Int) {
        val xx = x + ox; val yy = y + oy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) return
        val a = c ushr 24
        if (a == 0) return
        val i = yy * w + xx
        px[i] = if (a == 255) c else blend(px[i], c, a)
    }

    fun get(x: Int, y: Int): Int = if (x in 0 until w && y in 0 until h) px[y * w + x] else 0

    fun rect(x: Int, y: Int, rw: Int, rh: Int, c: Int) {
        for (j in y until y + rh) for (i in x until x + rw) set(i, j, c)
    }

    fun frame(x: Int, y: Int, rw: Int, rh: Int, c: Int) {
        hline(x, x + rw - 1, y, c); hline(x, x + rw - 1, y + rh - 1, c)
        vline(x, y, y + rh - 1, c); vline(x + rw - 1, y, y + rh - 1, c)
    }

    fun hline(x0: Int, x1: Int, y: Int, c: Int) { for (x in minOf(x0, x1)..maxOf(x0, x1)) set(x, y, c) }
    fun vline(x: Int, y0: Int, y1: Int, c: Int) { for (y in minOf(y0, y1)..maxOf(y0, y1)) set(x, y, c) }

    fun line(x0: Int, y0: Int, x1: Int, y1: Int, c: Int) {
        var x = x0; var y = y0
        val dx = abs(x1 - x0); val dy = -abs(y1 - y0)
        val sx = if (x0 < x1) 1 else -1; val sy = if (y0 < y1) 1 else -1
        var err = dx + dy
        while (true) {
            set(x, y, c)
            if (x == x1 && y == y1) break
            val e2 = 2 * err
            if (e2 >= dy) { err += dy; x += sx }
            if (e2 <= dx) { err += dx; y += sy }
        }
    }

    fun disc(cx: Int, cy: Int, r: Int, c: Int) {
        for (y in -r..r) for (x in -r..r) if (x * x + y * y <= r * r + r) set(cx + x, cy + y, c)
    }

    // A soft light: alpha falls off with distance. Additive-ish over dark.
    fun glow(cx: Int, cy: Int, r: Int, c: Int, strength: Float = 1f) {
        val base = (c ushr 24) * strength
        for (y in -r..r) for (x in -r..r) {
            val d = sqrt((x * x + y * y).toFloat()) / r
            if (d >= 1f) continue
            val a = (base * (1f - d) * (1f - d)).roundToInt().coerceIn(0, 255)
            if (a > 0) set(cx + x, cy + y, (a shl 24) or (c and RGB))
        }
    }

    // Ordered 2x2 dither: fills half the pixels, the old-school way to fake a tone.
    fun dither(x: Int, y: Int, rw: Int, rh: Int, c: Int, phase: Int = 0) {
        for (j in y until y + rh) for (i in x until x + rw) if ((i + j + phase) % 2 == 0) set(i, j, c)
    }

    // Light cone from (x, y) down to a floor line, widening.
    fun cone(x: Int, y: Int, floorY: Int, halfWidth: Int, c: Int) {
        val hgt = floorY - y
        if (hgt <= 0) return
        for (j in 0..hgt) {
            val half = 2 + halfWidth * j / hgt
            val a = ((c ushr 24) * (0.35f + 0.65f * j / hgt)).roundToInt()
            hline(x - half, x + half, y + j, (a shl 24) or (c and RGB))
        }
    }

    // Darker corners, like an old lens.
    fun vignette(strength: Float = 0.55f) {
        val cx = w / 2f; val cy = h / 2f
        for (y in 0 until h) for (x in 0 until w) {
            val dx = (x - cx) / cx; val dy = (y - cy) / cy
            val d = (dx * dx * 0.7f + dy * dy * 0.9f)
            if (d > 0.35f) {
                val a = ((d - 0.35f) * strength * 255).roundToInt().coerceIn(0, 200)
                val i = y * w + x
                px[i] = blend(px[i], 0, a)
            }
        }
    }

    // Darken or tint everything already drawn.
    fun wash(c: Int) { val sx = ox; val sy = oy; ox = 0; oy = 0; rect(0, 0, w, h, c); ox = sx; oy = sy }

    companion object {
        const val ALPHA = 0xFF000000.toInt()
        const val RGB = 0x00FFFFFF

        fun blend(dst: Int, src: Int, a: Int): Int {
            val ia = 255 - a
            val r = (((src shr 16) and 255) * a + ((dst shr 16) and 255) * ia) / 255
            val g = (((src shr 8) and 255) * a + ((dst shr 8) and 255) * ia) / 255
            val b = ((src and 255) * a + (dst and 255) * ia) / 255
            return ALPHA or (r shl 16) or (g shl 8) or b
        }

        fun withAlpha(c: Int, a: Float): Int = ((a.coerceIn(0f, 1f) * 255).roundToInt() shl 24) or (c and RGB)
        fun rgb(hex: Int): Int = ALPHA or hex
    }
}

// Deterministic noise: the same dust, stars and rain on every frame.
fun hash(i: Int): Int {
    var x = i * 374761393 + 668265263
    x = (x xor (x ushr 13)) * 1274126177
    return x xor (x ushr 16)
}
fun hashF(i: Int): Float = (hash(i) and 0xFFFF) / 65535f
