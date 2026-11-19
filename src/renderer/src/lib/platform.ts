/**
 * True on macOS.
 *
 * Read from the user agent rather than the preload bridge because the decision
 * it drives is purely cosmetic and has to be made during the first render —
 * `app.info()` is async and would make the title bar flash the wrong layout.
 *
 * It matters because macOS puts the application menu in the system menu bar,
 * so rendering our in-app menu there as well would show the same menu twice.
 */
export const IS_MAC = /Macintosh|Mac OS X/.test(navigator.userAgent)
