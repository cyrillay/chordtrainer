// The building listens. Outside a set, what you play at the piano can wake
// things up: a tritone calls the storm, a palm on the keys scares the band,
// a famous tune gets an answer. Pure logic, fed with MIDI keys.

package io.chordtrainer.ghostjam.core

enum class Egg {
    TRITONE,    // two keys a tritone apart: the devil's interval
    CLUSTER,    // a palm on the keys
    BIRTHDAY,   // the opening of Happy Birthday, in any key
    SHAVE,      // shave and a haircut… (the band answers: two bits)
    TRISTAN,    // Wagner's chord, voiced like Wagner: aug 4th, maj 3rd, 4th
    BACKDOOR,   // ♭VII7 then I: the back door home
    LOW,        // the lowest A of a full piano
}

class Ears {
    private val held = sortedSetOf<Int>()
    private val melody = ArrayDeque<Int>()
    private var lastChord: Pair<Int, Quality>? = null

    // A key went down or up. Returns what it woke up, if anything.
    fun key(midi: Int, down: Boolean): List<Egg> {
        if (!down) { held -= midi; return emptyList() }
        held += midi
        melody.addLast(midi)
        while (melody.size > 8) melody.removeFirst()
        val out = mutableListOf<Egg>()

        val notes = held.toList()
        if (notes.size == 2 && notes[1] - notes[0] == 6) out += Egg.TRITONE
        if (notes.size >= 5 && notes.last() - notes.first() <= 9) out += Egg.CLUSTER
        if (notes.size == 4 && notes.zipWithNext { a, b -> b - a } == listOf(6, 4, 5)) out += Egg.TRISTAN
        if (midi == 21) out += Egg.LOW
        if (ends(listOf(0, 0, 2, 0, 5, 4))) out += Egg.BIRTHDAY
        if (ends(listOf(0, -5, -5, -3, -5, -1, 0))) out += Egg.SHAVE

        chordOf(held)?.let { c ->
            val prev = lastChord
            if (prev != null && prev.second == Quality.DOM7 && (c.second == Quality.MAJ || c.second == Quality.MAJ7) &&
                (c.first - prev.first + 12) % 12 == 2
            ) out += Egg.BACKDOOR
            lastChord = c
        }
        return out
    }

    // Do the last notes played make this shape (semitones from the first)?
    private fun ends(shape: List<Int>): Boolean {
        if (melody.size < shape.size) return false
        val tail = melody.toList().takeLast(shape.size)
        return tail.indices.all { tail[it] - tail[0] == shape[it] }
    }

    companion object {
        // Root and quality of a held chord (3 or 4 distinct pitch classes), any inversion.
        fun chordOf(notes: Set<Int>): Pair<Int, Quality>? {
            val pcs = notes.map { it % 12 }.toSet()
            if (pcs.size !in 3..4) return null
            for (root in pcs) for (q in Quality.entries) {
                if (q.intervals.size != pcs.size) continue
                if (q.intervals.map { (root + it) % 12 }.toSet() == pcs) return root to q
            }
            return null
        }
    }
}
