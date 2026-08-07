// mineralCard.js
// Handles rendering the "Local Minerals" card section on the page.
// This card shows minerals that have been recorded near the selected location,
// pulled from the Mindat.org API via mindat.js.
//
// Each mineral gets its own small item block showing the name, chemical formula,
// a short description, color, and mineral type.
//
// There are three possible states for this card:
//   1. Has minerals - shows a list of mineral items
//   2. Empty - the API responded but no minerals were found nearby
//   3. Error - the API call failed (no key, network error, etc.)

/**
 * Updates the Local Minerals card with results from Mindat.
 *
 * @param {Array|null} minerals - Array of mineral objects from fetchNearbyMinerals(), or null on error
 *   Each mineral object has:
 *   @param {string} mineral.name - Common mineral name (e.g. "Quartz")
 *   @param {string|null} mineral.formula - Chemical formula (e.g. "SiO2")
 *   @param {string|null} mineral.description - Short description from Mindat
 *   @param {string|null} mineral.color - Reported color(s)
 *   @param {string} mineral.type - Type label (e.g. "mineral", "rock")
 */
export function renderMineralCard(minerals) {
    console.log(`[MineralCard] Rendering mineral card with ${minerals ? minerals.length : "null"} result(s)`);

    const mindatCard = document.getElementById("mindat-card");
    const mindatContent = document.getElementById("mindat-content");
    const mindatError = document.getElementById("mindat-error");

    if (!mindatCard || !mindatContent || !mindatError) {
        console.error("[MineralCard] Could not find required mineral card elements in the DOM!");
        return;
    }

    if (minerals === null) {
        // null means a real error happened - API key missing, network down, etc.
        console.warn("[MineralCard] minerals is null - showing error state");
        mindatError.hidden = false;
        mindatError.textContent = "Mindat API error. Check that your API key is set in .env.";
        mindatContent.hidden = true;

    } else if (minerals.length === 0) {
        // Empty array - the API worked but found nothing nearby
        console.log("[MineralCard] No minerals found near this location");
        mindatError.hidden = true;
        mindatContent.hidden = false;
        mindatContent.innerHTML = "<p>No minerals found within 25 miles of this location.</p>";

    } else {
        // We have minerals to show!
        mindatError.hidden = true;
        mindatContent.hidden = false;

        console.log(`[MineralCard] Building HTML for ${minerals.length} mineral(s)...`);

        // Build the HTML for each mineral item
        let mineralsHtml = "<div class=\"mindat-minerals-list\">";

        minerals.forEach(function(mineral) {
            mineralsHtml += `
                <div class="mineral-item">
                    <div class="mineral-item__header">
                        <span class="mineral-item__name">${mineral.name}</span>
                        ${mineral.formula ? `<span class="mineral-item__formula">${mineral.formula}</span>` : ""}
                    </div>
                    ${mineral.description ? `<p class="mineral-item__details">${mineral.description}</p>` : ""}
                    <div class="mineral-item__meta">
                        ${mineral.color ? `<span><strong>Color:</strong> ${mineral.color}</span>` : ""}
                        <span><strong>Type:</strong> ${mineral.type}</span>
                    </div>
                </div>
            `;
        });

        mineralsHtml += "</div>";
        mindatContent.innerHTML = mineralsHtml;

        console.log("[MineralCard] Mineral list rendered successfully");
    }

    // Remove the skeleton loading state
    mindatCard.classList.remove("skeleton");
}

/**
 * Resets the minerals card back to its default empty state.
 * Called when the user clears the location selection or changes state/county.
 */
export function resetMineralCard() {
    console.log("[MineralCard] Resetting mineral card to empty state");

    const mindatContent = document.getElementById("mindat-content");
    const mindatError = document.getElementById("mindat-error");
    const mindatCard = document.getElementById("mindat-card");

    if (mindatContent) {
        mindatContent.hidden = false;
        mindatContent.innerHTML = "<p>No mineral data available. Select a location to see minerals found within 25 miles.</p>";
    }

    if (mindatError) {
        mindatError.hidden = true;
    }

    if (mindatCard) {
        mindatCard.classList.remove("skeleton");
    }
}
