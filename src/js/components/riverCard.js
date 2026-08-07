// riverCard.js
// This component is responsible for rendering the "River Flow Status" card.
// It takes data from the USGS API and updates the gauge height, flow rate,
// and condition badge on the page.
//
// The condition (Normal/Elevated/High) is determined by comparing the gauge 
// height and discharge readings against some rough threshold values.

/**
 * Determines if the river is at a Normal, Elevated, or High water level.
 * This is used both for the status card and for coloring the map pins.
 *
 * Thresholds I am using (these are just rough estimates):
 * - Gauge > 8 ft  OR  Flow > 3000 cfs = HIGH (dangerous, avoid the river)
 * - Gauge >= 5 ft OR  Flow >= 1000 cfs = ELEVATED (be cautious)
 * - Anything below those values = NORMAL (good conditions for rockhounding!)
 *
 * @param {string|number|null} gaugeHeight - The gauge height reading in feet
 * @param {string|number|null} discharge - The discharge/flow rate in cubic feet per second
 * @returns {Object} - An object with class (CSS badge class) and label (display text)
 */
export function getRiverCondition(gaugeHeight, discharge) {
    // Default to unknown/neutral if we have no data to work with
    let conditionResult = { class: "badge-neutral", label: "Unknown" };

    // Check if we have a valid gauge height number
    const gaugeHeightIsValid = gaugeHeight !== null && !isNaN(parseFloat(gaugeHeight));

    // Check if we have a valid discharge number
    const dischargeIsValid = discharge !== null && !isNaN(parseFloat(discharge));

    // We can only determine a condition if at least one reading is available
    if (gaugeHeightIsValid || dischargeIsValid) {
        const parsedGaugeHeight = gaugeHeightIsValid ? parseFloat(gaugeHeight) : null;
        const parsedDischarge = dischargeIsValid ? parseFloat(discharge) : null;

        // Check HIGH thresholds first
        const riverIsHigh = (gaugeHeightIsValid && parsedGaugeHeight > 8) ||
                            (dischargeIsValid && parsedDischarge > 3000);

        // Check ELEVATED thresholds (but not quite high)
        const riverIsElevated = (gaugeHeightIsValid && parsedGaugeHeight >= 5) ||
                                (dischargeIsValid && parsedDischarge >= 1000);

        if (riverIsHigh) {
            conditionResult = { class: "badge-red", label: "High" };
        } else if (riverIsElevated) {
            conditionResult = { class: "badge-yellow", label: "Elevated" };
        } else {
            conditionResult = { class: "badge-green", label: "Normal" };
        }
    }

    return conditionResult;
}

/**
 * Updates the River Flow Status card on the page with the latest USGS reading.
 * Handles both the normal data case and error cases (no station found, API down, etc.)
 *
 * @param {Object} data - The river data object returned from fetchRiverData()
 *   @param {string} [data.gaugeHeight] - Water height in feet
 *   @param {string} [data.discharge] - Flow rate in cubic feet per second
 *   @param {string} [data.error] - An error message if something went wrong
 */
export function renderRiverCard(data) {
    console.log("[RiverCard] Rendering river status card...", data);

    // Grab all the DOM elements we need to update
    const riverStatusContainer = document.getElementById("river-status-container");
    const conditionBadgeElement = document.getElementById("condition-badge");
    const gaugeValueElement = document.getElementById("gauge-value");
    const flowValueElement = document.getElementById("flow-value");
    const riverErrorElement = document.getElementById("river-error");

    // If any critical elements are missing, stop here
    if (!riverStatusContainer || !conditionBadgeElement || !gaugeValueElement || !flowValueElement) {
        console.error("[RiverCard] One or more required river card elements were not found in the DOM!");
        return;
    }

    if (data.error) {
        // Show the error message and reset values to N/A
        console.warn(`[RiverCard] Showing error state: "${data.error}"`);

        if (riverErrorElement) {
            riverErrorElement.hidden = false;
            riverErrorElement.textContent = data.error;
        }

        gaugeValueElement.textContent = "N/A";
        flowValueElement.textContent = "N/A";
        conditionBadgeElement.className = "badge-neutral";
        conditionBadgeElement.textContent = "--";

    } else {
        // We have real data - display it!
        if (riverErrorElement) {
            riverErrorElement.hidden = true;
        }

        // Parse the readings into actual numbers for comparison
        const parsedGaugeHeight = parseFloat(data.gaugeHeight);
        const parsedFlowRate = parseFloat(data.discharge);

        // Get the river condition (Normal/Elevated/High) from our helper function
        const riverCondition = getRiverCondition(
            isNaN(parsedGaugeHeight) ? null : parsedGaugeHeight,
            isNaN(parsedFlowRate) ? null : parsedFlowRate
        );

        console.log(`[RiverCard] River condition: ${riverCondition.label}`);

        // Update the value displays with their units
        gaugeValueElement.textContent = data.gaugeHeight ? `${data.gaugeHeight} ft` : "N/A";
        flowValueElement.textContent = data.discharge ? `${data.discharge} cfs` : "N/A";

        // Update the condition badge color and text
        conditionBadgeElement.className = riverCondition.class;
        conditionBadgeElement.textContent = riverCondition.label;

        // Also update the status pill at the top of the page
        const statusTextElement = document.getElementById("status-text");
        const statusDotElement = document.getElementById("status-dot");

        if (statusTextElement && statusDotElement) {
            statusTextElement.textContent = `River is ${riverCondition.label}`;
            statusDotElement.className = riverCondition.class;
        }
    }

    // Remove the skeleton loading state now that we have content to show
    riverStatusContainer.classList.remove("skeleton");
    console.log("[RiverCard] Render complete");
}
