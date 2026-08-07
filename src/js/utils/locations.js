// locations.js
// This module provides the STATES object that contains all US states, their
// abbreviations, and their counties with FIPS codes. Instead of embedding all
// that data directly in this JS file (which was over 12,000 lines!), we load
// it from a separate locations.json data file. This keeps the code cleaner
// and makes the data easier to update if we ever need to.
//
// The JSON file lives at: src/data/locations.json
// It gets loaded at import time so STATES is ready to use right away.

// Import the JSON file - Vite handles this natively so no extra setup needed.
// This works because Vite supports importing JSON files as ES modules out of the box.
import statesData from "../../data/locations.json";

// Export it as STATES so all the other modules that import from here
// (main.js, usgs.js, etc.) don't have to change anything at all.
export const STATES = statesData;
