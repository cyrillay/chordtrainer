package io.chordtrainer.ghostjam.game

import android.content.Context
import androidx.core.content.edit
import io.chordtrainer.ghostjam.core.Progress

// The save: the core Progress as text, in shared preferences.
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("ghostjam", Context.MODE_PRIVATE)

    fun load(): Progress = Progress.load(sp.getString("progress", null))
    fun save(p: Progress) = sp.edit { putString("progress", p.save()) }
}
