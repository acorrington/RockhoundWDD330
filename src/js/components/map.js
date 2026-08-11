// map.js
// This file manages the Mapbox interactive map shown in the "Map View" section.
// It handles adding/removing markers for river stations, field log entries,
// and the user's selected position.
//
// Mapbox GL JS is loaded from a CDN in index.html so it's available globally.
// The API token is stored in .env as VITE_MAPBOX_TOKEN - don't commit that file!

import { getRiverCondition } from "./riverCard.js";

// Read the Mapbox API token from the environment variables set in .env
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Keep a reference to the map so we don't create more than one
let mapInstance = null;

// Track all active markers so we can remove them before re-rendering
let currentMapMarkers = [];

// Track log marker pin elements by log ID so we can pulse them when a card is clicked
// Key: log.id (string), Value: the inner pin <div> element
let logPinElements = new Map();

/**
 * Shows the entire United States on the map - used as the default/home view.
 * Called when the app first loads or when no state is selected.
 *
 * @param {Array} logs - Any saved log entries to show as markers
 */
export function showUSMap(logs = []) {
    console.log("[Map] Showing full US overview");
    renderMap([], null, null, logs, true, false, true);
}

/**
 * Shows a zoomed-in map view for a specific area with river station markers.
 *
 * @param {Array} stations - River gauge station objects to plot on the map
 * @param {Object|null} userPos - The user's selected/GPS position { lat, lng }
 * @param {string|null} activeId - Station ID that should be shown as "selected" (larger pin)
 * @param {Array} logs - Field log entries to show as marker pins
 * @param {boolean} fitLogs - If true, zoom the map to include the log markers
 * @param {boolean} fitStations - If true, zoom the map to include the station markers
 */
export function showCustomMap(stations, userPos = null, activeId = null, logs = [], fitLogs = false, fitStations = true) {
    console.log(`[Map] Rendering custom map - stations: ${stations ? stations.length : 0}, activeId: ${activeId}`);
    renderMap(stations, userPos, activeId, logs, false, fitLogs, fitStations);
}

/**
 * Creates a small wrapper div around a marker pin element.
 * Mapbox needs this container so it can position and size the marker correctly.
 *
 * @param {HTMLElement} pinElement - The inner marker div
 * @returns {HTMLElement} - A wrapper div containing the pin
 */
function createMarkerWrapper(pinElement) {
    const wrapper = document.createElement("div");
    wrapper.style.width = "24px";
    wrapper.style.height = "24px";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.cursor = "pointer";
    wrapper.appendChild(pinElement);
    return wrapper;
}

/**
 * The core map rendering function used by both showUSMap and showCustomMap.
 * Initializes the map on first call, then clears and re-adds all markers.
 *
 * @param {Array} stations - River stations to show as colored pins
 * @param {Object|null} userPos - User position to show as a special pin
 * @param {string|null} activeId - ID of the active/selected station
 * @param {Array} logs - Log entries to show as log pins
 * @param {boolean} isUSMap - If true, fly to the full US overview
 * @param {boolean} fitLogs - If true, zoom to fit log pins
 * @param {boolean} fitStations - If true, zoom to fit station pins
 */
function renderMap(stations, userPos, activeId, logs = [], isUSMap = false, fitLogs = false, fitStations = true) {

    // Create the map on first use
    if (!mapInstance) {
        console.log("[Map] Initializing Mapbox map for the first time...");

        const mapboxgl = window.mapboxgl;

        if (!mapboxgl) {
            console.error("Mapbox GL JS failed to load from CDN.");
            return;
        }

        mapboxgl.accessToken = MAPBOX_TOKEN;
        mapInstance = new mapboxgl.Map({
            container: "map-container-inner",
            style: "mapbox://styles/mapbox/satellite-streets-v12",
            center: [-98.5795, 39.8283],
            zoom: 3,
            projection: "globe",
            doubleClickZoom: false
        });

        // Add the built-in zoom controls (+/- buttons)
        mapInstance.addControl(new mapboxgl.NavigationControl());

        // When the user clicks anywhere on the map, send an event with the coordinates
        mapInstance.on("click", function(clickEvent) {
            const clickedLat = clickEvent.lngLat.lat;
            const clickedLng = clickEvent.lngLat.lng;
            console.log(`[Map] Map clicked at: (${clickedLat}, ${clickedLng})`);

            window.dispatchEvent(new CustomEvent("mapClicked", {
                detail: { lat: clickedLat, lng: clickedLng }
            }));
        });

        // Fire mapViewChanged whenever the user finishes panning or zooming.
        // main.js listens to this to filter logs and fetch stations for the visible area.
        mapInstance.on("moveend", function() {
            const bounds = mapInstance.getBounds();
            const zoom = mapInstance.getZoom();
            window.dispatchEvent(new CustomEvent("mapViewChanged", {
                detail: {
                    zoom: zoom,
                    minLng: bounds.getWest(),
                    minLat: bounds.getSouth(),
                    maxLng: bounds.getEast(),
                    maxLat: bounds.getNorth()
                }
            }));
        });

        console.log("[Map] Mapbox map created successfully!");
    }

    // Remove all the old markers before we add new ones
    console.log(`[Map] Removing ${currentMapMarkers.length} old marker(s)...`);
    currentMapMarkers.forEach(function(marker) {
        marker.remove();
    });
    currentMapMarkers = [];
    logPinElements.clear();

    // We use bounds to figure out what area to zoom into
    const mapBoundingBox = new mapboxgl.LngLatBounds();
    let hasAtLeastOnePoint = false;

    // --- Add River Station Markers ---
    if (stations && stations.length > 0) {
        console.log(`[Map] Adding ${stations.length} station marker(s)...`);

        stations.forEach(function(station) {
            const pinEl = document.createElement("div");

            // Color the pin based on river conditions
            const stationCondition = getRiverCondition(station.gaugeHeight, station.discharge);
            let pinColorClass = "status-neutral";

            if (stationCondition.class === "badge-green") pinColorClass = "status-green";
            else if (stationCondition.class === "badge-yellow") pinColorClass = "status-yellow";
            else if (stationCondition.class === "badge-red") pinColorClass = "status-red";

            // Highlight this pin if it's the currently selected station
            if (station.id === activeId) {
                pinEl.className = `map-pin active ${pinColorClass}`;
            } else {
                pinEl.className = `map-pin ${pinColorClass}`;
            }

            pinEl.title = `${station.name} (${stationCondition.label})`;

            const wrapper = createMarkerWrapper(pinEl);

            // Clicking a station pin fires a custom event so main.js can react
            wrapper.addEventListener("click", function(e) {
                e.stopPropagation(); // Don't also trigger the map-click event
                console.log(`[Map] Station pin clicked: "${station.name}"`);
                window.dispatchEvent(new CustomEvent("stationClicked", { detail: station }));
            });

            const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
                .setLngLat([station.lng, station.lat])
                .addTo(mapInstance);

            currentMapMarkers.push(marker);
            mapBoundingBox.extend([station.lng, station.lat]);
            hasAtLeastOnePoint = true;
        });
    }

    // --- Add Field Log Markers ---
    if (logs && logs.length > 0) {
        console.log(`[Map] Adding ${logs.length} log marker(s)...`);

        logs.forEach(function(logEntry) {
            const logLat = parseFloat(logEntry.lat);
            const logLng = parseFloat(logEntry.lng);

            // Skip logs with missing or invalid coordinates
            if (isNaN(logLat) || isNaN(logLng)) {
                console.warn(`[Map] Skipping log "${logEntry.locationName}" - invalid coordinates`);
                return;
            }

            const logPinEl = document.createElement("div");
            logPinEl.className = "map-pin log-pin";
            logPinEl.title = `Log: ${logEntry.locationName || "Field Log"}`;

            const wrapper = createMarkerWrapper(logPinEl);

            // Clicking a log pin highlights the corresponding card in the log list
            wrapper.addEventListener("click", function(e) {
                e.stopPropagation();
                console.log(`[Map] Log pin clicked: "${logEntry.locationName}"`);
                window.dispatchEvent(new CustomEvent("logClicked", { detail: logEntry }));
            });

            const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
                .setLngLat([logLng, logLat])
                .addTo(mapInstance);

            currentMapMarkers.push(marker);
            logPinElements.set(logEntry.id, logPinEl);

            // Only include log pins in the zoom calculation when fitLogs is true
            if (fitLogs) {
                mapBoundingBox.extend([logLng, logLat]);
                hasAtLeastOnePoint = true;
            }
        });
    }

    // --- Add User/Selected Position Marker ---
    if (userPos) {
        console.log(`[Map] Adding user position marker at (${userPos.lat}, ${userPos.lng})`);

        const userPinEl = document.createElement("div");
        userPinEl.className = "map-pin user";
        userPinEl.title = "Selected Location";

        const wrapper = createMarkerWrapper(userPinEl);

        const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
            .setLngLat([userPos.lng, userPos.lat])
            .addTo(mapInstance);

        currentMapMarkers.push(marker);
        mapBoundingBox.extend([userPos.lng, userPos.lat]);
        hasAtLeastOnePoint = true;
    }

    // --- Adjust the map view ---
    if (isUSMap) {
        // Return to the full US overview
        console.log("[Map] Flying to US overview");
        mapInstance.flyTo({ center: [-98.5795, 39.8283], zoom: 3, duration: 2000 });
    } else if (hasAtLeastOnePoint && (fitStations || fitLogs)) {
        // Zoom to fit all the visible markers
        console.log("[Map] Fitting bounds to markers");
        mapInstance.fitBounds(mapBoundingBox, { padding: 50, maxZoom: 12, duration: 1500 });
    }
}

/**
 * Pulses the map marker for a specific log entry when the user clicks its card.
 * Adds the "highlighted" CSS class to the pin element for 2.5 seconds, then removes it.
 * Also pans the map to center on the marker so the user can see it.
 *
 * @param {string} logId - The ID of the log whose marker should pulse
 * @param {number} lat - Latitude to pan the map to
 * @param {number} lng - Longitude to pan the map to
 */
export function pulseLogMarker(logId, lat, lng) {
    console.log(`[Map] Pulsing log marker for ID: ${logId}`);

    const pinEl = logPinElements.get(logId);

    if (!pinEl) {
        console.warn(`[Map] No marker found for log ID: ${logId} - it may not be visible on the current map view`);
        return;
    }

    // Remove any existing highlight first so re-clicking resets the timer
    pinEl.classList.remove("highlighted");

    // A tiny timeout lets the browser register the class removal before re-adding it
    // This makes sure the animation restarts cleanly even if you click the card twice
    setTimeout(function() {
        pinEl.classList.add("highlighted");

        // Pan the map to the marker so it's visible
        if (mapInstance && lat && lng) {
            mapInstance.panTo([lng, lat], { duration: 600 });
        }

        // Remove the highlight after 2.5 seconds
        setTimeout(function() {
            pinEl.classList.remove("highlighted");
        }, 2500);
    }, 20);
}
