// usgs.js
// Fetches river gauge data from the USGS (U.S. Geological Survey)
// National Water Information System (NWIS) live data API.
//
// The USGS runs thousands of water monitoring stations across the country.
// Each one records gauge height (how high the water is in feet) and discharge
// (how much water is flowing in cubic feet per second, or cfs).
//
// API docs: https://waterservices.usgs.gov/
//
// Parameter codes we request:
//   00065 = Gauge height in feet
//   00060 = Discharge/streamflow in cubic feet per second (cfs)

import { STATES } from "../utils/locations.js";

/**
 * Gets the current gauge height and discharge for a single USGS monitoring station.
 *
 * @param {string} siteId - The USGS site ID number (like "09380000" for Lee's Ferry on the Colorado)
 * @returns {Promise<Object|null>} - Object with gaugeHeight, discharge, and siteName, or null on error
 */
export async function fetchRiverData(siteId) {
    console.log(`[USGS] Fetching live river data for station: ${siteId}`);

    const requestUrl = `https://waterservices.usgs.gov/nwis/iv/?sites=${siteId}&parameterCd=00065,00060&format=json`;

    try {
        const apiResponse = await fetch(requestUrl);

        if (!apiResponse.ok) {
            throw new Error(`USGS API error for station ${siteId}: status ${apiResponse.status}`);
        }

        const responseData = await apiResponse.json();
        const timeSeries = responseData.value.timeSeries;

        // Default values in case some data isn't available
        let gaugeHeight = "N/A";
        let discharge = "N/A";
        let siteName = "Unknown Site";

        if (timeSeries && timeSeries.length > 0) {
            // Site name is the same across all series entries so we grab it from the first
            siteName = timeSeries[0].sourceInfo.siteName || siteName;

            // Go through each data series and pull out the latest reading
            timeSeries.forEach(function(series) {
                const paramCode = series.variable.variableCode[0].value;
                const latestReading = series.values[0]?.value[0]?.value;

                if (paramCode === "00065" && latestReading) {
                    gaugeHeight = latestReading;
                    console.log(`[USGS] Gauge height for ${siteId}: ${gaugeHeight} ft`);
                } else if (paramCode === "00060" && latestReading) {
                    discharge = latestReading;
                    console.log(`[USGS] Discharge for ${siteId}: ${discharge} cfs`);
                }
            });
        }

        return {
            gaugeHeight: gaugeHeight,
            discharge: discharge,
            siteName: siteName
        };

    } catch (error) {
        console.error(`[USGS] Error fetching data for station ${siteId}:`, error);
        return null;
    }
}

/**
 * Parses a raw USGS API response into a clean array of station objects.
 * This is an internal helper - not exported since only the fetch functions below use it.
 *
 * Filters out:
 * - Stations with no county code
 * - Stations outside the expected state/county
 * - Stations with invalid coordinates (0,0 or NaN)
 * - County codes not in our locations database (USGS sometimes has fake boundary codes)
 *
 * Uses a Map to de-duplicate stations since each one appears once per parameter
 * (gauge height shows up as one entry, discharge shows up as another).
 *
 * @param {Object} rawApiData - The raw JSON response from the USGS API
 * @param {string|null} expectedStateFips - 2-digit state FIPS to filter by, or null for no filter
 * @param {string|null} expectedCountyFips - 5-digit county FIPS to filter by, or null for no filter
 * @returns {Array} - Cleaned and de-duplicated array of station objects
 */
function parseStations(rawApiData, expectedStateFips = null, expectedCountyFips = null) {
    console.log(`[USGS] Parsing stations (state: ${expectedStateFips}, county: ${expectedCountyFips})...`);

    const timeSeries = rawApiData?.value?.timeSeries;

    // Use a Map so we don't get duplicates (one entry per station ID)
    const stationsByIdMap = new Map();

    if (!timeSeries || timeSeries.length === 0) {
        console.warn("[USGS] No time series data in API response");
        return [];
    }

    timeSeries.forEach(function(series) {
        const siteInfo = series.sourceInfo;
        const siteId = siteInfo.siteCode[0].value;

        // Find the county code in the site properties
        const countyProp = siteInfo.siteProperty
            ? siteInfo.siteProperty.find(function(prop) { return prop.name === "countyCd"; })
            : null;
        const countyCd = countyProp ? countyProp.value : null;

        // Skip stations with no county code
        if (!countyCd) return;

        // Filter by state if requested
        if (expectedStateFips) {
            const stationStateFips = countyCd.substring(0, 2);
            if (stationStateFips !== expectedStateFips) return;

            // Also verify the county is in our known counties database
            // (USGS uses codes like "10000" for stations near state boundaries that we want to skip)
            const stateInfo = STATES[expectedStateFips];
            if (stateInfo && stateInfo.counties) {
                const isKnownCounty = stateInfo.counties.some(function(county) {
                    return county.fips === countyCd;
                });
                if (!isKnownCounty) return;
            }
        }

        // Filter by county if requested
        if (expectedCountyFips && countyCd !== expectedCountyFips) return;

        // Parse the GPS coordinates
        const stationLat = parseFloat(siteInfo.geoLocation.geogLocation.latitude);
        const stationLng = parseFloat(siteInfo.geoLocation.geogLocation.longitude);

        // Skip stations with bad coordinates
        if (isNaN(stationLat) || isNaN(stationLng) || stationLat === 0 || stationLng === 0) return;

        const paramCode = series.variable.variableCode[0].value;
        const latestValue = series.values[0]?.value[0]?.value;

        // Get or create the station entry in our map
        let stationEntry = stationsByIdMap.get(siteId);
        if (!stationEntry) {
            stationEntry = {
                id: siteId,
                name: siteInfo.siteName,
                lat: stationLat,
                lng: stationLng,
                countyCd: countyCd,
                gaugeHeight: null,
                discharge: null
            };
            stationsByIdMap.set(siteId, stationEntry);
        }

        // Attach the latest measurement to the station object
        if (paramCode === "00065" && latestValue) {
            stationEntry.gaugeHeight = latestValue;
        } else if (paramCode === "00060" && latestValue) {
            stationEntry.discharge = latestValue;
        }
    });

    const stationArray = Array.from(stationsByIdMap.values());
    console.log(`[USGS] Parsed ${stationArray.length} valid station(s)`);
    return stationArray;
}

/**
 * Fetches all active river gauges in a specific county.
 *
 * @param {string} countyFips - 5-digit county FIPS code (e.g. "49049" for Utah County, UT)
 * @returns {Promise<Array|null>} - Array of station objects, or null if the API request failed
 */
export async function fetchStationsByCounty(countyFips) {
    console.log(`[USGS] Fetching stations for county: ${countyFips}`);

    try {
        const apiUrl = `https://waterservices.usgs.gov/nwis/iv/?countyCd=${countyFips}&parameterCd=00065,00060&siteType=ST&format=json`;
        const apiResponse = await fetch(apiUrl);

        if (!apiResponse.ok) {
            throw new Error(`USGS county API error: status ${apiResponse.status}`);
        }

        const responseData = await apiResponse.json();

        // State FIPS is just the first 2 digits of the county FIPS
        const stateFips = countyFips ? countyFips.substring(0, 2) : null;

        const stations = parseStations(responseData, stateFips, countyFips);
        console.log(`[USGS] County ${countyFips}: found ${stations.length} station(s)`);
        return stations;

    } catch (error) {
        console.error(`[USGS] Error fetching stations for county ${countyFips}:`, error);
        return null;
    }
}

/**
 * Fetches all active river gauges in an entire state.
 * Note: Large states like California or Texas can return hundreds of stations!
 *
 * @param {string} stateAbbr - 2-letter state abbreviation (e.g. "UT", "CO", "AZ")
 * @returns {Promise<Array|null>} - Array of station objects, or null if the API request failed
 */
export async function fetchStationsByState(stateAbbr) {
    console.log(`[USGS] Fetching all stations in state: ${stateAbbr}`);

    try {
        // USGS API expects lowercase state abbreviation
        const apiUrl = `https://waterservices.usgs.gov/nwis/iv/?stateCd=${stateAbbr.toLowerCase()}&parameterCd=00065,00060&siteType=ST&format=json`;
        const apiResponse = await fetch(apiUrl);

        if (!apiResponse.ok) {
            throw new Error(`USGS state API error for ${stateAbbr}: status ${apiResponse.status}`);
        }

        const responseData = await apiResponse.json();

        // Find the state FIPS code that matches this abbreviation
        const matchingEntry = Object.entries(STATES).find(function([fips, stateData]) {
            return stateData.abbr.toLowerCase() === stateAbbr.toLowerCase();
        });
        const stateFips = matchingEntry ? matchingEntry[0] : null;

        const stations = parseStations(responseData, stateFips, null);
        console.log(`[USGS] State ${stateAbbr}: found ${stations.length} station(s)`);
        return stations;

    } catch (error) {
        console.error(`[USGS] Error fetching stations for state ${stateAbbr}:`, error);
        return null;
    }
}

/**
 * Fetches river gauges within a rectangular geographic bounding box.
 * Used as a fallback when county/state lookup doesn't work (e.g. near borders).
 *
 * @param {number} minLng - West boundary (leftmost longitude)
 * @param {number} minLat - South boundary (bottom latitude)
 * @param {number} maxLng - East boundary (rightmost longitude)
 * @param {number} maxLat - North boundary (top latitude)
 * @returns {Promise<Array|null>} - Array of station objects, or null on error
 */
export async function fetchStationsByBBox(minLng, minLat, maxLng, maxLat) {
    console.log(`[USGS] Fetching stations in bbox: [${minLng}, ${minLat}, ${maxLng}, ${maxLat}]`);

    try {
        // Round to 6 decimal places to prevent USGS URL validation errors
        const bboxString = `${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}`;
        const apiUrl = `https://waterservices.usgs.gov/nwis/iv/?bBox=${bboxString}&parameterCd=00065,00060&siteType=ST&format=json`;

        const apiResponse = await fetch(apiUrl);

        if (!apiResponse.ok) {
            throw new Error(`USGS bbox API error: status ${apiResponse.status}`);
        }

        const responseData = await apiResponse.json();
        const stations = parseStations(responseData);
        console.log(`[USGS] BBox search found ${stations.length} station(s)`);
        return stations;

    } catch (error) {
        console.error("[USGS] Error fetching stations by bounding box:", error);
        return null;
    }
}
