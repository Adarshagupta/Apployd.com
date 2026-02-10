const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const normalizeHostname = (value: string): string =>
  value.trim().toLowerCase().replace(/\.$/, '');

export const assertValidHostname = (
  value: string,
  label = 'hostname',
): string => {
  const normalized = normalizeHostname(value);
  if (!HOSTNAME_PATTERN.test(normalized)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized;
};
