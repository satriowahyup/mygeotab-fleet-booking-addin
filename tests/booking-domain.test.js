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
  assert.throws(() => domain.toUtcInterval(end, start), /harus setelah/);
  assert.throws(() => domain.toUtcInterval('', end), /wajib diisi/);
});
