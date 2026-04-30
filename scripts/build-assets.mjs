import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const cssFiles = [
  '00-base-auth.css',
  '01-shell.css',
  '02-modules.css',
  '03-library-topics.css',
  '04-preferences-account.css',
  '05-themes.css',
  '06-dashboard-timeline.css',
  '07-todo.css',
  '08-setup-deadlines.css',
  '09-responsive-polish.css',
  '10-account-panel.css'
].filter((file) => existsSync(join(root, 'src/styles/app', file)));

const jsFiles = [
  '00-config-auth-state.js',
  '01-topic-splash-storage.js',
  '02-state-preferences.js',
  '03-marks-links-library.js',
  '04-dashboard-ui.js',
  '05-years-modules-forms.js',
  '06-deadlines.js',
  '07-todo.js',
  '08-module-rendering.js',
  '09-auth-cloud.js',
  '10-dialog-actions.js',
  '11-boot.js',
  '12-library-render.js',
  '13-account-panel.js'
].filter((file) => existsSync(join(root, 'src/js/app', file)));

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

const env = {
  ...parseEnvFile(join(root, '.env')),
  ...parseEnvFile(join(root, '.env.local')),
  ...process.env
};

function readExistingRuntimeConfig() {
  const configPath = join(root, 'public/config.js');
  if (!existsSync(configPath)) return {};
  const config = readFileSync(configPath, 'utf8');
  return {
    supabaseUrl: /supabaseUrl["']?\s*:\s*["']([^"']+)["']/.exec(config)?.[1] || '',
    supabaseAnonKey: /supabaseAnonKey["']?\s*:\s*["']([^"']+)["']/.exec(config)?.[1] || ''
  };
}

const existingRuntimeConfig = readExistingRuntimeConfig();

const runtimeConfig = {
  supabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || existingRuntimeConfig.supabaseUrl || '',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || existingRuntimeConfig.supabaseAnonKey || ''
};

const css = cssFiles
  .map((file) => {
    const contents = readFileSync(join(root, 'src/styles/app', file), 'utf8').trimEnd();
    return `/* ${file} */\n${contents}`;
  })
  .join('\n\n');

const js = jsFiles
  .map((file) => {
    const contents = readFileSync(join(root, 'src/js/app', file), 'utf8').trimEnd();
    return `/* ${file} */\n${contents}`;
  })
  .join('\n\n');

const forbiddenSecretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'][^"']+["']/i,
  /service_role\s*[:=]\s*["'][^"']+["']/i
];

for (const pattern of forbiddenSecretPatterns) {
  if (pattern.test(js)) {
    throw new Error(`Refusing to bundle source containing forbidden Supabase secret pattern: ${pattern}`);
  }
}

mkdirSync(join(root, 'public/generated'), { recursive: true });
writeFileSync(
  join(root, 'public/config.js'),
  `window.UNITRACK_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`
);
writeFileSync(join(root, 'public/generated/styles.bundle.css'), css);
writeFileSync(join(root, 'public/generated/app.bundle.js'), js);

console.log(`Synced runtime config, ${cssFiles.length} CSS files, and ${jsFiles.length} JS files into public/generated.`);
