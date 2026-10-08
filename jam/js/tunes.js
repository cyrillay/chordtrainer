// Ghost Jam: which grooves each tune suits. The Chords trainer's progressions
// know nothing about style, so the tags live here, keyed by progression name.
// The tune menu shows the tunes that fit the chosen groove first and Shuffle
// only draws from them. Every progression needs at least one style
// (tests/jam.test.js checks it).
//
// The rules: swing takes the bebop vocabulary (passing diminished chords,
// fast cycles), bossa the maj7 cadences and tritone subs, lo-fi the slow
// diatonic jazz loops, ballad the pop triads and the classical and cinematic
// lines, funk the one and two chord vamps, reggae the pop and rocksteady
// triads and the minor vamps.

import { PROGRESSIONS } from '../../js/training/progressions.js';

// Menu sections, in order. Each tune sits in one.
export const FAMILIES = ['Pop & rock', 'Jazz standards', 'Jazz turnarounds', 'Bridges & endings', 'Dropbacks', 'Classical & Spanish', 'Andalusian', 'Minor pop & rock', 'Modal vamps', 'Minor jazz', 'Minor blues'];

// name: [family, styles]
const TAGS = {
  // Pop & rock
  'I–vi–IV–V (50s)': ['Pop & rock', ['ballad', 'reggae']],
  'I–IV–vi–V': ['Pop & rock', ['ballad', 'reggae']],
  'vi–IV–I–V': ['Pop & rock', ['ballad', 'lofi', 'reggae']],
  'I–V–vi–IV (axis)': ['Pop & rock', ['ballad', 'lofi', 'reggae']],
  'I–ii–V–I': ['Pop & rock', ['ballad', 'reggae']],
  'I–IV–V–IV': ['Pop & rock', ['funk', 'reggae']],
  'I–vi–ii–V': ['Pop & rock', ['ballad', 'reggae']],
  'vi–V–IV–V': ['Pop & rock', ['ballad', 'reggae']],
  'I–IV–I–V': ['Pop & rock', ['funk', 'reggae']],
  'ii–V–I–vi': ['Pop & rock', ['ballad', 'lofi']],
  'I–iii–vi–IV': ['Pop & rock', ['ballad']],
  'I–IV–ii–V': ['Pop & rock', ['ballad', 'reggae']],
  'vi–IV–I–ii': ['Pop & rock', ['ballad', 'lofi']],
  'I–V–IV–V': ['Pop & rock', ['funk', 'reggae']],
  // Jazz standards
  'Amen': ['Jazz standards', ['lofi', 'bossa', 'ballad']],
  'Autumnal': ['Jazz standards', ['swing', 'bossa']],
  'Body & Soul': ['Jazz standards', ['ballad', 'swing']],
  'Dizzy': ['Jazz standards', ['bossa', 'swing']],
  'Dogleg': ['Jazz standards', ['swing', 'lofi']],
  '7-chord Dropback': ['Jazz standards', ['swing']],
  'Extended': ['Jazz standards', ['swing', 'bossa', 'lofi']],
  'Happenstance': ['Jazz standards', ['swing']],
  'Long': ['Jazz standards', ['swing', 'lofi']],
  'Overrun': ['Jazz standards', ['lofi', 'bossa', 'swing']],
  "Moment's": ['Jazz standards', ['swing']],
  'Night & Day': ['Jazz standards', ['bossa', 'ballad', 'swing']],
  "Nobody's": ['Jazz standards', ['ballad', 'lofi']],
  'Nowhere': ['Jazz standards', ['bossa', 'swing']],
  '7-chord Pullback': ['Jazz standards', ['swing']],
  'Rainbow': ['Jazz standards', ['ballad', 'lofi']],
  'Rainy': ['Jazz standards', ['ballad', 'bossa']],
  'Satin': ['Jazz standards', ['swing', 'lofi']],
  'Spring': ['Jazz standards', ['swing', 'ballad']],
  'Stablemates': ['Jazz standards', ['swing']],
  'Starlight': ['Jazz standards', ['ballad', 'swing']],
  'Starlight N&D Variant': ['Jazz standards', ['ballad', 'swing']],
  'Regular': ['Jazz standards', ['swing', 'bossa', 'lofi', 'ballad']],
  'Regular (minor)': ['Jazz standards', ['swing', 'bossa', 'ballad']],
  'Tension Ending': ['Jazz standards', ['funk', 'swing']],
  'Tritone Substitution': ['Jazz standards', ['bossa', 'swing']],
  'Two-Goes': ['Jazz standards', ['swing', 'bossa']],
  'Yardbird': ['Jazz standards', ['swing', 'lofi']],
  // Jazz turnarounds
  'Foggy': ['Jazz turnarounds', ['swing', 'bossa']],
  "II 'n' Back": ['Jazz turnarounds', ['swing']],
  'Ladybird': ['Jazz turnarounds', ['swing', 'bossa']],
  'Nowhere (turnaround)': ['Jazz turnarounds', ['swing']],
  'Pennies': ['Jazz turnarounds', ['swing']],
  'POT': ['Jazz turnarounds', ['swing', 'bossa', 'lofi']],
  'POT (minor)': ['Jazz turnarounds', ['swing', 'bossa']],
  'Rhythm': ['Jazz turnarounds', ['swing']],
  'SPOT': ['Jazz turnarounds', ['swing', 'lofi']],
  "To IV 'n' Back": ['Jazz turnarounds', ['swing']],
  "To IV 'n' Hack": ['Jazz turnarounds', ['swing']],
  "To IV 'n' Mack": ['Jazz turnarounds', ['swing', 'ballad']],
  "To IV 'n' Yak": ['Jazz turnarounds', ['swing', 'lofi']],
  'Whoopee': ['Jazz turnarounds', ['swing']],
  // Bridges & endings
  'Autumn Leaves Opening': ['Bridges & endings', ['swing', 'bossa']],
  'Four-Star Ending': ['Bridges & endings', ['swing']],
  'Honeysuckle Bridge': ['Bridges & endings', ['swing']],
  'ITCHY Opening': ['Bridges & endings', ['swing']],
  'On-Off-On Dropback': ['Bridges & endings', ['swing']],
  'Pennies Ending': ['Bridges & endings', ['swing']],
  'Rhythm Bridge': ['Bridges & endings', ['swing']],
  'Sharp Fourpenny Ending': ['Bridges & endings', ['swing']],
  'Sixpenny Ending': ['Bridges & endings', ['swing']],
  "To IV 'n' Bird SPOT": ['Bridges & endings', ['swing']],
  'Twopenny Ending': ['Bridges & endings', ['swing']],
  // Dropbacks
  'Chromatic Dropback': ['Dropbacks', ['swing']],
  'Dogleg (dropback)': ['Dropbacks', ['swing']],
  'Dropback': ['Dropbacks', ['swing']],
  'Raindrop': ['Dropbacks', ['swing']],
  'Starlight Dropback': ['Dropbacks', ['swing']],
  'TINGLe Dropback': ['Dropbacks', ['swing']],
  'TTFA Dropback': ['Dropbacks', ['swing']],
  // Classical & Spanish
  'Minor i–iv–V': ['Classical & Spanish', ['ballad', 'reggae']],
  'Spanish cadence': ['Classical & Spanish', ['ballad', 'reggae']],
  'Phrygian dominant': ['Classical & Spanish', ['ballad']],
  'Baroque turnaround': ['Classical & Spanish', ['ballad']],
  'Lament': ['Classical & Spanish', ['ballad']],
  'Pachelbel (minor)': ['Classical & Spanish', ['ballad']],
  'La Folia': ['Classical & Spanish', ['ballad']],
  'Greensleeves': ['Classical & Spanish', ['ballad']],
  // Andalusian
  'Andalusian': ['Andalusian', ['ballad', 'lofi']],
  'Hit the Road Jack': ['Andalusian', ['swing', 'funk']],
  'Stray Cat': ['Andalusian', ['swing', 'funk']],
  // Minor pop & rock
  'Pop minor': ['Minor pop & rock', ['ballad', 'lofi', 'reggae']],
  'Cinematic resolve': ['Minor pop & rock', ['ballad']],
  'Build-up': ['Minor pop & rock', ['ballad', 'reggae']],
  'Epic descent': ['Minor pop & rock', ['ballad', 'lofi']],
  'Mad World': ['Minor pop & rock', ['ballad', 'lofi']],
  'Smoke on the Water': ['Minor pop & rock', ['funk']],
  'House of the Rising Sun': ['Minor pop & rock', ['ballad']],
  'Stairway intro': ['Minor pop & rock', ['ballad', 'bossa', 'lofi']],
  // Modal vamps
  'Dorian vamp': ['Modal vamps', ['funk', 'reggae', 'lofi']],
  'Dorian rock': ['Modal vamps', ['funk', 'reggae']],
  'Modal pop minor': ['Modal vamps', ['reggae', 'ballad']],
  'Phrygian colour': ['Modal vamps', ['funk', 'ballad']],
  // Minor jazz
  'Minor ii–V–i': ['Minor jazz', ['swing', 'bossa', 'ballad']],
  'Minor ii–V–iΔ': ['Minor jazz', ['bossa', 'swing']],
  'Minor turnaround': ['Minor jazz', ['bossa', 'swing']],
  'Autumn Leaves cycle': ['Minor jazz', ['swing', 'bossa', 'lofi']],
  'Minor V-of-V': ['Minor jazz', ['bossa', 'swing']],
  // Minor blues
  'Minor blues': ['Minor blues', ['swing', 'funk']],
  'Slow minor blues': ['Minor blues', ['ballad', 'swing']],
};

export const tuneFamily = (prog) => TAGS[prog.name]?.[0] ?? null;
export const tuneStyles = (prog) => TAGS[prog.name]?.[1] ?? [];
export const fitsStyle = (prog, style) => tuneStyles(prog).includes(style);
export const tunesFor = (style) => PROGRESSIONS.filter((p) => fitsStyle(p, style));
