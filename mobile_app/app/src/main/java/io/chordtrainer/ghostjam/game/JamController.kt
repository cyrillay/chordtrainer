// Runs one set: schedules the band a bar ahead on the audio clock, feeds
// your keys to the core Gig with their MIDI timestamps, and publishes what
// the screen needs. Thread model: MIDI keys arrive on the MIDI thread, the
// loop runs on a background coroutine, both under `lock`.

package io.chordtrainer.ghostjam.game

import io.chordtrainer.ghostjam.audio.AudioEngine
import io.chordtrainer.ghostjam.core.Chord
import io.chordtrainer.ghostjam.core.Gig
import io.chordtrainer.ghostjam.core.Grade
import io.chordtrainer.ghostjam.core.Role
import io.chordtrainer.ghostjam.core.StyleId
import io.chordtrainer.ghostjam.midi.Key
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.random.Random

data class PlayState(
    val bar: Int = -1,
    val beat: Int = 0,
    val chord: Chord? = null,
    val upcoming: List<Chord> = emptyList(),
    val score: Int = 0,
    val combo: Int = 0,
    val energy: Int = 1,
    val shout: Grade? = null,
    val shoutId: Int = 0,
    val keys: Map<Int, Role> = emptyMap(),
    val over: Boolean = false,
    val rank: String = "",
)

class JamController(private val prefs: Prefs, private val scope: CoroutineScope) {
    private val lock = Any()
    private var gig: Gig? = null
    private var song: AudioEngine.Song? = null
    private var job: Job? = null
    private var nextBar = 0
    private val keys = mutableMapOf<Int, Role>()
    private val rng = Random.Default

    private val _state = MutableStateFlow(PlayState())
    val state: StateFlow<PlayState> = _state

    fun start(style: StyleId, tempo: Int, chords: List<Chord>, choruses: Int? = 2) {
        stop()
        AudioEngine.start()
        synchronized(lock) {
            gig = Gig(style, tempo, chords, 1, choruses)
            song = AudioEngine.newSong()
            nextBar = 0
            keys.clear()
        }
        _state.value = PlayState()
        job = scope.launch(Dispatchers.Default) { loop() }
    }

    fun stop() {
        job?.cancel()
        job = null
        AudioEngine.clear()
        synchronized(lock) { gig = null; song = null }
    }

    fun onKey(k: Key) = synchronized(lock) {
        val g = gig ?: return@synchronized
        val s = song ?: return@synchronized
        if (k.down) keys[k.midi] = g.noteOn(k.midi, s.msAt(k.nanos) - prefs.offsetMs)
        else { g.noteOff(k.midi); keys.remove(k.midi) }
        _state.value = _state.value.copy(keys = keys.toMap())
    }

    private suspend fun loop() {
        while (true) {
            synchronized(lock) {
                val g = gig ?: return
                val s = song ?: return
                val now = s.nowMs()
                // Keep a bar and a bit scheduled ahead.
                while (nextBar * g.barMs < now + g.barMs + 250 && (g.totalBars == null || nextBar <= g.totalBars!!)) {
                    g.soundsForBar(nextBar, g.scorer.energy) { rng.nextDouble() }.forEach(s::play)
                    nextBar++
                }
                val graded = g.update(now)
                val bar = if (now < 0) -1 else (now / g.barMs).toInt()
                val beat = if (now < 0) 0 else ((now % g.barMs) / g.beatMs).toInt()
                val k = g.shownSlot(now)
                val inSet = k >= 0 && (g.totalSlots == null || k < g.totalSlots!!)
                val last = graded.lastOrNull()
                val over = g.endMs?.let { now >= it } ?: false
                if (over && g.scorer.score > prefs.hiScore) prefs.hiScore = g.scorer.score
                _state.value = _state.value.copy(
                    bar = bar, beat = beat,
                    chord = if (inSet) g.chordOf(k) else null,
                    upcoming = if (k >= -1) (1..3).map { g.chordOf(maxOf(0, k + it)) } else emptyList(),
                    score = g.scorer.score, combo = g.scorer.combo, energy = g.scorer.energy,
                    shout = last?.result?.grade ?: _state.value.shout,
                    shoutId = _state.value.shoutId + if (last != null) 1 else 0,
                    over = over, rank = if (over) g.scorer.rank else "",
                )
                if (over) { gig = null; return }
            }
            delay(8)
        }
    }
}
