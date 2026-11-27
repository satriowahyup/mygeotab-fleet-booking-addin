const assert = require('node:assert/strict');
const test = require('node:test');

const driverDomain = require('../js/domain/driver-schedule-domain');
const formatters = require('../js/ui/formatters');

function makeBooking(id, overrides) {
  return {
    id: id,
    details: Object.assign({
      bookingKey: 'key-' + id,
      status: 'approved',
      startUtc: '2026-11-27T09:00:00.000Z',
      endUtc: '2026-11-27T11:00:00.000Z',
      purpose: 'Client meeting',
      destination: 'Cikarang',
      createdBy: 'requester@company.com',
      deviceId: 'dev-1',
      deviceName: 'Avanza B 1234 XY',
      driverId: 'drv-1',
      driverName: 'Andi Driver',
      driverLogin: 'andi@company.com',
      approvalNotes: '',
      cancellationReason: ''
    }, overrides)
  };
}

test('matches assigned driver by driverId or case-insensitive driverLogin', () => {
  const booking = makeBooking('1');

  assert.equal(driverDomain.isAssignedToDriver(booking.details, { id: 'drv-1', login: '' }), true);
  assert.equal(driverDomain.isAssignedToDriver(booking.details, { id: '', login: 'ANDI@COMPANY.COM' }), true);
  assert.equal(driverDomain.isAssignedToDriver(booking.details, { id: 'drv-2', login: 'other@company.com' }), false);
  assert.equal(driverDomain.isAssignedToDriver(booking.details, {}), false);
});

test('filters upcoming (ongoing + future) schedules by default and keeps cancelled visible', () => {
  const now = new Date(2026, 10, 27, 10, 0, 0); // 2026-11-27 10:00 local
  const bookings = [
    makeBooking('past', {
      startUtc: new Date(2026, 10, 26, 8, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 26, 10, 0, 0).toISOString()
    }),
    makeBooking('ongoing', {
      startUtc: new Date(2026, 10, 27, 9, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 27, 11, 0, 0).toISOString()
    }),
    makeBooking('future-cancelled', {
      status: 'cancelled',
      startUtc: new Date(2026, 10, 27, 13, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 27, 15, 0, 0).toISOString(),
      cancelledBy: 'admin@company.com',
      cancellationReason: 'Trip postponed'
    }),
    makeBooking('future-approved', {
      startUtc: new Date(2026, 10, 28, 9, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 28, 11, 0, 0).toISOString()
    }),
    makeBooking('pending-ignored', {
      status: 'pending',
      startUtc: new Date(2026, 10, 27, 12, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 27, 14, 0, 0).toISOString()
    }),
    makeBooking('other-driver', {
      driverId: 'drv-9',
      driverLogin: 'budi@company.com',
      startUtc: new Date(2026, 10, 27, 12, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 27, 14, 0, 0).toISOString()
    })
  ];

  const identity = { id: 'drv-1', login: 'andi@company.com' };
  const result = driverDomain.filterDriverSchedules(bookings, identity, {
    preset: 'upcoming',
    statusFilter: 'all'
  }, now);

  assert.deepEqual(result.map((r) => r.id), ['ongoing', 'future-cancelled', 'future-approved']);
});

test('supports today, custom date range, and status filters with validation', () => {
  const now = new Date(2026, 10, 27, 10, 0, 0);
  const bookings = [
    makeBooking('today-done', {
      startUtc: new Date(2026, 10, 27, 7, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 27, 9, 0, 0).toISOString()
    }),
    makeBooking('today-cancelled', {
      status: 'cancelled',
      startUtc: new Date(2026, 10, 27, 14, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 27, 16, 0, 0).toISOString()
    }),
    makeBooking('next-month', {
      startUtc: new Date(2026, 11, 5, 9, 0, 0).toISOString(),
      endUtc: new Date(2026, 11, 5, 11, 0, 0).toISOString()
    })
  ];
  const identity = { id: 'drv-1', login: 'andi@company.com' };

  const todayAll = driverDomain.filterDriverSchedules(bookings, identity, {
    preset: 'today',
    statusFilter: 'all'
  }, now);
  assert.deepEqual(todayAll.map((r) => r.id), ['today-done', 'today-cancelled']);

  const todayCancelledOnly = driverDomain.filterDriverSchedules(bookings, identity, {
    preset: 'today',
    statusFilter: 'cancelled'
  }, now);
  assert.deepEqual(todayCancelledOnly.map((r) => r.id), ['today-cancelled']);

  const customRange = driverDomain.filterDriverSchedules(bookings, identity, {
    preset: 'custom',
    fromDate: '2026-12-01',
    toDate: '2026-12-10',
    statusFilter: 'approved'
  }, now);
  assert.deepEqual(customRange.map((r) => r.id), ['next-month']);

  assert.throws(() => {
    driverDomain.filterDriverSchedules(bookings, identity, {
      preset: 'custom',
      fromDate: '2026-12-10',
      toDate: '2026-12-01'
    }, now);
  }, /End date must be on or after start date/);
});

test('classifies schedule time states, prioritizes ongoing trips, and summarizes counts', () => {
  const now = new Date(2026, 10, 27, 10, 0, 0).getTime();
  const records = [
    makeBooking('completed', {
      startUtc: new Date(2026, 10, 27, 7, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 27, 9, 0, 0).toISOString()
    }),
    makeBooking('upcoming', {
      startUtc: new Date(2026, 10, 28, 9, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 28, 11, 0, 0).toISOString()
    }),
    makeBooking('ongoing', {
      startUtc: new Date(2026, 10, 27, 9, 30, 0).toISOString(),
      endUtc: new Date(2026, 10, 27, 11, 30, 0).toISOString()
    }),
    makeBooking('cancelled', {
      status: 'cancelled',
      startUtc: new Date(2026, 10, 29, 9, 0, 0).toISOString(),
      endUtc: new Date(2026, 10, 29, 10, 0, 0).toISOString()
    })
  ];

  assert.equal(driverDomain.getScheduleTimeState(records[0].details, now), 'completed');
  assert.equal(driverDomain.getScheduleTimeState(records[1].details, now), 'upcoming');
  assert.equal(driverDomain.getScheduleTimeState(records[2].details, now), 'ongoing');
  assert.equal(driverDomain.getScheduleTimeState(records[3].details, now), 'cancelled');

  const sortedAll = driverDomain.sortDriverSchedules(records, 'all', now);
  assert.equal(sortedAll[0].id, 'ongoing');
  assert.equal(sortedAll[1].id, 'cancelled');

  const summary = driverDomain.summarizeDriverSchedules(records, now);
  assert.deepEqual(summary, {
    total: 4,
    ongoing: 1,
    upcoming: 1,
    completed: 1,
    cancelled: 1
  });
});

test('formats assignment and cancellation TextMessage notification texts', () => {
  const details = makeBooking('notif', {
    approvalNotes: 'Pick up at Lobby B',
    cancelledBy: 'admin@company.com',
    cancellationReason: 'Customer rescheduled'
  }).details;

  const assignMsg = driverDomain.buildAssignmentNotificationText(details, formatters);
  assert.match(assignMsg, /^\[New Schedule\]/);
  assert.match(assignMsg, /Vehicle: Avanza B 1234 XY/);
  assert.match(assignMsg, /Destination: Cikarang/);
  assert.match(assignMsg, /Purpose: Client meeting/);
  assert.match(assignMsg, /Requester: requester@company\.com/);
  assert.match(assignMsg, /Note: Pick up at Lobby B/);

  const cancelMsg = driverDomain.buildCancellationNotificationText(details, formatters);
  assert.match(cancelMsg, /^\[Schedule Cancelled\]/);
  assert.match(cancelMsg, /Vehicle: Avanza B 1234 XY/);
  assert.match(cancelMsg, /Cancelled by: admin@company\.com/);
  assert.match(cancelMsg, /Reason: Customer rescheduled/);
});
