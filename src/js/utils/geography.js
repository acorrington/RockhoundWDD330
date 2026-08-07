/**
 * Rockhound Companion - Geography and Distance Utilities
 * 
 * This file contains mathematical functions used to calculate geographic distances 
 * and to locate the nearest river measurement stations relative to a given coordinate.
 */

/**
 * Calculates the shortest distance over the Earth's curved surface between two points
 * using the Haversine formula.
 * 
 * We use 3,959 miles as the approximate radius of the Earth.
 * 
 * @param {number} latitude1 - Latitude of the first location in degrees
 * @param {number} longitude1 - Longitude of the first location in degrees
 * @param {number} latitude2 - Latitude of the second location in degrees
 * @param {number} longitude2 - Longitude of the second location in degrees
 * @returns {number} The calculated straight-line distance between the two points in miles
 */
export function calculateDistanceBetweenTwoCoordinatesInMiles(latitude1, longitude1, latitude2, longitude2) {
    console.log(`[Geography Utility] Calculating distance between Point A (${latitude1}, ${longitude1}) and Point B (${latitude2}, ${longitude2})`);

    // The radius of the Earth in miles
    const earthRadiusInMiles = 3959;

    // Convert degrees to radians because JavaScript Math functions (Math.sin, Math.cos, etc.) expect radians
    console.log("[Geography Utility] Converting latitude and longitude coordinates from degrees to radians...");
    const latitude1InRadians = (latitude1 * Math.PI) / 180;
    const latitude2InRadians = (latitude2 * Math.PI) / 180;
    
    // Calculate the differences in latitude and longitude in radians
    const changeInLatitudeInRadians = ((latitude2 - latitude1) * Math.PI) / 180;
    const changeInLongitudeInRadians = ((longitude2 - longitude1) * Math.PI) / 180;

    // Haversine formula steps:
    // a is the square of half the chord length between the points
    console.log("[Geography Utility] Applying Haversine formula calculations step by step...");
    const halfChordLengthSquared = 
        Math.sin(changeInLatitudeInRadians / 2) * Math.sin(changeInLatitudeInRadians / 2) +
        Math.cos(latitude1InRadians) * Math.cos(latitude2InRadians) *
        Math.sin(changeInLongitudeInRadians / 2) * Math.sin(changeInLongitudeInRadians / 2);
    
    // c is the angular distance in radians
    const angularDistanceInRadians = 2 * Math.atan2(Math.sqrt(halfChordLengthSquared), Math.sqrt(1 - halfChordLengthSquared));

    // Multiply the angular distance by the Earth's radius to get the final distance in miles
    const finalDistanceInMiles = earthRadiusInMiles * angularDistanceInRadians;

    console.log(`[Geography Utility] Distance calculation result: ${finalDistanceInMiles.toFixed(2)} miles`);
    return finalDistanceInMiles;
}

/**
 * Searches through a list of water measurement stations to find the one closest to the target coordinates,
 * but only if it's within a maximum mile limit (defaults to 50 miles).
 * 
 * @param {Array} stationsList - Array of water station objects
 * @param {number} targetLatitude - The latitude we are searching from
 * @param {number} targetLongitude - The longitude we are searching from
 * @param {number} maxDistanceInMiles - The maximum allowable distance (default is 50 miles)
 * @returns {Object|null} The nearest station object that is within the limit, or null if none are close enough
 */
export function findNearestWaterStationWithinMaximumMilesRange(stationsList, targetLatitude, targetLongitude, maxDistanceInMiles = 50) {
    console.log(`[Geography Utility] Looking for nearest water station among ${stationsList ? stationsList.length : 0} stations within ${maxDistanceInMiles} miles...`);

    // If the list of stations is invalid or empty, we cannot find a nearest station
    if (!stationsList || stationsList.length === 0) {
        console.warn("[Geography Utility] No stations list was provided, or the list is completely empty!");
        return null;
    }

    let nearestStationFound = null;
    let shortestDistanceFoundInMiles = maxDistanceInMiles;

    // Loop through each station in the array to measure its distance
    stationsList.forEach((station) => {
        // Parse the station's coordinates as floating-point numbers
        const stationLatitude = parseFloat(station.lat);
        const stationLongitude = parseFloat(station.lng);

        // Check if either latitude or longitude is invalid (Not a Number)
        if (Number.isNaN(stationLatitude) || Number.isNaN(stationLongitude)) {
            console.warn(`[Geography Utility] Skipping station ${station.id || 'unknown'} due to invalid or missing coordinates: (${station.lat}, ${station.lng})`);
            return;
        }

        // Call our helper function to compute the exact distance
        const distanceToStationInMiles = calculateDistanceBetweenTwoCoordinatesInMiles(
            targetLatitude,
            targetLongitude,
            stationLatitude,
            stationLongitude
        );

        // Check if this station is closer than any previously found station, and check if it is within our limit
        if (distanceToStationInMiles <= maxDistanceInMiles) {
            if (nearestStationFound === null || distanceToStationInMiles < shortestDistanceFoundInMiles) {
                console.log(`[Geography Utility] Found a closer station! Station "${station.name}" is only ${distanceToStationInMiles.toFixed(2)} miles away.`);
                nearestStationFound = station;
                shortestDistanceFoundInMiles = distanceToStationInMiles;
            }
        }
    });

    if (nearestStationFound) {
        console.log(`[Geography Utility] Successfully determined closest station: "${nearestStationFound.name}" at a distance of ${shortestDistanceFoundInMiles.toFixed(2)} miles.`);
    } else {
        console.log(`[Geography Utility] Did not find any stations within the maximum range of ${maxDistanceInMiles} miles.`);
    }

    return nearestStationFound;
}
