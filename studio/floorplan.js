// Spatial floor plan module for VowSuite's Seating view.
//
// This renders into the existing #tableMap element and reuses the app's
// existing .seat[data-table][data-seat] button contract, so guest
// assignment (click), drag-to-swap, and the rule-warning logic already in
// app.js keep working completely unchanged — this file only adds spatial
// position/shape/color to tables and lets you drag them and their chairs
// around a real venue map.
//
// Loaded BEFORE app.js: at parse time it only *defines* functions, which is
// fine even though `plan`/`recordChange`/`render`/`uid` (declared in app.js)
// don't exist yet — they only need to exist once these functions are
// actually called, which happens after app.js has finished loading and run
// its own initial render().
(function () {
  "use strict";

  var PALETTE = {
    terracotta: "#9a5d45", // matches VowSuite's --accent
    teal: "#2f6b64",       // matches VowSuite's --accent-2
    ochre: "#b18a45",      // matches VowSuite's --gold
    dustyrose: "#C08E83",
    champagne: "#E5D5B7"
  };

  var TABLE_TYPES = {
    cocktail24: { label: '24" Cocktail / High Top', shape: "round", w: 12, h: 12, color: PALETTE.teal },
    cocktail30: { label: '30" Cocktail / High Top', shape: "round", w: 8, h: 8, color: PALETTE.teal },
    card3x3: { label: "3'×3' Card Table", shape: "square", w: 18, h: 18, color: PALETTE.dustyrose },
    banquet6: { label: "6' Banquet", shape: "rect", w: 130, h: 46, color: PALETTE.terracotta },
    banquet8: { label: "8' Banquet", shape: "rect", w: 170, h: 46, color: PALETTE.terracotta },
    round60: { label: '60" Round (8-top)', shape: "round", w: 32, h: 32, color: PALETTE.terracotta }
  };
  var COLORS = [PALETTE.terracotta, PALETTE.teal, PALETTE.ochre, PALETTE.dustyrose, PALETTE.champagne, "#756f68", "#25211d"];
  var RUNNER_COLORS = [PALETTE.champagne, "#ffffff", PALETTE.dustyrose, PALETTE.terracotta, PALETTE.ochre, PALETTE.teal];

  var ROOM_W = 1057, ROOM_H = 706;
  var zoom = 1;
  var selectedTableId = null;

  function typeForSeatCount(n) {
    if (n <= 2) return "cocktail30";
    if (n <= 4) return "card3x3";
    if (n <= 6) return "banquet6";
    if (n <= 8) return "round60";
    return "banquet8";
  }

  // Assigns defaults to any table missing our extra fields, so tables added
  // through the plain "Add table" control (or older saved plans) still work.
  function ensureFloorPlanFields(table, index) {
    if (!table.type || !TABLE_TYPES[table.type]) table.type = typeForSeatCount(table.seats.length);
    if (typeof table.x !== "number" || typeof table.y !== "number") {
      var col = index % 5, row = Math.floor(index / 5);
      table.x = 140 + col * 150;
      table.y = 140 + row * 140;
    }
    if (typeof table.rot !== "number") table.rot = 0;
    if (!table.color) table.color = TABLE_TYPES[table.type].color;
    if (typeof table.runner !== "boolean") table.runner = false;
    if (!table.runnerColor) table.runnerColor = "#ffffff";
    if (!Array.isArray(table.seatLayout)) table.seatLayout = [];
    while (table.seatLayout.length < table.seats.length) table.seatLayout.push({ x: table.x, y: table.y, custom: false });
    table.seatLayout.length = table.seats.length;
    relayoutSeats(table);
  }

  function rotatePoint(local, deg, cx, cy) {
    var rad = (deg * Math.PI) / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    return { x: cx + local.x * cos - local.y * sin, y: cy + local.x * sin + local.y * cos };
  }

  function defaultSeatPositions(table) {
    var def = TABLE_TYPES[table.type];
    var n = table.seats.length;
    var pts = [];
    if (n === 0) return pts;
    if (def.shape === "round") {
      var r = def.w / 2 + 16;
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n - Math.PI / 2;
        pts.push({ x: table.x + r * Math.cos(a), y: table.y + r * Math.sin(a) });
      }
    } else {
      var hw = def.w / 2, hh = def.h / 2, pad = 14;
      var perSide = Math.ceil(n / 2);
      var idx = 0;
      for (var side = 0; side < 2 && idx < n; side++) {
        var yOff = side === 0 ? -(hh + pad) : hh + pad;
        var count = Math.min(perSide, n - idx);
        for (var k = 0; k < count; k++) {
          var frac = (k + 1) / (count + 1);
          var xOff = -hw + frac * (2 * hw);
          pts.push(rotatePoint({ x: xOff, y: yOff }, table.rot, table.x, table.y));
          idx++;
        }
      }
    }
    return pts;
  }

  function relayoutSeats(table, force) {
    var pts = defaultSeatPositions(table);
    for (var i = 0; i < table.seatLayout.length; i++) {
      var s = table.seatLayout[i];
      if (force || !s.custom) {
        if (pts[i]) { s.x = pts[i].x; s.y = pts[i].y; }
      }
    }
  }

  function typeDef(type) { return TABLE_TYPES[type]; }

  // escapeHtml is defined in app.js (loaded after this file) — safe to
  // reference here since it's only called later, at render time.
  function escHtml(value) { return escapeHtml(value == null ? "" : value); }

  // ---------- rendering ----------
  function renderFloorPlanCanvas() {
    renderToolbar();

    var mapEl = document.getElementById("tableMap");
    plan.tables.forEach(ensureFloorPlanFields);

    var html = '<div class="fp-surface" id="fpSurface" style="transform:scale(' + zoom + ')">' +
      '<img class="fp-bg" id="fpBg" src="./maplayout.png" alt="Venue map">';

    plan.tables.forEach(function (table) {
      var def = typeDef(table.type);
      var isSelected = table.id === selectedTableId;
      html += '<div class="fp-table ' + def.shape + (isSelected ? " fp-selected" : "") + '" data-fp-table="' + table.id + '" ' +
        'style="left:' + table.x + "px;top:" + table.y + "px;width:" + def.w + "px;height:" + def.h + "px;" +
        "margin-left:" + (-def.w / 2) + "px;margin-top:" + (-def.h / 2) + "px;" +
        "background:" + table.color + ";transform:rotate(" + table.rot + "deg);\">";
      if (table.runner) {
        var isRound = def.shape === "round";
        html += '<div class="fp-runner" style="background:' + table.runnerColor + ";" +
          (isRound ? "left:10%;right:10%;top:40%;height:20%;" : "left:6%;right:6%;top:38%;height:24%;") + '"></div>';
      }
      html += '<div class="fp-label" style="transform:rotate(' + -table.rot + 'deg)">' + escHtml(table.name) + "</div>";
      html += "</div>";

      table.seats.forEach(function (seatName, i) {
        var pos = table.seatLayout[i] || { x: table.x, y: table.y };
        html += '<button class="seat' + (seatName ? " occupied" : "") + '" data-table="' + table.id + '" data-seat="' + i + '" ' +
          (seatName ? 'draggable="true"' : "") +
          ' data-fp-seat="' + table.id + ":" + i + '" ' +
          'style="left:' + pos.x + "px;top:" + pos.y + 'px" ' +
          'title="' + escHtml(seatName || "Open seat") + '">' + escHtml(seatName || "") + "</button>";
      });
    });

    html += "</div>";
    mapEl.innerHTML = html;

    wireTableDragAndSelect();
  }

  function renderToolbar() {
    var bar = document.getElementById("floorplanToolbar");
    if (!bar) return;
    if (bar.dataset.built) { updateInspector(); return; }
    bar.dataset.built = "1";

    var typeOptions = Object.keys(TABLE_TYPES).map(function (k) {
      return '<option value="' + k + '">' + TABLE_TYPES[k].label + "</option>";
    }).join("");

    bar.innerHTML =
      '<select id="fpAddType">' + typeOptions + "</select>" +
      '<button id="fpAddBtn" class="ghost-button"><i data-lucide="plus"></i>Add shaped table</button>' +
      '<div class="fp-sep"></div>' +
      '<div class="fp-zoom"><button id="fpZoomOut" class="ghost-button access-safe">−</button><span id="fpZoomLabel">100%</span><button id="fpZoomIn" class="ghost-button access-safe">+</button></div>';

    document.getElementById("fpAddBtn").addEventListener("click", function () {
      pushUndo();
      var type = document.getElementById("fpAddType").value;
      var def = TABLE_TYPES[type];
      var seatCount = type === "round60" ? 8 : type === "banquet8" ? 8 : type === "banquet6" ? 6 : type === "card3x3" ? 4 : 0;
      var table = {
        id: uid(),
        name: "Table " + (plan.tables.length + 1),
        seats: Array.from({ length: seatCount }, function () { return ""; }),
        type: type, x: ROOM_W / 2, y: ROOM_H / 2, rot: 0,
        color: def.color, runner: false, runnerColor: "#ffffff", seatLayout: []
      };
      plan.tables.push(table);
      selectedTableId = table.id;
      recordChange("Added a shaped table to the floor plan");
      render();
    });

    document.getElementById("fpZoomIn").addEventListener("click", function () { zoom = Math.min(2, zoom + 0.1); applyZoom(); });
    document.getElementById("fpZoomOut").addEventListener("click", function () { zoom = Math.max(0.4, zoom - 0.1); applyZoom(); });

    updateInspector();
  }

  function applyZoom() {
    var surface = document.getElementById("fpSurface");
    if (surface) surface.style.transform = "scale(" + zoom + ")";
    var label = document.getElementById("fpZoomLabel");
    if (label) label.textContent = Math.round(zoom * 100) + "%";
  }

  function getSelectedTable() {
    return plan.tables.find(function (t) { return t.id === selectedTableId; });
  }

  function updateInspector() {
    var box = document.getElementById("floorplanTableInspector");
    if (!box) return;
    var table = getSelectedTable();
    if (!table) {
      box.innerHTML = '<p class="muted">Click a table on the floor plan to edit its size, color, runner, or rotation.</p>';
      return;
    }
    var def = typeDef(table.type);
    var html = "";
    html += '<div class="fp-field"><label>Table name</label><input type="text" id="fpName" value="' + escHtml(table.name) + '"></div>';
    html += '<div class="fp-field"><label>Table type</label><select id="fpType">' + Object.keys(TABLE_TYPES).map(function (k) {
      return '<option value="' + k + '"' + (k === table.type ? " selected" : "") + ">" + TABLE_TYPES[k].label + "</option>";
    }).join("") + "</select></div>";
    html += '<div class="fp-field"><label>Rotation (' + Math.round(table.rot) + '°)</label><input type="range" id="fpRot" min="0" max="359" value="' + table.rot + '"></div>';
    html += '<div class="fp-field"><label>Table color</label><div class="fp-swatches" id="fpColor"></div></div>';
    html += '<div class="fp-field"><label><input type="checkbox" id="fpRunnerOn" ' + (table.runner ? "checked" : "") + "> Horizontal runner</label>";
    html += '<div class="fp-swatches" id="fpRunnerColor" style="' + (table.runner ? "" : "opacity:.35;pointer-events:none;") + '"></div></div>';
    html += '<p class="muted">Size: ' + Math.round(def.w) + "×" + Math.round(def.h) + " px · " + table.seats.length + " seats. Drag the table shape to move it; drag a seat to move just that chair.</p>";
    box.innerHTML = html;

    document.getElementById("fpName").addEventListener("input", function (e) {
      table.name = e.target.value;
      var lbl = document.querySelector('.fp-table[data-fp-table="' + table.id + '"] .fp-label');
      if (lbl) lbl.textContent = table.name;
    });
    document.getElementById("fpName").addEventListener("change", function () { recordChange("Renamed a table"); savePlan(); });

    document.getElementById("fpType").addEventListener("change", function (e) {
      pushUndo();
      table.type = e.target.value;
      table.color = TABLE_TYPES[table.type].color;
      relayoutSeats(table, true);
      recordChange("Changed a table's type on the floor plan");
      render();
    });

    document.getElementById("fpRot").addEventListener("input", function (e) {
      table.rot = parseInt(e.target.value, 10);
      relayoutSeats(table);
      var el = document.querySelector('.fp-table[data-fp-table="' + table.id + '"]');
      if (el) { el.style.transform = "rotate(" + table.rot + "deg)"; }
      var lbl = el && el.querySelector(".fp-label");
      if (lbl) lbl.style.transform = "rotate(" + -table.rot + "deg)";
      table.seatLayout.forEach(function (pos, i) {
        var seatEl = document.querySelector('[data-fp-seat="' + table.id + ":" + i + '"]');
        if (seatEl) { seatEl.style.left = pos.x + "px"; seatEl.style.top = pos.y + "px"; }
      });
    });
    document.getElementById("fpRot").addEventListener("change", function () {
      recordChange("Rotated a table on the floor plan");
      savePlan();
      updateInspector();
    });

    var colorWrap = document.getElementById("fpColor");
    COLORS.forEach(function (c) {
      var sw = document.createElement("div");
      sw.className = "fp-swatch" + (table.color === c ? " fp-active" : "");
      sw.style.background = c;
      sw.addEventListener("click", function () {
        table.color = c;
        recordChange("Recolored a table");
        render();
      });
      colorWrap.appendChild(sw);
    });

    document.getElementById("fpRunnerOn").addEventListener("change", function (e) {
      table.runner = e.target.checked;
      recordChange("Toggled a table runner");
      render();
    });
    var runnerWrap = document.getElementById("fpRunnerColor");
    RUNNER_COLORS.forEach(function (c) {
      var sw = document.createElement("div");
      sw.className = "fp-swatch" + (table.runnerColor === c ? " fp-active" : "");
      sw.style.background = c;
      sw.addEventListener("click", function () {
        table.runnerColor = c;
        recordChange("Changed a runner color");
        render();
      });
      runnerWrap.appendChild(sw);
    });
  }

  // ---------- drag + select (pointer events, zoom-aware) ----------
  function wireTableDragAndSelect() {
    document.querySelectorAll(".fp-table").forEach(function (el) {
      el.addEventListener("pointerdown", function (ev) {
        if (ev.target.closest(".seat")) return; // let the app's own seat click/drag logic handle it
        if (ev.button !== 0) return;
        ev.preventDefault();
        var tableId = el.dataset.fpTable;
        var table = plan.tables.find(function (t) { return t.id === tableId; });
        if (!table) return;
        el.setPointerCapture(ev.pointerId);
        var lastX = ev.clientX, lastY = ev.clientY, moved = false;

        function onMove(e) {
          var dx = (e.clientX - lastX) / zoom, dy = (e.clientY - lastY) / zoom;
          if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) moved = true;
          lastX = e.clientX; lastY = e.clientY;
          table.x += dx; table.y += dy;
          el.style.left = table.x + "px"; el.style.top = table.y + "px";
          table.seatLayout.forEach(function (pos, i) {
            pos.x += dx; pos.y += dy;
            var seatEl = document.querySelector('[data-fp-seat="' + table.id + ":" + i + '"]');
            if (seatEl) { seatEl.style.left = pos.x + "px"; seatEl.style.top = pos.y + "px"; }
          });
        }
        function onUp() {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerup", onUp);
          if (moved) {
            recordChange("Moved a table on the floor plan");
            savePlan();
          } else {
            selectedTableId = table.id;
            document.querySelectorAll(".fp-table").forEach(function (t) { t.classList.toggle("fp-selected", t === el); });
            updateInspector();
          }
        }
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerup", onUp);
      });
    });

    document.querySelectorAll(".floorplan-canvas .seat").forEach(function (el) {
      // Occupied seats keep native HTML5 drag (draggable="true", wired in
      // app.js) so "drag a guest between seats to swap them" keeps working
      // untouched — only empty seats get the spatial repositioning drag.
      if (el.classList.contains("occupied")) return;
      el.addEventListener("pointerdown", function (ev) {
        if (ev.button !== 0) return;
        var key = el.dataset.fpSeat;
        var tableId = key.split(":")[0], seatIndex = Number(key.split(":")[1]);
        var table = plan.tables.find(function (t) { return t.id === tableId; });
        if (!table) return;
        var pos = table.seatLayout[seatIndex];
        var lastX = ev.clientX, lastY = ev.clientY, moved = false;
        // Only start a spatial drag once the pointer has moved a few pixels,
        // so a plain click still reaches the app's own seat-assignment logic.
        function onMove(e) {
          var dx = (e.clientX - lastX) / zoom, dy = (e.clientY - lastY) / zoom;
          if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
          if (!moved) { moved = true; el.setPointerCapture(ev.pointerId); }
          lastX = e.clientX; lastY = e.clientY;
          pos.x += dx; pos.y += dy; pos.custom = true;
          el.style.left = pos.x + "px"; el.style.top = pos.y + "px";
        }
        function onUp() {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          if (moved) { recordChange("Moved a chair on the floor plan"); savePlan(); }
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    });
  }

  window.renderFloorPlanCanvas = renderFloorPlanCanvas;
})();
