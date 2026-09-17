// Soft access gate for the Studio.
//
// IMPORTANT — what this actually protects, and what it doesn't: this is a
// plain <script> file, downloadable and readable by anyone who opens the
// page's source. The two codes below, and the fact that "helper" mode is
// read-only, are enforced entirely in this browser's JavaScript and CSS.
// That's enough to keep a casual visitor on the public schedule and keep an
// honest helper from accidentally editing something - it is NOT real
// security. Anyone who opens the browser's developer tools can read these
// codes, flip the access level directly, or call the Supabase REST API the
// app itself uses, bypassing this file entirely. Don't put anything here
// you wouldn't be okay with any wedding guest eventually finding.
//
// Loaded last, after app.js/floorplan.js/realtime.js - reads `render` if
// present (harmless if not) but otherwise doesn't touch plan state, so load
// order relative to those files doesn't matter.
(function () {
  "use strict";

  var STORAGE_KEY = "vowsuite-access-level";
  var CODES = { "0426": "power", "1630": "helper" };

  function currentLevel() {
    var level = localStorage.getItem(STORAGE_KEY);
    return level === "power" || level === "helper" ? level : null;
  }

  function applyLevel(level) {
    document.body.classList.toggle("access-unlocked", !!level);
    document.body.classList.toggle("access-helper", level === "helper");
    var badge = document.getElementById("accessLevelBadge");
    if (badge) {
      if (level === "power") {
        badge.textContent = "Power user (read/write)";
        badge.className = "access-badge power";
      } else if (level === "helper") {
        badge.textContent = "Helper (read only)";
        badge.className = "access-badge helper";
      } else {
        badge.textContent = "";
        badge.className = "access-badge";
      }
    }
  }

  function openGate() {
    var gate = document.getElementById("accessGate");
    var input = document.getElementById("accessGateInput");
    var error = document.getElementById("accessGateError");
    if (error) error.hidden = true;
    if (gate) { gate.hidden = false; gate.classList.add("open"); }
    if (input) { input.value = ""; input.focus(); }
  }

  function closeGate() {
    var gate = document.getElementById("accessGate");
    if (gate) { gate.hidden = true; gate.classList.remove("open"); }
  }

  document.addEventListener("DOMContentLoaded", function () {
    applyLevel(currentLevel());

    var openBtn = document.getElementById("openAccessGateBtn");
    if (openBtn) openBtn.addEventListener("click", openGate);

    var closeBtn = document.getElementById("closeAccessGateBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeGate);

    var form = document.getElementById("accessGateForm");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var input = document.getElementById("accessGateInput");
        var code = (input && input.value || "").trim();
        var level = CODES[code];
        var error = document.getElementById("accessGateError");
        if (level) {
          localStorage.setItem(STORAGE_KEY, level);
          window.location.reload();
        } else if (error) {
          error.hidden = false;
        }
      });
    }

    var lockBtn = document.getElementById("lockAppBtn");
    if (lockBtn) {
      lockBtn.addEventListener("click", function () {
        if (!window.confirm("Return to the public guest schedule view? You can unlock again with an access code any time.")) return;
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      });
    }
  });
})();
