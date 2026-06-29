import { useEffect, useState } from "react";
import MapView from "./components/MapView";

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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const ADMIN_TOKEN_STORAGE_KEY = "scratch-map-admin-token";

function App() {
  const [cities, setCities] = useState<VisitedCity[]>([]);
  const [cityName, setCityName] = useState("Berlin");
  const [country, setCountry] = useState("Germany");
  const [visitedAt, setVisitedAt] = useState("2026-06-29");
  const [notes, setNotes] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminToken, setAdminToken] = useState(
    localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingCity, setIsAddingCity] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  const isAdmin = Boolean(adminToken);

  async function loadCities() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const response = await fetch(`${API_URL}/api/visited-cities`);

      if (!response.ok) {
        throw new Error("Failed to load visited cities");
      }

      const data = await response.json();
      setCities(data);
    } catch (error) {
      setErrorMessage("Could not load visited cities. Is the backend running?");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCities();
  }, []);

  async function handleUnlockAdmin(event: React.FormEvent) {
    event.preventDefault();

    try {
      setIsUnlocking(true);
      setErrorMessage("");

      const response = await fetch(`${API_URL}/api/admin/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: adminPassword,
        }),
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(responseBody?.error || "Could not unlock admin mode");
      }

      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, responseBody.token);
      setAdminToken(responseBody.token);
      setAdminPassword("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not unlock admin mode."
      );
      console.error(error);
    } finally {
      setIsUnlocking(false);
    }
  }

  function handleLogoutAdmin() {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setAdminToken("");
    setAdminPassword("");
  }

  async function handleAddCity(event: React.FormEvent) {
    event.preventDefault();

    try {
      setIsAddingCity(true);
      setErrorMessage("");

      const response = await fetch(`${API_URL}/api/visited-cities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          cityName,
          country,
          visitedAt,
          notes,
        }),
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(responseBody?.error || "Failed to add city");
      }

      setCityName("");
      setCountry("");
      setVisitedAt("");
      setNotes("");

      await loadCities();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not add city."
      );
      console.error(error);
    } finally {
      setIsAddingCity(false);
    }
  }

  async function handleDeleteCity(id: string) {
    try {
      setErrorMessage("");

      const response = await fetch(`${API_URL}/api/visited-cities/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(responseBody?.error || "Failed to delete city");
      }

      await loadCities();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete city."
      );
      console.error(error);
    }
  }

  return (
    <main className="app-shell">
      <MapView cities={cities} />

      <div className="top-bar">
        <div>
          <p className="eyebrow">Personal scratch map</p>
          <h1>Travel Scratch Map</h1>
        </div>

        <button
          className="panel-toggle"
          onClick={() => setIsPanelOpen((current) => !current)}
        >
          {isPanelOpen ? "Hide panel" : "Open panel"}
        </button>
      </div>

      {isPanelOpen && (
        <aside className="floating-panel">
          <div className="panel-header">
            <div>
              <h2>{isAdmin ? "Admin mode" : "Public view"}</h2>
              <p>{cities.length} cities marked</p>
            </div>

            <button
              type="button"
              className="icon-button"
              onClick={() => setIsPanelOpen(false)}
              aria-label="Close panel"
            >
              ×
            </button>
          </div>

          {!isAdmin && (
            <form className="form admin-form" onSubmit={handleUnlockAdmin}>
              <p className="muted">
                Anyone can view the map. Enter the admin password to add or
                delete cities.
              </p>

              <label>
                Admin password
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Password"
                  required
                />
              </label>

              <button type="submit" disabled={isUnlocking}>
                {isUnlocking ? "Unlocking..." : "Unlock admin"}
              </button>
            </form>
          )}

          {isAdmin && (
            <>
              <form className="form" onSubmit={handleAddCity}>
                <div className="admin-actions">
                  <p className="admin-badge">Unlocked</p>

                  <button
                    type="button"
                    className="secondary"
                    onClick={handleLogoutAdmin}
                  >
                    Lock
                  </button>
                </div>

                <label>
                  City
                  <input
                    value={cityName}
                    onChange={(event) => setCityName(event.target.value)}
                    placeholder="Berlin"
                    required
                  />
                </label>

                <label>
                  Country
                  <input
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    placeholder="Germany"
                    required
                  />
                </label>

                <label>
                  Visited date
                  <input
                    type="date"
                    value={visitedAt}
                    onChange={(event) => setVisitedAt(event.target.value)}
                  />
                </label>

                <label>
                  Notes
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="What happened there?"
                  />
                </label>

                <button type="submit" disabled={isAddingCity}>
                  {isAddingCity ? "Finding city..." : "Mark as visited"}
                </button>
              </form>
            </>
          )}

          {errorMessage && <p className="error">{errorMessage}</p>}

          <section className="visited-section">
            <div className="list-header">
              <h2>Visited cities</h2>

              <button className="secondary" onClick={loadCities}>
                Refresh
              </button>
            </div>

            {isLoading && <p>Loading cities...</p>}
            {!isLoading && cities.length === 0 && <p>No cities yet.</p>}

            <div className="city-list">
              {cities.map((city) => (
                <article className="city-item" key={city.id}>
                  <div>
                    <h3>
                      {city.cityName}, {city.country}
                    </h3>

                    {city.visitedAt && <p>Visited: {city.visitedAt}</p>}

                    {city.notes && <p className="notes">{city.notes}</p>}
                  </div>

                  {isAdmin && (
                    <button
                      className="danger"
                      onClick={() => handleDeleteCity(city.id)}
                    >
                      Delete
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </aside>
      )}
    </main>
  );
}

export default App;