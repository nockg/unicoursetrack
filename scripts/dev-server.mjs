import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import trackerHandler from '../api/tracker.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const preferredPort = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp'
};

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

function readGeneratedRuntimeConfig() {
  const configPath = join(publicDir, 'config.js');
  if (!existsSync(configPath)) return {};
  const config = readFileSync(configPath, 'utf8');
  return {
    VITE_SUPABASE_URL: /supabaseUrl["']?\s*:\s*["']([^"']+)["']/.exec(config)?.[1] || '',
    VITE_SUPABASE_ANON_KEY: /supabaseAnonKey["']?\s*:\s*["']([^"']+)["']/.exec(config)?.[1] || ''
  };
}

function loadLocalEnvironment() {
  const env = {
    ...readGeneratedRuntimeConfig(),
    ...parseEnvFile(join(root, '.env')),
    ...parseEnvFile(join(root, '.env.local')),
    ...process.env
  };

  for (const [key, value] of Object.entries(env)) {
    if (value && !process.env[key]) process.env[key] = value;
  }
}

loadLocalEnvironment();

function sendNotFound(response) {
  response.statusCode = 404;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.end('Not found');
}

function resolveStaticPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${preferredPort}`).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const baseDir = pathname.startsWith('/generated/') || pathname === '/config.js' || pathname === '/config.example.js'
    ? publicDir
    : root;
  const candidate = normalize(join(baseDir, relative));
  const allowedRoot = resolve(baseDir);
  const resolved = resolve(candidate);

  if (resolved !== allowedRoot && !resolved.startsWith(allowedRoot + sep)) {
    return null;
  }

  return resolved;
}

function createDevServer() {
  return createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/api/tracker')) {
      await trackerHandler(request, response);
      return;
    }

    const filePath = resolveStaticPath(request.url || '/');
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      sendNotFound(response);
      return;
    }

    response.statusCode = 200;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream');
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end(error?.message || 'Server error');
  }
  });
}

function listen(port) {
  const server = createDevServer();

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
      console.log(`Port ${port} is unavailable (${error.code}), trying ${port + 1}...`);
      listen(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, host, () => {
    console.log(`UniTrack dev server running at http://${host}:${port}/`);
  });
}

listen(preferredPort);
