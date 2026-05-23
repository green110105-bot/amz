// AES-256-GCM cipher for at-rest credential encryption.
// Key source: env CREDENTIAL_ENC_KEY (64 hex chars = 32 bytes).
// Fails closed: no key → throw. Never silently store plaintext.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

function loadKey() {
  const hex = process.env.CREDENTIAL_ENC_KEY;
  if (!hex) throw new Error('credential_enc_key_missing');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('credential_enc_key_must_be_64_hex_chars');
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plaintext) {
  if (plaintext == null || plaintext === '') throw new Error('plaintext_empty');
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptToken(packed) {
  if (!packed || typeof packed !== 'string') throw new Error('ciphertext_empty');
  const parts = packed.split('.');
  if (parts.length !== 3) throw new Error('ciphertext_format_invalid');
  const key = loadKey();
  const [ivB64, tagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

export function isCredentialEncryptionReady() {
  try { loadKey(); return true; } catch { return false; }
}
