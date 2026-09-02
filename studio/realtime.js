// Realtime multi-device sync, layered on top of the existing Cloud Sync
// (Supabase) settings panel in app.js. Loaded AFTER app.js — classic
// (non-module) <script> tags on one page share a single top-level
// let/const scope, so this file reads and uses app.js's `plan`,
// `recordChange`, `render`, `pushUndo`, `loadCloudSyncSettings`,
// `isCloudSyncReady`, `setCloudStatus`, `migratePlan`, `pullCloudPlan`,
// `cloudSyncTimer`, and `syncClientId` directly, with no imports.
//
// How it avoids an infinite push/receive loop: every push from app.js's
// pushCloudPlan() is tagged with this tab's `syncClientId`. When a change
// arrives here, a row carrying our own client id is our own write echoing
// back and is ignored; anything else is applied locally, and the reflexive
// autosave that applying it triggers (render() -> savePlan()) is cancelled
// immediately after, so we never push it straight back out.
(function () {
  "use strict";

  var supabaseClient = null;
  var channel = null;
  var lastAppliedUpdatedAt = null;

  function teardown() {
    if (channel && supabaseClient) {
      try { supabaseClient.removeChannel(channel); } catch (e) { /* already gone */ }
    }
    channel = null;
  }

  function start() {
    teardown();
    var settings = loadCloudSyncSettings();
    if (!isCloudSyncReady(settings)) return;
    if (!window.supabase || !window.supabase.createClient) {
      setCloudStatus("Realtime library failed to load — check your connection and reload the page.", "error");
      return;
    }

    supabaseClient = window.supabase.createClient(settings.url, settings.anonKey);
    channel = supabaseClient
      .channel("wedding_plan_" + settings.syncId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wedding_plans", filter: "id=eq." + settings.syncId },
        handleChange
      )
      .subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          setCloudStatus("Live sync connected — your partner's changes will appear automatically.", "ok");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setCloudStatus("Live sync connection lost — retrying in the background.", "warn");
        }
      });
  }

  function handleChange(payload) {
    var row = payload.new;
    if (!row) return;
    if (row.client_id && row.client_id === syncClientId) return; // our own write, echoed back
    if (lastAppliedUpdatedAt && lastAppliedUpdatedAt === row.updated_at) return;
    lastAppliedUpdatedAt = row.updated_at;

    pushUndo(); // lets you Ctrl+Z back to what you had if this overwrites something you were mid-edit on
    plan = migratePlan(row.data || {});
    recordChange("Live-synced a change from another device");
    render();
    clearTimeout(cloudSyncTimer); // render() -> savePlan() may have just armed a reflexive re-push; cancel it
    setCloudStatus("Updated just now from a shared change.", "ok");
  }

  // One-time catch-up fetch on load (postgres_changes only streams changes
  // going forward from the moment we subscribe, so without this a device
  // that was closed while a change happened would never see it until the
  // next unrelated update arrives). This used to call the existing
  // pullCloudPlan(), which overwrites `plan` unconditionally - but that
  // fetch takes a moment over the network, and if you started editing
  // (e.g. importing a CSV) before it resolved, it would silently stomp
  // your edit back to whatever was already in the cloud, with no error.
  // Guard: only apply it if nothing local changed while we were waiting.
  async function syncOnStartup() {
    var settings = loadCloudSyncSettings();
    if (!isCloudSyncReady(settings)) return;
    var before = JSON.stringify(plan);
    try {
      var response = await fetch(
        cloudRowsUrl(settings, "id=eq." + encodeURIComponent(settings.syncId) + "&select=id,data,updated_at&limit=1"),
        { headers: cloudHeaders(settings) }
      );
      if (response.ok) {
        var cloudRows = await response.json();
        if (cloudRows.length) {
          if (JSON.stringify(plan) === before) {
            plan = migratePlan(cloudRows[0].data || {});
            lastAppliedUpdatedAt = cloudRows[0].updated_at;
            recordChange("Synced the latest shared plan on load");
            render();
          } else {
            setCloudStatus("You made changes before the initial sync finished, so it was skipped to avoid overwriting them. Click Pull if you want the cloud copy instead.", "warn");
          }
        }
      }
    } catch (e) {
      // offline or unreachable - local data is still usable, live sync will retry via start()
    }
    start();
  }

  document.addEventListener("DOMContentLoaded", syncOnStartup);

  // Re-subscribe whenever the sync settings change or a manual pull happens,
  // in case the URL/key/sync ID changed.
  ["cloudSyncSaveBtn", "cloudPullBtn"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", function () { setTimeout(start, 0); });
  });

  window.addEventListener("beforeunload", teardown);
})();
