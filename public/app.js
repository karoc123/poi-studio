const DEFAULT_CENTER = [59.3293, 18.0686];
const DEFAULT_ZOOM = 4;
const AUTOSAVE_DELAY_MS = 900;
const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)";
const MIN_FOCUS_ZOOM = 10;
const LOCATION_FOCUS_ZOOM = 13;

const state = {
  trips: [],
  currentTripId: null,
  currentTripName: "",
  currentTripPersisted: false,
  pois: [],
  markersById: new Map(),
  selectedLatLng: null,
  editingPoiId: null,
  importLatLng: null,
  isDirty: false,
  isSaving: false,
  saveQueued: false,
  autoSaveEnabled: true,
  panelOpen: false,
  poiSearchQueryRaw: "",
  poiSearchQuery: "",
  userLocationMarker: null,
  userLocationCircle: null
};

const ui = {
  statusMessage: document.getElementById("statusMessage"),
  activeTripLabel: document.getElementById("activeTripLabel"),
  tripSelect: document.getElementById("tripSelect"),
  createTripButton: document.getElementById("createTripButton"),
  saveButton: document.getElementById("saveButton"),
  reloadButton: document.getElementById("reloadButton"),
  addByLinkButton: document.getElementById("addByLinkButton"),
  autoSaveToggle: document.getElementById("autoSaveToggle"),
  poiList: document.getElementById("poiList"),
  poiCount: document.getElementById("poiCount"),
  poiSearchInput: document.getElementById("poiSearchInput"),
  locateButton: document.getElementById("locateButton"),
  controlPanel: document.getElementById("controlPanel"),
  panelToggleButton: document.getElementById("panelToggleButton"),
  panelCloseButton: document.getElementById("panelCloseButton"),
  addPointSheet: document.getElementById("addPointSheet"),
  addPointTitle: document.getElementById("addPointTitle"),
  addPointHint: document.getElementById("addPointHint"),
  addPointForm: document.getElementById("addPointForm"),
  pointLatLng: document.getElementById("pointLatLng"),
  pointName: document.getElementById("pointName"),
  pointDescription: document.getElementById("pointDescription"),
  submitPointButton: document.getElementById("submitPointButton"),
  cancelAddPoint: document.getElementById("cancelAddPoint"),
  importLinkSheet: document.getElementById("importLinkSheet"),
  importLinkForm: document.getElementById("importLinkForm"),
  mapsLinkInput: document.getElementById("mapsLinkInput"),
  parseMapsLinkButton: document.getElementById("parseMapsLinkButton"),
  importStatus: document.getElementById("importStatus"),
  importName: document.getElementById("importName"),
  importPosition: document.getElementById("importPosition"),
  importDescription: document.getElementById("importDescription"),
  cancelImportLink: document.getElementById("cancelImportLink")
};

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true
});

L.control.zoom({ position: "topright" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let autosaveTimer = null;
let resizeTimer = null;

function isMobileViewport() {
  return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}

function scheduleMapResize() {
  if (resizeTimer) {
    window.clearTimeout(resizeTimer);
  }

  resizeTimer = window.setTimeout(() => {
    map.invalidateSize();
  }, 220);
}

function syncPanelState() {
  const shouldBeOpen = !isMobileViewport() || state.panelOpen;
  ui.controlPanel.classList.toggle("is-open", shouldBeOpen);
  ui.panelToggleButton.setAttribute("aria-expanded", String(shouldBeOpen));
  scheduleMapResize();
}

function setPanelOpen(nextOpen) {
  state.panelOpen = Boolean(nextOpen);
  syncPanelState();
}

function showStatus(message, kind = "info") {
  ui.statusMessage.textContent = message;
  ui.statusMessage.dataset.kind = kind;
}

function setImportStatus(message, kind = "info") {
  ui.importStatus.textContent = message;
  ui.importStatus.dataset.kind = kind;
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `poi-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCoord(value) {
  return Number(value.toFixed(6)).toString();
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parsePosition(position) {
  if (typeof position !== "string") {
    throw new Error("Position muss ein String im Format 'lat, lng' sein.");
  }

  const parts = position.split(",").map((part) => part.trim());

  if (parts.length < 2) {
    throw new Error(`Ungueltige Position '${position}'.`);
  }

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  if (!isValidLatLng(lat, lng)) {
    throw new Error(`Ungueltige Zahlen in Position '${position}'.`);
  }

  return [lat, lng];
}

function parseLatLngText(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!isValidLatLng(lat, lng)) {
    return null;
  }

  return [lat, lng];
}

function normalizePosition(input) {
  if (typeof input === "string") {
    const parsed = parseLatLngText(input) || parsePosition(input);
    return `${formatCoord(parsed[0])}, ${formatCoord(parsed[1])}`;
  }

  if (Array.isArray(input) && input.length >= 2) {
    const lat = Number(input[0]);
    const lng = Number(input[1]);

    if (!isValidLatLng(lat, lng)) {
      throw new Error("Nicht unterstuetztes Positionsformat.");
    }

    return `${formatCoord(lat)}, ${formatCoord(lng)}`;
  }

  if (input && typeof input === "object" && "lat" in input && "lng" in input) {
    const lat = Number(input.lat);
    const lng = Number(input.lng);

    if (!isValidLatLng(lat, lng)) {
      throw new Error("Nicht unterstuetztes Positionsformat.");
    }

    return `${formatCoord(lat)}, ${formatCoord(lng)}`;
  }

  throw new Error("Nicht unterstuetztes Positionsformat.");
}

function slugifyTripName(name) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  if (cleaned) {
    return cleaned;
  }

  return `trip-${Date.now()}`;
}

function createUniqueTripId(name) {
  const baseId = slugifyTripName(name);
  let candidate = baseId;
  let suffix = 2;

  while (state.trips.some((trip) => trip.id === candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function sortTrips() {
  state.trips.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function getCurrentTripMeta() {
  return state.trips.find((trip) => trip.id === state.currentTripId) || null;
}

function updateCurrentTripMeta(patch) {
  const trip = getCurrentTripMeta();

  if (!trip) {
    return;
  }

  Object.assign(trip, patch);
}

function updateActiveTripLabel() {
  const fallback = state.currentTripName || "-";
  const suffix = state.currentTripPersisted ? "" : " (neu)";
  ui.activeTripLabel.textContent = `Aktiver Trip: ${fallback}${suffix}`;
}

function renderTripSelect() {
  const previousValue = ui.tripSelect.value;
  ui.tripSelect.innerHTML = "";

  for (const trip of state.trips) {
    const option = document.createElement("option");
    option.value = trip.id;

    const tag = trip.persisted ? "" : " (neu)";
    const count = Number.isFinite(trip.poiCount) ? ` - ${trip.poiCount}` : "";
    option.textContent = `${trip.name}${tag}${count}`;

    ui.tripSelect.append(option);
  }

  if (state.currentTripId && state.trips.some((trip) => trip.id === state.currentTripId)) {
    ui.tripSelect.value = state.currentTripId;
  } else if (previousValue && state.trips.some((trip) => trip.id === previousValue)) {
    ui.tripSelect.value = previousValue;
  }
}

function syncCurrentTripPointCount() {
  ui.poiCount.textContent = String(state.pois.length);
  updateCurrentTripMeta({ poiCount: state.pois.length });
  renderTripSelect();
}

function updateSaveButton() {
  if (state.isSaving) {
    ui.saveButton.disabled = true;
    ui.saveButton.textContent = "Speichern...";
    ui.saveButton.classList.add("opacity-70", "cursor-not-allowed");
    return;
  }

  ui.saveButton.disabled = false;
  ui.saveButton.classList.remove("opacity-70", "cursor-not-allowed");
  ui.saveButton.textContent = state.isDirty ? "Speichern *" : "Speichern";
}

function setDirty(nextDirty) {
  state.isDirty = nextDirty;
  updateSaveButton();

  if (nextDirty && state.autoSaveEnabled) {
    scheduleAutoSave();
  }
}

function scheduleAutoSave() {
  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
  }

  autosaveTimer = window.setTimeout(() => {
    void savePoints({ reason: "autosave" });
  }, AUTOSAVE_DELAY_MS);
}

function toGeoNavigationHref(poi) {
  try {
    const [latRaw, lngRaw] = parsePosition(poi.position);
    const lat = formatCoord(latRaw);
    const lng = formatCoord(lngRaw);
    const query = encodeURIComponent(`${lat},${lng} (${poi.name})`);
    return `geo:${lat},${lng}?q=${query}`;
  } catch {
    return "";
  }
}

function toGoogleNavigationHref(poi) {
  try {
    const [latRaw, lngRaw] = parsePosition(poi.position);
    const lat = formatCoord(latRaw);
    const lng = formatCoord(lngRaw);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  } catch {
    return "";
  }
}

function buildPopupHtml(poi) {
  const name = escapeHtml(poi.name);
  const description = escapeHtml(poi.description || "Keine Beschreibung");
  const position = escapeHtml(poi.position);
  const id = escapeHtml(poi.id);
  const geoHref = toGeoNavigationHref(poi);
  const webHref = toGoogleNavigationHref(poi);

  const navMarkup = [
    geoHref
      ? `<a href="${escapeHtml(geoHref)}" target="_blank" rel="noopener noreferrer">Navigieren (App)</a>`
      : "",
    webHref
      ? `<a href="${escapeHtml(webHref)}" target="_blank" rel="noopener noreferrer">In Google Maps</a>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="poi-popup">
      <h3>${name}</h3>
      <p>${description}</p>
      <p class="poi-popup-position">${position}</p>
      ${navMarkup ? `<div class="poi-popup-links">${navMarkup}</div>` : ""}
      <div class="poi-popup-actions">
        <button type="button" class="btn-focus" data-poi-action="focus" data-poi-id="${id}">Anzeigen</button>
        <button type="button" class="btn-edit" data-poi-action="edit" data-poi-id="${id}">Bearbeiten</button>
        <button type="button" class="btn-delete" data-poi-action="delete" data-poi-id="${id}">Loeschen</button>
      </div>
    </div>
  `;
}

function renderMarkers() {
  markerLayer.clearLayers();
  state.markersById.clear();

  for (const poi of state.pois) {
    let lat;
    let lng;

    try {
      [lat, lng] = parsePosition(poi.position);
    } catch {
      continue;
    }

    const marker = L.marker([lat, lng], { title: poi.name });
    marker.bindPopup(buildPopupHtml(poi));
    markerLayer.addLayer(marker);
    state.markersById.set(poi.id, marker);
  }
}

function renderPoiList() {
  syncCurrentTripPointCount();

  const visiblePois = getFilteredPois();

  if (state.poiSearchQuery) {
    ui.poiCount.textContent = `${visiblePois.length}/${state.pois.length}`;
  }

  if (visiblePois.length === 0) {
    if (state.poiSearchQuery) {
      ui.poiList.innerHTML =
        '<li class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Keine Treffer fuer die aktuelle Suche.</li>';
      return;
    }

    ui.poiList.innerHTML =
      '<li class="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Noch keine Punkte vorhanden.</li>';
    return;
  }

  const listMarkup = visiblePois
    .map((poi) => {
      const name = highlightSearchMatch(poi.name);
      const description = highlightSearchMatch(poi.description || "Keine Beschreibung");
      const position = escapeHtml(poi.position);
      const id = escapeHtml(poi.id);

      return `
        <li class="poi-card">
          <h3>${name}</h3>
          <p>${description}</p>
          <p>${position}</p>
          <div class="poi-actions">
            <button type="button" class="btn-focus" data-poi-action="focus" data-poi-id="${id}">Anzeigen</button>
            <button type="button" class="btn-edit" data-poi-action="edit" data-poi-id="${id}">Bearbeiten</button>
            <button type="button" class="btn-delete" data-poi-action="delete" data-poi-id="${id}">Loeschen</button>
          </div>
        </li>
      `;
    })
    .join("");

  ui.poiList.innerHTML = listMarkup;
}

function normalizeSearchText(value) {
  return String(value || "").toLocaleLowerCase("de").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchHighlightRegex() {
  const rawQuery = String(state.poiSearchQueryRaw || "").trim();

  if (!rawQuery) {
    return null;
  }

  return new RegExp(`(${escapeRegExp(rawQuery)})`, "ig");
}

function highlightSearchMatch(value) {
  const safeText = escapeHtml(value);

  if (!state.poiSearchQuery) {
    return safeText;
  }

  const regex = buildSearchHighlightRegex();

  if (!regex) {
    return safeText;
  }

  return safeText.replace(regex, '<mark class="poi-hit">$1</mark>');
}

function getFilteredPois() {
  if (!state.poiSearchQuery) {
    return state.pois;
  }

  return state.pois.filter((poi) => {
    const name = normalizeSearchText(poi.name);
    const description = normalizeSearchText(poi.description);

    return name.includes(state.poiSearchQuery) || description.includes(state.poiSearchQuery);
  });
}

function fitMapToPois() {
  if (state.pois.length === 0) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return;
  }

  const latLngs = state.pois
    .map((poi) => {
      try {
        const [lat, lng] = parsePosition(poi.position);
        return [lat, lng];
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (latLngs.length === 0) {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return;
  }

  if (latLngs.length === 1) {
    map.setView(latLngs[0], 11);
    return;
  }

  map.fitBounds(latLngs, {
    padding: [35, 35],
    maxZoom: 11,
    animate: false
  });
}

function setAddSheetModeForCreate(latlng) {
  state.selectedLatLng = latlng;
  state.editingPoiId = null;
  ui.addPointTitle.textContent = "Punkt hinzufuegen";
  ui.addPointHint.textContent = "Neuen Marker an der gewaehlten Position erstellen.";
  ui.submitPointButton.textContent = "Punkt speichern";
  ui.pointLatLng.value = `${formatCoord(latlng.lat)}, ${formatCoord(latlng.lng)}`;
  ui.pointName.value = "";
  ui.pointDescription.value = "";
}

function setAddSheetModeForEdit(poi) {
  const [lat, lng] = parsePosition(poi.position);

  state.selectedLatLng = { lat, lng };
  state.editingPoiId = poi.id;
  ui.addPointTitle.textContent = "POI bearbeiten";
  ui.addPointHint.textContent = "Name oder Beschreibung anpassen und speichern.";
  ui.submitPointButton.textContent = "Aenderungen speichern";
  ui.pointLatLng.value = `${formatCoord(lat)}, ${formatCoord(lng)}`;
  ui.pointName.value = poi.name;
  ui.pointDescription.value = poi.description || "";
}

function openAddPointSheetForCreate(latlng) {
  closeImportLinkSheet();
  setAddSheetModeForCreate(latlng);
  ui.addPointSheet.classList.remove("hidden");
  ui.pointName.focus();

  if (isMobileViewport()) {
    setPanelOpen(false);
  }
}

function openAddPointSheetForEdit(id) {
  const poi = state.pois.find((entry) => entry.id === id);

  if (!poi) {
    showStatus("POI wurde nicht gefunden.", "error");
    return;
  }

  try {
    closeImportLinkSheet();
    setAddSheetModeForEdit(poi);
    ui.addPointSheet.classList.remove("hidden");
    ui.pointDescription.focus();

    if (isMobileViewport()) {
      setPanelOpen(false);
    }
  } catch {
    showStatus("POI enthaelt keine gueltige Position.", "error");
  }
}

function closeAddPointSheet() {
  state.selectedLatLng = null;
  state.editingPoiId = null;
  ui.addPointSheet.classList.add("hidden");
}

function openImportLinkSheet() {
  closeAddPointSheet();
  state.importLatLng = null;
  ui.mapsLinkInput.value = "";
  ui.importName.value = "";
  ui.importPosition.value = "";
  ui.importDescription.value = "";
  setImportStatus("Noch kein Link analysiert.", "info");
  ui.importLinkSheet.classList.remove("hidden");
  ui.mapsLinkInput.focus();

  if (isMobileViewport()) {
    setPanelOpen(false);
  }
}

function closeImportLinkSheet() {
  state.importLatLng = null;
  ui.importLinkSheet.classList.add("hidden");
}

function addPoiEntry({ name, description, position }) {
  const poi = {
    id: createId(),
    name,
    description,
    position
  };

  state.pois.unshift(poi);
  renderMarkers();
  renderPoiList();
}

function submitAddPointForm() {
  if (!state.currentTripId) {
    showStatus("Es ist noch kein Trip aktiv.", "error");
    return;
  }

  if (!state.selectedLatLng) {
    showStatus("Keine Kartenposition gewaehlt.", "error");
    return;
  }

  const name = ui.pointName.value.trim();
  const description = ui.pointDescription.value.trim();

  if (!name) {
    showStatus("Name ist ein Pflichtfeld.", "error");
    ui.pointName.focus();
    return;
  }

  const normalizedPosition = `${formatCoord(state.selectedLatLng.lat)}, ${formatCoord(state.selectedLatLng.lng)}`;

  if (state.editingPoiId) {
    const index = state.pois.findIndex((poi) => poi.id === state.editingPoiId);

    if (index === -1) {
      showStatus("POI wurde nicht gefunden.", "error");
      return;
    }

    state.pois[index] = {
      ...state.pois[index],
      name,
      description,
      position: normalizedPosition
    };

    renderMarkers();
    renderPoiList();
    closeAddPointSheet();

    setDirty(true);
    const suffix = state.autoSaveEnabled ? "Auto-Save geplant." : "Bitte manuell speichern.";
    showStatus(`POI '${name}' aktualisiert. ${suffix}`, "success");
    return;
  }

  addPoiEntry({
    name,
    description,
    position: normalizedPosition
  });

  closeAddPointSheet();
  setDirty(true);
  const suffix = state.autoSaveEnabled ? "Auto-Save geplant." : "Bitte manuell speichern.";
  showStatus(`Punkt '${name}' hinzugefuegt. ${suffix}`, "success");
}

function removePoi(id) {
  const index = state.pois.findIndex((poi) => poi.id === id);

  if (index === -1) {
    return;
  }

  const poi = state.pois[index];
  state.pois.splice(index, 1);

  renderMarkers();
  renderPoiList();

  setDirty(true);
  const suffix = state.autoSaveEnabled ? "Auto-Save geplant." : "Bitte manuell speichern.";
  showStatus(`Punkt '${poi.name}' geloescht. ${suffix}`, "success");
}

function focusPoi(id) {
  const poi = state.pois.find((item) => item.id === id);
  const marker = state.markersById.get(id);

  if (!poi || !marker) {
    showStatus("Punkt wurde nicht gefunden.", "error");
    return;
  }

  try {
    const [lat, lng] = parsePosition(poi.position);

    map.flyTo([lat, lng], Math.max(map.getZoom(), MIN_FOCUS_ZOOM), {
      animate: true,
      duration: 0.7
    });

    marker.openPopup();
  } catch {
    showStatus("POI enthaelt keine gueltige Position.", "error");
  }
}

function extractErrorDetails(payload, status) {
  if (payload && typeof payload === "object" && payload.details) {
    return String(payload.details);
  }

  return `HTTP ${status}`;
}

function toSavePayload() {
  return {
    tripName: state.currentTripName,
    pois: state.pois.map((poi) => ({
      name: poi.name,
      position: normalizePosition(poi.position),
      description: poi.description
    }))
  };
}

async function savePoints({ reason = "manual", suppressStatus = false } = {}) {
  if (state.isSaving) {
    state.saveQueued = true;
    return false;
  }

  if (!state.currentTripId) {
    if (!suppressStatus) {
      showStatus("Kein aktiver Trip zum Speichern.", "error");
    }
    return false;
  }

  if (reason !== "manual" && !state.isDirty) {
    return true;
  }

  if (reason === "manual" && !state.isDirty) {
    if (!suppressStatus) {
      showStatus("Keine ungespeicherten Aenderungen vorhanden.", "info");
    }
    return true;
  }

  if (!state.currentTripPersisted && state.pois.length === 0) {
    setDirty(false);

    if (!suppressStatus) {
      showStatus("Neuer Trip wird erst beim ersten Punkt gespeichert.", "info");
    }

    return true;
  }

  state.isSaving = true;
  updateSaveButton();

  let saveSucceeded = false;

  try {
    const response = await fetch(`/api/trips/${encodeURIComponent(state.currentTripId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(toSavePayload())
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractErrorDetails(payload, response.status));
    }

    const savedTrip = payload && payload.trip ? payload.trip : null;

    if (savedTrip && typeof savedTrip.name === "string" && savedTrip.name.trim()) {
      state.currentTripName = savedTrip.name.trim();
    }

    state.currentTripPersisted = true;
    updateCurrentTripMeta({
      name: state.currentTripName,
      persisted: true,
      poiCount: state.pois.length
    });

    renderTripSelect();
    updateActiveTripLabel();
    setDirty(false);
    saveSucceeded = true;

    if (!suppressStatus) {
      const message = reason === "manual"
        ? `Aenderungen fuer '${state.currentTripName}' gespeichert.`
        : `Auto-Save abgeschlossen fuer '${state.currentTripName}'.`;

      showStatus(message, "success");
    }
  } catch (error) {
    if (!suppressStatus) {
      showStatus(`Speichern fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`, "error");
    }
  } finally {
    state.isSaving = false;
    updateSaveButton();

    if (state.saveQueued) {
      state.saveQueued = false;
      await savePoints({ reason: "queued", suppressStatus: true });
    }
  }

  return saveSucceeded;
}

async function loadTripFromServer(tripId, { fitMap = false } = {}) {
  try {
    showStatus("Trip wird geladen...", "info");

    const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractErrorDetails(payload, response.status));
    }

    const sourcePois = payload && Array.isArray(payload.pois) ? payload.pois : [];
    const tripName = payload && typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : tripId;

    state.currentTripId = tripId;
    state.currentTripName = tripName;
    state.currentTripPersisted = true;

    updateCurrentTripMeta({
      name: tripName,
      persisted: true
    });

    state.pois = sourcePois
      .map((poi) => {
        try {
          return {
            id: createId(),
            name: String(poi.name || "").trim(),
            description: String(poi.description || "").trim(),
            position: normalizePosition(poi.position)
          };
        } catch {
          return null;
        }
      })
      .filter((poi) => poi && poi.name);

    renderMarkers();
    renderPoiList();

    if (fitMap) {
      fitMapToPois();
    }

    closeAddPointSheet();
    closeImportLinkSheet();
    setDirty(false);
    updateActiveTripLabel();
    showStatus(`Trip '${tripName}' geladen (${state.pois.length} Punkte).`, "success");

    return true;
  } catch (error) {
    showStatus(`Trip konnte nicht geladen werden: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`, "error");
    return false;
  }
}

async function handlePendingChangesBeforeTripSwitch() {
  if (!state.isDirty) {
    return true;
  }

  if (state.autoSaveEnabled) {
    const saved = await savePoints({ reason: "trip-switch", suppressStatus: true });

    if (saved || !state.isDirty) {
      return true;
    }
  }

  return window.confirm("Ungespeicherte Aenderungen verwerfen und Trip wechseln?");
}

function setCurrentTripContext(trip) {
  state.currentTripId = trip.id;
  state.currentTripName = trip.name;
  state.currentTripPersisted = trip.persisted;
}

async function switchTrip(nextTripId, { fitMap = false, skipDirtyCheck = false } = {}) {
  const targetTrip = state.trips.find((trip) => trip.id === nextTripId);

  if (!targetTrip) {
    return false;
  }

  if (!skipDirtyCheck && state.currentTripId && state.currentTripId !== nextTripId) {
    const canSwitch = await handlePendingChangesBeforeTripSwitch();

    if (!canSwitch) {
      renderTripSelect();
      return false;
    }
  }

  setCurrentTripContext(targetTrip);
  renderTripSelect();
  updateActiveTripLabel();

  if (targetTrip.persisted) {
    return loadTripFromServer(targetTrip.id, { fitMap });
  }

  closeAddPointSheet();
  closeImportLinkSheet();
  state.pois = [];
  renderMarkers();
  renderPoiList();

  if (fitMap) {
    fitMapToPois();
  }

  setDirty(false);
  showStatus(`Neuer Trip '${targetTrip.name}'. Speicherung erfolgt beim ersten Punkt.`, "info");
  return true;
}

async function loadTrips() {
  try {
    showStatus("Trips werden geladen...", "info");

    const response = await fetch("/api/trips", {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractErrorDetails(payload, response.status));
    }

    const remoteTrips = payload && Array.isArray(payload.trips) ? payload.trips : [];

    state.trips = remoteTrips
      .map((trip) => {
        if (!trip || typeof trip !== "object") {
          return null;
        }

        const id = typeof trip.id === "string" ? trip.id.trim() : "";
        const name = typeof trip.name === "string" ? trip.name.trim() : "";

        if (!id || !name) {
          return null;
        }

        return {
          id,
          name,
          persisted: true,
          poiCount: Number.isFinite(trip.poiCount) ? trip.poiCount : 0
        };
      })
      .filter(Boolean);

    sortTrips();

    if (state.trips.length === 0) {
      state.trips.push({
        id: "points",
        name: "points",
        persisted: false,
        poiCount: 0
      });
    }

    renderTripSelect();
    await switchTrip(state.trips[0].id, { fitMap: true, skipDirtyCheck: true });
  } catch (error) {
    showStatus(`Trips konnten nicht geladen werden: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`, "error");
  }
}

async function createNewTrip() {
  const rawName = window.prompt("Name fuer den neuen Trip:");

  if (rawName === null) {
    return;
  }

  const name = rawName.trim();

  if (!name) {
    showStatus("Trip-Name darf nicht leer sein.", "error");
    return;
  }

  const existing = state.trips.find((trip) => trip.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    showStatus(`Trip '${name}' existiert bereits und wurde ausgewaehlt.`, "info");
    await switchTrip(existing.id, { fitMap: true });
    return;
  }

  const newTrip = {
    id: createUniqueTripId(name),
    name,
    persisted: false,
    poiCount: 0
  };

  state.trips.push(newTrip);
  sortTrips();
  renderTripSelect();
  await switchTrip(newTrip.id, { fitMap: true });
  showStatus(`Neuer Trip '${name}' erstellt. Speicherung beim ersten Punkt.`, "success");

  if (isMobileViewport()) {
    setPanelOpen(true);
  }
}

async function reloadCurrentTrip() {
  if (!state.currentTripId) {
    showStatus("Kein aktiver Trip zum Neuladen.", "error");
    return;
  }

  if (!state.currentTripPersisted) {
    if (state.pois.length === 0) {
      showStatus("Dieser neue Trip wurde noch nicht gespeichert.", "info");
      return;
    }

    const proceed = window.confirm(
      "Ungespeicherte Punkte in diesem neuen Trip verwerfen und auf leer zuruecksetzen?"
    );

    if (!proceed) {
      return;
    }

    state.pois = [];
    renderMarkers();
    renderPoiList();
    setDirty(false);
    fitMapToPois();
    showStatus("Neuer Trip auf leeren Zustand zurueckgesetzt.", "info");
    return;
  }

  await loadTripFromServer(state.currentTripId, { fitMap: false });
}

function decodePlaceText(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}

function extractLatLngFromGoogleUrl(url) {
  const queryKeys = ["q", "query", "ll", "destination", "daddr"];

  for (const key of queryKeys) {
    const value = url.searchParams.get(key);

    if (!value) {
      continue;
    }

    const parsed = parseLatLngText(value);

    if (parsed) {
      return parsed;
    }
  }

  let decodedHref = url.href;

  try {
    decodedHref = decodeURIComponent(url.href);
  } catch {
    decodedHref = url.href;
  }

  const placeAtMatch = decodedHref.match(/\/place\/[^/]+\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);

  if (placeAtMatch) {
    const lat = Number(placeAtMatch[1]);
    const lng = Number(placeAtMatch[2]);

    if (isValidLatLng(lat, lng)) {
      return [lat, lng];
    }
  }

  const atMatch = decodedHref.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);

  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);

    if (isValidLatLng(lat, lng)) {
      return [lat, lng];
    }
  }

  const pathMatch = url.pathname.match(/\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:[\/,]|$)/);

  if (pathMatch) {
    const lat = Number(pathMatch[1]);
    const lng = Number(pathMatch[2]);

    if (isValidLatLng(lat, lng)) {
      return [lat, lng];
    }
  }

  const exactMatch = decodedHref.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);

  if (exactMatch) {
    const lat = Number(exactMatch[1]);
    const lng = Number(exactMatch[2]);

    if (isValidLatLng(lat, lng)) {
      return [lat, lng];
    }
  }

  return null;
}

function extractPlaceNameFromGoogleUrl(url) {
  const placeMatch = url.pathname.match(/\/place\/([^/]+)/i);

  if (placeMatch && placeMatch[1]) {
    const fromPath = decodePlaceText(placeMatch[1]).trim();

    if (fromPath) {
      return fromPath;
    }
  }

  const queryValue = url.searchParams.get("q") || url.searchParams.get("query");

  if (queryValue) {
    const parsed = parseLatLngText(queryValue);

    if (!parsed) {
      const asName = decodePlaceText(queryValue).trim();

      if (asName) {
        return asName;
      }
    }
  }

  return "";
}

function isLikelyShortGoogleMapsLink(rawLink) {
  try {
    const url = new URL(rawLink.trim());
    const host = url.hostname.toLowerCase();

    return host === "maps.app.goo.gl" || (host === "goo.gl" && url.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

async function expandGoogleMapsLink(rawLink) {
  const response = await fetch("/api/maps/resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ url: rawLink.trim() })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractErrorDetails(payload, response.status));
  }

  if (!payload || typeof payload.url !== "string" || !payload.url.trim()) {
    throw new Error("Kurzlink konnte nicht aufgeloest werden.");
  }

  return payload.url.trim();
}

function parseGoogleMapsLink(rawLink) {
  const trimmed = rawLink.trim();

  if (!trimmed) {
    throw new Error("Bitte einen Google-Maps-Link eingeben.");
  }

  const directCoords = parseLatLngText(trimmed);

  if (directCoords) {
    return {
      latLng: {
        lat: directCoords[0],
        lng: directCoords[1]
      },
      name: "POI von Maps-Link"
    };
  }

  let url;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Der Link ist ungueltig.");
  }

  const host = url.hostname.toLowerCase();
  const isGoogleHost = host.includes("google.") || host.endsWith("goo.gl");

  if (!isGoogleHost) {
    throw new Error("Bitte einen Google-Maps-Link verwenden.");
  }

  const coords = extractLatLngFromGoogleUrl(url);

  if (!coords) {
    throw new Error(
      "Koordinaten konnten nicht gelesen werden. Bei Kurzlinks bitte zuerst den Link analysieren."
    );
  }

  const placeName = extractPlaceNameFromGoogleUrl(url) || "POI von Maps-Link";

  return {
    latLng: {
      lat: coords[0],
      lng: coords[1]
    },
    name: placeName
  };
}

async function derivePoiFromMapsInput(rawLink) {
  try {
    return parseGoogleMapsLink(rawLink);
  } catch (firstError) {
    if (!isLikelyShortGoogleMapsLink(rawLink)) {
      throw firstError;
    }

    const expandedLink = await expandGoogleMapsLink(rawLink);
    return parseGoogleMapsLink(expandedLink);
  }
}

async function parseImportLinkAndFillForm() {
  const rawLink = ui.mapsLinkInput.value.trim();

  if (!rawLink) {
    setImportStatus("Bitte zuerst einen Link einfuegen.", "error");
    ui.mapsLinkInput.focus();
    return false;
  }

  setImportStatus("Link wird analysiert...", "info");

  try {
    const derived = await derivePoiFromMapsInput(rawLink);
    state.importLatLng = derived.latLng;

    ui.importName.value = derived.name;
    ui.importPosition.value = `${formatCoord(derived.latLng.lat)}, ${formatCoord(derived.latLng.lng)}`;

    setImportStatus("Link analysiert. Name und Beschreibung pruefen und speichern.", "success");
    return true;
  } catch (error) {
    state.importLatLng = null;
    ui.importPosition.value = "";
    setImportStatus(
      `Analyse fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      "error"
    );
    return false;
  }
}

function submitImportForm() {
  if (!state.currentTripId) {
    showStatus("Es ist noch kein Trip aktiv.", "error");
    return;
  }

  if (!state.importLatLng) {
    showStatus("Bitte zuerst den Link analysieren.", "error");
    return;
  }

  const name = ui.importName.value.trim();
  const description = ui.importDescription.value.trim();

  if (!name) {
    setImportStatus("Name ist ein Pflichtfeld.", "error");
    ui.importName.focus();
    return;
  }

  addPoiEntry({
    name,
    description,
    position: `${formatCoord(state.importLatLng.lat)}, ${formatCoord(state.importLatLng.lng)}`
  });

  closeImportLinkSheet();
  setDirty(true);

  const suffix = state.autoSaveEnabled ? "Auto-Save geplant." : "Bitte manuell speichern.";
  showStatus(`Punkt '${name}' aus Maps-Link hinzugefuegt. ${suffix}`, "success");
}

function setUserLocationMarker(lat, lng) {
  const latLng = [lat, lng];

  if (!state.userLocationMarker) {
    state.userLocationMarker = L.circleMarker(latLng, {
      radius: 7,
      color: "#0f766e",
      fillColor: "#14b8a6",
      fillOpacity: 0.85,
      weight: 2
    }).addTo(map);
  } else {
    state.userLocationMarker.setLatLng(latLng);
  }

  if (!state.userLocationCircle) {
    state.userLocationCircle = L.circle(latLng, {
      radius: 55,
      color: "#0f766e",
      fillColor: "#2dd4bf",
      fillOpacity: 0.12,
      weight: 1
    }).addTo(map);
  } else {
    state.userLocationCircle.setLatLng(latLng);
  }
}

function locateCurrentPosition() {
  if (!navigator.geolocation) {
    showStatus("Geolocation wird von diesem Browser nicht unterstuetzt.", "error");
    return;
  }

  showStatus("Standort wird gesucht...", "info");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      if (!isValidLatLng(lat, lng)) {
        showStatus("Aktueller Standort konnte nicht gelesen werden.", "error");
        return;
      }

      setUserLocationMarker(lat, lng);
      map.flyTo([lat, lng], Math.max(map.getZoom(), LOCATION_FOCUS_ZOOM), {
        animate: true,
        duration: 0.8
      });
      showStatus("Karte auf aktuellen Standort gesetzt.", "success");
    },
    (error) => {
      const message = error && error.message ? error.message : "Unbekannter Fehler";
      showStatus(`Standort konnte nicht ermittelt werden: ${message}`, "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    }
  );
}

function handlePoiAction(action, id) {
  if (!id) {
    return;
  }

  if (action === "focus") {
    focusPoi(id);
    return;
  }

  if (action === "edit") {
    openAddPointSheetForEdit(id);
    return;
  }

  if (action === "delete") {
    removePoi(id);
  }
}

function installMapOverlayGuards() {
  const overlays = [ui.controlPanel, ui.addPointSheet, ui.importLinkSheet];

  for (const overlay of overlays) {
    L.DomEvent.disableClickPropagation(overlay);
    L.DomEvent.disableScrollPropagation(overlay);
  }
}

function wireEvents() {
  map.on("click", (event) => {
    openAddPointSheetForCreate(event.latlng);
  });

  ui.cancelAddPoint.addEventListener("click", () => {
    closeAddPointSheet();
  });

  ui.addPointForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAddPointForm();
  });

  ui.addByLinkButton.addEventListener("click", () => {
    openImportLinkSheet();
  });

  ui.cancelImportLink.addEventListener("click", () => {
    closeImportLinkSheet();
  });

  ui.parseMapsLinkButton.addEventListener("click", () => {
    void parseImportLinkAndFillForm();
  });

  ui.importLinkForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.importLatLng) {
      const parsed = await parseImportLinkAndFillForm();

      if (!parsed) {
        return;
      }
    }

    submitImportForm();
  });

  ui.locateButton.addEventListener("click", () => {
    locateCurrentPosition();
  });

  ui.saveButton.addEventListener("click", () => {
    void savePoints({ reason: "manual" });
  });

  ui.reloadButton.addEventListener("click", () => {
    void reloadCurrentTrip();
  });

  ui.autoSaveToggle.addEventListener("change", () => {
    state.autoSaveEnabled = ui.autoSaveToggle.checked;

    if (state.autoSaveEnabled && state.isDirty) {
      scheduleAutoSave();
    }

    showStatus(state.autoSaveEnabled ? "Auto-Save aktiviert." : "Auto-Save deaktiviert.", "info");
  });

  ui.poiSearchInput.addEventListener("input", () => {
    state.poiSearchQueryRaw = ui.poiSearchInput.value;
    state.poiSearchQuery = normalizeSearchText(ui.poiSearchInput.value);
    renderPoiList();
  });

  ui.tripSelect.addEventListener("change", async () => {
    const selectedId = ui.tripSelect.value;
    const switched = await switchTrip(selectedId, { fitMap: true });

    if (!switched) {
      renderTripSelect();
    }
  });

  ui.createTripButton.addEventListener("click", () => {
    void createNewTrip();
  });

  ui.panelToggleButton.addEventListener("click", () => {
    setPanelOpen(!state.panelOpen);
  });

  ui.panelCloseButton.addEventListener("click", () => {
    setPanelOpen(false);
  });

  window.addEventListener("resize", () => {
    syncPanelState();
  });

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-poi-action]");

    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.poiAction;
    const id = actionButton.dataset.poiId;

    handlePoiAction(action, id);
  });
}

function init() {
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  installMapOverlayGuards();

  state.panelOpen = !isMobileViewport();
  syncPanelState();

  wireEvents();
  void loadTrips();
}

init();
