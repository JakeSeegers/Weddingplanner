// Loads the couple's real RSVP guest list and table-seating assignments
// (embedded in guestdata.js as window.PRESET_GUESTS / window.PRESET_SEATING)
// straight into the plan, as a real in-app action - no file picker involved,
// so it can't be affected by anything CSV-import-related.
//
// Loaded after app.js and guestdata.js - reuses `plan`, `uid`, `pushUndo`,
// `recordChange`, `render` directly (shared top-level scope across classic
// <script> tags on one page).
(function () {
  "use strict";

  function normalizeTableKey(value) {
    return String(value || "").trim().toLowerCase().replace(/^table\s*/, "");
  }

  function loadPresetGuests() {
    var preset = window.PRESET_GUESTS || [];
    if (!preset.length) {
      window.alert("No embedded guest data found (guestdata.js didn't load).");
      return;
    }
    if (plan.guests.length && !window.confirm(
      "You already have " + plan.guests.length + " guest(s) in this plan. " +
      "Add the " + preset.length + " guests from the RSVP list on top of that (no duplicate check)?"
    )) return;

    pushUndo();
    preset.forEach(function (g) {
      plan.guests.push(Object.assign({ id: uid() }, g));
    });
    recordChange("Loaded " + preset.length + " guests from the RSVP list");
    render();
    window.alert("Added " + preset.length + " guests. Go to the Guests tab to review them.");
  }

  function loadPresetSeating() {
    var preset = window.PRESET_SEATING || [];
    if (!preset.length) {
      window.alert("No embedded seating data found (guestdata.js didn't load).");
      return;
    }

    var tableByKey = new Map(plan.tables.map(function (t) { return [normalizeTableKey(t.name), t]; }));
    var seated = 0, grown = [], notFound = [];

    pushUndo();
    preset.forEach(function (row) {
      var table = tableByKey.get(normalizeTableKey(row.table));
      var guestName = String(row.guest || "").trim();
      if (!guestName) return;
      if (!table) {
        notFound.push(guestName + " (table \"" + row.table + "\")");
        return;
      }
      var seatIndex = table.seats.findIndex(function (seat) { return !seat; });
      if (seatIndex === -1) {
        table.seats.push("");
        seatIndex = table.seats.length - 1;
        grown.push(table.name);
      }
      table.seats[seatIndex] = guestName;
      seated += 1;
    });

    recordChange("Applied " + seated + " seat assignment(s) from the seating spreadsheet");
    render();

    var parts = ["Seated " + seated + " of " + preset.length + " people."];
    if (grown.length) parts.push("Added an extra seat to: " + Array.from(new Set(grown)).join(", ") + ".");
    if (notFound.length) parts.push("Could not find a table for: " + notFound.join("; ") + ".");
    window.alert(parts.join(" "));
  }

  document.addEventListener("DOMContentLoaded", function () {
    var guestBtn = document.getElementById("loadPresetGuestsBtn");
    if (guestBtn) guestBtn.addEventListener("click", loadPresetGuests);
    var seatBtn = document.getElementById("loadPresetSeatingBtn");
    if (seatBtn) seatBtn.addEventListener("click", loadPresetSeating);
  });
})();
