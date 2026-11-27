(function (root, factory) {
  var domain;
  if (typeof module === 'object' && module.exports) {
    var nodeBookingDomain = require('./booking-domain');
    domain = factory(function () { return nodeBookingDomain; });
    module.exports = domain;
  } else {
    root.FleetAddIn = root.FleetAddIn || {};
    domain = factory(function () { return root.FleetAddIn && root.FleetAddIn.BookingDomain; });
    root.FleetAddIn.DriverScheduleDomain = domain;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (getBookingDomain) {
  'use strict';

  function bookingDomain() {
    var resolved = getBookingDomain();
    if (!resolved) {
      throw new Error('BookingDomain module is not loaded.');
    }
    return resolved;
  }

  function normalizeDriverIdentity(identity) {
    identity = identity || {};
    return {
      id: String(identity.id || '').trim(),
      login: String(identity.login || identity.userName || '').trim().toLowerCase()
    };
  }

  function isAssignedToDriver(details, identity) {
    if (!details || !identity) return false;
    var normalized = normalizeDriverIdentity(identity);
    if (!normalized.id && !normalized.login) return false;

    var recordDriverId = String(details.driverId || '').trim();
    var recordDriverLogin = String(details.driverLogin || '').trim().toLowerCase();

    if (normalized.id && recordDriverId && recordDriverId === normalized.id) {
      return true;
    }
    if (normalized.login && recordDriverLogin && recordDriverLogin === normalized.login) {
      return true;
    }
    return false;
  }

  function isDriverVisibleStatus(status) {
    var normalized = bookingDomain().normalizeStatus(status);
    return normalized === 'approved' || normalized === 'confirmed' || normalized === 'cancelled';
  }

  function matchesDriverStatusFilter(status, statusFilter) {
    var normalized = bookingDomain().normalizeStatus(status);
    if (!isDriverVisibleStatus(normalized)) return false;

    var filter = String(statusFilter || 'all').trim().toLowerCase();
    if (filter === 'all') return true;
    if (filter === 'approved') return normalized === 'approved' || normalized === 'confirmed';
    if (filter === 'cancelled') return normalized === 'cancelled';
    return false;
  }

  function getScheduleTimeState(details, nowMs) {
    if (!details) return 'unknown';
    var status = bookingDomain().normalizeStatus(details.status);
    if (status === 'cancelled') return 'cancelled';
    if (status !== 'approved' && status !== 'confirmed') return 'unknown';

    var start = Date.parse(details.startUtc);
    var end = Date.parse(details.endUtc);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      return 'unknown';
    }

    var now = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (start <= now && now < end) return 'ongoing';
    if (start > now) return 'upcoming';
    return 'completed';
  }

  function getDriverTimeBounds(options, nowDate) {
    options = options || {};
    var preset = String(options.preset || 'upcoming').trim().toLowerCase();
    var now = nowDate instanceof Date ? new Date(nowDate.getTime()) : new Date();

    if (preset === 'today') {
      var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      var nextDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      return { fromTime: dayStart.getTime(), toExclusive: nextDayStart.getTime() };
    }

    if (preset === 'custom') {
      var fromDate = options.fromDate ? new Date(options.fromDate + 'T00:00:00') : null;
      var toDate = options.toDate ? new Date(options.toDate + 'T00:00:00') : null;
      if ((fromDate && !Number.isFinite(fromDate.getTime())) ||
          (toDate && !Number.isFinite(toDate.getTime()))) {
        throw new Error('Invalid custom date range.');
      }

      var fromTime = fromDate ? fromDate.getTime() : null;
      var toExclusive = null;
      if (toDate) {
        toDate.setDate(toDate.getDate() + 1);
        toExclusive = toDate.getTime();
      }
      if (fromTime !== null && toExclusive !== null && fromTime >= toExclusive) {
        throw new Error('End date must be on or after start date.');
      }
      return { fromTime: fromTime, toExclusive: toExclusive };
    }

    return bookingDomain().getTimeRangeBounds(preset, now);
  }

  function sortDriverSchedules(records, preset, nowMs) {
    var now = Number.isFinite(nowMs) ? nowMs : Date.now();
    var key = String(preset || 'upcoming').trim().toLowerCase();
    var descending = key === 'all';

    return (Array.isArray(records) ? records : []).slice().sort(function (first, second) {
      var firstState = getScheduleTimeState(first && first.details, now);
      var secondState = getScheduleTimeState(second && second.details, now);
      var firstOngoing = firstState === 'ongoing' ? 0 : 1;
      var secondOngoing = secondState === 'ongoing' ? 0 : 1;
      if (firstOngoing !== secondOngoing) return firstOngoing - secondOngoing;

      var firstStart = Date.parse(first && first.details && first.details.startUtc);
      var secondStart = Date.parse(second && second.details && second.details.startUtc);
      var safeFirst = Number.isFinite(firstStart) ? firstStart : 0;
      var safeSecond = Number.isFinite(secondStart) ? secondStart : 0;

      if (firstOngoing === 0) return safeFirst - safeSecond;
      return descending ? safeSecond - safeFirst : safeFirst - safeSecond;
    });
  }

  function filterDriverSchedules(bookings, identity, filters, nowDate) {
    filters = filters || {};
    var now = nowDate instanceof Date ? new Date(nowDate.getTime()) : new Date();
    var preset = String(filters.preset || 'upcoming').trim().toLowerCase();
    var statusFilter = String(filters.statusFilter || 'all').trim().toLowerCase();
    var bounds = getDriverTimeBounds({
      preset: preset,
      fromDate: filters.fromDate || '',
      toDate: filters.toDate || ''
    }, now);

    var matched = (Array.isArray(bookings) ? bookings : []).filter(function (record) {
      var details = record && record.details;
      if (!isAssignedToDriver(details, identity)) return false;
      if (!matchesDriverStatusFilter(details.status, statusFilter)) return false;
      return bookingDomain().isBookingInBounds(details, bounds);
    });

    return sortDriverSchedules(matched, preset, now.getTime());
  }

  function summarizeDriverSchedules(records, nowMs) {
    var now = Number.isFinite(nowMs) ? nowMs : Date.now();
    var summary = {
      total: 0,
      ongoing: 0,
      upcoming: 0,
      completed: 0,
      cancelled: 0
    };

    (Array.isArray(records) ? records : []).forEach(function (record) {
      var state = getScheduleTimeState(record && record.details, now);
      summary.total += 1;
      if (state === 'ongoing') summary.ongoing += 1;
      else if (state === 'upcoming') summary.upcoming += 1;
      else if (state === 'completed') summary.completed += 1;
      else if (state === 'cancelled') summary.cancelled += 1;
    });

    return summary;
  }

  function formatNotificationSchedule(details, formatters) {
    if (formatters && typeof formatters.formatDateRange === 'function') {
      return formatters.formatDateRange(details.startUtc, details.endUtc);
    }
    return String(details.startUtc || '') + ' - ' + String(details.endUtc || '');
  }

  function buildAssignmentNotificationText(details, formatters) {
    details = details || {};
    var parts = [
      '[New Schedule] ' + formatNotificationSchedule(details, formatters),
      'Vehicle: ' + (details.deviceName || details.deviceId || 'Assigned vehicle'),
      'Destination: ' + (details.destination || 'Not specified'),
      'Purpose: ' + (details.purpose || 'Not specified')
    ];
    if (details.createdBy) {
      parts.push('Requester: ' + details.createdBy);
    }
    if (details.approvalNotes) {
      parts.push('Note: ' + details.approvalNotes);
    }
    return parts.join(' | ');
  }

  function buildCancellationNotificationText(details, formatters) {
    details = details || {};
    var parts = [
      '[Schedule Cancelled] ' + formatNotificationSchedule(details, formatters),
      'Vehicle: ' + (details.deviceName || details.deviceId || 'Assigned vehicle'),
      'Destination: ' + (details.destination || 'Not specified')
    ];
    if (details.cancelledBy) {
      parts.push('Cancelled by: ' + details.cancelledBy);
    }
    if (details.cancellationReason) {
      parts.push('Reason: ' + details.cancellationReason);
    }
    return parts.join(' | ');
  }

  return {
    buildAssignmentNotificationText: buildAssignmentNotificationText,
    buildCancellationNotificationText: buildCancellationNotificationText,
    filterDriverSchedules: filterDriverSchedules,
    getDriverTimeBounds: getDriverTimeBounds,
    getScheduleTimeState: getScheduleTimeState,
    isAssignedToDriver: isAssignedToDriver,
    isDriverVisibleStatus: isDriverVisibleStatus,
    matchesDriverStatusFilter: matchesDriverStatusFilter,
    normalizeDriverIdentity: normalizeDriverIdentity,
    sortDriverSchedules: sortDriverSchedules,
    summarizeDriverSchedules: summarizeDriverSchedules
  };
}));
