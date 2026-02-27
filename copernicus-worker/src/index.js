export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), env);

    if (url.pathname === '/health') {
      return cors(json({ ok: true, service: 'copernicus-proxy' }), env);
    }

    if (url.pathname === '/api/risk' && request.method === 'POST') {
      try {
        const { address, building } = await request.json();
        if (!address || typeof address !== 'string') {
          return cors(json({ error: 'address required' }, 400), env);
        }

        const location = await geocode(address);
        const weather = await getWeather(location.lat, location.lon);
        const elevationM = await getElevation(location.lat, location.lon);

        const cop = await getCopernicusFeatures(location.lat, location.lon, env);

        const river = clamp(35 + (cop.floodProne ? 35 : 0));
        const elevationRisk = clamp(100 - Math.min(100, Math.max(0, elevationM / 3)));
        const surface = clamp(building ? 62 : 48);
        const rain = clamp((weather.maxDailyPrecip * 3.2) + (weather.maxDailyHours * 2.3) + (weather.maxHourlyRain * 6));

        const copBoost = cop.available
          ? clamp((cop.soilMoistureAnomaly ?? 0) * 1.2 + (cop.runoffAnomaly ?? 0) * 1.2)
          : 0;

        const score = clamp(river * 0.25 + elevationRisk * 0.2 + surface * 0.1 + rain * 0.25 + copBoost * 0.2);

        return cors(json({
          location,
          metrics: { river, elevationRisk, surface, rain, copBoost },
          score,
          copernicus: cop,
          computedAt: new Date().toISOString()
        }), env);
      } catch (err) {
        return cors(json({ error: String(err?.message || err) }, 500), env);
      }
    }

    return cors(json({ error: 'not found' }, 404), env);
  }
};

async function geocode(address) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '1');
  u.searchParams.set('q', address);
  const r = await fetch(u, { headers: { 'accept': 'application/json' } });
  if (!r.ok) throw new Error(`geocode failed (${r.status})`);
  const arr = await r.json();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('address not found');
  const x = arr[0];
  return {
    lat: Number(x.lat),
    lon: Number(x.lon),
    displayName: x.display_name || address
  };
}

async function getWeather(lat, lon) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', String(lat));
  u.searchParams.set('longitude', String(lon));
  u.searchParams.set('daily', 'precipitation_sum,precipitation_hours');
  u.searchParams.set('hourly', 'rain');
  u.searchParams.set('timezone', 'auto');
  u.searchParams.set('forecast_days', '3');

  const r = await fetch(u);
  if (!r.ok) throw new Error(`weather failed (${r.status})`);
  const j = await r.json();
  const dailyPrecip = j?.daily?.precipitation_sum || [0, 0, 0];
  const dailyHours = j?.daily?.precipitation_hours || [0, 0, 0];
  const hourlyRain = j?.hourly?.rain || [];

  return {
    maxDailyPrecip: Math.max(...dailyPrecip, 0),
    maxDailyHours: Math.max(...dailyHours, 0),
    maxHourlyRain: Math.max(...hourlyRain, 0)
  };
}

async function getElevation(lat, lon) {
  const u = new URL('https://api.open-meteo.com/v1/elevation');
  u.searchParams.set('latitude', String(lat));
  u.searchParams.set('longitude', String(lon));
  const r = await fetch(u);
  if (!r.ok) return 0;
  const j = await r.json();
  return Number(j?.elevation?.[0] ?? 0);
}

async function getCopernicusFeatures(_lat, _lon, env) {
  // MVP: graceful fallback if no Copernicus credentials are configured.
  if (!env.COPERNICUS_CLIENT_ID || !env.COPERNICUS_CLIENT_SECRET) {
    return { available: false, reason: 'missing_credentials', soilMoistureAnomaly: null, runoffAnomaly: null, floodProne: false };
  }

  // Placeholder for Copernicus token/data calls; return deterministic demo values for now.
  // In production, replace with CDS/Sentinel query + anomaly extraction.
  return {
    available: true,
    source: 'copernicus-proxy-mvp',
    soilMoistureAnomaly: 18,
    runoffAnomaly: 12,
    floodProne: true
  };
}

function clamp(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function cors(response, env) {
  const h = new Headers(response.headers);
  h.set('access-control-allow-origin', env.ALLOWED_ORIGIN || '*');
  h.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  h.set('access-control-allow-headers', 'content-type');
  return new Response(response.body, { status: response.status, headers: h });
}
