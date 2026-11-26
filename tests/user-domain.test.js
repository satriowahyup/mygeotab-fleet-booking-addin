const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const userDomain = require('../js/domain/user-domain');

test('normalizes all built-in technical security clearance names to MyGeotab UI labels', () => {
  const builtInClearances = [
    ['GroupEverythingSecurityId', '**EverythingSecurity**', 'Administrator'],
    ['GroupSupervisorSecurityId', '**SupervisorSecurity**', 'Supervisor'],
    ['GroupDefaultSecurityId', '**DefaultSecurity**', 'Default user'],
    ['GroupDriveUserSecurityId', '**DriveUserSecurity**', 'Drive App user'],
    ['GroupViewOnlySecurityId', '**ViewOnlySecurity**', 'View only'],
    ['GroupNothingSecurityId', '**NothingSecurity**', 'Nothing']
  ];

  for (const [id, name, expected] of builtInClearances) {
    assert.equal(
      userDomain.getUserClearanceLabel({ securityGroups: [{ id }] }, { [id]: name }, true),
      expected
    );
  }
});

test('preserves custom clearance names and distinguishes unmapped vs unavailable clearances', () => {
  assert.equal(
    userDomain.getUserClearanceLabel(
      { securityGroups: [{ id: 'custom-id' }] },
      { 'custom-id': 'Regional Fleet Approver' },
      true
    ),
    'Regional Fleet Approver'
  );
  assert.equal(
    userDomain.getUserClearanceLabel({ securityGroups: [{ id: 'custom-id' }] }, {}, true),
    'Unmapped clearance'
  );
  assert.equal(
    userDomain.getUserClearanceLabel({ securityGroups: [{ id: 'custom-id' }] }, {}, false),
    'Not available'
  );
  assert.equal(
    userDomain.getUserClearanceLabel({ securityGroups: [] }, {}, true),
    'Not available'
  );
});

test('identifies Administrator clearance and fails closed when group lookup did not succeed', () => {
  const adminUser = { securityGroups: [{ id: 'GroupEverythingSecurityId' }] };
  const supervisorUser = { securityGroups: [{ id: 'GroupSupervisorSecurityId' }] };
  const driveUser = { securityGroups: [{ id: 'GroupDriveUserSecurityId' }] };
  const groupNames = {
    GroupEverythingSecurityId: '**EverythingSecurity**',
    GroupSupervisorSecurityId: '**SupervisorSecurity**',
    GroupDriveUserSecurityId: '**DriveUserSecurity**'
  };

  assert.equal(userDomain.isAdministrator(adminUser, groupNames, true), true);
  assert.equal(userDomain.isAdministrator(supervisorUser, groupNames, true), false);
  assert.equal(userDomain.isAdministrator(driveUser, groupNames, true), false);

  // Fail-closed checks
  assert.equal(userDomain.isAdministrator(adminUser, groupNames, false), false);
  assert.equal(userDomain.isAdministrator(null, groupNames, true), false);
  assert.equal(userDomain.isAdministrator({ securityGroups: [] }, groupNames, true), false);
});

test('returns only active Driver accounts sorted by full name', () => {
  const now = Date.parse('2026-11-25T12:00:00.000Z');
  const users = [
    {
      id: 'u1',
      firstName: 'Andri',
      lastName: 'Setiyawan',
      login: 'andri@opexcg.com',
      isDriver: true,
      activeFrom: '2025-01-01T00:00:00.000Z',
      activeTo: '2050-01-01T00:00:00.000Z'
    },
    {
      id: 'u2',
      firstName: 'Akun',
      lastName: 'Dummy',
      login: 'dummy.geotab@gmail.com',
      isDriver: true,
      activeFrom: '2025-01-01T00:00:00.000Z',
      activeTo: '2050-01-01T00:00:00.000Z'
    },
    {
      id: 'u3',
      firstName: 'Inactive',
      lastName: 'Driver',
      login: 'inactive@opexcg.com',
      isDriver: true,
      activeFrom: '2024-01-01T00:00:00.000Z',
      activeTo: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'u4',
      firstName: 'Heppy',
      lastName: '',
      login: 'heppy@opexcg.com',
      isDriver: false,
      activeFrom: '2025-01-01T00:00:00.000Z',
      activeTo: '2050-01-01T00:00:00.000Z'
    },
    {
      id: 'u5',
      firstName: 'Future',
      lastName: 'Driver',
      login: 'future@opexcg.com',
      isDriver: true,
      activeFrom: '2027-01-01T00:00:00.000Z',
      activeTo: '2050-01-01T00:00:00.000Z'
    }
  ];

  const activeDrivers = userDomain.getActiveDrivers(users, now);
  assert.deepEqual(activeDrivers.map((u) => u.id), ['u2', 'u1']);
});

test('geotab-api service preserves ADDIN_ID and queries GroupSecurityId', () => {
  const apiSource = fs.readFileSync(path.resolve(__dirname, '../js/services/geotab-api.js'), 'utf8');
  assert.match(apiSource, /ADDIN_ID\s*=\s*'U8LviU9x8j93HrLBQUHL8bB'/);
  assert.match(apiSource, /typeName:\s*'Group',[\s\S]*?search:\s*\{\s*id:\s*'GroupSecurityId'\s*\}/);
});

