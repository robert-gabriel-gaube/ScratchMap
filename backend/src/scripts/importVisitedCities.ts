import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../db/prisma";

type BackupCity = {
  id?: string;
  cityName: string;
  country: string;
  latitude: number;
  longitude: number;
  boundaryGeojson?: unknown;
  visitedAt?: string | null;
  notes?: string | null;
  createdAt?: string | null;
};

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function main() {
  const backupPath = join(
    process.cwd(),
    "..",
    "backups",
    "visited-cities.json"
  );

  const rawBackup = readFileSync(backupPath, "utf-8");
  const cities = JSON.parse(rawBackup) as BackupCity[];

  console.log(`Found ${cities.length} cities in backup.`);

  for (const city of cities) {
    if (!city.cityName || !city.country) {
      console.warn("Skipping invalid city:", city);
      continue;
    }

    await prisma.visitedCity.upsert({
      where: {
        cityName_country: {
          cityName: city.cityName,
          country: city.country,
        },
      },
      update: {
        latitude: Number(city.latitude),
        longitude: Number(city.longitude),
        boundaryGeojson: city.boundaryGeojson ?? undefined,
        visitedAt: parseDate(city.visitedAt),
        notes: city.notes ?? null,
      },
      create: {
        ...(city.id ? { id: city.id } : {}),
        cityName: city.cityName,
        country: city.country,
        latitude: Number(city.latitude),
        longitude: Number(city.longitude),
        boundaryGeojson: city.boundaryGeojson ?? undefined,
        visitedAt: parseDate(city.visitedAt),
        notes: city.notes ?? null,
        ...(parseDate(city.createdAt)
          ? { createdAt: parseDate(city.createdAt)! }
          : {}),
      },
    });

    console.log(`Imported: ${city.cityName}, ${city.country}`);
  }

  console.log("Import finished.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });