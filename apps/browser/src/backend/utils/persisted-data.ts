import type { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getGlobalDataPath } from './paths';

/**
 * Reads persisted data from a JSON file in the global data directory.
 * Uses Zod schema for validation and type inference.
 *
 * @param name - The name of the data file (without .json extension)
 * @param schema - Zod schema to validate and infer the type
 * @param defaultValue - Value to return if file doesn't exist or is invalid
 * @returns The parsed data or default value
 */
export async function readPersistedData<T extends z.ZodTypeAny>(
  name: string,
  schema: T,
  defaultValue: z.infer<T>,
): Promise<z.infer<T>> {
  const filePath = path.join(getGlobalDataPath(), `${name}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return schema.parse(JSON.parse(content));
  } catch {
    return defaultValue;
  }
}

/**
 * Writes data to a JSON file in the global data directory.
 * Validates data against schema before writing.
 *
 * @param name - The name of the data file (without .json extension)
 * @param schema - Zod schema to validate the data
 * @param data - The data to write
 */
export async function writePersistedData<T extends z.ZodTypeAny>(
  name: string,
  schema: T,
  data: z.infer<T>,
): Promise<void> {
  const filePath = path.join(getGlobalDataPath(), `${name}.json`);
  schema.parse(data); // Validate before writing
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
