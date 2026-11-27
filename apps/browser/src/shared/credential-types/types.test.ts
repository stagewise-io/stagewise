import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  credentialField,
  isCredentialFieldSchema,
  extractSecretFieldNames,
} from './types';
import { credentialTypeRegistry } from './index';

describe('credentialField detection', () => {
  it('isCredentialFieldSchema returns true for a credentialField()', () => {
    const field = credentialField();
    expect(isCredentialFieldSchema(field)).toBe(true);
  });

  it('isCredentialFieldSchema returns false for a plain z.string()', () => {
    expect(isCredentialFieldSchema(z.string())).toBe(false);
  });

  it('isCredentialFieldSchema returns false for z.string().describe("other")', () => {
    expect(isCredentialFieldSchema(z.string().describe('other'))).toBe(false);
  });

  it('isCredentialFieldSchema returns false for z.number()', () => {
    expect(isCredentialFieldSchema(z.number())).toBe(false);
  });
});

describe('extractSecretFieldNames', () => {
  it('identifies credential fields in a mixed schema', () => {
    const schema = z.object({
      url: z.string(),
      accessToken: credentialField(),
      refreshToken: credentialField(),
    });

    const secrets = extractSecretFieldNames(schema);
    expect(secrets).toContain('accessToken');
    expect(secrets).toContain('refreshToken');
    expect(secrets).not.toContain('url');
    expect(secrets).toHaveLength(2);
  });

  it('returns empty array for schema with no credential fields', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    });

    expect(extractSecretFieldNames(schema)).toEqual([]);
  });

  it('detects fields in all registered credential types', () => {
    for (const [typeId, typeDef] of Object.entries(credentialTypeRegistry)) {
      const secrets = extractSecretFieldNames(
        typeDef.schema as z.ZodObject<z.ZodRawShape>,
      );
      expect(
        secrets.length,
        `${typeId} should have at least one secret field`,
      ).toBeGreaterThan(0);
    }
  });

  it('correctly identifies figma-pat token field', () => {
    const schema = credentialTypeRegistry['figma-pat'].schema;
    const secrets = extractSecretFieldNames(
      schema as z.ZodObject<z.ZodRawShape>,
    );
    expect(secrets).toEqual(['token']);
  });
});
