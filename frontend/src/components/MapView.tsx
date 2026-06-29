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

function hasDrawableBoundary(city: VisitedCity) {
  if (!city.boundaryGeojson || typeof city.boundaryGeojson !== "object") {
    return false;
  }

  const geometry = city.boundaryGeojson as { type?: string };

  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
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
          if (hasDrawableBoundary(city)) {
            return (
              <GeoJSON
                key={city.id}
                data={city.boundaryGeojson as GeoJSON.GeoJsonObject}
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