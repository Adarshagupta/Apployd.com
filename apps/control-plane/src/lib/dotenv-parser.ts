const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export class DotenvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DotenvParseError';
  }
}

export interface ParsedDotenvEntry {
  key: string;
  value: string;
}

const decodeDoubleQuotedValue = (value: string): string =>
  value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');

const parseDotenvLine = (line: string, lineNumber: number): ParsedDotenvEntry | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trimStart()
    : trimmed;

  const separator = normalized.indexOf('=');
  if (separator <= 0) {
    throw new DotenvParseError(`Invalid .env line ${lineNumber}. Expected KEY=value format.`);
  }

  const key = normalized.slice(0, separator).trim();
  if (!ENV_KEY_PATTERN.test(key)) {
    throw new DotenvParseError(
      `Invalid environment key "${key}" on line ${lineNumber}. Use uppercase snake case.`,
    );
  }

  const rawValue = normalized.slice(separator + 1).trim();
  if (!rawValue) {
    return { key, value: '' };
  }

  if (rawValue.startsWith('"') || rawValue.startsWith('\'')) {
    const quote = rawValue.charAt(0);
    if (!rawValue.endsWith(quote) || rawValue.length < 2) {
      throw new DotenvParseError(`Unclosed quoted value on line ${lineNumber}.`);
    }
    const inner = rawValue.slice(1, -1);
    return {
      key,
      value: quote === '"' ? decodeDoubleQuotedValue(inner) : inner,
    };
  }

  const inlineCommentIndex = rawValue.search(/\s+#/);
  const value = inlineCommentIndex >= 0
    ? rawValue.slice(0, inlineCommentIndex).trimEnd()
    : rawValue;

  return { key, value };
};

export const parseDotenvText = (source: string): ParsedDotenvEntry[] => {
  const keyOrder: string[] = [];
  const valuesByKey = new Map<string, string>();
  const normalized = source.replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);

  lines.forEach((line, index) => {
    const entry = parseDotenvLine(line, index + 1);
    if (!entry) {
      return;
    }
    if (!valuesByKey.has(entry.key)) {
      keyOrder.push(entry.key);
    }
    valuesByKey.set(entry.key, entry.value);
  });

  return keyOrder.map((key) => ({
    key,
    value: valuesByKey.get(key) ?? '',
  }));
};
