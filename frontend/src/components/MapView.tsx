import {
  Circle,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { LatLngBounds } from "leaflet";
import { useEffect } from "react";

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

type MapViewProps = {
  cities: VisitedCity[];
};

function getCityRadiusMeters(city: VisitedCity) {
  const name = city.cityName.toLowerCase();

  if (
    name.includes("timi") ||
    name.includes("timisoara") ||
    name.includes("timișoara")
  ) {
    return 11000;
  }

  if (name.includes("london") || name.includes("berlin") || name.includes("paris")) {
    return 18000;
  }

  return 12000;
}

function ResizeMap() {
  const map = useMap();

  useEffect(() => {
    const resize = () => {
      map.invalidateSize();
    };

    const timeoutId = window.setTimeout(resize, 150);

    window.addEventListener("resize", resize);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", resize);
    };
  }, [map]);

  return null;
}

function FitBounds({ cities }: MapViewProps) {
  const map = useMap();

  useEffect(() => {
    if (cities.length === 0) {
      map.setView([45.75, 21.2], 5);
      return;
    }

    if (cities.length === 1) {
      map.setView([cities[0].latitude, cities[0].longitude], 10);
      return;
    }

    const bounds = new LatLngBounds(
      cities.map((city) => [city.latitude, city.longitude] as [number, number])
    );

    map.fitBounds(bounds, { padding: [80, 80] });
  }, [cities, map]);

  return null;
}

function CityPopup({ city }: { city: VisitedCity }) {
  return (
    <Popup>
      <div>
        <strong>
          {city.cityName}, {city.country}
        </strong>
        <br />
        {city.visitedAt && (
          <>
            Visited: {city.visitedAt}
            <br />
          </>
        )}
        {city.notes && <>Notes: {city.notes}</>}
      </div>
    </Popup>
  );
}

type Position = [number, number]; // [lng, lat]
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = PolygonCoordinates[];

type GeoJsonGeometry = {
  type?: string;
  coordinates?: unknown;
};

function isPosition(input: unknown): input is Position {
  return (
    Array.isArray(input) &&
    input.length >= 2 &&
    typeof input[0] === "number" &&
    typeof input[1] === "number"
  );
}

function collectCoordinates(input: unknown): Position[] {
  if (!Array.isArray(input)) {
    return [];
  }

  if (isPosition(input)) {
    return [input];
  }

  return input.flatMap((item) => collectCoordinates(item));
}

function getBounds(coordinates: Position[]) {
  const lngValues = coordinates.map(([lng]) => lng);
  const latValues = coordinates.map(([, lat]) => lat);

  return {
    minLng: Math.min(...lngValues),
    maxLng: Math.max(...lngValues),
    minLat: Math.min(...latValues),
    maxLat: Math.max(...latValues),
  };
}

function getBoundsSpread(coordinates: Position[]) {
  const bounds = getBounds(coordinates);

  return {
    lngSpread: bounds.maxLng - bounds.minLng,
    latSpread: bounds.maxLat - bounds.minLat,
  };
}

function boundsContainPoint(
  coordinates: Position[],
  longitude: number,
  latitude: number
) {
  const bounds = getBounds(coordinates);

  return (
    longitude >= bounds.minLng &&
    longitude <= bounds.maxLng &&
    latitude >= bounds.minLat &&
    latitude <= bounds.maxLat
  );
}

function getBoundsCenterDistance(
  coordinates: Position[],
  longitude: number,
  latitude: number
) {
  const bounds = getBounds(coordinates);

  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;

  return Math.hypot(centerLng - longitude, centerLat - latitude);
}

function getApproxPolygonArea(polygon: PolygonCoordinates) {
  const outerRing = polygon[0];

  if (!outerRing || outerRing.length < 3) {
    return 0;
  }

  let area = 0;

  for (let i = 0; i < outerRing.length; i++) {
    const [x1, y1] = outerRing[i];
    const [x2, y2] = outerRing[(i + 1) % outerRing.length];

    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area / 2);
}

function isCompactEnough(coordinates: Position[]) {
  const { lngSpread, latSpread } = getBoundsSpread(coordinates);

  /*
    This rejects enormous administrative boundaries,
    while allowing normal city-shaped areas.
  */
  return lngSpread <= 1.5 && latSpread <= 1.5;
}

function getPolygonPieces(geometry: GeoJsonGeometry): PolygonCoordinates[] {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates as PolygonCoordinates];
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as MultiPolygonCoordinates;
  }

  return [];
}

function getDrawableBoundary(city: VisitedCity) {
  if (!city.boundaryGeojson || typeof city.boundaryGeojson !== "object") {
    return null;
  }

  const geometry = city.boundaryGeojson as GeoJsonGeometry;

  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    return null;
  }

  const allCoordinates = collectCoordinates(geometry.coordinates);

  if (allCoordinates.length === 0) {
    return null;
  }

  /*
    If the full boundary is already compact, draw it normally.
    This works well for normal cities.
  */
  if (isCompactEnough(allCoordinates)) {
    return geometry;
  }

  /*
    If the boundary is huge/fragmented, like Tokyo,
    choose only the polygon piece closest to the city center.
  */
  const polygonPieces = getPolygonPieces(geometry);

  if (polygonPieces.length === 0) {
    return null;
  }

  const cityLongitude = city.longitude;
  const cityLatitude = city.latitude;

  const rankedPieces = polygonPieces
    .map((polygon) => {
      const coordinates = collectCoordinates(polygon);
      const containsCityCenter = boundsContainPoint(
        coordinates,
        cityLongitude,
        cityLatitude
      );

      return {
        polygon,
        coordinates,
        containsCityCenter,
        distance: getBoundsCenterDistance(
          coordinates,
          cityLongitude,
          cityLatitude
        ),
        area: getApproxPolygonArea(polygon),
      };
    })
    .filter((piece) => piece.coordinates.length > 0)
    .sort((a, b) => {
      if (a.containsCityCenter !== b.containsCityCenter) {
        return a.containsCityCenter ? -1 : 1;
      }

      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }

      return b.area - a.area;
    });

  const bestPiece = rankedPieces[0];

  if (!bestPiece || !isCompactEnough(bestPiece.coordinates)) {
    return null;
  }

  return {
    type: "Polygon",
    coordinates: bestPiece.polygon,
  };
}

function MapView({ cities }: MapViewProps) {
  return (
    <div className="map-wrapper">
      <MapContainer
        center={[45.75, 21.2]}
        zoom={5}
        minZoom={3}
        maxZoom={12}
        scrollWheelZoom={true}
        className="map"
        zoomControl={true}
      >
        <ResizeMap />

        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />

        <FitBounds cities={cities} />

        {cities.map((city) => {
          const drawableBoundary = getDrawableBoundary(city);

if (drawableBoundary) {
  return (
    <GeoJSON
      key={city.id}
      data={drawableBoundary as GeoJSON.GeoJsonObject}
      style={() => ({
        color: "#fef08a",
        fillColor: "#facc15",
        fillOpacity: 0.58,
        opacity: 1,
        weight: 2,
        className: "visited-boundary",
      })}
    >
      <CityPopup city={city} />
    </GeoJSON>
  );
}

          return (
            <Circle
              key={city.id}
              center={[city.latitude, city.longitude]}
              radius={getCityRadiusMeters(city)}
              pathOptions={{
                color: "#fef08a",
                fillColor: "#facc15",
                fillOpacity: 0.55,
                opacity: 0.9,
                weight: 2,
              }}
            >
              <CityPopup city={city} />
            </Circle>
          );
        })}
      </MapContainer>
    </div>
  );
}

export default MapView;