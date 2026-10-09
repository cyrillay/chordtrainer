// All the game's words, in English and French. Very few of them: the story
// is told with pictures. Short, no dashes between clauses.

package io.chordtrainer.ghostjam.core.scene

enum class Lang { EN, FR }

class Text(val lang: Lang) {
    private fun t(en: String, fr: String) = if (lang == Lang.FR) fr else en

    val room get() = t("ROOM 7", "CHAMBRE 7")
    val setList get() = t("SET LIST", "AU PROGRAMME")
    val groove get() = t("GROOVE", "GROOVE")
    val tune get() = t("TUNE", "MORCEAU")
    val key get() = t("KEY", "TON")
    val tempo get() = t("TEMPO", "TEMPO")
    val length get() = t("CHORUSES", "GRILLES")
    val endless get() = t("ENDLESS", "SANS FIN")
    val insertCoin get() = t("INSERT COIN", "UNE PIÈCE")
    val play get() = t("PLAY", "JOUER")
    val score get() = t("SCORE", "SCORE")
    val hi get() = t("HI", "RECORD")
    val combo get() = t("COMBO", "COMBO")
    val next get() = t("NEXT", "APRÈS")
    val early get() = t("EARLY", "TÔT")
    val late get() = t("LATE", "TARD")
    val again get() = t("AGAIN", "ENCORE")
    val back get() = t("BACK", "RETOUR")
    val newHi get() = t("NEW RECORD!", "NOUVEAU RECORD !")
    val tuneInHint get() = t("HIT A KEY ON THE CLICK", "JOUE UNE TOUCHE SUR LE CLIC")
    val tuneInDone get() = t("OFFSET", "DÉCALAGE")
    val tuneInAgain get() = t("NOT ENOUGH HITS", "PAS ASSEZ DE NOTES")
    val stop get() = t("STOP", "STOP")
    val noKeyboard get() = t("NO KEYBOARD", "PAS DE CLAVIER")
    val searching get() = t("LOOKING…", "RECHERCHE…")
    val ecto get() = t("ECTO", "ECTO")
    val polaroids get() = t("POLAROIDS", "POLAROÏDS")
    val playOnTheAnd get() = t("PLAY ON THE AND", "JOUE SUR LE ET")
    val spicy get() = t("SPICY", "ÉPICÉ")
    val outOfOrder get() = t("OUT OF ORDER", "EN PANNE")

    fun grade(g: io.chordtrainer.ghostjam.core.Grade) = when (g) {
        io.chordtrainer.ghostjam.core.Grade.PERFECT -> t("PERFECT", "PARFAIT")
        io.chordtrainer.ghostjam.core.Grade.GOOD -> t("GOOD", "BIEN")
        io.chordtrainer.ghostjam.core.Grade.LATE -> t("LATE", "EN RETARD")
        io.chordtrainer.ghostjam.core.Grade.MISS -> t("MISS", "RATÉ")
    }
    fun setsLeft(n: Int) = "+$n SET" + if (n > 1) "S" else ""

    val shouts: Map<String, List<String>> get() = if (lang == Lang.FR) mapOf(
        "PERFECT" to listOf("DANS LA POCHE !", "PARFAIT !", "SAVOUREUX !", "CHAUD !", "CARRÉ !"),
        "GOOD" to listOf("GROOVY !", "PAS MAL !", "SOLIDE !", "ÇA ROULE !"),
        "LATE" to listOf("LIMITE…", "ÇA TRAÎNE…", "RATTRAPE !"),
        "MISS" to listOf("PLOUF !", "LE CRASH !", "C'ÉTAIT QUOI ?", "GHOSTÉ !"),
    ) else mapOf(
        "PERFECT" to listOf("IN THE POCKET!", "PERFECT!", "TASTY!", "FAR OUT!", "RIGHTEOUS!"),
        "GOOD" to listOf("GROOVY!", "NICE!", "SOLID!", "COOL CAT!"),
        "LATE" to listOf("LATE BUT LEGAL", "DRAGGING…", "CATCH UP!"),
        "MISS" to listOf("CLAM!", "TRAINWRECK!", "WHO ORDERED THAT?", "GHOSTED!"),
    )
}

// The one line each ghost says. Never translated: they died in English bars.
val GHOST_LINES = mapOf(
    "KEV" to "PLUG IN, MATE.", "DEZ" to "AGAIN. FASTER.", "LENNY" to "SHE NEVER CALLED.",
    "MARCO" to "WHO'S SHE?", "NOODLES" to "…ZZ. HUH?", "MAESTRO" to "PIANISSIMO, PEASANT.",
    "RICO" to "DOUBLE OR NOTHING.", "PAT" to "EASY, EASY.", "TONY" to "HIT IT. HIT IT.",
    "JOE" to "SINCE '33, KID.", "VELVET" to "NOT HIM AGAIN.", "FERMATA" to "…",
)
