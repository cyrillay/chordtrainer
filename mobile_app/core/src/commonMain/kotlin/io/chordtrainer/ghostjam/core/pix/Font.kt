// A 5×7 pixel font, drawn by hand, uppercase like an arcade cabinet (lower
// case is shown as upper case). French accents sit above the letter.
// Music signs (♭ ♯ ° ø Δ) are glyphs too, so chord symbols stay pixel-crisp.

package io.chordtrainer.ghostjam.core.pix

object Font {
    const val H = 7
    private val G: Map<Char, List<String>> = mapOf(
        'A' to listOf(".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
        'B' to listOf("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),
        'C' to listOf(".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
        'D' to listOf("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
        'E' to listOf("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
        'F' to listOf("#####", "#....", "#....", "####.", "#....", "#....", "#...."),
        'G' to listOf(".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"),
        'H' to listOf("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
        'I' to listOf("###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"),
        'J' to listOf("..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."),
        'K' to listOf("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
        'L' to listOf("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
        'M' to listOf("#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"),
        'N' to listOf("#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"),
        'O' to listOf(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
        'P' to listOf("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
        'Q' to listOf(".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),
        'R' to listOf("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
        'S' to listOf(".####", "#....", "#....", ".###.", "....#", "....#", "####."),
        'T' to listOf("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
        'U' to listOf("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
        'V' to listOf("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),
        'W' to listOf("#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."),
        'X' to listOf("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),
        'Y' to listOf("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
        'Z' to listOf("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),
        '0' to listOf(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),
        '1' to listOf(".#.", "##.", ".#.", ".#.", ".#.", ".#.", "###"),
        '2' to listOf(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),
        '3' to listOf("####.", "....#", "....#", ".###.", "....#", "....#", "####."),
        '4' to listOf("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),
        '5' to listOf("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
        '6' to listOf(".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."),
        '7' to listOf("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
        '8' to listOf(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),
        '9' to listOf(".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."),
        ' ' to listOf("...", "...", "...", "...", "...", "...", "..."),
        '.' to listOf(".", ".", ".", ".", ".", ".", "#"),
        ',' to listOf("..", "..", "..", "..", "..", ".#", "#."),
        ':' to listOf(".", ".", "#", ".", ".", "#", "."),
        '!' to listOf("#", "#", "#", "#", "#", ".", "#"),
        '?' to listOf(".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."),
        '\'' to listOf("#", "#", ".", ".", ".", ".", "."),
        '"' to listOf("#.#", "#.#", "...", "...", "...", "...", "..."),
        '-' to listOf("....", "....", "....", "####", "....", "....", "...."),
        '+' to listOf(".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."),
        '×' to listOf(".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"),
        '/' to listOf("....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."),
        '(' to listOf(".#", "#.", "#.", "#.", "#.", "#.", ".#"),
        ')' to listOf("#.", ".#", ".#", ".#", ".#", ".#", "#."),
        '#' to listOf(".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."),
        '%' to listOf("##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##"),
        '·' to listOf(".", ".", ".", "#", ".", ".", "."),
        '…' to listOf(".....", ".....", ".....", ".....", ".....", ".....", "#.#.#"),
        '♭' to listOf("#...", "#...", "#...", "###.", "#..#", "#.#.", "##.."),
        '♯' to listOf(".#.#", "####", ".#.#", ".#.#", "####", ".#.#", "...."),
        '°' to listOf(".#.", "#.#", ".#.", "...", "...", "...", "..."),
        'ø' to listOf("....", "...#", ".##.", "#.##", "##.#", ".##.", "#..."),
        'Δ' to listOf(".....", "..#..", ".#.#.", ".#.#.", "#...#", "#####", "....."),
        '♥' to listOf(".....", ".#.#.", "#####", "#####", ".###.", "..#..", "....."),
        '♪' to listOf("..##", "..#.", "..#.", "..#.", ".##.", "###.", ".#.."),
        '>' to listOf("#...", ".#..", "..#.", "...#", "..#.", ".#..", "#..."),
        '<' to listOf("...#", "..#.", ".#..", "#...", ".#..", "..#.", "...#"),
        '=' to listOf("....", "....", "####", "....", "####", "....", "...."),
        '&' to listOf(".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"),
        '∞' to listOf(".......", ".......", ".##.##.", "#..#..#", "#..#..#", ".##.##.", "......."),
        // Lower-case m only: chord symbols need Am apart from AM.
        'm' to listOf(".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"),
        '_' to listOf("....", "....", "....", "....", "....", "....", "####"),
    )

    // Accented letters: the base letter and a mark drawn two rows above it.
    private val ACCENTS: Map<Char, Pair<Char, String>> = mapOf(
        'É' to ('E' to "acute"), 'È' to ('E' to "grave"), 'Ê' to ('E' to "circ"), 'Ë' to ('E' to "diaer"),
        'À' to ('A' to "grave"), 'Â' to ('A' to "circ"), 'Î' to ('I' to "circ"), 'Ï' to ('I' to "diaer"),
        'Ô' to ('O' to "circ"), 'Ù' to ('U' to "grave"), 'Û' to ('U' to "circ"), 'Ç' to ('C' to "cedilla"),
    )

    private fun norm(ch: Char): Char = when (ch) {
        '’' -> '\''
        '–', '—' -> '-'
        'm' -> 'm'
        else -> ch.uppercaseChar()
    }

    private fun glyph(ch: Char): List<String> = G[ch] ?: ACCENTS[ch]?.let { G[it.first] } ?: G.getValue('?')

    fun width(s: String, scale: Int = 1): Int {
        var w = 0
        for (c in s) w += (glyph(norm(c))[0].length + 1) * scale
        return if (w > 0) w - scale else 0
    }

    // Draws s with its top-left at (x, y). Returns the x after the text.
    fun draw(pm: Pixmap, s: String, x: Int, y: Int, color: Int, scale: Int = 1, shadow: Int = 0): Int {
        if (shadow != 0) { val d = maxOf(1, scale / 2); draw(pm, s, x + d, y + d, shadow, scale) }
        var cx = x
        for (raw in s) {
            val ch = norm(raw)
            val g = glyph(ch)
            g.forEachIndexed { row, line ->
                line.forEachIndexed { col, p -> if (p == '#') pm.rect(cx + col * scale, y + row * scale, scale, scale, color) }
            }
            ACCENTS[ch]?.let { (_, mark) -> accent(pm, mark, cx, y, g[0].length, scale, color) }
            cx += (g[0].length + 1) * scale
        }
        return cx
    }

    fun drawCentered(pm: Pixmap, s: String, cx: Int, y: Int, color: Int, scale: Int = 1, shadow: Int = 0) =
        draw(pm, s, cx - width(s, scale) / 2, y, color, scale, shadow)

    private fun accent(pm: Pixmap, mark: String, x: Int, y: Int, gw: Int, s: Int, c: Int) {
        val mid = x + (gw / 2) * s
        when (mark) {
            "acute" -> { pm.rect(mid + s, y - 2 * s, s, s, c); pm.rect(mid, y - s, s, s, c) }
            "grave" -> { pm.rect(mid - s, y - 2 * s, s, s, c); pm.rect(mid, y - s, s, s, c) }
            "circ" -> { pm.rect(mid, y - 2 * s, s, s, c); pm.rect(mid - s, y - s, s, s, c); pm.rect(mid + s, y - s, s, s, c) }
            "diaer" -> { pm.rect(mid - s, y - 2 * s, s, s, c); pm.rect(mid + s, y - 2 * s, s, s, c) }
            "cedilla" -> { pm.rect(mid, y + 7 * s, s, s, c); pm.rect(mid - s, y + 8 * s, s, s, c) }
        }
    }

    // Wraps words to fit maxWidth; returns the lines.
    fun wrap(s: String, maxWidth: Int, scale: Int = 1): List<String> {
        val out = mutableListOf<String>()
        var line = ""
        for (word in s.split(' ')) {
            val next = if (line.isEmpty()) word else "$line $word"
            if (width(next, scale) > maxWidth && line.isNotEmpty()) { out += line; line = word } else line = next
        }
        if (line.isNotEmpty()) out += line
        return out
    }
}

// Seven-segment digits for alarm clocks and scoreboards. Each digit is
// 4 wide and 7 tall at scale 1; segments light in `on`, ghost in `off`.
object Segments {
    private val MAP = mapOf(
        '0' to "abcdef", '1' to "bc", '2' to "abged", '3' to "abgcd", '4' to "fgbc",
        '5' to "afgcd", '6' to "afgedc", '7' to "abc", '8' to "abcdefg", '9' to "abcdfg",
    )

    fun draw(pm: Pixmap, s: String, x: Int, y: Int, on: Int, off: Int, scale: Int = 2, colon: Boolean = true): Int {
        var cx = x
        val w = 4 * scale; val h = 7 * scale
        for (ch in s) {
            if (ch == ':') {
                if (colon) { pm.rect(cx, y + 2 * scale, scale, scale, on); pm.rect(cx, y + 5 * scale, scale, scale, on) }
                cx += 2 * scale
                continue
            }
            val segs = MAP[ch] ?: ""
            fun seg(name: Char, sx: Int, sy: Int, sw: Int, sh: Int) = pm.rect(cx + sx, y + sy, sw, sh, if (name in segs) on else off)
            seg('a', scale, 0, w - 2 * scale, scale)
            seg('g', scale, 3 * scale, w - 2 * scale, scale)
            seg('d', scale, h - scale, w - 2 * scale, scale)
            seg('f', 0, scale, scale, 2 * scale)
            seg('b', w - scale, scale, scale, 2 * scale)
            seg('e', 0, 4 * scale, scale, 2 * scale)
            seg('c', w - scale, 4 * scale, scale, 2 * scale)
            cx += w + scale
        }
        return cx
    }
}
