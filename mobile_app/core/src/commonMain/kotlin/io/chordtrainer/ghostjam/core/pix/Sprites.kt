// Pixel art as character maps. '.' is transparent, '#' takes the sprite's
// tint, other letters come from the shared palette. Same idea as
// jam/js/sprites.js on the web, so the ghosts are the same ghosts.

package io.chordtrainer.ghostjam.core.pix

import io.chordtrainer.ghostjam.core.pix.Pixmap.Companion.rgb

object Pal {
    val night = rgb(0x120A1F)
    val deep = rgb(0x0B0614)
    val wall = rgb(0x24173A)
    val wallDark = rgb(0x1A1029)
    val wallLight = rgb(0x2E1F48)
    val beam = rgb(0x3A2614)
    val beamLight = rgb(0x5A3B1E)
    val floor = rgb(0x2B1A12)
    val floorLight = rgb(0x3D2618)
    val line = rgb(0x3A2A55)
    val ink = rgb(0xEFE6FF)
    val dim = rgb(0xA99CC4)
    val bone = rgb(0xFFF7FF)
    val pupil = rgb(0x140A24)
    val pink = rgb(0xFF2E88)
    val pinkSoft = rgb(0xFF7AC0)
    val cyan = rgb(0x18F0FF)
    val orange = rgb(0xFF9F1C)
    val lime = rgb(0xB6FF3B)
    val gold = rgb(0xFFB000)
    val goldLight = rgb(0xFFE48A)
    val red = rgb(0xFF3B3B)
    val redDark = rgb(0x4A0E14)
    val violet = rgb(0x9B5CFF)
    val warm = rgb(0xFFD9A0)
    val ecto = rgb(0x7DFFC4)
    val wood = rgb(0x4A2A18)
    val woodLight = rgb(0x6B4226)
    val woodDark = rgb(0x2A160C)
    val metal = rgb(0x6D6080)
    val metalLight = rgb(0xA79BB8)
    val paper = rgb(0xE9E0C9)
    val paperDark = rgb(0xB8AC8E)
    val black = rgb(0x000000)
    val sky = rgb(0x0E1430)
    val moon = rgb(0xF4F1D0)

    val chars: Map<Char, Int> = mapOf(
        'W' to bone, 'P' to pupil, 'K' to rgb(0x2A1D3D), 'R' to rgb(0xE8364F), 'A' to gold, 'O' to rgb(0xFF6A00),
        'G' to metal, 'L' to metalLight, 'Y' to goldLight, 'B' to woodLight, 'D' to woodDark, 'N' to wood,
        'C' to cyan, 'M' to pink, 'E' to ecto, 'X' to black, 'S' to paper, 'T' to paperDark, 'V' to violet,
        'H' to rgb(0x7FD0FF), 'F' to rgb(0x5A8F6A), 'U' to rgb(0x3F6B4B), 'Q' to rgb(0x7A1030), 'Z' to rgb(0xFFD84A),
    )
}

class Sprite(val rows: List<String>) {
    val w = rows.maxOf { it.length }
    val h = rows.size
}

// Draws a sprite with its top-left at (x, y).
fun Pixmap.sprite(s: Sprite, x: Int, y: Int, tint: Int = Pal.bone, alpha: Float = 1f, flip: Boolean = false, scale: Int = 1) {
    for (j in 0 until s.h) {
        val row = s.rows[j]
        for (i in row.indices) {
            val ch = row[i]
            if (ch == '.') continue
            var c = if (ch == '#') tint else Pal.chars[ch] ?: continue
            if (alpha < 1f) c = Pixmap.withAlpha(c, alpha * ((c ushr 24) / 255f))
            val xx = if (flip) s.w - 1 - i else i
            if (scale == 1) set(x + xx, y + j, c) else rect(x + xx * scale, y + j * scale, scale, scale, c)
        }
    }
}

object Spr {
    val ghost = Sprite(listOf(
        "....######....", "..##########..", ".############.", ".##WW####WW##.",
        "##WWWW##WWWW##", "##WWPP##WWPP##", "##WWPP##WWPP##", "###WW####WW###",
        "##############", "##############", "##############", "##############",
        "##.###..###.##", "#...##..##...#",
    ))
    // Second frame of the hem: the ghost's tail ripples.
    val ghostHem2 = listOf("###.##..##.###", ".#..##..##..#.")
    // Eyes looking to the side.
    val ghostLookLeft = listOf(".##WW####WW##.", "##WWWW##WWWW##", "##PPWW##PPWW##", "##PPWW##PPWW##", "###WW####WW###")
    val ghostBlink = listOf(".############.", "##############", "##WWWW##WWWW##", "##############", "##############")

    val beer = Sprite(listOf(
        "..WWWWWW....", ".WWWWWWWWW..", ".KWWWWWWWK..", ".KAAAAAAAKKK", ".KAYAAAAAK.K",
        ".KAAAAYAAK.K", ".KAAAAAAAK.K", ".KAYAAAAAKKK", ".KAAAAAYAK..", ".KAAAAAAAK..", ".KKKKKKKKK..",
    ))
    val bottle = Sprite(listOf("..UU..", "..UU..", "..UU..", ".UUUU.", "UUUUUU", "UUSSUU", "UUSSUU", "UUUUUU", "UUUUUU", ".UUUU."))
    val ashtray = Sprite(listOf("..........WWWWWWO", "...GGGGGGGGGG....", "..GKKKKKKKKKKG...", ".GGGGGGGGGGGGGG..", "..GGGGGGGGGGGG..."))
    val coin = Sprite(listOf("..####..", ".#YYYY#.", "#YY##YY#", "#YY#YYY#", "#YY#YYY#", "#YY##YY#", ".#YYYY#.", "..####.."))
    val bat = Sprite(listOf("#.......#", "##.#.#.##", "###WXW###", ".#######.", "..#...#.."))
    val batFold = Sprite(listOf("..#.#..", ".#####.", ".#WXW#.", ".#####.", "..###..", "...#..."))
    val mouse = Sprite(listOf("..LL..", ".LLLL.", "LLPLLL", "LLLLLL", ".M..L."))
    val note = Sprite(listOf("..##", "..#.", "..#.", ".##.", "###.", ".#.."))
    val fermata = Sprite(listOf(".#####.", "#.....#", "#..#..#"))
    val heart = Sprite(listOf(".#.#.", "#####", "#####", ".###.", "..#.."))
    val zzz = Sprite(listOf("###", "..#", ".#.", "#..", "###"))
    val drop = Sprite(listOf("..#..", ".###.", "#####", "#####", ".###."))
    val mini = Sprite(listOf(".#####.", "#######", "#WP#WP#", "#######", "#######", "#.#.#.#"))
    val can = Sprite(listOf("GLG", "RRR", "RWR", "RRR", "GLG"))
    val canDown = Sprite(listOf("GRRRG", "LRWRL", "GRRRG"))
    val star = Sprite(listOf(".#.", "###", ".#."))
    val crown = Sprite(listOf("#.#.#", "#####", "#AAA#"))
}

// ---- The twelve ghosts ----
// Props are rectangles on an 18×20 grid (the ghost sits at 2,5), the same
// numbers as the game design document. 'body' means the ghost's own colour.

data class Prop(val x: Int, val y: Int, val w: Int, val h: Int, val c: Int, val body: Boolean = false)

private fun p(x: Int, y: Int, w: Int, h: Int, c: Char) = Prop(x, y, w, h, Pal.chars.getValue(c))
private fun p(x: Int, y: Int, w: Int, h: Int, c: Int) = Prop(x, y, w, h, c)
private fun body(x: Int, y: Int, w: Int, h: Int) = Prop(x, y, w, h, 0, body = true)

enum class GhostId(val color: Int, val props: List<Prop>) {
    KEV(rgb(0x7DFFC4), listOf(p(5, 3, 8, 3, 'R'), p(3, 5, 4, 1, 'R'), p(5, 4, 8, 1, rgb(0xB0283C)))),
    DEZ(rgb(0x18F0FF), listOf(p(3, 7, 12, 1, 'R'))),
    LENNY(rgb(0xFF7AD9), listOf(p(12, 14, 4, 1, 'W'), p(16, 14, 1, 1, 'O'), p(5, 13, 1, 2, 'H'))),
    MARCO(rgb(0xFFA04D), listOf(
        p(4, 9, 4, 3, 'P'), p(10, 9, 4, 3, 'P'), p(8, 9, 2, 1, 'P'), p(3, 9, 1, 1, 'P'), p(14, 9, 1, 1, 'P'),
        p(5, 16, 1, 1, 'A'), p(7, 17, 1, 1, 'A'), p(9, 17, 1, 1, 'A'), p(11, 17, 1, 1, 'A'), p(13, 16, 1, 1, 'A'),
    )),
    NOODLES(rgb(0xB9A3FF), listOf(
        p(5, 2, 8, 3, 'F'), p(4, 4, 10, 2, 'U'), p(8, 1, 2, 1, 'W'),
        body(4, 8, 4, 2), body(10, 8, 4, 2), p(4, 10, 4, 1, 'P'), p(10, 10, 4, 1, 'P'),
    )),
    MAESTRO(rgb(0xF3E7C9), listOf(p(6, 15, 2, 2, 'R'), p(10, 15, 2, 2, 'R'), p(8, 15, 2, 1, 'R'))),
    RICO(rgb(0xFFD166), listOf(p(6, 2, 6, 3, rgb(0x7A5A2A)), p(6, 4, 6, 1, 'K'), p(4, 5, 10, 1, rgb(0x7A5A2A)), p(7, 14, 4, 1, 'P'), p(9, 14, 1, 1, 'A'))),
    PAT(rgb(0x8DFF6A), listOf(
        p(5, 2, 8, 3, 'Z'), p(3, 5, 12, 1, rgb(0xE0B820)), p(7, 3, 1, 1, 'R'), p(10, 2, 1, 1, 'R'),
        p(4, 9, 4, 3, 'P'), p(10, 9, 4, 3, 'P'), p(8, 9, 2, 1, 'P'),
    )),
    TONY(rgb(0xFF5A5A), listOf(p(6, 13, 6, 1, 'K'), p(5, 14, 2, 1, 'K'), p(11, 14, 2, 1, 'K'), p(12, 14, 4, 1, 'B'), p(16, 14, 1, 1, 'O'))),
    JOE(rgb(0x9FB4FF), listOf(p(5, 1, 8, 3, 'K'), p(5, 3, 8, 1, 'R'), p(3, 4, 12, 1, 'K'), p(12, 14, 4, 1, 'W'), p(16, 14, 1, 1, 'O'))),
    VELVET(rgb(0xFF4FA3), listOf(p(12, 3, 3, 3, 'R'), p(13, 4, 1, 1, 'Y'), p(8, 13, 3, 1, 'R'))),
    FERMATA(rgb(0xE9E9F2), listOf(p(4, 5, 10, 1, 'K'), p(5, 4, 8, 1, 'K'), p(6, 15, 2, 2, 'K'), p(10, 15, 2, 2, 'K'), p(8, 15, 2, 1, 'K'))),
}

// Draws a ghost on its 18×20 grid with (x, y) the grid's top-left.
// level 1..5: memory. 1 is grey with no pupils, 3 has its colour back,
// 4 its props, 5 its shadow. t: seconds, for the ripple and the blink.
fun Pixmap.ghost(
    id: GhostId, x: Int, y: Int, t: Double = 0.0, level: Int = 5, alpha: Float = 1f,
    lookLeft: Boolean = false, scale: Int = 1, seed: Int = id.ordinal,
) {
    val c = when {
        level <= 1 -> rgb(0x8A8299)
        level == 2 -> rgb(0xC9C2D6)
        else -> id.color
    }
    val a = alpha * when (level) { 1 -> 0.45f; 2 -> 0.75f; else -> 1f }
    val rows = Spr.ghost.rows.toMutableList()
    if (level <= 1) for (i in rows.indices) rows[i] = rows[i].replace('P', 'W')
    // Blink every few seconds, ripple the hem twice a second.
    val blink = ((t * 1000).toLong() + seed * 977) % 3700 < 120
    if (lookLeft) for (i in 0..4) rows[3 + i] = Spr.ghostLookLeft[i]
    if (blink && level > 1) for (i in 0..4) rows[3 + i] = Spr.ghostBlink[i]
    if (((t * 2).toInt() + seed) % 2 == 1) { rows[12] = Spr.ghostHem2[0]; rows[13] = Spr.ghostHem2[1] }
    if (level >= 5) rect(x + (6) * scale, y + 20 * scale, 6 * scale, scale, Pixmap.withAlpha(Pal.black, 0.35f * a))
    sprite(Sprite(rows), x + 2 * scale, y + 5 * scale, c, a, scale = scale)
    if (level >= 4) for (pr in id.props) {
        val col = if (pr.body) c else pr.c
        rect(x + pr.x * scale, y + pr.y * scale, pr.w * scale, pr.h * scale, if (a < 1f) Pixmap.withAlpha(col, a) else col)
    }
}
