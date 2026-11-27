(function (root) {
  'use strict';

  var STATE_LABELS = {
    ongoing: 'Ongoing',
    upcoming: 'Upcoming',
    completed: 'Completed',
    cancelled: 'Cancelled',
    unknown: 'Scheduled'
  };

  function createDriveScheduleView(deps) {
    var driverDomain = deps.driverScheduleDomain;
    var fmt = deps.formatters;
    var state = deps.state;
    var onRefresh = deps.onRefresh;
    var onFilterChanged = deps.onFilterChanged;

    var driverBadge = document.getElementById('driveDriverBadge');
    var refreshButton = document.getElementById('driveRefreshButton');
    var statusBanner = document.getElementById('driveStatusBanner');
    var kpiOngoing = document.getElementById('driveKpiOngoing');
    var kpiUpcoming = document.getElementById('driveKpiUpcoming');
    var kpiCancelled = document.getElementById('driveKpiCancelled');
    var presetBar = document.getElementById('drivePresetBar');
    var statusBar = document.getElementById('driveStatusBar');
    var customRangeForm = document.getElementById('driveCustomRangeForm');
    var fromDateInput = document.getElementById('driveFromDate');
    var toDateInput = document.getElementById('driveToDate');
    var clearDatesButton = document.getElementById('driveClearDatesButton');
    var filterError = document.getElementById('driveFilterError');
    var resultSummary = document.getElementById('driveResultSummary');
    var syncTimestamp = document.getElementById('driveSyncTimestamp');
    var scheduleList = document.getElementById('driveScheduleList');

    function setBanner(message, tone) {
      if (!message) {
        statusBanner.textContent = '';
        statusBanner.removeAttribute('data-tone');
        statusBanner.hidden = true;
        return;
      }
      statusBanner.textContent = message;
      statusBanner.setAttribute('data-tone', tone || 'info');
      statusBanner.hidden = false;
    }

    function setLoading(isLoading) {
      refreshButton.disabled = Boolean(isLoading);
      refreshButton.textContent = isLoading ? 'Syncing...' : 'Refresh';
    }

    function setFilterError(message) {
      filterError.textContent = message || '';
      filterError.hidden = !message;
    }

    function setDriverBadge(identity) {
      if (!identity || (!identity.fullName && !identity.login)) {
        driverBadge.textContent = 'Not signed in';
        return;
      }
      var label = identity.fullName && identity.fullName !== identity.login
        ? identity.fullName + ' (' + identity.login + ')'
        : (identity.login || identity.fullName);
      driverBadge.textContent = label;
    }

    function setSyncTimestamp(isoValue, isOfflineCache) {
      if (!isoValue) {
        syncTimestamp.hidden = true;
        return;
      }
      var prefix = isOfflineCache ? 'Offline cache from ' : 'Last synced ';
      syncTimestamp.textContent = prefix + fmt.formatDate(isoValue);
      syncTimestamp.hidden = false;
    }

    function syncFilterControls() {
      presetBar.querySelectorAll('[data-preset]').forEach(function (button) {
        var active = button.getAttribute('data-preset') === state.filters.preset;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      statusBar.querySelectorAll('[data-status]').forEach(function (button) {
        var active = button.getAttribute('data-status') === state.filters.statusFilter;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      customRangeForm.hidden = state.filters.preset !== 'custom';
      fromDateInput.value = state.filters.fromDate || '';
      toDateInput.value = state.filters.toDate || '';
    }

    function appendMetaItem(list, label, value) {
      var wrap = document.createElement('div');
      wrap.className = 'drive-meta-item';
      var dt = document.createElement('dt');
      dt.textContent = label;
      var dd = document.createElement('dd');
      dd.textContent = value || '-';
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      list.appendChild(wrap);
    }

    function buildCard(record, nowMs) {
      var details = record.details || {};
      var timeState = driverDomain.getScheduleTimeState(details, nowMs);
      var summary = fmt.getScheduleSummary(details.startUtc, details.endUtc);

      var card = document.createElement('article');
      card.className = 'drive-card drive-card-' + timeState;

      var top = document.createElement('div');
      top.className = 'drive-card-top';

      var timeBlock = document.createElement('div');
      timeBlock.className = 'drive-card-time';
      var dateLine = document.createElement('span');
      dateLine.className = 'drive-card-date';
      dateLine.textContent = summary.dateText;
      var hoursLine = document.createElement('span');
      hoursLine.className = 'drive-card-hours';
      hoursLine.textContent = summary.timeText + (summary.durationText ? ' (' + summary.durationText + ')' : '');
      timeBlock.appendChild(dateLine);
      timeBlock.appendChild(hoursLine);

      var badge = document.createElement('span');
      badge.className = 'drive-state-badge drive-badge-' + timeState;
      badge.textContent = STATE_LABELS[timeState] || STATE_LABELS.unknown;

      top.appendChild(timeBlock);
      top.appendChild(badge);
      card.appendChild(top);

      var destination = document.createElement('p');
      destination.className = 'drive-card-destination';
      destination.textContent = details.destination || 'Destination not specified';
      card.appendChild(destination);

      var meta = document.createElement('dl');
      meta.className = 'drive-meta-grid';
      appendMetaItem(meta, 'Vehicle', details.deviceName || details.deviceId || 'Unassigned');
      appendMetaItem(meta, 'Purpose', details.purpose || 'Not specified');
      appendMetaItem(meta, 'Requester', details.createdBy || '-');
      if (timeState === 'cancelled') {
        appendMetaItem(meta, 'Cancelled by', details.cancelledBy || '-');
      } else {
        appendMetaItem(meta, 'Approved by', details.reviewedBy || '-');
      }
      card.appendChild(meta);

      if (details.approvalNotes) {
        var note = document.createElement('p');
        note.className = 'drive-callout';
        note.textContent = 'Admin note: ' + details.approvalNotes;
        card.appendChild(note);
      }

      if (timeState === 'cancelled') {
        var cancelCallout = document.createElement('p');
        cancelCallout.className = 'drive-callout drive-callout-cancelled';
        cancelCallout.textContent = details.cancellationReason
          ? 'Cancellation reason: ' + details.cancellationReason
          : 'This assigned trip has been cancelled.';
        card.appendChild(cancelCallout);
      }

      return card;
    }

    function render() {
      syncFilterControls();
      setDriverBadge(state.driverIdentity);
      setSyncTimestamp(state.lastSyncedAtIso, state.usingOfflineCache);

      var now = new Date();
      var allAssigned = driverDomain.filterDriverSchedules(
        state.bookings,
        state.driverIdentity,
        { preset: 'all', statusFilter: 'all' },
        now
      );
      var kpi = driverDomain.summarizeDriverSchedules(allAssigned, now.getTime());
      kpiOngoing.textContent = String(kpi.ongoing);
      kpiUpcoming.textContent = String(kpi.upcoming);
      kpiCancelled.textContent = String(kpi.cancelled);

      var visible = [];
      try {
        setFilterError('');
        visible = driverDomain.filterDriverSchedules(
          state.bookings,
          state.driverIdentity,
          state.filters,
          now
        );
      } catch (error) {
        setFilterError(fmt.errorText(error));
        scheduleList.textContent = '';
        resultSummary.textContent = '0 trips';
        return;
      }

      resultSummary.textContent = visible.length + (visible.length === 1 ? ' trip' : ' trips') +
        ' of ' + allAssigned.length;
      scheduleList.textContent = '';

      if (visible.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'drive-empty';
        empty.textContent = allAssigned.length > 0
          ? 'No trips match the selected time range and status filters.'
          : 'No vehicle booking schedules are assigned to your account yet.';
        scheduleList.appendChild(empty);
        return;
      }

      var nowMs = now.getTime();
      visible.forEach(function (record) {
        scheduleList.appendChild(buildCard(record, nowMs));
      });
    }

    function bind() {
      refreshButton.addEventListener('click', function () {
        if (typeof onRefresh === 'function') onRefresh();
      });

      presetBar.addEventListener('click', function (event) {
        var button = event.target.closest('[data-preset]');
        if (!button) return;
        state.filters.preset = button.getAttribute('data-preset');
        setFilterError('');
        if (typeof onFilterChanged === 'function') onFilterChanged();
      });

      statusBar.addEventListener('click', function (event) {
        var button = event.target.closest('[data-status]');
        if (!button) return;
        state.filters.statusFilter = button.getAttribute('data-status');
        if (typeof onFilterChanged === 'function') onFilterChanged();
      });

      customRangeForm.addEventListener('submit', function (event) {
        event.preventDefault();
        state.filters.preset = 'custom';
        state.filters.fromDate = fromDateInput.value || '';
        state.filters.toDate = toDateInput.value || '';
        if (typeof onFilterChanged === 'function') onFilterChanged();
      });

      clearDatesButton.addEventListener('click', function () {
        state.filters.fromDate = '';
        state.filters.toDate = '';
        fromDateInput.value = '';
        toDateInput.value = '';
        setFilterError('');
        if (typeof onFilterChanged === 'function') onFilterChanged();
      });
    }

    return {
      bind: bind,
      render: render,
      setBanner: setBanner,
      setLoading: setLoading
    };
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.DriveScheduleView = {
    create: createDriveScheduleView
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
