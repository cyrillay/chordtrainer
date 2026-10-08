package io.chordtrainer.ghostjam.game

import android.content.Context
import androidx.core.content.edit

// What the game remembers between launches. M0 keeps it to settings.
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("ghostjam", Context.MODE_PRIVATE)

    // How late (ms) the player's hits land after the click they hear: MIDI
    // transport, ears, hands. Measured by the calibration, subtracted when judging.
    var offsetMs: Double
        get() = sp.getFloat("offsetMs", 0f).toDouble()
        set(v) = sp.edit { putFloat("offsetMs", v.toFloat()) }

    var hiScore: Int
        get() = sp.getInt("hiScore", 0)
        set(v) = sp.edit { putInt("hiScore", v) }
}
