// main.js
// This is the main entry point that starts up the whole Rockhound Companion app.
// It wires together all the other modules and handles:
//   - Building the state/county/river dropdown menus
//   - Responding to user actions (clicking the map, selecting from dropdowns, etc.)
//   - Loading and displaying river, geology, and mineral data for a selected location
//   - Managing the field log entry dialog

import { fetchRiverData, fetchStationsByCounty, fetchStationsByState, fetchStationsByBBox } from "./api/usgs.js";
import { fetchGeologyData } from "./api/macrostrat.js";
import { fetchNearbyMinerals } from "./api/mindat.js";
import { renderLogGrid, initLogSearch, highlightLogCard } from "./components/logbook.js";
import { renderRiverCard } from "./components/riverCard.js";
import { renderGeologyCard, resetGeologyCard } from "./components/geologyCard.js";
import { renderMineralCard, resetMineralCard } from "./components/mineralCard.js";
import { showUSMap, showCustomMap, pulseLogMarker } from "./components/map.js";
import { getSavedLogs, saveLog, updateLog } from "./utils/storage.js";
import { STATES } from "./utils/locations.js";
import { calculateDistanceBetweenTwoCoordinatesInMiles, findNearestWaterStationWithinMaximumMilesRange } from "./utils/geography.js";
import { fetchCountyByCoordinates } from "./api/fcc.js";

// Module-level variables that track the current app state
// These need to be accessible across multiple functions, so they live up here
let currentStations = []; // All river stations loaded for the current area
let currentUserPos = null; // The lat/lng the user has selected or clicked
let currentActiveId = null; // The ID of the currently selected station

/**
 * A simple debounce helper. Wraps a function so it only runs after the user has
 * stopped calling it for a given number of milliseconds. We use this to avoid
 * hammering the USGS API on every pixel of a map pan/zoom - we wait until the
 * user has stopped moving the map for 800ms before fetching new data.
 *
 * @param {Function} fn - The function to debounce
 * @param {number} delayMs - How many milliseconds to wait after the last call
 * @returns {Function} - The debounced version of fn
 */
function debounce(fn, delayMs) {
    let timeoutId = null;
    return function() {
        const args = arguments;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(function() {
            fn.apply(null, args);
        }, delayMs);
    };
}

/**
 * Checks whether the main state AND county dropdowns both have a value selected.
 * If they do, the "Add New Log" button is enabled. If not, it stays disabled.
 * This is called any time the state or county selection changes.
 */
function updateAddLogButtonState() {
    const addLogButton = document.getElementById("open-log-dialog");
    const stateDropdown = document.getElementById("state-select");
    const countyDropdown = document.getElementById("county-select");

    if (!addLogButton || !stateDropdown || !countyDropdown) return;

    const stateIsSelected = stateDropdown.value !== "";
    const countyIsSelected = countyDropdown.value !== "";
    const bothSelected = stateIsSelected && countyIsSelected;

    addLogButton.disabled = !bothSelected;

    // Update the tooltip so the user knows why it's disabled
    if (bothSelected) {
        addLogButton.title = "";
    } else if (stateIsSelected) {
        addLogButton.title = "Select a county first";
    } else {
        addLogButton.title = "Select a state and county first";
    }

    console.log("[Main] Add Log button " + (bothSelected ? "enabled" : "disabled"));
}

/**
 * Resets the river, geology, and mineral data cards back to their empty/default state.
 * Called when the user clears a filter or changes state/county selection.
 */
function clearLocationData() {
    console.log("[Main] Clearing location data cards...");

    // Reset condition badge
    const conditionBadge = document.getElementById("condition-badge");
    const gaugeValue = document.getElementById("gauge-value");
    const flowValue = document.getElementById("flow-value");

    if (conditionBadge) {
        conditionBadge.className = "badge-neutral";
        conditionBadge.textContent = "--";
    }
    if (gaugeValue) gaugeValue.textContent = "N/A";
    if (flowValue) flowValue.textContent = "N/A";

    // Reset geology and mineral cards using their own component functions
    resetGeologyCard();
    resetMineralCard();

    // Reset the status pill
    const statusText = document.getElementById("status-text");
    const statusDot = document.getElementById("status-dot");
    if (statusText) statusText.textContent = "Ready for field work";
    if (statusDot) statusDot.className = "badge-neutral";
}

/**
 * The core data-loading function. Fetches and displays:
 *   1. River flow data from USGS for the nearest station
 *   2. Geological bedrock info from Macrostrat for the exact clicked point
 *   3. Nearby mineral occurrences from Mindat for the clicked point
 *
 * @param {string|null} siteId - USGS station ID to load river data for (null if no station nearby)
 * @param {number} lat - Latitude of the location to look up
 * @param {number} lng - Longitude of the location to look up
 * @param {string|null} countyCd - County FIPS code, used to sync the dropdown menus
 * @param {boolean} fitMap - Whether to zoom the map to fit the new markers
 */
async function loadLocationData(siteId, lat, lng, countyCd = null, fitMap = true, mapLogs = null) {
    console.log(`[Main] loadLocationData called - siteId: ${siteId}, lat: ${lat}, lng: ${lng}`);

    currentActiveId = siteId || null;

    // Use the caller-provided log list for the map, or fall back to the current filter.
    // searchArea() passes state-scoped logs so clicking the map never hides nearby markers.
    const logsForMap = mapLogs !== null ? mapLogs : getDisplayLogs();

    // Refresh the map with the updated active pin
    showCustomMap(currentStations, currentUserPos, siteId, logsForMap, false, fitMap);

    // If we have a county code, make sure the state/county dropdowns match
    const stateDropdown = document.getElementById("state-select");
    const countyDropdown = document.getElementById("county-select");

    if (countyCd && countyDropdown && stateDropdown) {
        const stateFipsFromCounty = countyCd.substring(0, 2);

        if (stateDropdown.value !== stateFipsFromCounty) {
            stateDropdown.value = stateFipsFromCounty;

            // Rebuild the county dropdown for this state
            countyDropdown.innerHTML = "<option value=\"\">-- Select a County --</option>";
            if (STATES[stateFipsFromCounty]) {
                STATES[stateFipsFromCounty].counties.forEach(function(county) {
                    const opt = document.createElement("option");
                    opt.value = county.fips;
                    opt.textContent = county.name;
                    countyDropdown.appendChild(opt);
                });
                countyDropdown.disabled = false;
            }
        }
        if (countyDropdown.value !== countyCd) {
            countyDropdown.value = countyCd;
        }
    }

    // Add skeleton loading animation to the cards while fetching
    const riverContainer = document.getElementById("river-status-container");
    const geologyCard = document.getElementById("geology-card");
    const mindatCard = document.getElementById("mindat-card");

    if (riverContainer) riverContainer.classList.add("skeleton");
    if (geologyCard) geologyCard.classList.add("skeleton");
    if (mindatCard) mindatCard.classList.add("skeleton");

    try {
        // --- Fetch 1: River data from USGS ---
        if (siteId) {
            console.log(`[Main] Fetching river data for station: ${siteId}`);
            const riverData = await fetchRiverData(siteId);

            if (riverData) {
                renderRiverCard(riverData);
            } else {
                renderRiverCard({ error: "Failed to load river data" });
            }
        } else {
            renderRiverCard({ error: "No river gauge found within 50 miles" });
        }

        // --- Fetch 2: Geology data from Macrostrat ---
        if (lat && lng) {
            console.log(`[Main] Fetching geology for: (${lat}, ${lng})`);
            const geologyData = await fetchGeologyData(lat, lng);
            renderGeologyCard(geologyData);

            // --- Fetch 3: Nearby minerals from Mindat ---
            console.log(`[Main] Fetching nearby minerals for: (${lat}, ${lng})`);
            const nearbyMinerals = await fetchNearbyMinerals(lat, lng, 25);
            renderMineralCard(nearbyMinerals);

        } else {
            // No coordinates to search - just clear both cards
            renderGeologyCard(null);
            renderMineralCard([]);
        }

    } catch (error) {
        console.error("[Main] Unexpected error loading location data:", error);
    }
}

/**
 * Returns the logs that should be shown based on the current state/county selection.
 * - County selected: show only that county's logs
 * - State only: show all logs from that state
 * - Nothing selected: return empty array
 *
 * @returns {Array} - Filtered array of log objects
 */
function getDisplayLogs() {
    const stateDropdown = document.getElementById("state-select");
    const countyDropdown = document.getElementById("county-select");
    const selectedState = stateDropdown ? stateDropdown.value : null;
    const selectedCounty = countyDropdown ? countyDropdown.value : null;

    const allLogs = getSavedLogs();

    if (!selectedState) return allLogs;

    if (selectedCounty) {
        return allLogs.filter(function(log) { return log.county === selectedCounty; });
    }

    return allLogs.filter(function(log) { return log.state === selectedState; });
}

/**
 * Populates the county dropdown for a given state.
 * Clears and disables it if no valid state is given.
 *
 * @param {HTMLSelectElement} countyDropdown - The county <select> element to populate
 * @param {string} stateFips - The 2-digit state FIPS code
 * @param {string|null} preSelectFips - A county FIPS to auto-select after populating (optional)
 */
function populateCountySelect(countyDropdown, stateFips, preSelectFips = null) {
    if (!countyDropdown) return;

    countyDropdown.innerHTML = "<option value=\"\">-- Select a County --</option>";

    if (!stateFips || !STATES[stateFips]) {
        countyDropdown.disabled = true;
        countyDropdown.value = "";
        return;
    }

    STATES[stateFips].counties.forEach(function(county) {
        const opt = document.createElement("option");
        opt.value = county.fips;
        opt.textContent = county.name;
        countyDropdown.appendChild(opt);
    });

    countyDropdown.disabled = false;

    if (preSelectFips) {
        countyDropdown.value = preSelectFips;
    }
}

/**
 * Searches for river stations and geological data around a given set of coordinates.
 * Called when the user clicks on the map or uses the "Find Nearest to Me" button.
 *
 * Steps:
 * 1. Reverse geocode the coordinates to find the county and state (using api/fcc.js)
 * 2. Fetch river stations for that county (falling back to state or bounding box)
 * 3. Find the nearest station within 50 miles (using geography.js)
 * 4. Load the data for that station and the clicked coordinates
 *
 * @param {number} lat - Latitude to search around
 * @param {number} lng - Longitude to search around
 * @param {string} label - Human-readable description for status messages
 */
async function searchArea(lat, lng, label = "Selected Location") {
    console.log(`[Main] Searching area for: "${label}" at (${lat}, ${lng})`);

    const statusText = document.getElementById("status-text");
    if (statusText) statusText.textContent = `Locating ${label}...`;

    const stateDropdown = document.getElementById("state-select");
    const countyDropdown = document.getElementById("county-select");
    const riverDropdown = document.getElementById("river-select");

    // Reset the river dropdown while we figure out where we are
    if (riverDropdown) {
        riverDropdown.disabled = true;
        riverDropdown.innerHTML = "<option value=\"\">Resolving county and nearby gauges...</option>";
    }

    currentUserPos = { lat: lat, lng: lng };

    // Store coordinates in the hidden lat/lng fields for the log form
    const latInput = document.getElementById("lat");
    const lngInput = document.getElementById("lng");
    if (latInput) latInput.value = lat;
    if (lngInput) lngInput.value = lng;

    // Call the FCC API to reverse geocode the coordinates into a county and state
    let countyFips = null;
    let stateFips = null;
    let stateAbbr = null;

    const geocodeResult = await fetchCountyByCoordinates(lat, lng);
    if (geocodeResult) {
        countyFips = geocodeResult.countyFips;
        stateFips = geocodeResult.stateFips;
        stateAbbr = geocodeResult.stateAbbr;
    }

    // Update the state dropdown if we got a FIPS code
    if (stateDropdown && stateFips) {
        stateDropdown.value = stateFips;
    } else if (!stateFips && stateAbbr) {
        // Fall back to matching by abbreviation if we didn't get a FIPS code
        const matchedState = Object.entries(STATES).find(function([fips, stateData]) {
            return stateData.abbr === stateAbbr;
        });
        if (matchedState) {
            stateFips = matchedState[0];
            if (stateDropdown) stateDropdown.value = stateFips;
        }
    }

    // Populate the county dropdown for the resolved state
    if (countyDropdown) {
        populateCountySelect(countyDropdown, stateFips, countyFips);
    }
    updateAddLogButtonState();

    // Update the log grid to match the resolved county/state filter
    // Use state-scoped logs for the map so markers never vanish when clicking near a county border.
    // The county dropdown is pre-selected for the Add Log form, but the MAP and GRID show the whole state.
    const stateFilteredLogs = stateFips ? getSavedLogs().filter(function(log) { return log.state === stateFips; }) : getSavedLogs();
    renderLogGrid(stateFilteredLogs);

    // Fetch stations - try county first, then state, then fall back to bounding box
    let riverStations = null;

    if (countyFips) {
        console.log(`[Main] Fetching stations by county: ${countyFips}`);
        riverStations = await fetchStationsByCounty(countyFips);
    } else if (stateAbbr) {
        console.log(`[Main] No county found - fetching by state: ${stateAbbr}`);
        riverStations = await fetchStationsByState(stateAbbr);
    }

    if (!riverStations) {
        console.log("[Main] County/state fetch failed - trying bounding box fallback...");
        riverStations = await fetchStationsByBBox(lng - 0.5, lat - 0.5, lng + 0.5, lat + 0.5);
    }

    // If all fetch attempts returned null, the USGS API is down
    if (riverStations === null) {
        alert("USGS API is temporarily unavailable (503). Please try again later.");
        if (statusText) statusText.textContent = "API Error";
        return;
    }

    currentStations = riverStations;

    // Use geography.js to find the nearest station within 50 miles
    let nearestStation = findNearestWaterStationWithinMaximumMilesRange(riverStations, lat, lng, 50);

    // If we still don't know the county, try to get it from the nearest station
    if (!countyFips && nearestStation && nearestStation.countyCd) {
        countyFips = nearestStation.countyCd;
        stateFips = countyFips.substring(0, 2);

        console.log(`[Main] Got county ${countyFips} from nearest station - re-fetching for accuracy...`);

        if (stateDropdown) stateDropdown.value = stateFips;
        if (countyDropdown) populateCountySelect(countyDropdown, stateFips, countyFips);
        updateAddLogButtonState();
        renderLogGrid(stateFilteredLogs);

        // Re-fetch stations specifically for this county for better accuracy
        const countyStations = await fetchStationsByCounty(countyFips);
        if (countyStations && countyStations.length > 0) {
            riverStations = countyStations;
            currentStations = countyStations;
            nearestStation = findNearestWaterStationWithinMaximumMilesRange(riverStations, lat, lng, 50);
        }
    }

    // Populate the river station dropdown and load data
    if (riverStations.length > 0) {
        if (riverDropdown) {
            riverDropdown.innerHTML = "<option value=\"\">-- Select a River Station --</option>";
            riverStations.forEach(function(station) {
                const opt = document.createElement("option");
                opt.value = station.id;
                opt.textContent = station.name;
                riverDropdown.appendChild(opt);
            });
            riverDropdown.disabled = false;
            riverDropdown.value = nearestStation ? nearestStation.id : "";
        }

        if (nearestStation) {
            currentActiveId = nearestStation.id;
            console.log(`[Main] Loading data for nearest station: "${nearestStation.name}"`);
            loadLocationData(nearestStation.id, lat, lng, nearestStation.countyCd, true, stateFilteredLogs);
        } else {
            currentActiveId = null;
            console.log("[Main] No station within 50 miles - loading geology data only");
            loadLocationData(null, lat, lng, null, true, stateFilteredLogs);
        }
    } else {
        // No stations found anywhere in the area
        currentActiveId = null;
        loadLocationData(null, lat, lng, null, true, stateFilteredLogs);
        showCustomMap([], currentUserPos, null, stateFilteredLogs, false);

        if (riverDropdown) {
            riverDropdown.innerHTML = "<option value=\"\">No river gauges found within 50 miles</option>";
            riverDropdown.disabled = true;
        }

        if (statusText) statusText.textContent = "No nearby river gauges.";
    }

    // Update the status text if it's still showing the "Locating..." message
    if (statusText && statusText.textContent.includes("Locating")) {
        statusText.textContent = nearestStation
            ? "Ready for field work"
            : "Ready for field work, but no gauge was found within 50 miles";
    }
}

// ============================================================
// App Initialization - runs when the HTML page is fully loaded
// ============================================================
document.addEventListener("DOMContentLoaded", async function() {
    console.log("[Main] Page loaded - starting app initialization...");

    // On first load show all saved logs in the grid and as pins on the US map
    const initialLogs = getSavedLogs();
    renderLogGrid(initialLogs);
    showUSMap(initialLogs);

    // Grab all the main UI controls we will interact with
    const stateDropdown = document.getElementById("state-select");
    const countyDropdown = document.getElementById("county-select");
    const riverDropdown = document.getElementById("river-select");
    const logStateDropdown = document.getElementById("log-state");
    const logCountyDropdown = document.getElementById("log-county");

    // Populate both state dropdowns (main filter + log form) with all US states
    if (stateDropdown) {
        console.log("[Main] Populating state dropdown...");

        // Sort alphabetically by state name so they're easy to find
        const sortedStates = Object.entries(STATES).sort(function(a, b) {
            return a[1].name.localeCompare(b[1].name);
        });

        sortedStates.forEach(function([fips, stateData]) {
            const opt = document.createElement("option");
            opt.value = fips;
            opt.textContent = stateData.name;
            stateDropdown.appendChild(opt);

            // Also add to the log form dropdown if it exists on the page
            if (logStateDropdown) {
                const opt2 = document.createElement("option");
                opt2.value = fips;
                opt2.textContent = stateData.name;
                logStateDropdown.appendChild(opt2);
            }
        });

        // When the log form state changes, rebuild the log form county dropdown
        if (logStateDropdown && logCountyDropdown) {
            logStateDropdown.addEventListener("change", function(e) {
                const selectedFips = e.target.value;
                logCountyDropdown.innerHTML = "<option value=\"\">-- Select County --</option>";
                if (STATES[selectedFips]) {
                    STATES[selectedFips].counties.forEach(function(county) {
                        const opt = document.createElement("option");
                        opt.value = county.fips;
                        opt.textContent = county.name;
                        logCountyDropdown.appendChild(opt);
                    });
                }
            });
        }

        // Handle the main state dropdown changing
        stateDropdown.addEventListener("change", async function(e) {
            const selectedFips = e.target.value;
            console.log(`[Main] State changed to: ${selectedFips} (${STATES[selectedFips]?.name || "none"})`);
            updateAddLogButtonState();

            // Reset dependent dropdowns and clear old data
            if (riverDropdown) {
                riverDropdown.innerHTML = "<option value=\"\">-- Select a River Station --</option>";
                riverDropdown.disabled = true;
            }
            currentStations = [];
            clearLocationData();
            countyDropdown.innerHTML = "<option value=\"\">-- Select a County --</option>";

            if (!selectedFips) {
                countyDropdown.disabled = true;
                const allLogsOnClear = getSavedLogs();
                renderLogGrid(allLogsOnClear);
                showUSMap(allLogsOnClear);
                return;
            }

            // Populate the county dropdown for the selected state
            if (STATES[selectedFips]) {
                STATES[selectedFips].counties.forEach(function(county) {
                    const opt = document.createElement("option");
                    opt.value = county.fips;
                    opt.textContent = county.name;
                    countyDropdown.appendChild(opt);
                });
                countyDropdown.disabled = false;
            }

            // Start fetching stations for the state
            if (riverDropdown) {
                riverDropdown.innerHTML = "<option value=\"\">Loading state stations...</option>";
                riverDropdown.disabled = true;
            }

            const stateData = STATES[selectedFips];
            console.log(`[Main] Fetching stations for state: ${stateData.abbr}`);
            const stateStations = await fetchStationsByState(stateData.abbr);

            const displayLogs = getDisplayLogs();
            renderLogGrid(displayLogs);

            if (stateStations === null) {
                if (riverDropdown) {
                    riverDropdown.innerHTML = "<option value=\"\">USGS API Unavailable (503)</option>";
                    riverDropdown.disabled = true;
                }
                showCustomMap([], null, null, displayLogs, displayLogs.length > 0);
                return;
            }

            currentStations = stateStations;

            if (stateStations.length > 0) {
                if (riverDropdown) {
                    riverDropdown.innerHTML = "<option value=\"\">-- Select a River Station --</option>";
                    stateStations.forEach(function(station) {
                        const opt = document.createElement("option");
                        opt.value = station.id;
                        opt.textContent = station.name;
                        riverDropdown.appendChild(opt);
                    });
                    riverDropdown.disabled = false;
                }
                showCustomMap(stateStations, null, null, displayLogs);
            } else {
                if (riverDropdown) {
                    riverDropdown.innerHTML = "<option value=\"\">No active stations found in state</option>";
                    riverDropdown.disabled = true;
                }
                showCustomMap([], null, null, displayLogs, displayLogs.length > 0);
            }
        });
    }

    // Handle county dropdown changes
    if (countyDropdown) {
        countyDropdown.addEventListener("change", async function(e) {
            const selectedFips = e.target.value;
            console.log(`[Main] County changed to: ${selectedFips}`);
            updateAddLogButtonState();

            if (!selectedFips) {
                // County was cleared - go back to state-level view
                const displayLogs = getDisplayLogs();
                renderLogGrid(displayLogs);

                showCustomMap([], null, null, displayLogs, displayLogs.length > 0);

                if (riverDropdown) {
                    riverDropdown.innerHTML = "<option value=\"\">-- Select a River Station --</option>";
                    riverDropdown.disabled = true;
                }
                currentStations = [];
                clearLocationData();
                return;
            }

            // Reset station dropdown while loading
            if (riverDropdown) {
                riverDropdown.innerHTML = "<option value=\"\">Loading stations...</option>";
                riverDropdown.disabled = true;
            }
            currentStations = [];
            currentUserPos = null;

            console.log(`[Main] Fetching stations for county: ${selectedFips}`);
            const countyStations = await fetchStationsByCounty(selectedFips);

            const displayLogs = getDisplayLogs();
            renderLogGrid(displayLogs);

            if (countyStations === null) {
                if (riverDropdown) {
                    riverDropdown.innerHTML = "<option value=\"\">USGS API Unavailable (503)</option>";
                    riverDropdown.disabled = true;
                }
                showCustomMap([], null, null, displayLogs, displayLogs.length > 0);
                clearLocationData();
                return;
            }

            currentStations = countyStations;

            if (countyStations.length > 0) {
                if (riverDropdown) {
                    riverDropdown.innerHTML = "<option value=\"\">-- Select a River Station --</option>";
                    countyStations.forEach(function(station) {
                        const opt = document.createElement("option");
                        opt.value = station.id;
                        opt.textContent = station.name;
                        riverDropdown.appendChild(opt);
                    });
                    riverDropdown.disabled = false;
                }
                showCustomMap(countyStations, null, null, displayLogs);
            } else {
                if (riverDropdown) {
                    riverDropdown.innerHTML = "<option value=\"\">No active stations found</option>";
                    riverDropdown.disabled = true;
                }
                showCustomMap([], null, null, displayLogs, displayLogs.length > 0);
            }
            clearLocationData();
        });
    }

    // Handle river station dropdown selection
    if (riverDropdown) {
        riverDropdown.addEventListener("change", function(e) {
            const selectedId = e.target.value;
            if (!selectedId) return;

            // Find the full station object so we have its coordinates
            const selectedStation = currentStations.find(function(station) {
                return station.id === selectedId;
            });

            if (selectedStation) {
                console.log(`[Main] River station selected: "${selectedStation.name}"`);
                loadLocationData(
                    selectedStation.id,
                    parseFloat(selectedStation.lat),
                    parseFloat(selectedStation.lng),
                    selectedStation.countyCd,
                    false // Don't re-fit the map when picking from the dropdown manually
                );
            }
        });
    }

    // Listen for map click events (dispatched from map.js)
    window.addEventListener("mapClicked", function(e) {
        const { lat, lng } = e.detail;
        console.log(`[Main] mapClicked event received at (${lat}, ${lng})`);
        searchArea(lat, lng, "map point");
    });


    // Listen for map pan/zoom events (dispatched from map.js after every moveend).
    // We only use this to filter the log card list to whatever is visible in the
    // current map view. River stations are loaded by state/county selection or
    // map click - not dynamically on pan/zoom.
    // Debounced so we don't fire on every animation frame while the map is moving.
    window.addEventListener("mapViewChanged", debounce(function(e) {
        const { minLng, minLat, maxLng, maxLat } = e.detail;
        console.log(`[Main] mapViewChanged - filtering logs to current map view`);

        // Check each saved log to see if its coordinates are inside the current map bounds.
        const allLogs = getSavedLogs();
        const visibleLogs = allLogs.filter(function(log) {
            const logLat = parseFloat(log.lat);
            const logLng = parseFloat(log.lng);
            if (isNaN(logLat) || isNaN(logLng)) return false;
            return logLat >= minLat && logLat <= maxLat && logLng >= minLng && logLng <= maxLng;
        });

        console.log(`[Main] ${visibleLogs.length} log(s) visible in current map view`);
        renderLogGrid(visibleLogs);
    }, 300));

    // Listen for station marker clicks (dispatched from map.js)
    window.addEventListener("stationClicked", function(e) {
        const station = e.detail;
        console.log(`[Main] stationClicked event for: "${station.name}"`);
        currentActiveId = station.id;
        if (riverDropdown) riverDropdown.value = station.id;
        loadLocationData(station.id, parseFloat(station.lat), parseFloat(station.lng), station.countyCd, false);
    });

    // Listen for log marker clicks (dispatched from map.js) - scrolls to and highlights the card
    window.addEventListener("logClicked", function(e) {
        console.log("[Main] logClicked event for log ID:", e.detail.id);
        highlightLogCard(e.detail.id);
    });
    // When the user clicks a log card, pulse its marker on the map
    window.addEventListener("logCardClicked", function(e) {
        const { id, lat, lng } = e.detail;
        console.log(`[Main] logCardClicked event - pulsing marker for log: ${id}`);
        pulseLogMarker(id, lat, lng);
    });


    // "Find Nearest to Me" button - uses the browser Geolocation API
    const geoBtn = document.getElementById("geo-btn");
    if (geoBtn) {
        geoBtn.addEventListener("click", function() {
            if (!navigator.geolocation) {
                alert("Geolocation is not supported by your browser.");
                return;
            }

            const statusText = document.getElementById("status-text");
            if (statusText) statusText.textContent = "Locating you...";
            console.log("[Main] Requesting browser geolocation...");

            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    console.log(`[Main] Got user location: (${userLat}, ${userLng})`);
                    searchArea(userLat, userLng, "your location");
                },
                function(geolocationError) {
                    console.error("[Main] Geolocation failed:", geolocationError);
                    const statusText = document.getElementById("status-text");
                    if (statusText) statusText.textContent = "Error obtaining location.";
                }
            );
        });
    }

    // "Reset Map" button - clears all dropdowns, results cards, and resets the map to the
    // full US overview with all saved log pins, just like the initial page load state.
    const resetMapBtn = document.getElementById("reset-map-btn");
    if (resetMapBtn) {
        resetMapBtn.addEventListener("click", function() {
            console.log("[Main] Reset Map button clicked - resetting everything to initial state...");

            // Clear the state dropdown back to the blank placeholder
            if (stateDropdown) {
                stateDropdown.value = "";
            }

            // Clear and disable the county dropdown
            if (countyDropdown) {
                countyDropdown.innerHTML = "<option value=\"\">-- Select a County --</option>";
                countyDropdown.disabled = true;
            }

            // Clear and disable the river station dropdown
            if (riverDropdown) {
                riverDropdown.innerHTML = "<option value=\"\">-- Select a River Station --</option>";
                riverDropdown.disabled = true;
            }

            // Clear the result cards (river flow, geology, minerals)
            clearLocationData();

            // Reset module-level tracking variables
            currentStations = [];
            currentUserPos = null;
            currentActiveId = null;

            // Re-enable/disable the Add Log button based on the now-empty dropdowns
            updateAddLogButtonState();

            // Show all saved logs as pins on the full US map view
            const allLogs = getSavedLogs();
            renderLogGrid(allLogs);
            showUSMap(allLogs);

            console.log("[Main] Reset complete - showing full US map with all logs");
        });
    }

    // Set up the log search box filtering
    initLogSearch();

    // --- Log Dialog Setup ---
    const logDialog = document.getElementById("log-dialog");
    const openDialogBtn = document.getElementById("open-log-dialog");
    const closeDialogBtn = document.getElementById("close-log-dialog");
    const logForm = document.getElementById("log-form");
    const loadSampleLogsBtn = document.getElementById("load-sample-logs-btn");

    // "Load Sample Logs" button - imports 25 pre-made logs from sampleLogs.json into localStorage
    if (loadSampleLogsBtn) {
        loadSampleLogsBtn.addEventListener("click", async function() {
            console.log("[Main] Load Sample Logs clicked");

            const existingLogs = getSavedLogs();

            if (existingLogs.length > 0) {
                const userConfirmed = confirm(
                    `You already have ${existingLogs.length} log(s) saved. Loading sample logs will add them alongside your existing ones. Continue?`
                );
                if (!userConfirmed) {
                    console.log("[Main] User cancelled sample log load");
                    return;
                }
            }

            try {
                const response = await fetch("/src/data/sampleLogs.json");
                if (!response.ok) {
                    throw new Error(`Could not load sampleLogs.json (status: ${response.status})`);
                }

                const sampleLogs = await response.json();
                console.log(`[Main] Loaded ${sampleLogs.length} sample log(s) from JSON file`);

                const existingIds = existingLogs.map(function(log) { return log.id; });
                let addedCount = 0;

                sampleLogs.forEach(function(sampleLog) {
                    if (!existingIds.includes(sampleLog.id)) {
                        saveLog(sampleLog);
                        addedCount++;
                    } else {
                        console.log(`[Main] Skipping duplicate sample log ID: ${sampleLog.id}`);
                    }
                });

                console.log(`[Main] Added ${addedCount} sample log(s) to localStorage`);
                alert(`Loaded ${addedCount} sample field logs!`);
                window.dispatchEvent(new Event("logsChanged"));

            } catch (loadError) {
                console.error("[Main] Error loading sample logs:", loadError);
                alert("Sorry, could not load the sample logs. Check the console for details.");
            }
        });
    }
    // Set up the add/edit log dialog
    if (logDialog && openDialogBtn && closeDialogBtn && logForm) {

        openDialogBtn.addEventListener("click", function() {
            console.log("[Main] Opening log dialog for new entry");

            // Reset the dialog to "new log" mode
            document.getElementById("log-dialog-title").textContent = "New Field Log Entry";
            logForm.reset();
            document.getElementById("log-id").value = ""; // Clear any leftover ID from editing

            // Auto-fill state/county from the current map selection
            if (logStateDropdown && stateDropdown) {
                logStateDropdown.value = stateDropdown.value || "";
                logStateDropdown.dispatchEvent(new Event("change")); // Triggers county dropdown population
                if (logCountyDropdown && countyDropdown) {
                    logCountyDropdown.value = countyDropdown.value || "";
                }
            }

            // Auto-fill coordinates if we have a position tracked
            if (currentUserPos) {
                document.getElementById("lat").value = currentUserPos.lat;
                document.getElementById("lng").value = currentUserPos.lng;
            }

            logDialog.showModal();
        });

        closeDialogBtn.addEventListener("click", function() {
            logDialog.close();
        });

        logForm.addEventListener("submit", function(e) {
            e.preventDefault();
            console.log("[Main] Log form submitted");

            const formData = new FormData(logForm);
            const existingId = formData.get("log-id");

            const logEntry = {
                id: existingId || crypto.randomUUID(),
                date: formData.get("date"),
                state: formData.get("state"),
                county: formData.get("county"),
                locationName: formData.get("locationName"),
                lat: formData.get("lat"),
                lng: formData.get("lng"),
                rockType: formData.get("rockType"),
                notes: formData.get("notes")
            };

            if (existingId) {
                // Editing - preserve the original creation timestamp
                const existingLogs = getSavedLogs();
                const original = existingLogs.find(function(l) { return l.id === existingId; });
                logEntry.createdAt = original ? original.createdAt : new Date().toISOString();
                updateLog(logEntry);
                console.log(`[Main] Updated log: ${existingId}`);
            } else {
                // New entry
                logEntry.createdAt = new Date().toISOString();
                saveLog(logEntry);
                console.log("[Main] Saved new log entry");
            }

            window.dispatchEvent(new Event("logsChanged"));
            logDialog.close();
            logForm.reset();
        });
    }

    // Listen for log changes from anywhere in the app and refresh the display
    window.addEventListener("logsChanged", function() {
        console.log("[Main] logsChanged event - refreshing log display...");

        // getDisplayLogs() returns all logs when no state is selected,
        // state-filtered when state only, county-filtered when both are set.
        const displayLogs = getDisplayLogs();
        renderLogGrid(displayLogs);

        const countySelected = countyDropdown && countyDropdown.value;
        const stateSelected = stateDropdown && stateDropdown.value;

        if (countySelected) {
            // County view - show station pins + county log pins
            showCustomMap(currentStations, currentUserPos, currentActiveId, displayLogs);
        } else if (stateSelected) {
            // State view - show station pins + state log pins
            showCustomMap(currentStations, currentUserPos, currentActiveId, displayLogs, displayLogs.length > 0);
        } else {
            // No filter - US overview with all log pins
            showUSMap(displayLogs);
        }
    });

    // Make sure the button starts in the right state on page load
    updateAddLogButtonState();

    console.log("[Main] App initialization complete!");
});
