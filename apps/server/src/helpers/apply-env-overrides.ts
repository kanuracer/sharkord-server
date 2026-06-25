const applyEnvOverrides = <T>(
  config: T,
  overridesMap: Record<string, string>
): T => {
  const updatedConfig = structuredClone(config);

  for (const [configKey, envVar] of Object.entries(overridesMap)) {
    if (process.env[envVar]) {
      const keys = configKey.split('.');

      let current: Record<string, unknown> = updatedConfig as Record<
        string,
        unknown
      >;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];

        if (key === undefined) continue;

        current = current[key] as Record<string, unknown>;
      }

      const finalKey = keys[keys.length - 1];
      const envValue = process.env[envVar];

      if (finalKey === undefined) {
        continue;
      }

      const existingValue = current[finalKey];
      let parsedValue: unknown;

      try {
        parsedValue = JSON.parse(envValue!);
      } catch {
        parsedValue = envValue;
      }

      if (Array.isArray(existingValue) && typeof parsedValue === 'string') {
        current[finalKey] = parsedValue
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
      } else {
        current[finalKey] = parsedValue;
      }
    }
  }

  return updatedConfig;
};

export { applyEnvOverrides };
