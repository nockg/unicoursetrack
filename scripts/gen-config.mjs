/**
 * Generates public/config.js from environment variables.
 * Replaces the config-generation portion of the old build-assets.mjs.
 * Vite now handles JS/CSS bundling; this script only writes the runtime config.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function parseEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const rawValue = line.slice(index + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
}

function readExistingRuntimeConfig() {
  const configPath = join(root, 'public/config.js');
  if (!existsSync(configPath)) return {};
  const config = readFileSync(configPath, 'utf8');
  return {
    supabaseUrl: /supabaseUrl["']?\s*:\s*["']([^"']+)["']/.exec(config)?.[1] || '',
    supabaseAnonKey: /supabaseAnonKey["']?\s*:\s*["']([^"']+)["']/.exec(config)?.[1] || '',
  };
}

const env = {
  ...parseEnvFile(join(root, '.env')),
  ...parseEnvFile(join(root, '.env.local')),
  ...process.env,
};

const existingRuntimeConfig = readExistingRuntimeConfig();

const runtimeConfig = {
  supabaseUrl:
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    existingRuntimeConfig.supabaseUrl ||
    '',
  supabaseAnonKey:
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    existingRuntimeConfig.supabaseAnonKey ||
    '',
};

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(
  join(root, 'public/config.js'),
  `window.UNITRACK_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`
);

console.log('Generated public/config.js from environment variables.');
