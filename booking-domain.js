(function (root, factory) {
  var domain = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = domain;
  } else {
    root.VehicleBookingDomain = domain;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function toUtcInterval(startLocal, endLocal) {
    if (!startLocal || !endLocal) {
      throw new Error('Start and end times are required.');
    }

    var start = new Date(startLocal);
    var end = new Date(endLocal);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new Error('Invalid time format.');
    }
    if (start.getTime() >= end.getTime()) {
      throw new Error('End time must be after start time.');
    }

    return {
      startUtc: start.toISOString(),
      endUtc: end.toISOString()
    };
  }

  function hasConflict(bookings, deviceId, startUtc, endUtc) {
    var requestedStart = Date.parse(startUtc);
    var requestedEnd = Date.parse(endUtc);
    if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd) || requestedStart >= requestedEnd) {
      throw new Error('Invalid booking time range.');
    }

    return bookings.some(function (booking) {
      var details = booking.details || {};
      if (details.status !== 'confirmed' || details.deviceId !== deviceId) return false;

      var existingStart = Date.parse(details.startUtc);
      var existingEnd = Date.parse(details.endUtc);
      if (!Number.isFinite(existingStart) || !Number.isFinite(existingEnd) || existingStart >= existingEnd) {
        throw new Error('Stored booking time data is invalid for vehicle ' + deviceId + '.');
      }

      return requestedStart < existingEnd && requestedEnd > existingStart;
    });
  }

  function filterBookings(bookings, filters) {
    filters = filters || {};
    var fromDate = filters.fromDate ? new Date(filters.fromDate + 'T00:00:00') : null;
    var toDate = filters.toDate ? new Date(filters.toDate + 'T00:00:00') : null;
    if ((fromDate && !Number.isFinite(fromDate.getTime())) ||
        (toDate && !Number.isFinite(toDate.getTime()))) {
      throw new Error('Invalid report date range.');
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

    var requester = String(filters.requester || '').trim().toLowerCase();
    return bookings.filter(function (booking) {
      var details = booking.details || {};
      var status = details.status === 'confirmed' || details.status === 'cancelled'
        ? details.status
        : 'unknown';
      if (filters.status && filters.status !== 'all' && status !== filters.status) return false;

      var deviceId = String(details.deviceId || details.deviceName || '');
      if (filters.deviceId && deviceId !== filters.deviceId) return false;
      if (requester && String(details.createdBy || '').toLowerCase().indexOf(requester) === -1) return false;

      if (fromTime !== null || toExclusive !== null) {
        var start = Date.parse(details.startUtc);
        var end = Date.parse(details.endUtc);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return false;
        if (fromTime !== null && end <= fromTime) return false;
        if (toExclusive !== null && start >= toExclusive) return false;
      }

      return true;
    });
  }

  function toLocalDateTimeInput(utcValue) {
    var date = new Date(utcValue);
    if (!Number.isFinite(date.getTime())) {
      throw new Error('Stored booking time is invalid.');
    }

    function pad(value) { return String(value).padStart(2, '0'); }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' +
      pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  return {
    filterBookings: filterBookings,
    hasConflict: hasConflict,
    toLocalDateTimeInput: toLocalDateTimeInput,
    toUtcInterval: toUtcInterval
  };
}));
