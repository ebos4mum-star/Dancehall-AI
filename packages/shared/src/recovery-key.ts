/**
 * The Recovery Key: a 160-bit random credential, shown once as 36 human-readable characters (Crockford base32, nine groups of four: 32 characters of key + 4 of
 * checksum so a typo is caught on the device before anything is sent). It is generated ON THE DEVICE from the OS CSPRNG. The server never receives it: the
 * client sends only a one-way digest, and the server stores a keyed hash of that digest. 160 bits means a leaked verifier table cannot be guessed offline.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_KEY_BYTES = 20;
const DATA_CHARS = 32;
const CHECK_CHARS = 4;

function encode(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}

function checksum(data: string): string {
  const h = sha256(utf8ToBytes(`dh-rk-check-v1:${data}`));
  return encode(h.subarray(0, 3)).slice(0, CHECK_CHARS);
}

const group = (s: string): string => s.match(/.{1,4}/g)!.join('-');

/** Makes a fresh key from `random` (the platform CSPRNG: `crypto.getRandomValues`). Returns the canonical (ungrouped) form. */
export function generateRecoveryKey(random: (n: number) => Uint8Array): string {
  const bytes = random(RECOVERY_KEY_BYTES);
  if (bytes.length !== RECOVERY_KEY_BYTES)
    throw new Error('random source returned the wrong length');
  const data = encode(bytes).slice(0, DATA_CHARS);
  return data + checksum(data);
}

/** The grouped, display form: XXXX-XXXX-… */
export const formatRecoveryKey = (canonical: string): string => group(canonical);

/**
 * Accepts what a person might type or paste: any case, spaces or dashes, and the usual look-alikes (O→0, I/L→1). Returns the canonical key, or null if the length
 * or checksum is wrong.
 */
export function parseRecoveryKey(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== DATA_CHARS + CHECK_CHARS) return null;
  for (const c of s) if (!ALPHABET.includes(c)) return null;
  const data = s.slice(0, DATA_CHARS);
  return checksum(data) === s.slice(DATA_CHARS) ? s : null;
}

/** What the client sends to find the account. A one-way digest: the Recovery Key itself never leaves the device. */
export const recoveryDigest = (canonical: string): string =>
  bytesToHex(sha256(utf8ToBytes(`dh-rk-digest-v1:${canonical}`)));
