// The Ghost Jam pixel ghost, drawn as crisp squares (same map as
// jam/js/sprites.js on the web). Memory level 1 to 5: grey and pupil-less
// at first, its colour back from level 3.

package io.chordtrainer.ghostjam.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val GHOST = listOf(
    "....######....", "..##########..", ".############.", ".##WW####WW##.",
    "##WWWW##WWWW##", "##WWPP##WWPP##", "##WWPP##WWPP##", "###WW####WW###",
    "##############", "##############", "##############", "##############",
    "##.###..###.##", "#...##..##...#",
)

@Composable
fun Ghost(color: Color, modifier: Modifier = Modifier, px: Dp = 4.dp, level: Int = 5, alpha: Float = 1f) {
    val body = when {
        level <= 1 -> Color(0xFF8A8299)
        level == 2 -> Color(0xFFC9C2D6)
        else -> color
    }
    val a = alpha * when (level) { 1 -> 0.35f; 2 -> 0.65f; else -> 1f }
    Canvas(modifier.size(px * 14, px * 14)) {
        val p = size.width / 14f
        GHOST.forEachIndexed { y, row ->
            row.forEachIndexed { x, ch ->
                val c = when (ch) {
                    '#' -> body
                    'W' -> Palette.bone
                    'P' -> if (level <= 1) Palette.bone else Palette.pupil
                    else -> null
                }
                if (c != null) drawRect(c.copy(alpha = c.alpha * a), Offset(x * p, y * p), Size(p + 0.5f, p + 0.5f))
            }
        }
    }
}
