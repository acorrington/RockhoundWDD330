// macrostrat.js
// Fetches geological formation data from the Macrostrat API.
//
// Macrostrat is a research database of geologic units (named rock formations)
// across North America. We use it to tell the user what kind of bedrock is
// under a location they click on the map - great for knowing what to look for
// when rockhounding in an area!
//
// More info about the API: https://macrostrat.org/api

/**
 * Looks up the bedrock geology at a specific latitude/longitude point.
 *
 * The API returns "geologic units" - named rock formations with info like:
 * - Formation name and stratigraphic name
 * - Age range (how old the rocks are, in millions of years)
 * - Lithology (what types of rocks/minerals make it up)
 * - A field description
 *
 * @param {number} lat - The latitude of the location to look up
 * @param {number} lng - The longitude of the location to look up
 * @returns {Promise<Object|null>} - An object with geology info, or null if nothing found or on error
 */
export async function fetchGeologyData(lat, lng) {
    console.log(`[Macrostrat] Fetching geology data for (${lat}, ${lng})...`);

    // Build the request URL with our coordinates
    const requestUrl = `https://macrostrat.org/api/v2/geologic_units/map?lat=${lat}&lng=${lng}&format=json`;
    console.log(`[Macrostrat] Request URL: ${requestUrl}`);

    try {
        const apiResponse = await fetch(requestUrl);

        if (!apiResponse.ok) {
            throw new Error(`Macrostrat API returned error status ${apiResponse.status}`);
        }

        const responseData = await apiResponse.json();

        // The actual geologic units are nested inside response.success.data
        const geologicUnits = responseData?.success?.data;

        if (!Array.isArray(geologicUnits) || geologicUnits.length === 0) {
            console.warn("[Macrostrat] No geologic units found for this location");
            return null;
        }

        console.log(`[Macrostrat] Found ${geologicUnits.length} geologic unit(s)`);

        // Units that have a strat_name tend to have more complete info, so try those first
        const bestUnit = geologicUnits.find(function(unit) {
            return unit.strat_name;
        }) || geologicUnits[0];

        // The lithology field lists rock types separated by semicolons
        // Convert "granite;gneiss;schist" into a cleaner "granite, gneiss, schist"
        let lithologyText = bestUnit.lith || "Unknown";
        const lithParts = lithologyText.split(";");
        const cleanedLithParts = lithParts.map(function(part) {
            return part.trim();
        });
        lithologyText = cleanedLithParts.join(", ");

        // Package up the useful info and return it
        const geologyResult = {
            unitName: bestUnit.name || "Unknown",
            stratName: bestUnit.strat_name || "None",
            ageRange: (bestUnit.b_age && bestUnit.t_age)
                ? `${bestUnit.b_age} - ${bestUnit.t_age} Ma`
                : "Unknown",
            lithology: lithologyText,
            description: bestUnit.descrip || bestUnit.comments || "No detailed field description available."
        };

        console.log("[Macrostrat] Geology data ready:", geologyResult);
        return geologyResult;

    } catch (error) {
        console.error("[Macrostrat] Error fetching geology data:", error);
        return null;
    }
}
