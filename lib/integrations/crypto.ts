/**
 * AES-256-GCM encryption for integration secrets (SMTP password, SMS/WhatsApp
 * tokens) so they are never stored in plaintext in the settings table.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY is not set');
  // Derives a stable 32-byte key from whatever hex/string the operator supplies.
  return scryptSync(secret, 'complianceos-settings', 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  if (!payload.startsWith('v1:')) return payload; // legacy plaintext value
  try {
    const [, ivHex, tagHex, dataHex] = payload.split(':');
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Masks a secret for display: sk_live_abcd…wxyz */
export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 8, 12))}${value.slice(-4)}`;
}
