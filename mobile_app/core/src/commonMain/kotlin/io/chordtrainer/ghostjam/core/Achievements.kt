// The achievements of the web Ghost Jam, the same 28, ported from
// jam/js/achievements.js with the same thresholds. Each one becomes a
// Polaroid on the wall of Room 7. Names and hints in English and French.

package io.chordtrainer.ghostjam.core

import kotlin.math.abs

enum class Vis { VISIBLE, SECRET, ULTRA }

class Ach(val id: String, val vis: Vis, val name: String, val nameFr: String, val desc: String, val descFr: String, val hint: String = "", val hintFr: String = "")

private fun v(id: String, n: String, nf: String, d: String, df: String) = Ach(id, Vis.VISIBLE, n, nf, d, df)
private fun s(id: String, n: String, nf: String, d: String, df: String, h: String, hf: String) = Ach(id, Vis.SECRET, n, nf, d, df, h, hf)
private fun u(id: String, n: String, nf: String, d: String, df: String, h: String, hf: String) = Ach(id, Vis.ULTRA, n, nf, d, df, h, hf)

val ACH: List<Ach> = listOf(
    v("firstGig", "First Gig", "Premier concert", "Play a whole set with the ghosts", "Joue un set entier avec les fantômes"),
    v("fullBand", "Full House", "Salle comble", "Bring every ghost on stage", "Fais monter tous les fantômes sur scène"),
    v("golden", "Golden Chorus", "Grille en or", "A whole chorus, every chord Perfect", "Une grille entière, tout en Parfait"),
    v("busted", "Ghostbuster", "SOS Fantômes", "Finish a set with rank S", "Finis un set avec le rang S"),
    v("passport", "Passport", "Passeport", "Finish a set in all six grooves", "Finis un set dans les six grooves"),
    s("dilla", "Dilla Time", "Dilla Time", "Eight chords in a row, laid back", "Huit accords de suite, en arrière du temps", "Lean back. Further. Not too far.", "Penche-toi en arrière. Encore. Pas trop."),
    s("pushing", "Pushing It", "Ça pousse", "Eight chords in a row, anticipated", "Huit accords de suite, en avance", "Jump the gun. Every single time.", "Pars avant le coup. À chaque fois."),
    s("atomic", "Atomic Clock", "Horloge atomique", "Four chords within 15 ms of the beat", "Quatre accords à 15 ms du temps", "Caesium has nothing on you.", "Le césium peut aller se rhabiller."),
    s("onTheOne", "On the One", "Sur le un", "Eight Perfects in a row in funk", "Huit Parfaits de suite en funk", "Mr Brown wants it on the one.", "Mr Brown le veut sur le un."),
    s("ghostNotes", "Ghost Notes", "Notes fantômes", "Land a chord with every note whispered", "Un accord entier joué en murmure", "Play like one of them.", "Joue comme l'un d'eux."),
    s("wakeDead", "Wake the Dead", "Réveiller les morts", "Land a chord with every note slammed", "Un accord entier joué à fond", "Loud enough to raise a few.", "Assez fort pour en réveiller."),
    s("lullaby", "Lullaby", "Berceuse", "A whole ballad chorus, every note soft", "Une grille de ballade, tout en douceur", "Shh. The ghosts are sleeping.", "Chut. Les fantômes dorment."),
    s("shells", "Shell Game", "Coquilles", "Eight chords in a row with two notes", "Huit accords de suite à deux notes", "Two notes are plenty.", "Deux notes suffisent."),
    s("planing", "Parallel Parking", "Créneau", "Four chords, one hand shape, slid", "Quatre accords, une seule forme, glissée", "Same shape. New spot.", "Même forme. Autre place."),
    s("butter", "Butter", "Beurre", "Eight chords, no voice moving more than a step", "Huit accords, aucune voix ne bouge de plus d'un ton", "Smooth. Really smooth.", "Doux. Vraiment doux."),
    s("tenFingers", "All Hands on Deck", "Tout le monde sur le pont", "Land a chord with ten notes, none wrong", "Un accord à dix notes, aucune fausse", "Count your fingers.", "Compte tes doigts."),
    s("basement", "Basement Tapes", "Les bandes de la cave", "A whole chorus voiced below C3", "Une grille entière sous le do 3", "Down where the pipes rattle.", "En bas, là où les tuyaux claquent."),
    s("attic", "Attic Ghost", "Le fantôme du grenier", "A whole chorus voiced above C6", "Une grille entière au-dessus du do 6", "Up with the bats.", "Là-haut avec les chauves-souris."),
    s("hotSauce", "Hot Sauce", "Sauce piquante", "Spicy ×3 on a single chord", "Épicé ×3 sur un seul accord", "Three colours on one plate.", "Trois couleurs dans une assiette."),
    s("altered", "Altered State", "État altéré", "Two altered tensions on a dominant", "Deux tensions altérées sur une dominante", "Bend the dominant until it squeals.", "Tords la dominante jusqu'à ce qu'elle couine."),
    s("sauceAll", "Sauce on Everything", "Sauce partout", "A whole chorus with colour on every chord", "Une grille avec de la couleur partout", "No plain plates tonight.", "Pas d'assiette nature ce soir."),
    s("lazarus", "Back From the Dead", "Revenant", "Lose the whole band, then bring them back", "Perds tout le groupe, puis ramène-le", "Empty stage. Full stage.", "Scène vide. Scène pleine."),
    s("stageFright", "Stage Fright", "Le trac", "Run off during the count-in", "Fuis pendant le décompte", "One, two… nope.", "Un, deux… non."),
    s("ghostTown", "Ghost Town", "Ville fantôme", "Let the band play a whole set without you", "Laisse le groupe jouer un set sans toi", "Sometimes they jam alone.", "Parfois ils jouent seuls."),
    s("encore", "Encore! Encore!", "Une autre !", "Play the same tune three times in a row", "Joue trois fois de suite le même morceau", "They want more.", "Ils en redemandent."),
    s("lastOrders", "Last Orders", "Dernière tournée", "Finish a set between 1 and 5 a.m.", "Finis un set entre 1 h et 5 h", "The bar is closed. The band is not.", "Le bar est fermé. Pas le groupe."),
    u("seance", "Séance", "Séance", "Rank S with colour on every chord", "Rang S avec de la couleur partout", "Perfect, and spicy, all night long.", "Parfait et épicé, toute la nuit."),
    u("worldTour", "World Tour", "Tournée mondiale", "Rank S in all six grooves", "Rang S dans les six grooves", "Six rooms. Six crowds. No mistakes.", "Six salles. Six publics. Zéro faute."),
)

val ACH_BY_ID = ACH.associateBy { it.id }

// ---- Thresholds ----

const val STREAK = 8
const val SHORT_STREAK = 4
const val ATOMIC_MS = 15.0
const val SOFT = 40
const val LOUD = 112
const val LULLABY = 60
const val LOW = 48
const val HIGH = 84
private val ALTERED = listOf(1, 3, 6, 8)

// One graded chord as the tracker sees it.
data class ChordPlay(
    val grade: Grade,
    val offsetBeats: Double?,
    val offsetMs: Double?,
    val colours: Int,
    val voicing: List<Int>?,           // sorted MIDI notes held when it landed
    val velocities: List<Int>?,
    val wrong: Int,
    val colourIntervals: List<Int>,
    val quality: Quality,
)

fun smoothMove(a: List<Int>?, b: List<Int>?, max: Int = 2): Boolean {
    if (a == null || b == null || a.size != b.size) return false
    return a.indices.all { abs(a[it] - b[it]) <= max }
}

private fun shapeOf(v: List<Int>) = v.map { it - v[0] }

// Follows one set: feed it every graded chord, energy changes and the end.
class JamTracker(val style: StyleId, val chorusLen: Int) {
    private val chords = mutableListOf<ChordPlay>()
    private val chorus = mutableListOf<ChordPlay>()
    private val st = mutableMapOf("dilla" to 0, "pushing" to 0, "atomic" to 0, "onTheOne" to 0, "shells" to 0, "planing" to 0, "butter" to 0)
    private var lastShape: List<Int>? = null
    private var lastVoicing: List<Int>? = null
    private var hitZero = false
    private var notes = 0

    private fun landed(c: ChordPlay) = c.grade != Grade.MISS

    fun chord(c: ChordPlay): List<String> {
        val out = mutableListOf<String>()
        val ok = landed(c) && !c.voicing.isNullOrEmpty()
        fun step(name: String, cond: Boolean, need: Int, id: String) {
            st[name] = if (cond) st.getValue(name) + 1 else 0
            if (st.getValue(name) >= need) out += id
        }
        val off = c.offsetBeats ?: 0.0
        step("dilla", ok && off > 0.25 && off <= 1, STREAK, "dilla")
        step("pushing", ok && off < 0, STREAK, "pushing")
        step("atomic", ok && c.offsetMs != null && abs(c.offsetMs) <= ATOMIC_MS, SHORT_STREAK, "atomic")
        step("onTheOne", style == StyleId.FUNK && c.grade == Grade.PERFECT, STREAK, "onTheOne")
        step("shells", ok && c.voicing!!.size == 2, STREAK, "shells")

        val shape = if (ok && c.voicing!!.size >= 3) shapeOf(c.voicing) else null
        val slid = shape != null && shape == lastShape && c.voicing!![0] != lastVoicing?.get(0)
        st["planing"] = if (shape != null) (if (slid) st.getValue("planing") + 1 else 1) else 0
        if (st.getValue("planing") >= SHORT_STREAK) out += "planing"
        lastShape = shape

        st["butter"] = if (ok) (if (smoothMove(lastVoicing, c.voicing)) st.getValue("butter") + 1 else 1) else 0
        if (st.getValue("butter") >= STREAK) out += "butter"
        lastVoicing = if (ok) c.voicing else null

        if (ok) {
            val vel = c.velocities.orEmpty()
            if (vel.size >= 2 && vel.all { it <= SOFT }) out += "ghostNotes"
            if (vel.size >= 2 && vel.all { it >= LOUD }) out += "wakeDead"
            if (c.voicing!!.size >= 10 && c.wrong == 0) out += "tenFingers"
            if (c.colours >= 3) out += "hotSauce"
            if (c.quality == Quality.DOM7 && ALTERED.count { it in c.colourIntervals } >= 2) out += "altered"
        }

        chords += c
        chorus += c
        if (chorus.size == chorusLen) { out += closeChorus(chorus); chorus.clear() }
        return out
    }

    private fun closeChorus(ch: List<ChordPlay>): List<String> {
        val out = mutableListOf<String>()
        if (ch.all { it.grade == Grade.PERFECT }) out += "golden"
        if (!ch.all { landed(it) && !it.voicing.isNullOrEmpty() }) return out
        if (ch.all { it.colours > 0 }) out += "sauceAll"
        if (ch.all { c -> c.voicing!!.all { it < LOW } }) out += "basement"
        if (ch.all { c -> c.voicing!!.all { it >= HIGH } }) out += "attic"
        if (style == StyleId.BALLAD && ch.all { c -> !c.velocities.isNullOrEmpty() && c.velocities.all { it <= LULLABY } }) out += "lullaby"
        return out
    }

    fun energy(e: Int): List<String> {
        if (e == 0) hitZero = true
        return if (e >= MAX_ENERGY && hitZero) listOf("lazarus") else emptyList()
    }

    fun note() { notes++ }

    fun finish(complete: Boolean, rank: String, hour: Int, encore: Int): List<String> {
        val out = mutableListOf<String>()
        val n = chords.size
        if (!complete) { if (n == 0) out += "stageFright"; return out }
        if (n > 0 && notes == 0) out += "ghostTown"
        if (encore >= 2) out += "encore"
        if (hour in 1..4) out += "lastOrders"
        if (rank == "S" && n > 0 && chords.all { it.colours > 0 }) out += "seance"
        return out
    }
}
