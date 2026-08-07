// geologyCard.js
// Handles rendering the "Geological Information" card section on the page.
// This card shows bedrock formation info fetched from the Macrostrat API -
// things like the rock formation name, how old it is, what kinds of rocks 
// and minerals are in it, and a field description.
//
// The data comes from macrostrat.js which calls the Macrostrat API.
// This file just takes that data and puts it into the right HTML elements.

/**
 * Updates the Geological Information card with the data returned from Macrostrat.
 * If geologyData is null, shows an error state instead.
 *
 * @param {Object|null} geologyData - The geology result object from fetchGeologyData(), or null
 *   @param {string} geologyData.unitName - Name of the geologic unit/formation
 *   @param {string} geologyData.stratName - Stratigraphic name
 *   @param {string} geologyData.ageRange - Age range in millions of years (e.g. "65 - 100 Ma")
 *   @param {string} geologyData.lithology - Rock and mineral types found in this formation
 *   @param {string} geologyData.description - Full field description from the database
 */
export function renderGeologyCard(geologyData) {
    console.log("[GeologyCard] Rendering geology card...", geologyData);

    const geologyCard = document.getElementById("geology-card");
    const geologyContent = document.getElementById("geology-content");
    const geologyError = document.getElementById("geology-error");

    if (!geologyCard || !geologyContent || !geologyError) {
        console.error("[GeologyCard] Could not find required geology card elements in the DOM!");
        return;
    }

    if (!geologyData) {
        // No data came back - could be offshore, no coverage, or API error
        console.warn("[GeologyCard] No geology data received - showing error state");
        geologyError.hidden = false;
        geologyError.textContent = "No geological data found for this location.";
        geologyContent.hidden = true;
    } else {
        // We have data - build out the content HTML
        geologyError.hidden = true;
        geologyContent.hidden = false;

        geologyContent.innerHTML = `
            <p><strong>Bedrock Name:</strong> ${geologyData.unitName}</p>
            <p><strong>Stratigraphy:</strong> ${geologyData.stratName}</p>
            <p><strong>Age Range:</strong> ${geologyData.ageRange}</p>
            <p><strong>Lithology (Rocks/Minerals):</strong> ${geologyData.lithology}</p>
            <p><strong>Field Details:</strong> ${geologyData.description}</p>
        `;

        console.log("[GeologyCard] Geology content rendered successfully");
    }

    // Remove the skeleton loading animation now that we have content
    geologyCard.classList.remove("skeleton");
}

/**
 * Resets the geology card back to its default empty state.
 * Called when the user clears the location selection or changes state/county.
 */
export function resetGeologyCard() {
    console.log("[GeologyCard] Resetting geology card to empty state");

    const geologyContent = document.getElementById("geology-content");
    const geologyError = document.getElementById("geology-error");
    const geologyCard = document.getElementById("geology-card");

    if (geologyContent) {
        geologyContent.hidden = false;
        geologyContent.innerHTML = "<p>No geological data available. Select a location.</p>";
    }

    if (geologyError) {
        geologyError.hidden = true;
    }

    if (geologyCard) {
        geologyCard.classList.remove("skeleton");
    }
}
