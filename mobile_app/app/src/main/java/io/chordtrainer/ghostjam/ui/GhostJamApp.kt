// M0 screens: Room 7 (home), Jam (play) and Tune in (calibration).
// Placeholder art: the real floors, the elevator and the clock story come
// with M1, as planned in the game design document.

package io.chordtrainer.ghostjam.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.chordtrainer.ghostjam.R
import io.chordtrainer.ghostjam.core.Grade
import io.chordtrainer.ghostjam.core.Role
import io.chordtrainer.ghostjam.core.STYLES
import io.chordtrainer.ghostjam.core.StyleId
import io.chordtrainer.ghostjam.core.TUNES
import io.chordtrainer.ghostjam.core.Tune
import io.chordtrainer.ghostjam.core.NOTE_NAMES
import io.chordtrainer.ghostjam.game.Calibration
import io.chordtrainer.ghostjam.game.JamController
import io.chordtrainer.ghostjam.game.Prefs
import io.chordtrainer.ghostjam.midi.MidiInput
import kotlinx.coroutines.delay

private enum class Screen { ROOM, JAM, TUNE_IN }

// The Dead Ringers: Dez on drums, Lenny on bass, Marco on keys, then the guest.
private val BAND = listOf(Palette.cyan, Palette.neon, Palette.orange, Palette.good)

private fun t(size: Int, color: Color = Palette.ink, bold: Boolean = false) =
    TextStyle(fontFamily = Pixel, fontSize = size.sp, color = color, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)

@Composable
fun GhostJamApp(midi: MidiInput, jam: JamController, calib: Calibration, prefs: Prefs) {
    var screen by remember { mutableStateOf(Screen.ROOM) }
    var style by remember { mutableStateOf(StyleId.LOFI) }
    var tune by remember { mutableStateOf(TUNES.first { it.fits(StyleId.LOFI) }) }
    var key by remember { mutableStateOf("C") }

    val startJam = {
        val g = STYLES.getValue(style)
        jam.start(style, g.tempo.def, tune.chordsIn(key))
        screen = Screen.JAM
    }

    Box(Modifier.fillMaxSize().background(Palette.night).safeDrawingPadding().padding(16.dp)) {
        when (screen) {
            Screen.ROOM -> Room(
                midi, style, tune,
                onStyle = { s -> style = s; if (!tune.fits(s)) tune = TUNES.first { it.fits(s) } },
                onShuffle = { tune = TUNES.filter { it.fits(style) }.random(); key = NOTE_NAMES.random() },
                onJam = startJam,
                onTuneIn = { calib.start(); screen = Screen.TUNE_IN },
            )
            Screen.JAM -> Jam(jam, onAgain = startJam, onBack = { jam.stop(); screen = Screen.ROOM })
            Screen.TUNE_IN -> TuneIn(calib, onBack = { screen = Screen.ROOM })
        }
    }
}

// ---- Room 7 ----

@Composable
private fun Clock() {
    // The colon never blinks. Time stopped at 23:59.
    Text("23:59", style = t(44, Palette.clock, bold = true))
}

@Composable
private fun Floating(delayMs: Int, content: @Composable () -> Unit) {
    val y by rememberInfiniteTransition(label = "float").animateFloat(
        0f, -6f, infiniteRepeatable(tween(1600, delayMillis = delayMs), RepeatMode.Reverse), label = "y",
    )
    Box(Modifier.offset { IntOffset(0, y.dp.roundToPx()) }) { content() }
}

@Composable
private fun Room(
    midi: MidiInput, style: StyleId, tune: Tune,
    onStyle: (StyleId) -> Unit, onShuffle: () -> Unit, onJam: () -> Unit, onTuneIn: () -> Unit,
) {
    val device by midi.device.collectAsState()
    val scanning by midi.scanning.collectAsState()
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.all { it }) midi.scanBluetooth()
    }
    val btPermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
        arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    else arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)

    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.room), style = t(12, Palette.dim))
            Clock()
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Bottom) {
                BAND.take(3).forEachIndexed { i, c -> Floating(i * 500) { Ghost(c, px = 5.dp, level = 1 + i) } }
            }
            Spacer(Modifier.weight(1f))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(10.dp).background(if (device != null) Palette.good else Palette.clock, CircleShape))
                Text(device ?: stringResource(R.string.midi_none), style = t(12, Palette.dim))
            }
            if (device == null) Chip(stringResource(if (scanning) R.string.midi_scanning else R.string.midi_bluetooth)) { ask.launch(btPermissions) }
        }
        Column(Modifier.weight(1.3f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StyleId.entries.forEach { s -> Chip(STYLES.getValue(s).name, selected = s == style) { onStyle(s) } }
            }
            Text(tune.name, style = t(18, Palette.cyan))
            Text(tune.tokens.joinToString("  "), style = t(13, Palette.dim))
            Text(stringResource(R.string.bpm, STYLES.getValue(style).tempo.def), style = t(12, Palette.dim))
            Chip(stringResource(R.string.shuffle), onClick = onShuffle)
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BigButton(stringResource(R.string.jam), Palette.neon, onJam)
                BigButton(stringResource(R.string.calibrate), Palette.line, onTuneIn)
            }
        }
    }
}

@Composable
private fun Chip(label: String, selected: Boolean = false, onClick: () -> Unit) {
    Text(
        label,
        style = t(12, if (selected) Palette.night else Palette.ink),
        modifier = Modifier
            .background(if (selected) Palette.cyan else Palette.panel)
            .border(1.dp, Palette.line)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}

@Composable
private fun BigButton(label: String, color: Color, onClick: () -> Unit) {
    Text(
        label.uppercase(),
        style = t(16, Palette.bone, bold = true),
        modifier = Modifier.background(color).clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 14.dp),
    )
}

// ---- Jam ----

@Composable
private fun gradeLabel(g: Grade) = stringResource(
    when (g) { Grade.PERFECT -> R.string.perfect; Grade.GOOD -> R.string.good; Grade.LATE -> R.string.late; Grade.MISS -> R.string.miss },
)

private fun gradeColor(g: Grade) = when (g) {
    Grade.PERFECT -> Palette.gold; Grade.GOOD -> Palette.good; Grade.LATE -> Palette.orange; Grade.MISS -> Palette.clock
}

@Composable
private fun Jam(jam: JamController, onAgain: () -> Unit, onBack: () -> Unit) {
    val s by jam.state.collectAsState()
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${stringResource(R.string.score)} ${s.score}", style = t(14, Palette.ink))
            Text("${stringResource(R.string.combo)} ${s.combo}", style = t(14, if (s.combo >= 4) Palette.gold else Palette.dim))
            Text(stringResource(R.string.stop), style = t(14, Palette.dim), modifier = Modifier.clickable(onClick = onBack))
        }
        Row(Modifier.weight(1f).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    repeat(4) { b ->
                        val on = s.bar >= 0 && s.beat == b
                        Box(Modifier.size(14.dp).background(if (on) (if (b == 0) Palette.neon else Palette.gold) else Palette.line, CircleShape))
                    }
                }
                Spacer(Modifier.height(10.dp))
                val big = when {
                    s.bar == 0 -> "${s.beat + 1}"
                    s.chord != null -> s.chord!!.symbol
                    else -> "·"
                }
                Text(big, style = t(64, Palette.bone, bold = true))
                Text(s.upcoming.joinToString("   ") { it.symbol }, style = t(16, Palette.dim))
                Spacer(Modifier.height(8.dp))
                s.shout?.let { g -> Text(gradeLabel(g), style = t(22, gradeColor(g), bold = true)) }
            }
        }
        // The band: whoever is on stage glows. Energy 0 is drums and bass.
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            BAND.forEachIndexed { i, c ->
                val onStage = when (i) { 0, 1 -> true; 2 -> s.energy >= 1; else -> s.energy >= 3 }
                Box(Modifier.padding(horizontal = 10.dp)) { Ghost(c, px = 4.dp, alpha = if (onStage) 1f else 0.15f) }
            }
        }
        Keyboard(s.keys, Modifier.fillMaxWidth().height(44.dp))
    }
    if (s.over) Results(s.score, s.rank, onAgain, onBack)
}

@Composable
private fun Keyboard(keys: Map<Int, Role>, modifier: Modifier) {
    val low = 36; val high = 96
    val black = setOf(1, 3, 6, 8, 10)
    val whites = (low..high).filter { it % 12 !in black }
    Canvas(modifier) {
        val w = size.width / whites.size
        fun roleColor(r: Role?) = when (r) { Role.TONE -> Palette.cyan; Role.COLOUR -> Palette.gold; Role.WRONG -> Palette.clock; null -> null }
        whites.forEachIndexed { i, m ->
            drawRect(roleColor(keys[m]) ?: Palette.bone, Offset(i * w + 1, 0f), Size(w - 2, size.height))
        }
        (low..high).filter { it % 12 in black }.forEach { m ->
            val i = whites.indexOfLast { it < m }
            drawRect(roleColor(keys[m]) ?: Palette.pupil, Offset((i + 1) * w - w * 0.3f, 0f), Size(w * 0.6f, size.height * 0.6f))
        }
    }
}

@Composable
private fun Results(score: Int, rank: String, onAgain: () -> Unit, onBack: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Palette.night.copy(alpha = 0.92f)), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(rank, style = t(72, Palette.gold, bold = true))
            Text("$score", style = t(24, Palette.ink))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BigButton(stringResource(R.string.back), Palette.line, onBack)
                BigButton(stringResource(R.string.again), Palette.neon, onAgain)
            }
        }
    }
}

// ---- Tune in ----

@Composable
private fun TuneIn(calib: Calibration, onBack: () -> Unit) {
    val s by calib.state.collectAsState()
    LaunchedEffect(Unit) { while (true) { calib.tick(); delay(16) } }
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically)) {
        Text(stringResource(R.string.calib_hint), style = t(16, Palette.ink))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(16) { i ->
                Box(Modifier.size(12.dp).background(if (i < s.clicks) (if (i % 4 == 0) Palette.neon else Palette.gold) else Palette.line, CircleShape))
            }
        }
        Text("${s.taps}", style = t(28, Palette.cyan))
        s.offsetMs?.let { Text(stringResource(R.string.calib_done, it), style = t(14, Palette.good)) }
        if (s.done) {
            Text(stringResource(R.string.calib_bt_warning), style = t(11, Palette.dim))
            BigButton(stringResource(R.string.back), Palette.line, onBack)
        }
    }
}
