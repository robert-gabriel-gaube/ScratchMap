import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "./db/prisma";

dotenv.config();

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

app.use(express.json({ limit: "12mb" }));

const geocodeCache = new Map<string, NominatimResult>();

function normalizeKey(cityName: string, country: string) {
  return `${cityName.trim().toLowerCase()}|${country.trim().toLowerCase()}`;
}

function createAdminToken() {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ role: "admin" }, JWT_SECRET, {
    expiresIn: "30d",
  });
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

function getSpecialSearchQuery(cityName: string, country: string) {
  const normalizedCity = cityName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const normalizedCountry = country
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (
    normalizedCity === "jeju" &&
    (normalizedCountry === "south korea" ||
      normalizedCountry === "korea" ||
      normalizedCountry === "republic of korea")
  ) {
    return "Jeju Island, South Korea";
  }

  return null;
}

async function geocodeCity(cityName: string, country: string) {
  const cacheKey = normalizeKey(cityName, country);
  const cached = geocodeCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const specialSearchQuery = getSpecialSearchQuery(cityName, country);

  const params = specialSearchQuery
    ? new URLSearchParams({
        format: "jsonv2",
        q: specialSearchQuery,
        limit: "1",
        polygon_geojson: "1",
        addressdetails: "1",
      })
    : new URLSearchParams({
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

function parseVisitedAt(value: unknown) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    storage: "postgres",
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

app.get("/api/visited-cities", async (_req, res) => {
  try {
    const cities = await prisma.visitedCity.findMany({
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json(cities);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Could not load visited cities",
    });
  }
});

app.post("/api/visited-cities", requireAdmin, async (req, res) => {
  try {
    const { cityName, country, visitedAt, notes } = req.body;

    if (!cityName || !country) {
      return res.status(400).json({
        error: "cityName and country are required",
      });
    }

    const alreadyExists = await prisma.visitedCity.findFirst({
      where: {
        cityName: {
          equals: cityName,
          mode: "insensitive",
        },
        country: {
          equals: country,
          mode: "insensitive",
        },
      },
    });

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

    const newCity = await prisma.visitedCity.create({
      data: {
        cityName,
        country,
        latitude,
        longitude,
        boundaryGeojson:
          geocodedCity.geojson === undefined
            ? undefined
            : (geocodedCity.geojson as Prisma.InputJsonValue),
        visitedAt: parseVisitedAt(visitedAt),
        notes: notes || null,
      },
    });

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

app.delete("/api/visited-cities/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.visitedCity.delete({
      where: {
        id,
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error(error);

    res.status(404).json({
      error: "City not found",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});