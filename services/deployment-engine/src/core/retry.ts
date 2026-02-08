export const withRetry = async <T>(
  fn: () => Promise<T>,
  options: { retries: number; delayMs: number; factor?: number },
): Promise<T> => {
  let attempt = 0;
  const factor = options.factor ?? 1.8;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= options.retries) {
        throw error;
      }

      const delay = Math.floor(options.delayMs * Math.pow(factor, attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
};
