const assert = require('node:assert/strict');
const test = require('node:test');
const domain = require('../booking-domain');

test('allows bookings that start when an existing booking ends', () => {
  const bookings = [{
    details: {
      deviceId: 'vehicle-1',
      status: 'confirmed',
      startUtc: '2026-11-12T08:00:00.000Z',
      endUtc: '2026-11-12T09:00:00.000Z'
    }
  }];

  assert.equal(domain.hasConflict(bookings, 'vehicle-1', '2026-11-12T09:00:00.000Z', '2026-11-12T10:00:00.000Z'), false);
});

test('detects overlapping confirmed bookings for the same vehicle only', () => {
  const bookings = [
    {
      details: {
        deviceId: 'vehicle-1',
        status: 'confirmed',
        startUtc: '2026-11-12T08:00:00.000Z',
        endUtc: '2026-11-12T10:00:00.000Z'
      }
    },
    {
      details: {
        deviceId: 'vehicle-1',
        status: 'cancelled',
        startUtc: '2026-11-12T08:00:00.000Z',
        endUtc: '2026-11-12T10:00:00.000Z'
      }
    }
  ];

  assert.equal(domain.hasConflict(bookings, 'vehicle-1', '2026-11-12T09:00:00.000Z', '2026-11-12T11:00:00.000Z'), true);
  assert.equal(domain.hasConflict(bookings, 'vehicle-2', '2026-11-12T09:00:00.000Z', '2026-11-12T11:00:00.000Z'), false);
});

test('converts local form values to valid UTC intervals and rejects invalid intervals', () => {
  const start = '2026-11-12T08:30';
  const end = '2026-11-12T09:30';
  const interval = domain.toUtcInterval(start, end);

  assert.equal(interval.startUtc, new Date(start).toISOString());
  assert.equal(interval.endUtc, new Date(end).toISOString());
  assert.throws(() => domain.toUtcInterval(end, start), /must be after/);
  assert.throws(() => domain.toUtcInterval('', end), /required/);
});

test('filters history to bookings that overlap the selected local date range', () => {
  const startOfDay = new Date('2026-11-12T00:00:00');
  const nextDay = new Date('2026-11-13T00:00:00');
  const bookings = [
    {
      id: 'overlapping',
      details: {
        startUtc: new Date(startOfDay.getTime() - 60 * 60 * 1000).toISOString(),
        endUtc: new Date(startOfDay.getTime() + 60 * 60 * 1000).toISOString(),
        status: 'cancelled'
      }
    },
    {
      id: 'inside',
      details: {
        startUtc: new Date(startOfDay.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        endUtc: new Date(startOfDay.getTime() + 3 * 60 * 60 * 1000).toISOString(),
        status: 'confirmed'
      }
    },
    {
      id: 'ends-at-start',
      details: {
        startUtc: new Date(startOfDay.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        endUtc: startOfDay.toISOString(),
        status: 'confirmed'
      }
    },
    {
      id: 'starts-after-range',
      details: {
        startUtc: nextDay.toISOString(),
        endUtc: new Date(nextDay.getTime() + 60 * 60 * 1000).toISOString(),
        status: 'confirmed'
      }
    }
  ];

  const filtered = domain.filterBookings(bookings, {
    fromDate: '2026-11-12',
    toDate: '2026-11-12'
  });

  assert.deepEqual(filtered.map((booking) => booking.id), ['overlapping', 'inside']);
});

test('filters booking history by vehicle, status, and requester', () => {
  const bookings = [
    {
      id: 'matching',
      details: {
        deviceId: 'vehicle-1',
        status: 'confirmed',
        createdBy: 'Alice Smith'
      }
    },
    {
      id: 'wrong-status',
      details: {
        deviceId: 'vehicle-1',
        status: 'cancelled',
        createdBy: 'Alice Smith'
      }
    },
    {
      id: 'wrong-requester',
      details: {
        deviceId: 'vehicle-1',
        status: 'confirmed',
        createdBy: 'Bob Jones'
      }
    },
    {
      id: 'wrong-vehicle',
      details: {
        deviceId: 'vehicle-2',
        status: 'confirmed',
        createdBy: 'Alice Smith'
      }
    }
  ];

  const filtered = domain.filterBookings(bookings, {
    deviceId: 'vehicle-1',
    status: 'confirmed',
    requester: 'alice'
  });

  assert.deepEqual(filtered.map((booking) => booking.id), ['matching']);
});

test('rejects a report date range whose end precedes its start', () => {
  assert.throws(() => domain.filterBookings([], {
    fromDate: '2026-11-13',
    toDate: '2026-11-12'
  }), /on or after/);
});
