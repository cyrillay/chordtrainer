package io.chordtrainer.ghostjam

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import io.chordtrainer.ghostjam.audio.AudioEngine
import io.chordtrainer.ghostjam.game.Calibration
import io.chordtrainer.ghostjam.game.JamController
import io.chordtrainer.ghostjam.game.Prefs
import io.chordtrainer.ghostjam.midi.MidiInput
import io.chordtrainer.ghostjam.ui.GhostJamApp

class MainActivity : ComponentActivity() {
    private lateinit var midi: MidiInput

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val prefs = Prefs(this)
        val jam = JamController(prefs, lifecycleScope)
        val calib = Calibration(prefs)
        // Keys go to whichever of the two is listening.
        midi = MidiInput(this) { key -> jam.onKey(key); calib.onKey(key) }
        setContent { GhostJamApp(midi, jam, calib, prefs) }
    }

    override fun onStart() {
        super.onStart()
        midi.start()
        AudioEngine.start()
    }

    override fun onStop() {
        midi.stop()
        AudioEngine.stop()
        super.onStop()
    }
}
