// What every screen shares: tap zones rebuilt each frame, and the effects a
// scene asks the app for (sounds, haptics, going somewhere). Scenes stay
// pure: they never touch Android, they only fill `fx`.

package io.chordtrainer.ghostjam.core.scene

import io.chordtrainer.ghostjam.core.pix.Pixmap

enum class Sfx { THUNDER, STATIC, DING, RATTLE, SQUEAK, CHIME, POP, COIN, WHOOSH, STAMP, TICK, SNORE }

sealed interface Fx {
    data class Sound(val sfx: Sfx) : Fx
    data class Haptic(val strong: Boolean) : Fx
    data class Go(val to: Place) : Fx
    data object ScanBluetooth : Fx
    data object Radio : Fx
    data class Secret(val id: String) : Fx
}

enum class Place { ROOM, SETUP, JAM, TUNE_IN, POLAROIDS }

class Hot(val x: Int, val y: Int, val w: Int, val h: Int, val action: () -> Unit) {
    fun hit(px: Int, py: Int) = px in x until x + w && py in y until y + h
}

abstract class Scene {
    val fx = mutableListOf<Fx>()
    private val hots = mutableListOf<Hot>()

    // Last frame's tap zones, topmost last.
    private var live: List<Hot> = emptyList()

    protected fun hot(x: Int, y: Int, w: Int, h: Int, action: () -> Unit) { hots += Hot(x, y, w, h, action) }

    fun render(pm: Pixmap, t: Double) {
        hots.clear()
        draw(pm, t)
        live = hots.toList()
    }

    // A tap at virtual pixel (x, y). Returns true if something took it.
    fun tap(x: Int, y: Int): Boolean {
        val h = live.lastOrNull { it.hit(x, y) } ?: return false
        h.action()
        return true
    }

    protected abstract fun draw(pm: Pixmap, t: Double)
}
