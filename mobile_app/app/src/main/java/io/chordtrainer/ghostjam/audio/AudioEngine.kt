// Kotlin side of the C++ band (src/main/cpp). Schedules notes by audio frame
// and converts between three clocks: audio frames, System.nanoTime() (what
// MIDI timestamps use) and song time in ms (what the core module judges in).

package io.chordtrainer.ghostjam.audio

import io.chordtrainer.ghostjam.core.Patch
import io.chordtrainer.ghostjam.core.Sound
import kotlin.math.roundToLong

object AudioEngine {
    init { System.loadLibrary("ghostband") }

    private external fun nativeStart(): Boolean
    private external fun nativeStop()
    private external fun nativeClear()
    private external fun nativeSampleRate(): Int
    private external fun nativeFramesRendered(): Long
    private external fun nativeLatencyFrames(): Long
    private external fun nativeSchedule(frame: Long, patch: Int, midi: Int, vel: Float, dur: Long): Boolean
    private external fun nativeTimestamp(out: LongArray): Boolean

    private val ts = LongArray(2)

    fun start() = nativeStart()
    fun stop() = nativeStop()
    fun clear() = nativeClear()
    val sampleRate: Int get() = nativeSampleRate()

    // The frame reaching the speaker at System.nanoTime() = nanos.
    fun speakerFrameAt(nanos: Long): Double {
        val sr = sampleRate.toDouble()
        if (nativeTimestamp(ts)) return ts[0] + (nanos - ts[1]) * sr / 1e9
        // No timestamp from this device: what we rendered, minus what is
        // still in the buffers.
        val now = System.nanoTime()
        return nativeFramesRendered() - nativeLatencyFrames() + (nanos - now) * sr / 1e9
    }

    // A song: frame `startFrame` at the speaker is song time 0.
    class Song(val startFrame: Long) {
        private val sr = sampleRate.toDouble()
        fun frameOf(ms: Double): Long = startFrame + (ms * sr / 1000.0).roundToLong()
        fun msAt(nanos: Long): Double = (speakerFrameAt(nanos) - startFrame) * 1000.0 / sr
        fun nowMs(): Double = msAt(System.nanoTime())
        fun play(s: Sound) {
            nativeSchedule(frameOf(s.atMs), s.patch.ordinal, s.midi, s.vel.toFloat(), (s.durMs * sr / 1000.0).roundToLong())
        }
    }

    // A new song starting `leadMs` from now at the speaker.
    fun newSong(leadMs: Double = 300.0): Song {
        clear()
        val now = speakerFrameAt(System.nanoTime())
        return Song((now + leadMs * sampleRate / 1000.0).roundToLong())
    }

    fun click(song: Song, atMs: Double, accent: Boolean) =
        song.play(Sound(atMs, 30.0, Patch.STICKS, 0, if (accent) 1.0 else 0.7))
}
