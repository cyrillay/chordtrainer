// Renders the scenes to PNG in core/build/snapshots, scaled ×4 with no
// smoothing, so the art can be reviewed without a phone.

package io.chordtrainer.ghostjam.core

import io.chordtrainer.ghostjam.core.pix.Pixmap
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

object Snapshots {
    private val dir = File("build/snapshots").apply { mkdirs() }

    fun save(pm: Pixmap, name: String, scale: Int = 4) {
        val img = BufferedImage(pm.w * scale, pm.h * scale, BufferedImage.TYPE_INT_RGB)
        for (y in 0 until pm.h * scale) for (x in 0 until pm.w * scale) img.setRGB(x, y, pm.px[(y / scale) * pm.w + x / scale])
        ImageIO.write(img, "png", File(dir, "$name.png"))
    }
}
