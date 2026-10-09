package io.chordtrainer.ghostjam

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import io.chordtrainer.ghostjam.audio.AudioEngine
import io.chordtrainer.ghostjam.core.scene.Lang
import io.chordtrainer.ghostjam.game.Game
import io.chordtrainer.ghostjam.game.Prefs
import io.chordtrainer.ghostjam.midi.MidiInput
import io.chordtrainer.ghostjam.ui.GameView
import kotlinx.coroutines.launch
import java.util.Locale

class MainActivity : ComponentActivity() {
    private lateinit var midi: MidiInput
    private lateinit var game: Game

    private val btPermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
        arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

    private val askBluetooth = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.all { it }) midi.scanBluetooth()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Full screen: the attic is the whole phone.
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val lang = if (Locale.getDefault().language == "fr") Lang.FR else Lang.EN
        game = Game(Prefs(this), lang, ::vibrate, ::scanBluetooth)
        midi = MidiInput(this, game::onKey)
        lifecycleScope.launch { midi.device.collect { game.env.midiName = it } }
        lifecycleScope.launch { midi.scanning.collect { game.env.scanning = it } }
        onBackPressedDispatcher.addCallback(this) { if (!game.back()) finish() }
        setContent { GameView(game) }
    }

    private fun scanBluetooth() {
        if (btPermissions.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }) midi.scanBluetooth()
        else askBluetooth.launch(btPermissions)
    }

    private fun vibrate(strong: Boolean) {
        val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        else @Suppress("DEPRECATION") (getSystemService(VIBRATOR_SERVICE) as Vibrator)
        v.vibrate(VibrationEffect.createOneShot(if (strong) 40 else 12, if (strong) 200 else 80))
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
