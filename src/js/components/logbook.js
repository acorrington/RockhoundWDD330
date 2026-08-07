// logbook.js
// Everything related to the "Personal Field Log" section lives here.
// This includes building the individual log cards, rendering the whole grid,
// setting up the search/filter input, and highlighting a card when the user
// clicks its map pin.

import { deleteLog, getSavedLogs } from "../utils/storage.js";

/**
 * Builds a single HTML card element for a log entry.
 * The card shows the date, location, rock type, notes, and GPS coordinates.
 * Edit and delete buttons are also wired up here.
 *
 * @param {Object} log - The log entry object to build a card for
 * @returns {HTMLElement} - A fully built <article> element ready to insert into the page
 */
export function buildLogCard(log) {
    console.log(`[Logbook] Building card for: "${log.locationName}" (ID: ${log.id})`);

    const cardElement = document.createElement("article");
    cardElement.className = "log-card";
    cardElement.id = `log-card-${log.id}`; // We use the ID later for highlighting and scrolling

    // Format the date for display - toLocaleDateString() makes it human-readable
    const formattedDate = new Date(log.date).toLocaleDateString();

    // Round the GPS coordinates to 4 decimal places for display
    // Also check they are real numbers first just in case something is weird
    const displayLat = Number.isFinite(Number(log.lat)) ? Number(log.lat).toFixed(4) : "N/A";
    const displayLng = Number.isFinite(Number(log.lng)) ? Number(log.lng).toFixed(4) : "N/A";

    cardElement.innerHTML = `
        <header class="log-card__header">
            <span class="log-card__date badge-neutral">${formattedDate}</span>
            <div class="log-card__actions">
                <button class="log-card__edit" data-id="${log.id}" aria-label="Edit log">&#9998;</button>
                <button class="log-card__delete" data-id="${log.id}" aria-label="Delete log">&times;</button>
            </div>
        </header>
        <div class="log-card__body">
            <h3>${escapeHTML(log.locationName)}</h3>
            <span class="log-card__rock-type badge-neutral">${escapeHTML(log.rockType)}</span>
            <p class="log-card__notes">${escapeHTML(log.notes)}</p>
        </div>
        <footer class="log-card__footer">
            <small>${displayLat}, ${displayLng}</small>
        </footer>
    `;

    // Wire up the edit button
    const editButton = cardElement.querySelector(".log-card__edit");
    editButton.addEventListener("click", function() {
        console.log(`[Logbook] Edit clicked for log ID: ${log.id}`);

        const dialogElement = document.getElementById("log-dialog");

        // Switch the dialog title to "Edit" mode
        document.getElementById("log-dialog-title").textContent = "Edit Field Log";

        // Put the log ID in the hidden field so the form knows which log to update on submit
        document.getElementById("log-id").value = log.id;

        // Fill in the state dropdown and trigger the change event to load counties
        const stateDropdown = document.getElementById("log-state");
        if (stateDropdown) {
            stateDropdown.value = log.state || "";
            stateDropdown.dispatchEvent(new Event("change")); // This populates the county dropdown

            // Set the county value after the counties have been loaded
            document.getElementById("log-county").value = log.county || "";
        }

        // Fill in the rest of the form fields with the existing log data
        document.getElementById("date").value = log.date;
        document.getElementById("locationName").value = log.locationName;
        document.getElementById("lat").value = log.lat;
        document.getElementById("lng").value = log.lng;
        document.getElementById("rockType").value = log.rockType;
        document.getElementById("notes").value = log.notes;

        dialogElement.showModal();
    });

    // Wire up the delete button
    const deleteButton = cardElement.querySelector(".log-card__delete");
    deleteButton.addEventListener("click", function() {
        console.log(`[Logbook] Delete clicked for log ID: ${log.id}`);

        // Confirm before permanently deleting - can't undo this!
        const userSaidYes = confirm("Are you sure you want to delete this log? This cannot be undone.");

        if (userSaidYes) {
            console.log(`[Logbook] Confirmed delete for log: ${log.id}`);
            deleteLog(log.id);
            // Fire an event so the rest of the app knows the logs list has changed
            window.dispatchEvent(new Event("logsChanged"));
        } else {
            console.log("[Logbook] User cancelled delete - no changes made");
        }
    });

    // When the user clicks anywhere on the card body (not the edit/delete buttons),
    // fire an event so the map can pulse the corresponding marker.
    // We listen on the card element but check the target isn't one of the action buttons.
    cardElement.addEventListener("click", function(e) {
        const clickedButton = e.target.closest(".log-card__edit, .log-card__delete");
        if (clickedButton) return; // Let the button's own handler take care of it

        console.log(`[Logbook] Card clicked for log: ${log.locationName}`);
        window.dispatchEvent(new CustomEvent("logCardClicked", {
            detail: { id: log.id, lat: parseFloat(log.lat), lng: parseFloat(log.lng) }
        }));
    });

    return cardElement;
}

/**
 * Clears the log grid and re-renders it with the given list of logs.
 * Shows an empty state message if the list is empty.
 *
 * @param {Array} logs - The array of log objects to display
 */
export function renderLogGrid(logs) {
    console.log(`[Logbook] Rendering log grid with ${logs ? logs.length : 0} log(s)`);

    const logGridContainer = document.getElementById("log-grid");
    const emptyStateMessage = document.getElementById("log-empty");

    if (!logGridContainer) {
        console.error("[Logbook] Could not find the #log-grid element!");
        return;
    }

    // Clear whatever cards are in there now
    logGridContainer.innerHTML = "";

    if (!logs || logs.length === 0) {
        // No logs to show - display the empty message instead
        if (emptyStateMessage) {
            emptyStateMessage.textContent = "No field logs found here.";
            emptyStateMessage.hidden = false;
        }
        console.log("[Logbook] No logs to display, showing empty state");
        return;
    }

    // Hide the empty message and build a card for each log
    if (emptyStateMessage) {
        emptyStateMessage.hidden = true;
    }

    logs.forEach(function(logEntry) {
        const card = buildLogCard(logEntry);
        logGridContainer.appendChild(card);
    });

    console.log("[Logbook] Log grid render complete");
}

/**
 * Sets up live search/filtering on the log grid.
 * As the user types in the search box, it filters the displayed logs to
 * only show ones matching the search term in location name, rock type, or notes.
 */
export function initLogSearch() {
    console.log("[Logbook] Initializing log search...");

    const searchInput = document.getElementById("log-search");

    if (!searchInput) {
        console.warn("[Logbook] No #log-search input found, skipping search setup");
        return;
    }

    searchInput.addEventListener("input", function(event) {
        const searchTerm = event.target.value.toLowerCase();
        console.log(`[Logbook] Searching for: "${searchTerm}"`);

        // Get the current state/county filter values so we search within the right scope
        const selectedStateFips = document.getElementById("state-select")?.value;
        const selectedCountyFips = document.getElementById("county-select")?.value;

        let logsToSearch = getSavedLogs();

        // Apply location filter if one is active
        if (selectedStateFips || selectedCountyFips) {
            if (selectedCountyFips) {
                logsToSearch = logsToSearch.filter(function(log) {
                    return log.county === selectedCountyFips;
                });
            } else {
                logsToSearch = logsToSearch.filter(function(log) {
                    return log.state === selectedStateFips;
                });
            }
        }

        // Now filter by the search term across the text fields
        const matchingLogs = logsToSearch.filter(function(log) {
            const locationMatch = (log.locationName || "").toLowerCase().includes(searchTerm);
            const rockMatch = (log.rockType || "").toLowerCase().includes(searchTerm);
            const notesMatch = (log.notes || "").toLowerCase().includes(searchTerm);
            return locationMatch || rockMatch || notesMatch;
        });

        console.log(`[Logbook] Found ${matchingLogs.length} matching log(s)`);
        renderLogGrid(matchingLogs);
    });

    console.log("[Logbook] Search initialized");
}

/**
 * Prevents cross-site scripting (XSS) by converting HTML special characters
 * in user-provided text to safe escaped versions before inserting into the DOM.
 *
 * Example: "<script>" becomes "&lt;script&gt;" and is shown as text, not executed.
 *
 * @param {string} str - The user-provided string to escape
 * @returns {string} - The safely escaped version of the string
 */
function escapeHTML(str) {
    const tempDiv = document.createElement("div");
    tempDiv.textContent = str;
    return tempDiv.innerHTML;
}

/**
 * Scrolls to a specific log card and briefly highlights it.
 * Called when the user clicks on a log marker on the map.
 *
 * @param {string} logId - The ID of the log card to highlight
 */
export function highlightLogCard(logId) {
    console.log(`[Logbook] Highlighting log card: ${logId}`);

    const targetCard = document.getElementById(`log-card-${logId}`);

    if (!targetCard) {
        console.warn(`[Logbook] Could not find card "log-card-${logId}" to highlight`);
        return;
    }

    // Smoothly scroll it into view
    targetCard.scrollIntoView({ behavior: "smooth", block: "center" });

    // Add the highlight CSS class
    targetCard.classList.add("highlighted");

    // Remove the highlight after 2 seconds
    setTimeout(function() {
        targetCard.classList.remove("highlighted");
    }, 2000);
}
