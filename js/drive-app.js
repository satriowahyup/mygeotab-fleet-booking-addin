(function (root) {
  'use strict';

  var CACHE_PREFIX = 'fleetBookingDriveCache:v1:';
  var loadSequence = 0;
  var view = null;
  var listenersBound = false;

  var state = {
    api: null,
    database: '',
    driverIdentity: null,
    bookings: [],
    lastSyncedAtIso: '',
    usingOfflineCache: false,
    filters: {
      preset: 'upcoming',
      fromDate: '',
      toDate: '',
      statusFilter: 'all'
    }
  };

  function getModules() {
    var ns = root.FleetAddIn || {};
    return {
      driverDomain: ns.DriverScheduleDomain,
      apiService: ns.GeotabApi,
      fmt: ns.Formatters,
      viewFactory: ns.DriveScheduleView
    };
  }

  function ensureView() {
    if (view) return view;
    var mods = getModules();
    if (!mods.driverDomain || !mods.apiService || !mods.fmt || !mods.viewFactory) {
      return null;
    }
    if (!document.getElementById('driveScheduleList')) {
      return null;
    }
    view = mods.viewFactory.create({
      driverScheduleDomain: mods.driverDomain,
      formatters: mods.fmt,
      state: state,
      onRefresh: function () {
        refresh(state.api, null);
      },
      onFilterChanged: function () {
        if (view) view.render();
      }
    });
    if (!listenersBound) {
      view.bind();
      listenersBound = true;
    }
    return view;
  }

  function getCacheKey(database, userName) {
    return CACHE_PREFIX +
      String(database || 'default').toLowerCase() + ':' +
      String(userName || 'unknown').toLowerCase();
  }

  function saveOfflineCache(database, userName, identity, bookings, syncedAtIso) {
    try {
      if (!root.localStorage || !userName) return;
      var payload = {
        driverIdentity: identity,
        bookings: bookings,
        syncedAtIso: syncedAtIso
      };
      root.localStorage.setItem(getCacheKey(database, userName), JSON.stringify(payload));
    } catch (error) {
      // Ignore storage quota or private mode failures
    }
  }

  function readOfflineCache(database, userName) {
    try {
      if (!root.localStorage || !userName) return null;
      var raw = root.localStorage.getItem(getCacheKey(database, userName));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.bookings)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function applyOfflineFallback(activeView, database, userName, reasonText) {
    var cached = readOfflineCache(database, userName);
    if (cached) {
      state.driverIdentity = cached.driverIdentity || state.driverIdentity || {
        id: '',
        login: userName || '',
        fullName: userName || '',
        isDriver: null
      };
      state.bookings = cached.bookings;
      state.lastSyncedAtIso = cached.syncedAtIso || '';
      state.usingOfflineCache = true;
      activeView.setBanner(reasonText + ' Showing your last synced schedules.', 'warning');
      activeView.render();
      return true;
    }

    state.bookings = [];
    state.usingOfflineCache = false;
    activeView.setBanner(reasonText + ' No offline cache is available yet.', 'error');
    activeView.render();
    return false;
  }

  async function refresh(api, driveState) {
    var activeView = ensureView();
    var mods = getModules();
    if (!api || !activeView || !mods.apiService || !mods.driverDomain || !mods.fmt) return;

    state.api = api;
    var sequence = ++loadSequence;
    activeView.setLoading(true);
    activeView.setBanner('Syncing your assigned schedules...', 'info');

    var sessionUserName = '';
    var sessionDatabase = state.database;

    try {
      var session = await mods.apiService.getSession(api);
      if (sequence !== loadSequence) return;
      sessionUserName = (session && session.userName) || '';
      sessionDatabase = (session && session.database) || sessionDatabase;
      state.database = sessionDatabase;
    } catch (sessionError) {
      if (sequence !== loadSequence) return;
      activeView.setLoading(false);
      activeView.setBanner('Unable to read Geotab Drive session: ' + mods.fmt.errorText(sessionError), 'error');
      return;
    }

    var isExplicitlyOffline = (driveState && driveState.online === false) ||
      (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (isExplicitlyOffline) {
      activeView.setLoading(false);
      applyOfflineFallback(activeView, sessionDatabase, sessionUserName, 'You are currently offline.');
      return;
    }

    try {
      var results = await Promise.all([
        mods.apiService.resolveDriverIdentity(api, sessionUserName),
        mods.apiService.getBookingRecords(api)
      ]);
      if (sequence !== loadSequence) return;

      var identity = results[0];
      var allBookings = results[1];
      var driverOnlyRecords = allBookings.filter(function (record) {
        return record && record.details &&
          mods.driverDomain.isAssignedToDriver(record.details, identity) &&
          mods.driverDomain.isDriverVisibleStatus(record.details.status);
      });

      var syncedAtIso = new Date().toISOString();
      state.driverIdentity = identity;
      state.bookings = driverOnlyRecords;
      state.lastSyncedAtIso = syncedAtIso;
      state.usingOfflineCache = false;

      saveOfflineCache(sessionDatabase, sessionUserName, identity, driverOnlyRecords, syncedAtIso);
      activeView.setBanner('', 'info');
      activeView.render();
    } catch (error) {
      if (sequence !== loadSequence) return;
      applyOfflineFallback(
        activeView,
        sessionDatabase,
        sessionUserName,
        'Unable to sync schedules (' + mods.fmt.errorText(error) + ').'
      );
    } finally {
      if (sequence === loadSequence) {
        activeView.setLoading(false);
      }
    }
  }

  root.geotab = root.geotab || {};
  root.geotab.addin = root.geotab.addin || {};
  root.geotab.addin.driverSchedule = function () {
    return {
      initialize: function (api, driveState, callback) {
        state.api = api;
        try {
          ensureView();
        } catch (error) {
          // Allow Drive to finish initialization even if DOM mounts on focus
        }
        if (typeof callback === 'function') callback();
      },
      focus: function (api, driveState) {
        refresh(api, driveState);
      },
      blur: function () {
        // No background timers to clean up
      }
    };
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
