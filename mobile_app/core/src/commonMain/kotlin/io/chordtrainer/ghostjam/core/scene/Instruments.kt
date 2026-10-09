// The band's instruments, drawn with rectangles. `hit` (0..1) is how
// recently the beat landed, for sticks and cymbals that move.

package io.chordtrainer.ghostjam.core.scene

import io.chordtrainer.ghostjam.core.StyleId
import io.chordtrainer.ghostjam.core.pix.Font
import io.chordtrainer.ghostjam.core.pix.Pal
import io.chordtrainer.ghostjam.core.pix.Pixmap

fun Pixmap.drumKit(x: Int, y: Int, hit: Float) {
    // Cymbal and hi-hat stands.
    vline(x - 6, y - 8, y + 12, Pal.metal); hline(x - 12, x, y - 8 - (hit * 2).toInt(), Pal.goldLight)
    vline(x + 26, y - 6, y + 12, Pal.metal); hline(x + 21, x + 31, y - 6, Pal.gold); hline(x + 21, x + 31, y - 5 + if (hit > 0.5f) 0 else 1, Pal.gold)
    // Bass drum with the band's name on the head.
    disc(x + 12, y + 4, 9, Pal.red); disc(x + 12, y + 4, 7, Pal.bone)
    Font.drawCentered(this, "DR", x + 12, y + 1, Pal.red)
    // Snare and tom.
    rect(x + 20, y - 2, 9, 4, Pal.metalLight); hline(x + 20, x + 28, y - 2, Pal.bone)
    rect(x + 6, y - 7, 8, 4, Pal.red); hline(x + 6, x + 13, y - 7, Pal.bone)
}

fun Pixmap.uprightBass(x: Int, y: Int, sway: Int) {
    val c = Pal.woodLight
    rect(x + 2, y + 6, 10, 16, c); rect(x + 1, y + 10, 12, 4, c); rect(x + 3, y + 3, 8, 4, c)
    vline(x + 7 + sway, y - 14, y + 6, Pal.woodDark); rect(x + 6 + sway, y - 17, 3, 3, Pal.woodDark)
    for (s in 0..3) vline(x + 5 + s * 1, y + 4, y + 18, Pal.paperDark)
    set(x + 4, y + 10, Pal.woodDark); set(x + 10, y + 10, Pal.woodDark)
    vline(x + 7, y + 22, y + 25, Pal.metal)
}

fun Pixmap.rhodes(x: Int, y: Int) {
    rect(x, y, 30, 7, Pal.redDark); rect(x, y, 30, 2, Pal.red)
    rect(x + 1, y + 4, 28, 3, Pal.bone)
    for (k in 0 until 28 step 2) set(x + 1 + k, y + 4, Pal.pupil)
    line(x + 4, y + 7, x + 24, y + 22, Pal.metal); line(x + 24, y + 7, x + 4, y + 22, Pal.metal)
}

fun Pixmap.guestInstrument(style: StyleId, x: Int, y: Int, t: Double) {
    when (style) {
        StyleId.SWING -> { // sax
            vline(x + 4, y - 6, y + 8, Pal.gold); rect(x + 4, y + 8, 6, 3, Pal.gold); rect(x + 8, y + 3, 3, 6, Pal.gold)
            rect(x + 7, y + 1, 5, 2, Pal.goldLight); set(x + 3, y - 7, Pal.pupil)
        }
        StyleId.BOSSA -> { // trumpet with a harmon mute
            hline(x - 4, x + 10, y + 2, Pal.gold); rect(x + 10, y, 3, 5, Pal.gold); rect(x + 13, y + 1, 2, 3, Pal.metal)
            rect(x + 2, y - 1, 1, 3, Pal.goldLight); rect(x + 4, y - 1, 1, 3, Pal.goldLight); rect(x + 6, y - 1, 1, 3, Pal.goldLight)
        }
        StyleId.LOFI -> { // vibes
            for (k in 0 until 8) rect(x - 6 + k * 3, y + 14 + (k % 2), 2, 6 - k / 3, if (k % 2 == 0) Pal.metalLight else Pal.metal)
            vline(x - 6, y + 20, y + 26, Pal.metal); vline(x + 16, y + 20, y + 26, Pal.metal)
        }
        StyleId.BALLAD -> { // violin
            rect(x + 2, y + 2, 7, 10, Pal.woodLight); rect(x + 1, y + 5, 9, 4, Pal.woodLight); vline(x + 5, y - 6, y + 2, Pal.woodDark)
            line(x - 4, y - 2 + (kotlin.math.sin(t * 3) * 3).toInt(), x + 14, y + 8, Pal.paper)
        }
        StyleId.FUNK -> { // trombone
            hline(x - 6, x + 12, y + 1, Pal.gold); hline(x - 6, x + 12, y + 4, Pal.gold); vline(x - 6, y + 1, y + 4, Pal.gold)
            rect(x + 12, y - 1, 3, 8, Pal.goldLight)
        }
        StyleId.REGGAE -> { // melodica
            rect(x - 2, y + 2, 14, 5, Pal.red); for (k in 0 until 6) rect(x - 1 + k * 2, y + 3, 1, 3, Pal.bone)
            line(x - 2, y + 4, x - 6, y - 4, Pal.metalLight)
        }
    }
}

// The light colour of each groove's room.
fun grooveColor(style: StyleId): Int = when (style) {
    StyleId.SWING -> Pal.gold
    StyleId.BOSSA -> Pal.lime
    StyleId.LOFI -> Pal.violet
    StyleId.BALLAD -> Pal.pinkSoft
    StyleId.FUNK -> Pal.orange
    StyleId.REGGAE -> Pal.ecto
}
