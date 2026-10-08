// Tune in: the band clicks, you hit a key on each click. The median gap
// between click and key is your offset: MIDI transport, the audio path we
// could not measure, and your own feel. It is subtracted when judging.

package io.chordtrainer.ghostjam.game

import io.chordtrainer.ghostjam.audio.AudioEngine
import io.chordtrainer.ghostjam.midi.Key
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlin.math.abs
import kotlin.math.roundToInt

data class CalibState(val clicks: Int = 0, val taps: Int = 0, val done: Boolean = false, val offsetMs: Int? = null)

class Calibration(private val prefs: Prefs) {
    private val beatMs = 600.0
    private val total = 16
    private val skip = 4                      // the first clicks are for finding the beat
    private var song: AudioEngine.Song? = null
    private val gaps = mutableListOf<Double>()

    private val _state = MutableStateFlow(CalibState())
    val state: StateFlow<CalibState> = _state

    fun start() {
        AudioEngine.start()
        val s = AudioEngine.newSong()
        song = s
        gaps.clear()
        for (i in 0 until total) AudioEngine.click(s, i * beatMs, i % 4 == 0)
        _state.value = CalibState()
    }

    // Call often: tracks which click we are on.
    fun tick() {
        val s = song ?: return
        val n = ((s.nowMs() / beatMs).toInt() + 1).coerceIn(0, total)
        if (n != _state.value.clicks) _state.value = _state.value.copy(clicks = n)
        if (s.nowMs() > total * beatMs + 300 && !_state.value.done) finish()
    }

    fun onKey(k: Key) {
        val s = song ?: return
        if (!k.down) return
        val t = s.msAt(k.nanos)
        val i = (t / beatMs).roundToInt()
        if (i < skip || i >= total) return
        val gap = t - i * beatMs
        if (abs(gap) < beatMs / 3) gaps += gap
        _state.value = _state.value.copy(taps = gaps.size)
    }

    private fun finish() {
        song = null
        if (gaps.size < 4) { _state.value = _state.value.copy(done = true); return }
        val median = gaps.sorted()[gaps.size / 2]
        prefs.offsetMs = median
        _state.value = _state.value.copy(done = true, offsetMs = median.roundToInt())
    }
}
