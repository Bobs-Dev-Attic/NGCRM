import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with scrypt (Node built-in — no native deps). Node-only;
 * keep this out of edge-imported modules. Format: "<saltHex>:<keyHex>".
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const key = Buffer.from(keyHex, "hex");
  const test = scryptSync(password, salt, key.length);
  return key.length === test.length && timingSafeEqual(key, test);
}
