(function (root) {
  'use strict';

  var ns = root.FleetAddIn;
  var bookingDomain = ns.BookingDomain;
  var userDomain = ns.UserDomain;
  var apiService = ns.GeotabApi;
  var fmt = ns.Formatters;

  var navigation = document.querySelector('.side-nav');
  var heroUserBadge = document.getElementById('heroUserBadge');
  var approvalNavButton = navigation.querySelector('[data-page="approval"]');
  var usersNavButton = navigation.querySelector('[data-page="users"]');
  var approvalPendingBadge = document.getElementById('approvalPendingBadge');

  var state = {
    api: null,
    currentUserName: '',
    currentUser: null,
    isAdministrator: false,
    devices: [],
    bookings: [],
    users: [],
    securityGroupNames: {},
    securityGroupsLoaded: false,
    usersLoadState: 'idle',
    activePage: 'booking',
    canBook: false,
    isBusy: false
  };

  var AUTO_REFRESH_COOLDOWN_MS = 15000;
  var loadSequence = 0;
  var usersLoadSequence = 0;
  var lastBookingsSyncAt = 0;
  var isQuietRefreshing = false;
  var isAddInFocused = false;
  var listenersBound = false;

  var vehiclesView = ns.VehiclesView.create({
    bookingDomain: bookingDomain,
    formatters: fmt,
    state: state
  });
  var reportsView = ns.ReportsView.create({
    bookingDomain: bookingDomain,
    userDomain: userDomain,
    formatters: fmt,
    state: state
  });
  var usersView = ns.UsersView.create({
    userDomain: userDomain,
    bookingDomain: bookingDomain,
    formatters: fmt,
    state: state,
    onRefresh: function (force) {
      loadUsers(state.api, force);
    }
  });
  var bookingView = ns.BookingView.create({
    bookingDomain: bookingDomain,
    apiService: apiService,
    formatters: fmt,
    state: state,
    onDataChanged: function (quiet) {
      return refresh(state.api, quiet);
    }
  });
  var approvalView = ns.ApprovalView.create({
    bookingDomain: bookingDomain,
    userDomain: userDomain,
    apiService: apiService,
    formatters: fmt,
    reviewFormBuilder: ns.ApprovalReviewForm,
    state: state,
    onDataChanged: function (quiet) {
      return refresh(state.api, quiet);
    },
    onRefreshDrivers: function (force) {
      return loadUsers(state.api, force);
    }
  });

  function isAdminOnlyPage(pageName) {
    return pageName === 'approval' || pageName === 'users';
  }

  function switchPage(pageName) {
    if (isAdminOnlyPage(pageName) && !state.isAdministrator) {
      pageName = 'booking';
    }
    state.activePage = pageName;
    var targetId = 'page-' + pageName;

    document.querySelectorAll('.page-view').forEach(function (page) {
      page.hidden = page.id !== targetId;
    });
    navigation.querySelectorAll('[data-page]').forEach(function (item) {
      if (item.getAttribute('data-page') === pageName) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });

    if ((pageName === 'users' || pageName === 'approval') && state.isAdministrator) {
      loadUsers(state.api, false);
    }
    if (pageName === 'approval') approvalView.render();
    if (pageName === 'users') usersView.render();
    if (pageName === 'vehicles') vehiclesView.render();
    refreshBookingsQuiet(false);
  }

  async function refreshBookingsQuiet(force) {
    if (!state.api || !state.currentUserName || state.isBusy || isQuietRefreshing) return;
    if (!force && (Date.now() - lastBookingsSyncAt) < AUTO_REFRESH_COOLDOWN_MS) return;

    var startSequence = loadSequence;
    isQuietRefreshing = true;
    try {
      var freshBookings = await apiService.getBookingRecords(state.api);
      if (startSequence !== loadSequence) return;

      state.bookings = freshBookings;
      lastBookingsSyncAt = Date.now();
      syncAdminNavigation();
      bookingView.renderList();
      vehiclesView.render();
      usersView.render();
      reportsView.renderVehicleOptions();
      reportsView.renderRequesterOptions();
      reportsView.render();
      if (!approvalView.isReviewOpen()) {
        approvalView.render();
      }
    } catch (error) {
      // Keep current cached view if silent background refresh fails
    } finally {
      isQuietRefreshing = false;
    }
  }

  function updateHeroUser(userName) {
    if (!heroUserBadge) return;
    heroUserBadge.textContent = userName || '';
    heroUserBadge.hidden = !userName;
  }

  function syncAdminNavigation() {
    approvalNavButton.hidden = !state.isAdministrator;
    usersNavButton.hidden = !state.isAdministrator;

    var pendingCount = bookingDomain.filterApprovalQueue(state.bookings, 'pending').length;
    approvalPendingBadge.textContent = String(pendingCount);
    approvalPendingBadge.hidden = !state.isAdministrator || pendingCount === 0;

    if (!state.isAdministrator && isAdminOnlyPage(state.activePage)) {
      switchPage('booking');
    }
  }

  async function loadUsers(api, force) {
    if (!api || !state.isAdministrator || state.usersLoadState === 'loading' ||
        (state.usersLoadState === 'loaded' && !force)) {
      return;
    }

    var sequence = ++usersLoadSequence;
    state.usersLoadState = 'loading';
    state.users = [];
    state.securityGroupNames = {};
    state.securityGroupsLoaded = false;
    usersView.setLoading(true);
    usersView.setStatus('Loading drivers and users from the current database...', false);
    usersView.render();
    approvalView.render();

    try {
      var directory = await apiService.getUsersDirectory(api);
      if (sequence !== usersLoadSequence) return;

      state.users = directory.users;
      state.securityGroupNames = directory.securityGroupNames;
      state.securityGroupsLoaded = directory.securityGroupsLoaded;
      state.usersLoadState = 'loaded';
      usersView.setStatus(
        state.users.length
          ? 'Loaded ' + state.users.length + ' user records visible to this account.'
          : 'No user records are visible to this account.',
        false
      );
      usersView.render();
      approvalView.render();
      reportsView.renderRequesterOptions();
    } catch (error) {
      if (sequence === usersLoadSequence) {
        state.users = [];
        state.usersLoadState = 'error';
        usersView.setStatus(
          'Unable to load users. Check User read access for this account. Details: ' + fmt.errorText(error),
          true
        );
        usersView.render();
        approvalView.render();
      }
    } finally {
      if (sequence === usersLoadSequence) usersView.setLoading(false);
    }
  }

  async function refresh(api, quiet) {
    state.api = api;
    var sequence = ++loadSequence;
    if (!quiet) bookingView.setStatus('Loading booking data from MyGeotab...', false);

    try {
      var results = await Promise.all([
        apiService.getDevices(api).catch(function () { return []; }),
        apiService.getBookingRecords(api),
        apiService.getSession(api)
      ]);
      if (sequence !== loadSequence) return null;

      state.devices = results[0];
      state.bookings = results[1];
      state.currentUserName = (results[2] && results[2].userName) || '';
      updateHeroUser(state.currentUserName);
      lastBookingsSyncAt = Date.now();

      var clearance = await apiService.resolveCurrentUserClearance(api, state.currentUserName, userDomain);
      if (sequence !== loadSequence) return null;

      state.currentUser = clearance.user;
      state.isAdministrator = clearance.isAdministrator;
      if (clearance.securityGroupsLoaded && !state.securityGroupsLoaded) {
        state.securityGroupNames = clearance.securityGroupNames;
        state.securityGroupsLoaded = true;
      }

      state.canBook = Boolean(state.currentUserName);
      bookingView.updateFormState();
      syncAdminNavigation();

      vehiclesView.render();
      bookingView.renderList();
      reportsView.renderVehicleOptions();
      reportsView.renderRequesterOptions();
      reportsView.render();
      approvalView.render();
      usersView.render();

      if (state.isAdministrator && isAdminOnlyPage(state.activePage)) {
        loadUsers(api, false);
      }

      if (!quiet) {
        bookingView.clearStatus();
      }
      return state.bookings.slice();
    } catch (error) {
      if (sequence === loadSequence) {
        state.canBook = false;
        state.isAdministrator = false;
        bookingView.updateFormState();
        syncAdminNavigation();
        bookingView.setStatus('Unable to load MyGeotab data: ' + fmt.errorText(error), true);
      }
      return null;
    }
  }

  function bindListeners() {
    if (listenersBound) return;
    bookingView.bind();
    approvalView.bind();
    reportsView.bind();
    usersView.bind();
    vehiclesView.bind();

    navigation.addEventListener('click', function (event) {
      var button = event.target.closest('[data-page]');
      if (!button || button.hidden) return;
      switchPage(button.getAttribute('data-page'));
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && isAddInFocused) {
        refreshBookingsQuiet(false);
      }
    });

    listenersBound = true;
  }

  root.geotab = root.geotab || {};
  root.geotab.addin = root.geotab.addin || {};
  root.geotab.addin.fleetSummaryDashboard = function () {
    return {
      initialize: function (api, pageState, callback) {
        isAddInFocused = true;
        bindListeners();
        refresh(api, false).then(function () {
          callback();
        });
      },
      focus: function (api) {
        isAddInFocused = true;
        refresh(api, false);
        if (state.isAdministrator && isAdminOnlyPage(state.activePage)) {
          loadUsers(api, true);
        }
      },
      blur: function () {
        isAddInFocused = false;
      }
    };
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
