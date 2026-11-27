(function (root) {
  'use strict';

  var ns = root.FleetAddIn;
  var driverDomain = ns.DriverScheduleDomain;
  var apiService = ns.GeotabApi;
  var fmt = ns.Formatters;

  var CACHE_PREFIX = 'fleetBookingDriveCache:v1:';
  var loadSequence = 0;
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

  var view = ns.DriveScheduleView.create({
    driverScheduleDomain: driverDomain,
    formatters: fmt,
    state: state,
    onRefresh: function () {
      refresh(state.api, null);
    },
    onFilterChanged: function () {
      view.render();
    }
  });

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

  function applyOfflineFallback(database, userName, reasonText) {
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
      view.setBanner(reasonText + ' Showing your last synced schedules.', 'warning');
      view.render();
      return true;
    }

    state.bookings = [];
    state.usingOfflineCache = false;
    view.setBanner(reasonText + ' No offline cache is available yet.', 'error');
    view.render();
    return false;
  }

  async function refresh(api, driveState) {
    if (!api) return;
    state.api = api;
    var sequence = ++loadSequence;
    view.setLoading(true);
    view.setBanner('Syncing your assigned schedules...', 'info');

    var sessionUserName = '';
    var sessionDatabase = state.database;

    try {
      var session = await apiService.getSession(api);
      if (sequence !== loadSequence) return;
      sessionUserName = (session && session.userName) || '';
      sessionDatabase = (session && session.database) || sessionDatabase;
      state.database = sessionDatabase;
    } catch (sessionError) {
      if (sequence !== loadSequence) return;
      view.setLoading(false);
      view.setBanner('Unable to read Geotab Drive session: ' + fmt.errorText(sessionError), 'error');
      return;
    }

    var isExplicitlyOffline = (driveState && driveState.online === false) ||
      (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (isExplicitlyOffline) {
      view.setLoading(false);
      applyOfflineFallback(sessionDatabase, sessionUserName, 'You are currently offline.');
      return;
    }

    try {
      var results = await Promise.all([
        apiService.resolveDriverIdentity(api, sessionUserName),
        apiService.getBookingRecords(api)
      ]);
      if (sequence !== loadSequence) return;

      var identity = results[0];
      var allBookings = results[1];
      var driverOnlyRecords = allBookings.filter(function (record) {
        return record && record.details &&
          driverDomain.isAssignedToDriver(record.details, identity) &&
          driverDomain.isDriverVisibleStatus(record.details.status);
      });

      var syncedAtIso = new Date().toISOString();
      state.driverIdentity = identity;
      state.bookings = driverOnlyRecords;
      state.lastSyncedAtIso = syncedAtIso;
      state.usingOfflineCache = false;

      saveOfflineCache(sessionDatabase, sessionUserName, identity, driverOnlyRecords, syncedAtIso);
      view.setBanner('', 'info');
      view.render();
    } catch (error) {
      if (sequence !== loadSequence) return;
      applyOfflineFallback(
        sessionDatabase,
        sessionUserName,
        'Unable to sync schedules (' + fmt.errorText(error) + ').'
      );
    } finally {
      if (sequence === loadSequence) {
        view.setLoading(false);
      }
    }
  }

  function bindOnce() {
    if (listenersBound) return;
    view.bind();
    listenersBound = true;
  }

  root.geotab = root.geotab || {};
  root.geotab.addin = root.geotab.addin || {};
  root.geotab.addin.driverSchedule = function () {
    return {
      initialize: function (api, driveState, callback) {
        bindOnce();
        refresh(api, driveState).then(function () {
          if (typeof callback === 'function') callback();
        });
      },
      focus: function (api, driveState) {
        bindOnce();
        refresh(api, driveState);
      },
      blur: function () {
        // No background polling timers to clean up
      }
    };
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
