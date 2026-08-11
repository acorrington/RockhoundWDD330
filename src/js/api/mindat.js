// mindat.js
// Fetches mineral locality data from the Mindat.org API.
//
// Mindat is the world's largest online database of minerals and their collecting localities.
// We use it to show the user what minerals have been recorded near a location they
// select on the map - really useful for knowing what to look for when rockhounding!
//
// This requires an API key from Mindat stored as VITE_MINDAT_API_KEY in the .env file.
// You can request a key at: https://www.mindat.org/a/mindat_api
//
// The process is two steps:
// 1. Ask Mindat which minerals have been found near our GPS point (geomin-point endpoint)
// 2. Get the details for those minerals (geomaterials endpoint)

// Pull in the API key from environment variables (set in the .env file)
const MINDAT_API_KEY = import.meta.env.VITE_MINDAT_API_KEY;
alert("Mindat API Key: " + MINDAT_API_KEY);

/**
 * Finds minerals that have been recorded near a given latitude and longitude.
 *
 * @param {number} lat - Latitude of the center of the search area
 * @param {number} lng - Longitude of the center of the search area
 * @param {number} distanceMiles - How far out to search in miles (default is 25 miles)
 * @returns {Promise<Array|null>} - Array of mineral objects if successful, empty array if none found, null on error
 */
export async function fetchNearbyMinerals(lat, lng, distanceMiles = 25) {
    console.log(`[Mindat] Searching for minerals within ${distanceMiles} miles of (${lat}, ${lng})`);

    // Check if we have a key before even trying
    if (!MINDAT_API_KEY) {
        console.warn("[Mindat] No API key found. Add VITE_MINDAT_API_KEY to your .env file.");
        return null;
    }

    try {
        // Step 1: Find mineral IDs near our location
        // The Mindat API uses kilometers, not miles, so we have to convert
        // 1 mile = 1.609344 kilometers
        const distanceInKm = Math.round((parseFloat(distanceMiles) * 1.609344) * 100) / 100;
        console.log(`[Mindat] Converted ${distanceMiles} miles to ${distanceInKm} km for the API`);

        const geoSearchEndpoint = "https://api.mindat.org/v1/geomin-point/";

        console.log("[Mindat] Step 1: Calling geomin-point to find mineral IDs near the location...");
        const geoSearchResponse = await fetch(geoSearchEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Token ${MINDAT_API_KEY}`
            },
            body: JSON.stringify({
                point: {
                    lat: parseFloat(lat),
                    lon: parseFloat(lng)
                },
                distance: `${distanceInKm}km`
            })
        });

        if (!geoSearchResponse.ok) {
            throw new Error(`Mindat geomin-point returned error: ${geoSearchResponse.status} ${geoSearchResponse.statusText}`);
        }

        // The response might be an array of mineral IDs, or an object mapping mineralId -> [localityIds]
        const geoSearchBody = await geoSearchResponse.json().catch(function() { return null; });

        let mineralIdList = [];

        if (Array.isArray(geoSearchBody)) {
            mineralIdList = geoSearchBody;
            console.log(`[Mindat] Got ${mineralIdList.length} mineral ID(s) as an array`);
        } else if (geoSearchBody && typeof geoSearchBody === "object") {
            // Extract just the keys (mineral IDs) from the object and convert to numbers
            mineralIdList = Object.keys(geoSearchBody).map(function(key) {
                return parseInt(key, 10);
            }).filter(function(id) {
                return !Number.isNaN(id);
            });
            console.log(`[Mindat] Got ${mineralIdList.length} mineral ID(s) from object keys`);
        }

        if (!Array.isArray(mineralIdList) || mineralIdList.length === 0) {
            console.log("[Mindat] No minerals found near this location");
            return [];
        }

        // Limit to 15 minerals so we don't overwhelm the page
        const mineralIdsToFetch = mineralIdList.slice(0, 15);
        console.log(`[Mindat] Step 2: Fetching details for ${mineralIdsToFetch.length} mineral(s)...`);

        // Step 2: Get the actual details for the mineral IDs we found
        const detailsEndpoint = `https://api.mindat.org/v1/geomaterials/?id_in=${mineralIdsToFetch.join(",")}`;

        const detailsResponse = await fetch(detailsEndpoint, {
            headers: {
                "Authorization": `Token ${MINDAT_API_KEY}`
            }
        });

        if (!detailsResponse.ok) {
            throw new Error(`Mindat geomaterials returned error: ${detailsResponse.status} ${detailsResponse.statusText}`);
        }

        const detailsData = await detailsResponse.json();
        const mineralResults = detailsData.results || [];

        console.log(`[Mindat] Got details for ${mineralResults.length} mineral(s)`);

        // Map the API response to a simpler object format our app uses
        const formattedMinerals = mineralResults.map(function(item) {
            return {
                id: item.id,
                name: item.name || "Unknown Mineral",
                formula: item.mindat_formula || item.ima_formula || null,
                color: item.colour || null,
                description: item.description_short || null,
                type: item.entrytype_text || "mineral"
            };
        });

        console.log(`[Mindat] Done! Returning ${formattedMinerals.length} mineral(s)`);
        return formattedMinerals;

    } catch (error) {
        console.error("[Mindat] Error fetching mineral data:", error);
        return null;
    }
}
