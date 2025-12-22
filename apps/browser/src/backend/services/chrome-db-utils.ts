/**
 * Shared utilities for Chrome-compatible database services.
 * Chrome uses WebKit timestamps (microseconds since Jan 1, 1601) which exceed
 * Number.MAX_SAFE_INTEGER, so we use BigInt for safe handling.
 */

import { customType } from 'drizzle-orm/sqlite-core';

// -------------------------------------------------------------------
// WebKit Timestamp Utilities
// -------------------------------------------------------------------

/**
 * Offset between Unix epoch (Jan 1, 1970) and WebKit epoch (Jan 1, 1601)
 * in milliseconds.
 */
export const WEBKIT_EPOCH_OFFSET = 11644473600000n;

/**
 * Convert a JavaScript Date to a WebKit timestamp (microseconds since 1601).
 */
export function toWebKitTimestamp(date: Date): bigint {
  return (BigInt(date.getTime()) + WEBKIT_EPOCH_OFFSET) * 1000n;
}

/**
 * Convert a WebKit timestamp to a JavaScript Date.
 */
export function fromWebKitTimestamp(ts: bigint | number): Date {
  const tsAsBigInt = typeof ts === 'bigint' ? ts : BigInt(ts);
  return new Date(Number(tsAsBigInt / 1000n - WEBKIT_EPOCH_OFFSET));
}

// -------------------------------------------------------------------
// Drizzle Custom Types for Chrome DB Compatibility
// -------------------------------------------------------------------

/**
 * Custom Drizzle type for WebKit timestamps.
 * Stores as INTEGER in SQLite but uses BigInt in JavaScript for safe handling
 * of values that exceed Number.MAX_SAFE_INTEGER.
 */
export const bigintTimestamp = customType<{ data: bigint; driverData: bigint }>(
  {
    dataType() {
      return 'integer';
    },
    fromDriver(value: unknown) {
      if (typeof value === 'bigint') return value;
      if (typeof value === 'number') return BigInt(value);
      if (typeof value === 'string') return BigInt(value);
      return 0n;
    },
    toDriver(value: bigint) {
      return value;
    },
  },
);

/**
 * Custom Drizzle type for SQLite booleans.
 * SQLite doesn't have a native BOOLEAN type, so we use INTEGER (0/1).
 */
export const sqliteBoolean = customType<{ data: boolean }>({
  dataType() {
    return 'boolean';
  },
  fromDriver(value: unknown) {
    return Number(value) === 1;
  },
  toDriver(value: boolean) {
    return value ? 1 : 0;
  },
});
