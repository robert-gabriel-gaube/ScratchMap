export function getCityBoundaryKey(cityName: string, country: string) {
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

  return `${normalizedCity}|${normalizedCountry}`;
}

export const CITY_BOUNDARIES = {
  "timisoara|romania": {
    type: "Feature",
    properties: {
      cityName: "Timișoara",
      country: "Romania",
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [21.124, 45.784],
          [21.166, 45.805],
          [21.235, 45.806],
          [21.286, 45.780],
          [21.301, 45.735],
          [21.272, 45.700],
          [21.209, 45.691],
          [21.151, 45.710],
          [21.116, 45.746],
          [21.124, 45.784],
        ],
      ],
    },
  },
} as const;