// The set list, taped to the piano's music stand: pick a groove, a tune,
// a key, a tempo, then drop a coin.

package io.chordtrainer.ghostjam.core.scene

import io.chordtrainer.ghostjam.core.NOTE_DISPLAY
import io.chordtrainer.ghostjam.core.NOTE_NAMES
import io.chordtrainer.ghostjam.core.Progress
import io.chordtrainer.ghostjam.core.STYLES
import io.chordtrainer.ghostjam.core.SetConfig
import io.chordtrainer.ghostjam.core.StyleId
import io.chordtrainer.ghostjam.core.tunesFor
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

class Setup(val text: Text, val progress: Progress) : Scene() {
    var style = StyleId.LOFI; private set
    private var tuneIdx = 0
    private var key = "C"
    private var tempo = STYLES.getValue(StyleId.LOFI).tempo.def
    private val lengths = listOf<Int?>(2, 4, 8, null)
    private var lengthIdx = 0
    private var coinAt = -10.0
    private var lockShakeUntil = 0.0
    private var lockShake: StyleId? = null
    private var now = 0.0
    private val bubbles = mutableListOf<Bubble>()

    val config: SetConfig get() = SetConfig(style, tunes()[tuneIdx], key, tempo, lengths[lengthIdx])

    private fun tunes() = tunesFor(style)

    private fun pick(s: StyleId) {
        style = s; tuneIdx = 0; tempo = STYLES.getValue(s).tempo.def
        fx += Fx.Sound(Sfx.TICK)
    }

    fun shuffle(seed: Int) {
        val list = tunes()
        tuneIdx = (hash(seed) and 0x7FFFFFFF) % list.size
        key = NOTE_NAMES[(hash(seed * 3) and 0x7FFFFFFF) % 12]
        fx += Fx.Sound(Sfx.RATTLE)
    }

    override fun draw(pm: Pixmap, t: Double) {
        now = t
        pm.attic(t)
        pm.wash(withAlpha(Pal.black, 0.6f))
        val x0 = (pm.w - 280) / 2
        val y0 = 8
        // The sheet, a little crooked, taped at the corners.
        pm.rect(x0 + 3, y0 + 3, 280, 166, withAlpha(Pal.black, 0.5f))
        pm.rect(x0, y0, 280, 166, Pal.paper)
        for (ly in y0 + 26 until y0 + 160 step 12) pm.hline(x0 + 8, x0 + 272, ly, withAlpha(Pal.paperDark, 0.35f))
        for ((tx, ty) in listOf(x0 - 4 to y0 - 2, x0 + 266 to y0 - 2)) pm.rect(tx, ty, 18, 6, withAlpha(Pal.goldLight, 0.6f))
        pm.disc(x0 + 240, y0 + 140, 9, withAlpha(Pal.paperDark, 0.25f))      // a beer ring

        Font.draw(pm, text.setList, x0 + 12, y0 + 8, Pal.pupil, 2)
        Font.draw(pm, "X", x0 + 264, y0 + 8, Pal.red, 1)
        hot(x0 + 254, y0, 26, 20) { fx += Fx.Go(Place.ROOM) }

        // Grooves: six cards, locked until you get there.
        Font.draw(pm, text.groove, x0 + 12, y0 + 30, Pal.paperDark)
        Progress.GROOVE_ORDER.forEachIndexed { i, s ->
            val cx = x0 + 12 + (i % 3) * 88; val cy = y0 + 40 + (i / 3) * 24
            val open = progress.unlocked(s)
            val sel = s == style
            val col = grooveColor(s)
            val shake = if (lockShake == s && t < lockShakeUntil) (sin(t * 70) * 2).toInt() else 0
            pm.rect(cx + shake, cy, 82, 20, if (sel) col else if (open) Pal.bone else withAlpha(Pal.paperDark, 0.5f))
            pm.frame(cx + shake, cy, 82, 20, if (sel) Pal.pupil else Pal.paperDark)
            if (open) {
                pm.sprite(Spr.mini, cx + 4 + shake, cy + 7, if (sel) Pal.pupil else col)
                Font.draw(pm, STYLES.getValue(s).name.uppercase(), cx + 15 + shake, cy + 7, Pal.pupil)
                hot(cx, cy, 82, 20) { pick(s) }
            } else {
                padlock(pm, cx + 6 + shake, cy + 5)
                val left = progress.setsToUnlock(s)
                Font.draw(pm, text.setsLeft(left), cx + 20 + shake, cy + 3, Pal.pupil)
                Font.draw(pm, "${Progress.GROOVE_PRICE} ECTO", cx + 20 + shake, cy + 11, if (progress.ecto >= Progress.GROOVE_PRICE) Pal.pupil else withAlpha(Pal.pupil, 0.4f))
                hot(cx, cy, 82, 20) {
                    if (progress.buy(s)) { pick(s); fx += Fx.Sound(Sfx.COIN); fx += Fx.Secret("buy-${s.name}") }
                    else { lockShake = s; lockShakeUntil = now + 0.35; fx += Fx.Sound(Sfx.RATTLE) }
                }
            }
        }

        // Tune.
        val ty = y0 + 92
        val tune = tunes()[tuneIdx]
        Font.draw(pm, text.tune, x0 + 12, ty, Pal.paperDark)
        arrows(pm, x0 + 12, ty + 10, 220, tune.name.uppercase(), { tuneIdx = (tuneIdx + tunes().size - 1) % tunes().size }, { tuneIdx = (tuneIdx + 1) % tunes().size })
        Font.draw(pm, tune.tokens.joinToString(" "), x0 + 26, ty + 21, withAlpha(Pal.pupil, 0.5f))
        // A die to roll a random tune.
        val dx = x0 + 246; val dy = ty + 8
        pm.rect(dx, dy, 13, 13, Pal.bone); pm.frame(dx, dy, 13, 13, Pal.pupil)
        for ((px, py) in listOf(3 to 3, 9 to 9, 6 to 6, 3 to 9, 9 to 3)) pm.rect(dx + px - 1, dy + py - 1, 2, 2, Pal.red)
        hot(dx - 4, dy - 4, 21, 21) { shuffle((now * 1000).toInt()) }

        // Key, tempo, length.
        val ky = y0 + 128
        Font.draw(pm, text.key, x0 + 12, ky, Pal.paperDark)
        arrows(pm, x0 + 12, ky + 10, 64, NOTE_DISPLAY[NOTE_NAMES.indexOf(key)], { key = NOTE_NAMES[(NOTE_NAMES.indexOf(key) + 11) % 12] }, { key = NOTE_NAMES[(NOTE_NAMES.indexOf(key) + 1) % 12] })
        val tr = STYLES.getValue(style).tempo
        Font.draw(pm, text.tempo, x0 + 88, ky, Pal.paperDark)
        arrows(pm, x0 + 88, ky + 10, 64, "$tempo", { tempo = maxOf(tr.min, tempo - 4) }, { tempo = minOf(tr.max, tempo + 4) })
        Font.draw(pm, text.length, x0 + 164, ky, Pal.paperDark)
        arrows(pm, x0 + 164, ky + 10, 64, lengths[lengthIdx]?.toString() ?: "∞", { lengthIdx = (lengthIdx + 3) % 4 }, { lengthIdx = (lengthIdx + 1) % 4 })

        // Insert coin.
        val bx = x0 + 236; val by = y0 + 128
        val glow = 0.5f + 0.5f * sin(t * 4).toFloat()
        pm.glow(bx + 18, by + 12, 26, withAlpha(Pal.pink, 0.35f * glow))
        pm.rect(bx - 6, by, 46, 26, Pal.pink); pm.frame(bx - 6, by, 46, 26, Pal.redDark)
        val coinY = if (t - coinAt < 0.4) by - 10 + ((t - coinAt) * 50).toInt() else by - 10
        pm.rect(bx + 10, by + 3, 14, 2, Pal.pupil)     // the slot
        if (t - coinAt >= 0.4) pm.sprite(Spr.coin, bx + 13, coinY, Pal.gold)
        Font.drawCentered(pm, text.play, bx + 17, by + 15, Pal.bone)
        hot(bx - 8, by - 12, 50, 40) {
            coinAt = now; fx += Fx.Sound(Sfx.COIN); fx += Fx.Go(Place.JAM)
        }
        val rec = progress.record(style)
        if (rec > 0) Font.draw(pm, "${text.hi} $rec", x0 + 12, y0 + 152, withAlpha(Pal.pupil, 0.6f))

        // The guest of the groove leans on the sheet's edge.
        val guest = when (style) {
            StyleId.SWING -> GhostId.JOE; StyleId.BOSSA -> GhostId.RICO; StyleId.LOFI -> GhostId.NOODLES
            StyleId.BALLAD -> GhostId.MAESTRO; StyleId.FUNK -> GhostId.TONY; StyleId.REGGAE -> GhostId.PAT
        }
        pm.ghost(guest, x0 + 284, y0 + 70 + (sin(t * 2) * 2).toInt(), t, level = maxOf(3, progress.memory(guest)), lookLeft = true)
        bubbles.removeAll { t > it.until }
        bubbles.forEach { pm.bubble(it, t) }
        pm.vignette(0.4f)
    }

    // "< value >" with two tap zones.
    private fun arrows(pm: Pixmap, x: Int, y: Int, w: Int, value: String, prev: () -> Unit, next: () -> Unit) {
        Font.draw(pm, "<", x, y, Pal.red)
        val shown = if (Font.width(value) > w - 20) Font.wrap(value, w - 20).first() + "…" else value
        Font.drawCentered(pm, shown, x + w / 2, y, Pal.pupil)
        Font.draw(pm, ">", x + w - 4, y, Pal.red)
        hot(x - 6, y - 6, 18, 19) { prev(); fx += Fx.Sound(Sfx.TICK) }
        hot(x + w - 12, y - 6, 18, 19) { next(); fx += Fx.Sound(Sfx.TICK) }
    }

    private fun padlock(pm: Pixmap, x: Int, y: Int) {
        pm.frame(x + 2, y, 6, 5, Pal.metal)
        pm.rect(x, y + 4, 10, 7, Pal.gold); pm.set(x + 5, y + 7, Pal.pupil); pm.set(x + 5, y + 8, Pal.pupil)
    }
}
