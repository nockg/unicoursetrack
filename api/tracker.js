const MAX_BODY_BYTES = 750_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 90;
// NOTE: rateBuckets is in-process memory. In a serverless environment (Vercel Functions)
// each cold start resets this Map and concurrent instances do not share it, so this
// limiter only adds a best-effort defence within a single warm instance. The primary
// data-isolation guarantee is Supabase RLS (auth.uid() = user_id), which cannot be
// bypassed regardless. For hard per-user rate limiting, replace this with a shared
// KV store (e.g. Vercel KV / Upstash Redis) keyed by user.id.
const rateBuckets = new Map();

function json(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(payload));
}

function getClientKey(request, userId = "") {
  const forwarded = request.headers["x-forwarded-for"];
  const ip = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  return userId || ip;
}

function checkRateLimit(key) {
  const now = Date.now();
  // Prune expired entries when the map grows large to prevent unbounded memory use
  // in long-lived instances (e.g. dev server, long-warm serverless containers).
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (now > v.resetAt) rateBuckets.delete(k);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    error.statusCode = 400;
    error.message = "Request body must be valid JSON.";
    throw error;
  }
}

function getBearerToken(request) {
  const header = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || "";
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const apiKey = serviceKey || anonKey;
  if (!supabaseUrl || !apiKey) {
    const error = new Error("Server Supabase configuration is missing.");
    error.statusCode = 500;
    throw error;
  }
  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ""), apiKey };
}

async function requireUser(request, config) {
  const token = getBearerToken(request);
  if (!token) {
    const error = new Error("Missing bearer token.");
    error.statusCode = 401;
    throw error;
  }
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.apiKey, authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const error = new Error("Invalid or expired session.");
    error.statusCode = 401;
    throw error;
  }
  const user = await response.json();
  if (!user?.id) {
    const error = new Error("Invalid session user.");
    error.statusCode = 401;
    throw error;
  }
  return user;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateTrackerShape(data) {
  if (!isPlainObject(data)) return "Tracker data must be an object.";
  if (!isPlainObject(data.years)) return "Tracker data is missing years.";
  if (Object.keys(data.years).length > 8) return "Tracker has too many years.";
  for (const year of Object.values(data.years)) {
    if (!isPlainObject(year)) return "Invalid year entry.";
    const store = year.store;
    if (!isPlainObject(store)) return "Invalid year store.";
    if (Array.isArray(store.modules) && store.modules.length > 100) return "Too many modules in one year.";
    if (Array.isArray(store.customExams) && store.customExams.length > 600) return "Too many deadlines in one year.";
    if (Array.isArray(store.todos) && store.todos.length > 600) return "Too many to-do items in one year.";
  }
  return "";
}

function validateTrackerPayload(payload) {
  if (!isPlainObject(payload)) return "Payload must be an object.";
  if (!isPlainObject(payload.data)) return "Tracker data must be an object.";
  if (!isPlainObject(payload.prefs)) return "Tracker preferences must be an object.";
  const encodedSize = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (encodedSize > MAX_BODY_BYTES) return "Tracker payload is too large.";
  return validateTrackerShape(payload.data);
}

async function supabaseRest(config, userToken, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${userToken}`,
      "content-type": "application/json",
      ...options.headers
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || "Supabase request failed.");
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

module.exports = async function trackerHandler(request, response) {
  try {
    const config = getSupabaseConfig();
    const userToken = getBearerToken(request);
    const user = await requireUser(request, config);
    const rateKey = getClientKey(request, user.id);

    if (!checkRateLimit(rateKey)) {
      json(response, 429, { error: "Too many requests. Please wait a moment and try again." });
      return;
    }

    if (request.method === "GET") {
      const rows = await supabaseRest(
        config,
        userToken,
        `tracker_profiles?user_id=eq.${encodeURIComponent(user.id)}&select=data,prefs,updated_at&limit=1`,
        { method: "GET" }
      );
      json(response, 200, { profile: rows?.[0] || null });
      return;
    }

    if (request.method === "PUT") {
      const payload = await readJsonBody(request);
      const validationError = validateTrackerPayload(payload);
      if (validationError) {
        json(response, 400, { error: validationError });
        return;
      }
      await supabaseRest(config, userToken, "tracker_profiles?on_conflict=user_id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: user.id,
          data: payload.data,
          prefs: payload.prefs,
          updated_at: new Date().toISOString()
        })
      });
      json(response, 200, { ok: true });
      return;
    }

    if (request.method === "DELETE") {
      await supabaseRest(
        config,
        userToken,
        `tracker_profiles?user_id=eq.${encodeURIComponent(user.id)}`,
        { method: "DELETE", headers: { prefer: "return=minimal" } }
      );
      json(response, 200, { ok: true });
      return;
    }

    response.setHeader("allow", "GET, PUT, DELETE");
    json(response, 405, { error: "Method not allowed." });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    json(response, statusCode, { error: statusCode >= 500 ? "Tracker service failed." : error.message });
  }
};
