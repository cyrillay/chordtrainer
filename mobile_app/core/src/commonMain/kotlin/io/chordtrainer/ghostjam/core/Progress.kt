// What the player keeps between sessions: ectoplasm, sets played, secrets
// found, achievements, records. Saved as plain "key=value" lines so the
// app can keep it anywhere (and iOS later the same way).

package io.chordtrainer.ghostjam.core

import io.chordtrainer.ghostjam.core.pix.GhostId

class Progress {
    var ecto = 0
    var sets = 0
    var offsetMs = 0.0
    val secrets = linkedSetOf<String>()
    val achievements = linkedSetOf<String>()
    val records = mutableMapOf<String, Int>()     // per groove
    val setsByGroove = mutableMapOf<StyleId, Int>()

    // A ghost remembers who they were by playing with you: grey and blank
    // at first, then their colour, their things, their shadow.
    fun memory(id: GhostId): Int {
        val n = when (id) {
            GhostId.NOODLES -> setsByGroove[StyleId.LOFI] ?: 0
            GhostId.KEV, GhostId.DEZ, GhostId.LENNY, GhostId.MARCO -> sets
            else -> 0
        }
        return when {
            n >= 12 -> 5
            n >= 6 -> 4
            n >= 3 -> 3
            n >= 1 -> 2
            else -> 1
        }
    }

    fun record(style: StyleId) = records[style.name] ?: 0

    // Grooves open one by one, in the order of the floors: two sets each,
    // or bought with ectoplasm.
    fun unlocked(style: StyleId): Boolean {
        val i = GROOVE_ORDER.indexOf(style)
        return i < 1 + sets / 2 || "buy-${style.name}" in secrets
    }
    fun setsToUnlock(style: StyleId) = maxOf(0, GROOVE_ORDER.indexOf(style) * 2 - sets)

    fun buy(style: StyleId): Boolean {
        if (unlocked(style) || ecto < GROOVE_PRICE) return false
        ecto -= GROOVE_PRICE
        secrets += "buy-${style.name}"
        return true
    }


    fun save(): String = buildString {
        appendLine("ecto=$ecto")
        appendLine("sets=$sets")
        appendLine("offsetMs=$offsetMs")
        appendLine("secrets=${secrets.joinToString(",")}")
        appendLine("achievements=${achievements.joinToString(",")}")
        appendLine("records=${records.entries.joinToString(",") { "${it.key}:${it.value}" }}")
        appendLine("setsByGroove=${setsByGroove.entries.joinToString(",") { "${it.key.name}:${it.value}" }}")
    }

    companion object {
        val GROOVE_ORDER = listOf(StyleId.LOFI, StyleId.BALLAD, StyleId.BOSSA, StyleId.REGGAE, StyleId.FUNK, StyleId.SWING)
        const val GROOVE_PRICE = 150

        fun load(s: String?): Progress {
            val p = Progress()
            if (s == null) return p
            val kv = s.lines().filter { '=' in it }.associate { it.substringBefore('=') to it.substringAfter('=') }
            fun list(k: String) = kv[k].orEmpty().split(',').filter { it.isNotBlank() }
            p.ecto = kv["ecto"]?.toIntOrNull() ?: 0
            p.sets = kv["sets"]?.toIntOrNull() ?: 0
            p.offsetMs = kv["offsetMs"]?.toDoubleOrNull() ?: 0.0
            p.secrets += list("secrets")
            p.achievements += list("achievements")
            list("records").forEach { e -> e.split(':').let { if (it.size == 2) it[1].toIntOrNull()?.let { v -> p.records[it[0]] = v } } }
            list("setsByGroove").forEach { e ->
                e.split(':').let { parts ->
                    val id = StyleId.entries.firstOrNull { it.name == parts.getOrNull(0) }
                    val v = parts.getOrNull(1)?.toIntOrNull()
                    if (id != null && v != null) p.setsByGroove[id] = v
                }
            }
            return p
        }
    }
}
