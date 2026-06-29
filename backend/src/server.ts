import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

type VisitedCity = {
  id: string;
  cityName: string;
  country: string;
  latitude: number;
  longitude: number;
  boundaryGeojson?: unknown;
  visitedAt?: string;
  notes?: string;
  createdAt: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name?: string;
  geojson?: unknown;
};

const app = express();

const PORT = process.env.PORT || 3000;
const FRONTEND_URLS = (process.env.FRONTEND_URLS || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim());

const APP_CONTACT = process.env.APP_CONTACT || "your-email@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

if (!ADMIN_PASSWORD) {
  console.warn("WARNING: ADMIN_PASSWORD is not set.");
}

if (!JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not set.");
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || FRONTEND_URLS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "8mb" }));

let visitedCities: VisitedCity[] = [
  {
    id: "1",
    cityName: "Timișoara",
    country: "Romania",
    latitude: 45.7489,
    longitude: 21.2087,
    visitedAt: "2026-06-29",
    notes: "Home base.",
    createdAt: new Date().toISOString(),
  },
];

const geocodeCache = new Map<string, NominatimResult>();

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeKey(cityName: string, country: string) {
  return `${cityName.trim().toLowerCase()}|${country.trim().toLowerCase()}`;
}

function createAdminToken() {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      role: "admin",
    },
    JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );
}

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({
        error: "JWT_SECRET is not configured",
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Admin access required",
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const payload = jwt.verify(token, JWT_SECRET) as { role?: string };

    if (payload.role !== "admin") {
      return res.status(403).json({
        error: "Invalid admin token",
      });
    }

    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired admin token",
    });
  }
}

async function geocodeCity(cityName: string, country: string) {
  const cacheKey = normalizeKey(cityName, country);

  const cached = geocodeCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    format: "jsonv2",
    city: cityName,
    country,
    limit: "1",
    polygon_geojson: "1",
    addressdetails: "1",
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": `TravelScratchMap/0.1 (${APP_CONTACT})`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed with status ${response.status}`);
  }

  const results = (await response.json()) as NominatimResult[];

  if (results.length === 0) {
    throw new Error("City not found");
  }

  const bestResult = results[0];

  geocodeCache.set(cacheKey, bestResult);

  return bestResult;
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Travel Scratch Map backend is running",
  });
});

app.post("/api/admin/unlock", (req, res) => {
  try {
    const { password } = req.body;

    if (!ADMIN_PASSWORD) {
      return res.status(500).json({
        error: "ADMIN_PASSWORD is not configured",
      });
    }

    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({
        error: "Wrong password",
      });
    }

    const token = createAdminToken();

    res.json({
      token,
      message: "Admin unlocked",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Could not unlock admin mode",
    });
  }
});

app.get("/api/admin/status", requireAdmin, (_req, res) => {
  res.json({
    isAdmin: true,
  });
});

app.get("/api/visited-cities", (_req, res) => {
  res.json(visitedCities);
});

app.post("/api/visited-cities", requireAdmin, async (req, res) => {
  try {
    const { cityName, country, visitedAt, notes } = req.body;

    if (!cityName || !country) {
      return res.status(400).json({
        error: "cityName and country are required",
      });
    }

    const alreadyExists = visitedCities.some(
      (city) =>
        normalizeKey(city.cityName, city.country) ===
        normalizeKey(cityName, country)
    );

    if (alreadyExists) {
      return res.status(409).json({
        error: "City is already marked as visited",
      });
    }

    const geocodedCity = await geocodeCity(cityName, country);

    const latitude = Number(geocodedCity.lat);
    const longitude = Number(geocodedCity.lon);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return res.status(500).json({
        error: "Geocoding returned invalid coordinates",
      });
    }

    const newCity: VisitedCity = {
      id: createId(),
      cityName,
      country,
      latitude,
      longitude,
      boundaryGeojson: geocodedCity.geojson,
      visitedAt,
      notes,
      createdAt: new Date().toISOString(),
    };

    visitedCities.push(newCity);

    res.status(201).json(newCity);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Could not geocode and save city",
    });
  }
});

app.delete("/api/visited-cities/:id", requireAdmin, (req, res) => {
  const { id } = req.params;

  const cityExists = visitedCities.some((city) => city.id === id);

  if (!cityExists) {
    return res.status(404).json({
      error: "City not found",
    });
  }

  visitedCities = visitedCities.filter((city) => city.id !== id);

  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});