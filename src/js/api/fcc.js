// fcc.js
// Makes requests to the FCC (Federal Communications Commission) Census Block API.
// This API is completely free and requires no API key, which is nice.
//
// We use it for one thing: reverse geocoding. That means taking a latitude and
// longitude and figuring out what county and state that point is inside.
// The FCC returns FIPS codes, which are the same standardized numeric codes
// our locations.json file uses for every state and county in the US.
//
// FCC API docs: https://geo.fcc.gov/api/census/#!/block/get_block_find
// Example URL: https://geo.fcc.gov/api/census/block/find?latitude=40.76&longitude=-111.89&format=json

/**
 * Calls the FCC Census Block API to find what county and state a
 * latitude/longitude point falls inside. This is called "reverse geocoding."
 *
 * The FCC response looks something like this:
 * {
 *   "County": { "FIPS": "49035", "name": "Salt Lake" },
 *   "State":  { "code": "UT", "FIPS": "49", "name": "Utah" },
 *   ...
 * }
 *
 * We pull out the county FIPS, derive the state FIPS from the first two digits,
 * and also grab the two-letter state abbreviation.
 *
 * @param {number} latitude - The latitude of the location to look up
 * @param {number} longitude - The longitude of the location to look up
 * @returns {Promise<Object|null>} Object with countyFips, stateFips, stateAbbr, or null on failure
 */
export async function fetchCountyByCoordinates(latitude, longitude) {
    console.log(`[FCC] Reverse geocoding coordinates: (${latitude}, ${longitude})`);

    const fccApiUrl = `https://geo.fcc.gov/api/census/block/find?latitude=${latitude}&longitude=${longitude}&format=json`;
    console.log(`[FCC] Request URL: ${fccApiUrl}`);

    try {
        const apiResponse = await fetch(fccApiUrl);

        if (!apiResponse.ok) {
            console.warn(`[FCC] API returned error status: ${apiResponse.status}`);
            return null;
        }

        const responseData = await apiResponse.json();

        let countyFips = null;
        let stateFips = null;
        let stateAbbr = null;

        // Pull the 5-digit county FIPS code out of the response
        if (responseData && responseData.County && responseData.County.FIPS) {
            countyFips = responseData.County.FIPS; // e.g. "49035" for Salt Lake County, UT
            stateFips = countyFips.substring(0, 2); // First two digits are the state FIPS
            console.log(`[FCC] County FIPS: ${countyFips}, State FIPS: ${stateFips}`);
        } else {
            console.warn("[FCC] No county FIPS in response - point may be offshore or outside the US");
        }

        // Grab the two-letter state abbreviation as well
        if (responseData && responseData.State && responseData.State.code) {
            stateAbbr = responseData.State.code; // e.g. "UT"
            console.log(`[FCC] State abbreviation: ${stateAbbr}`);
        }

        return {
            countyFips: countyFips,
            stateFips: stateFips,
            stateAbbr: stateAbbr
        };

    } catch (fetchError) {
        console.warn("[FCC] Request failed:", fetchError);
        return null;
    }
}
