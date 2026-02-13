const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

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

const parseLine = (line: string, lineNumber: number): ParsedDotenvEntry | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trimStart()
    : trimmed;

  const separator = normalized.indexOf('=');
  if (separator <= 0) {
    throw new Error(`Invalid .env line ${lineNumber}. Expected KEY=value format.`);
  }

  const key = normalized.slice(0, separator).trim();
  if (!ENV_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid environment key "${key}" on line ${lineNumber}.`);
  }

  const rawValue = normalized.slice(separator + 1).trim();
  if (!rawValue) {
    return { key, value: '' };
  }

  if (rawValue.startsWith('"') || rawValue.startsWith('\'')) {
    const quote = rawValue.charAt(0);
    if (!rawValue.endsWith(quote) || rawValue.length < 2) {
      throw new Error(`Unclosed quoted value on line ${lineNumber}.`);
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
  const order: string[] = [];
  const valuesByKey = new Map<string, string>();
  const normalized = source.replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);

  lines.forEach((line, index) => {
    const parsed = parseLine(line, index + 1);
    if (!parsed) {
      return;
    }
    if (!valuesByKey.has(parsed.key)) {
      order.push(parsed.key);
    }
    valuesByKey.set(parsed.key, parsed.value);
  });

  return order.map((key) => ({
    key,
    value: valuesByKey.get(key) ?? '',
  }));
};
