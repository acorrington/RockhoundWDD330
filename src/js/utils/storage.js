// storage.js
// This file handles saving and loading field log entries using the browser's localStorage.
// localStorage is like a tiny database that lives inside the browser - data stays there 
// even after the tab is closed, which is perfect for saving field notes offline.
//
// All our log data gets stored under one key ("rockhound_logs") as a JSON string.

// The key we use to store all log data in localStorage
// Using a specific app name prevents conflicts with other websites
const STORAGE_KEY = "rockhound_logs";

/**
 * Loads all saved field logs from localStorage and returns them as a JavaScript array.
 * If no logs have been saved yet, returns an empty array instead of null.
 *
 * @returns {Array} - Array of log entry objects, or an empty array if there are none saved
 */
export function getSavedLogs() {
    console.log("[Storage] Loading saved logs from localStorage...");

    try {
        // localStorage only stores strings, so we parse the JSON string back into an array
        const rawStorageData = localStorage.getItem(STORAGE_KEY);

        if (rawStorageData === null) {
            console.log("[Storage] No logs found - returning empty array");
            return [];
        }

        const parsedLogs = JSON.parse(rawStorageData);
        console.log(`[Storage] Loaded ${parsedLogs.length} log(s) from storage`);
        return parsedLogs;

    } catch (storageError) {
        console.error("[Storage] Something went wrong reading from localStorage:", storageError);
        return [];
    }
}

/**
 * Adds a new log entry to the beginning of the saved logs list.
 * We use unshift() so the newest log always shows at the top.
 *
 * @param {Object} logItem - The new log entry object to save
 */
export function saveLog(logItem) {
    console.log("[Storage] Saving a new log entry:", logItem);

    try {
        // Always load existing logs first so we don't accidentally wipe them out
        const existingLogs = getSavedLogs();

        // Add the new log to the front of the array
        existingLogs.unshift(logItem);

        // Convert back to a JSON string and save
        const jsonString = JSON.stringify(existingLogs);
        localStorage.setItem(STORAGE_KEY, jsonString);

        console.log(`[Storage] Saved! Total logs in storage: ${existingLogs.length}`);

    } catch (storageError) {
        console.error("[Storage] Error saving log to localStorage:", storageError);
    }
}

/**
 * Permanently removes a log entry from localStorage by its ID.
 * Filters it out of the array and saves the rest back.
 *
 * @param {string} logId - The unique ID of the log to delete
 */
export function deleteLog(logId) {
    console.log(`[Storage] Deleting log with ID: ${logId}`);

    try {
        const allLogs = getSavedLogs();

        // Keep every log EXCEPT the one matching the ID we want to delete
        const remainingLogs = allLogs.filter(function(log) {
            return log.id !== logId;
        });

        const numberRemoved = allLogs.length - remainingLogs.length;
        console.log(`[Storage] Removed ${numberRemoved} log(s). Remaining: ${remainingLogs.length}`);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingLogs));

    } catch (storageError) {
        console.error("[Storage] Error deleting from localStorage:", storageError);
    }
}

/**
 * Updates an existing log entry in place.
 * Finds the entry by ID and replaces it with the updated version.
 *
 * @param {Object} updatedLog - The updated log object (must include the original ID)
 */
export function updateLog(updatedLog) {
    console.log(`[Storage] Updating log with ID: ${updatedLog.id}`);

    try {
        const allLogs = getSavedLogs();

        // Find where in the array this log lives
        const logIndex = allLogs.findIndex(function(log) {
            return log.id === updatedLog.id;
        });

        if (logIndex === -1) {
            console.warn(`[Storage] Could not find log with ID ${updatedLog.id} - nothing to update`);
            return;
        }

        // Replace the old version with the new one at the same array position
        allLogs[logIndex] = updatedLog;

        localStorage.setItem(STORAGE_KEY, JSON.stringify(allLogs));
        console.log("[Storage] Log updated successfully!");

    } catch (storageError) {
        console.error("[Storage] Error updating log in localStorage:", storageError);
    }
}

/**
 * Validates log form data before saving to make sure all required fields are filled in
 * and that latitude/longitude values are in the correct ranges.
 *
 * @param {Object} formData - An object containing the form field values to check
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
export function validateLogInput(formData) {
    console.log("[Storage] Validating log form data before saving...");

    const validationErrors = [];

    // These fields must all have a value - none can be blank
    const requiredFieldNames = ["date", "locationName", "lat", "lng", "rockType", "notes"];

    requiredFieldNames.forEach(function(fieldName) {
        const fieldValue = formData[fieldName];
        if (!fieldValue || fieldValue.toString().trim() === "") {
            // Convert camelCase field names to readable text for the error message
            const readableFieldName = fieldName.replace(/([A-Z])/g, " $1").toLowerCase();
            validationErrors.push(`${readableFieldName} is required.`);
        }
    });

    // Latitude must be a number between -90 and 90 degrees
    const latitudeNumber = parseFloat(formData.lat);
    if (isNaN(latitudeNumber) || latitudeNumber < -90 || latitudeNumber > 90) {
        validationErrors.push("Latitude must be a number between -90 and 90.");
    }

    // Longitude must be a number between -180 and 180 degrees
    const longitudeNumber = parseFloat(formData.lng);
    if (isNaN(longitudeNumber) || longitudeNumber < -180 || longitudeNumber > 180) {
        validationErrors.push("Longitude must be a number between -180 and 180.");
    }

    const isFormValid = validationErrors.length === 0;

    if (isFormValid) {
        console.log("[Storage] Validation passed!");
    } else {
        console.warn("[Storage] Validation failed with errors:", validationErrors);
    }

    return {
        isValid: isFormValid,
        errors: validationErrors
    };
}
