// Minimal, dependency-free JSON-Schema validator (draft-07 subset).
// Supported: type, enum, const, required, properties, additionalProperties(false|schema),
// items, minItems, maxItems, uniqueItems, minimum, maximum, minLength, maxLength, pattern,
// anyOf, oneOf, allOf, not (simple), $ref to "#/definitions/<name>".
// Why custom: the factory must run on a fresh Muse VM with no npm install step.

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v; // string | boolean | object
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  if (t === "number") return actual === "number" || actual === "integer";
  return actual === t;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function validate(schema, data, root = schema, path = "$") {
  const errors = [];
  const push = (msg) => errors.push(`${path}: ${msg}`);

  if (schema === true || schema === undefined) return errors;
  if (schema === false) return [`${path}: schema forbids any value`];

  if (schema.$ref) {
    const m = /^#\/definitions\/(.+)$/.exec(schema.$ref);
    const target = m && root.definitions && root.definitions[m[1]];
    if (!target) return [`${path}: unresolvable $ref ${schema.$ref}`];
    return validate(target, data, root, path);
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(data, t))) {
      push(`expected ${types.join("|")}, got ${typeOf(data)}`);
      return errors; // further checks would be noise
    }
  }
  if (schema.const !== undefined && !deepEqual(schema.const, data)) push(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((e) => deepEqual(e, data))) push(`must be one of ${JSON.stringify(schema.enum)}`);

  if (typeof data === "string") {
    if (schema.minLength !== undefined && data.length < schema.minLength) push(`shorter than minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && data.length > schema.maxLength) push(`longer than maxLength ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) push(`does not match pattern ${schema.pattern}`);
  }
  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < schema.minimum) push(`below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) push(`above maximum ${schema.maximum}`);
    if (!Number.isFinite(data)) push("must be finite");
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) push(`fewer than minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) push(`more than maxItems ${schema.maxItems}`);
    if (schema.uniqueItems && new Set(data.map((x) => JSON.stringify(x))).size !== data.length) push("items must be unique");
    if (schema.items) data.forEach((item, i) => errors.push(...validate(schema.items, item, root, `${path}[${i}]`)));
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const key of schema.required || []) {
      if (!(key in data)) push(`missing required property "${key}"`);
    }
    const props = schema.properties || {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in data) errors.push(...validate(sub, data[key], root, `${path}.${key}`));
    }
    if (schema.additionalProperties !== undefined) {
      for (const key of Object.keys(data)) {
        if (key in props) continue;
        if (schema.additionalProperties === false) push(`unexpected property "${key}"`);
        else if (typeof schema.additionalProperties === "object")
          errors.push(...validate(schema.additionalProperties, data[key], root, `${path}.${key}`));
      }
    }
  }

  if (schema.allOf) for (const s of schema.allOf) errors.push(...validate(s, data, root, path));
  if (schema.anyOf && !schema.anyOf.some((s) => validate(s, data, root, path).length === 0))
    push("does not satisfy any allowed alternative (anyOf)");
  if (schema.oneOf) {
    const n = schema.oneOf.filter((s) => validate(s, data, root, path).length === 0).length;
    if (n !== 1) push(`must satisfy exactly one alternative (oneOf), satisfied ${n}`);
  }
  if (schema.not && validate(schema.not, data, root, path).length === 0) push("matches a forbidden schema (not)");
  return errors;
}

export function assertValid(schema, data, label = "data") {
  const errors = validate(schema, data);
  if (errors.length) {
    const err = new Error(`${label} failed schema validation:\n  - ${errors.slice(0, 25).join("\n  - ")}`);
    err.errors = errors;
    throw err;
  }
}
