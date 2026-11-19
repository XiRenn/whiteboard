/**
 * Id generation.
 *
 * Board ids must match `BOARD_ID_PATTERN` (`^[a-z0-9][a-z0-9-]{5,63}$`) because
 * the main process validates them before turning them into file names.
 * Object ids have no such constraint — they never touch the filesystem.
 */

const HEX = '0123456789abcdef'

function randomHex(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += HEX[bytes[i] & 0x0f]
  return out
}

/** Short, collision-resistant object id. */
export function createShapeId(): string {
  return `s_${randomHex(12)}`
}

/** Group id — same shape as a shape id, separate namespace by prefix. */
export function createGroupId(): string {
  return `g_${randomHex(12)}`
}

/**
 * Board id. Lowercase hex only, so it satisfies the shared pattern and is a
 * safe file name on every platform without further escaping.
 */
export function createBoardId(): string {
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(12)}`
}
