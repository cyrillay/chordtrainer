// Shows the game's pixmap on the whole screen, scaled up by a whole number
// so every pixel stays square and sharp, and turns taps into pixel coords.

package io.chordtrainer.ghostjam.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.core.graphics.createBitmap
import io.chordtrainer.ghostjam.game.Game

private class Frame { var bitmap: Bitmap? = null; var scale = 1; var ox = 0; var oy = 0 }

@Composable
fun GameView(game: Game) {
    var nanos by remember { mutableLongStateOf(0L) }
    val f = remember { Frame() }
    LaunchedEffect(Unit) { while (true) withFrameNanos { nanos = it } }

    Canvas(
        Modifier.fillMaxSize().pointerInput(Unit) {
            detectTapGestures { p -> game.tap(((p.x - f.ox) / f.scale).toInt(), ((p.y - f.oy) / f.scale).toInt()) }
        },
    ) {
        if (nanos == 0L) return@Canvas
        // At least 360×180 virtual pixels, as big as the screen allows.
        val scale = maxOf(1, minOf((size.height / 180).toInt(), (size.width / 360).toInt()))
        val vw = (size.width / scale).toInt()
        val vh = (size.height / scale).toInt()
        val pm = game.frame(nanos, vw, vh)
        val bmp = f.bitmap?.takeIf { it.width == vw && it.height == vh }
            ?: createBitmap(vw, vh).also { f.bitmap = it }
        bmp.setPixels(pm.px, 0, vw, 0, 0, vw, vh)
        f.scale = scale
        f.ox = ((size.width - vw * scale) / 2).toInt()
        f.oy = ((size.height - vh * scale) / 2).toInt()
        drawRect(Color.Black)
        drawImage(
            bmp.asImageBitmap(), dstOffset = IntOffset(f.ox, f.oy), dstSize = IntSize(vw * scale, vh * scale),
            filterQuality = FilterQuality.None,
        )
    }
}
