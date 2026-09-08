import * as Crypto from 'expo-crypto';

/**
 * Stable client-generated UUID.
 *
 * Written to a row's `client_ref` column so an insert can be retried exactly
 * once after an offline period without creating duplicates. Also used as the
 * local id for draft records before they reach the server.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
