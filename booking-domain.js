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
      throw new Error('Waktu mulai dan selesai wajib diisi.');
    }

    var start = new Date(startLocal);
    var end = new Date(endLocal);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new Error('Format waktu tidak valid.');
    }
    if (start.getTime() >= end.getTime()) {
      throw new Error('Waktu selesai harus setelah waktu mulai.');
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
      throw new Error('Rentang waktu booking tidak valid.');
    }

    return bookings.some(function (booking) {
      var details = booking.details || {};
      if (details.status !== 'confirmed' || details.deviceId !== deviceId) return false;

      var existingStart = Date.parse(details.startUtc);
      var existingEnd = Date.parse(details.endUtc);
      if (!Number.isFinite(existingStart) || !Number.isFinite(existingEnd) || existingStart >= existingEnd) {
        throw new Error('Data waktu booking tersimpan tidak valid untuk kendaraan ' + deviceId + '.');
      }

      return requestedStart < existingEnd && requestedEnd > existingStart;
    });
  }

  function toLocalDateTimeInput(utcValue) {
    var date = new Date(utcValue);
    if (!Number.isFinite(date.getTime())) {
      throw new Error('Waktu booking tersimpan tidak valid.');
    }

    function pad(value) { return String(value).padStart(2, '0'); }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' +
      pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function isValidDeviceIdConfiguration(deviceIds) {
    if (!Array.isArray(deviceIds) || deviceIds.length < 1 || deviceIds.length > 5) return false;
    return deviceIds.every(function (id, index, ids) {
      return typeof id === 'string' &&
        id.length > 0 &&
        id.trim() === id &&
        id.indexOf('REPLACE_WITH_') !== 0 &&
        ids.indexOf(id) === index;
    });
  }

  return {
    hasConflict: hasConflict,
    isValidDeviceIdConfiguration: isValidDeviceIdConfiguration,
    toLocalDateTimeInput: toLocalDateTimeInput,
    toUtcInterval: toUtcInterval
  };
}));
