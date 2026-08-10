import { randomUUID } from 'node:crypto';
import type { CreateElicitationRequest } from '@agentclientprotocol/sdk';

type JsonObject = Record<string, unknown>;

export function elicitationForm(
  request: CreateElicitationRequest,
): JsonObject | null {
  if (request.mode !== 'form' || !isJsonObject(request.requestedSchema)) {
    return null;
  }
  const schema = request.requestedSchema;
  const properties = isJsonObject(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  );
  const fields = Object.entries(properties).map(([id, property]) =>
    elicitationField(id, property, required.has(id)),
  );
  if (fields.length === 0) return null;
  const steps = [];
  for (let index = 0; index < fields.length; index += 10) {
    steps.push({ fields: fields.slice(index, index + 10) });
  }
  return {
    title: textValue(schema.title) ?? 'Agent needs input',
    description: request.message,
    steps,
  };
}

export function requestScopeId(request: CreateElicitationRequest): string {
  return 'toolCallId' in request && typeof request.toolCallId === 'string'
    ? request.toolCallId
    : `acp-elicitation:${randomUUID()}`;
}

function elicitationField(
  id: string,
  value: unknown,
  required: boolean,
): JsonObject {
  const property = isJsonObject(value) ? value : {};
  const type = textValue(property.type) ?? 'string';
  const options = elicitationOptions(property);
  const common = {
    questionId: id,
    label: textValue(property.title) ?? id,
    description: textValue(property.description),
    required,
  };
  if (type === 'boolean') {
    return { ...common, type: 'checkbox', defaultValue: property.default };
  }
  if (type === 'array') {
    return {
      ...common,
      type: 'checkbox-group',
      options,
      defaultValues: Array.isArray(property.default)
        ? property.default.filter(
            (item): item is string => typeof item === 'string',
          )
        : undefined,
    };
  }
  if (options.length > 0) {
    return {
      ...common,
      type: 'radio-group',
      options,
      defaultValue: property.default,
    };
  }
  return {
    ...common,
    type: 'input',
    inputType:
      type === 'number' || type === 'integer'
        ? 'number'
        : property.format === 'email'
          ? 'email'
          : 'text',
    defaultValue: property.default,
    minLength: property.minLength,
    maxLength: property.maxLength,
    min: property.minimum,
    max: property.maximum,
  };
}

function elicitationOptions(property: JsonObject) {
  const source =
    (Array.isArray(property.oneOf) && property.oneOf) ||
    (isJsonObject(property.items) &&
      ((Array.isArray(property.items.anyOf) && property.items.anyOf) ||
        (Array.isArray(property.items.enum) && property.items.enum))) ||
    (Array.isArray(property.enum) && property.enum) ||
    [];
  return source.flatMap((option) => {
    if (typeof option === 'string') return [{ value: option, label: option }];
    if (!isJsonObject(option)) return [];
    const value = textValue(option.const);
    return value ? [{ value, label: textValue(option.title) ?? value }] : [];
  });
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
