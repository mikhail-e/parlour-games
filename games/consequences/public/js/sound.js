// The sound that calls a player back to the game: «Three notes», three notes
// up like a marimba (the owner's pick from a page of variants), made by the
// browser itself (Web Audio): no file to load, nothing the CSP has to allow.
// When to call is game-room.js's; here: the sound, the switch's choice, and
// whether the player is looking at the game.
//
// A browser lets no page sound before a tap or a key on it, and asks no
// permission for it: every tap or key wakes the sound if it sleeps (Safari
// stops it while the page is in the background). A sound that cannot play
// now is dropped, never held: a call heard when the player is back and taps
// would come at the wrong time.
/* exported soundIsOn, setSoundOn, callPlayerBack */
/* global AppStorage, debugLog */
// From the game's config.js
/* global APP_STORAGE_PREFIX */

// The switch's choice: 'off' when the player turned the sound off; no key - on
const SOUND_KEY = `${APP_STORAGE_PREFIX}-sound`;

// The notes: C, E, G of the fifth octave, one after another
const SOUND_NOTES = [523.25, 659.25, 783.99];
const SOUND_NOTE_GAP = 0.11;
// A marimba's overtone over each note, quiet and short
const SOUND_OVERTONE = 3.93;
const SOUND_VOLUME = 0.3;

let soundContext = null;
let soundOut = null;

// On a tap or a key: the browser allows the sound from now on. A mouse gives
// it on pointerdown, a finger only on pointerup, so both
function wakeSound() {
    try {
        if (!soundContext) {
            if (!window.AudioContext) return;
            soundContext = new AudioContext();
            soundOut = soundContext.createGain();
            soundOut.gain.value = SOUND_VOLUME;
            soundOut.connect(soundContext.destination);
        }
        if (soundContext.state !== 'running') soundContext.resume().catch(error => debugLog('Sound not woken:', error));
    } catch (error) {
        debugLog('No sound:', error);
    }
}
['pointerdown', 'pointerup', 'keydown'].forEach(type => document.addEventListener(type, wakeSound, true));

// One strike of a tone: a quick rise, then an exponential fade
function strike(time, frequency, peak, length) {
    const tone = soundContext.createOscillator();
    tone.frequency.value = frequency;
    const gain = soundContext.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    tone.connect(gain).connect(soundOut);
    tone.start(time);
    tone.stop(time + length + 0.05);
}

function threeNotes() {
    const start = soundContext.currentTime + 0.03;
    SOUND_NOTES.forEach((frequency, index) => {
        const time = start + index * SOUND_NOTE_GAP;
        const last = index === SOUND_NOTES.length - 1;
        strike(time, frequency, 1, last ? 0.9 : 0.45);
        strike(time, frequency * SOUND_OVERTONE, 0.15, 0.12);
    });
}

// The sound, now or never; `tapped`: the player's own press, whose waking
// the sound may wait for
function playThreeNotes(tapped = false) {
    if (!soundContext) return;
    if (soundContext.state === 'running') {
        threeNotes();
    } else if (tapped) {
        soundContext.resume().then(threeNotes, error => debugLog('Sound not woken:', error));
    }
}

function soundIsOn() {
    return AppStorage.get(SOUND_KEY) !== 'off';
}

// The switch: the choice is kept in this browser; the sound turned on plays
// once, so the player hears which it is
function setSoundOn(on) {
    if (on) {
        AppStorage.remove(SOUND_KEY);
        playThreeNotes(true);
    } else {
        AppStorage.set(SOUND_KEY, 'off');
    }
}

// The player is not looking at the game: its tab is hidden (another tab, a
// minimized window, another app) or its window is not the one in focus (a
// video call's window next to it)
function playerLooksAway() {
    return document.visibilityState === 'hidden' || !document.hasFocus();
}

// A new question or the reading has come: call the player back if they are
// looking away and want the sound
function callPlayerBack() {
    if (soundIsOn() && playerLooksAway()) playThreeNotes();
}
