const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../fleet-summary.html'), 'utf8');

function getClearanceLabel(user, groups) {
  const helperStart = html.indexOf('      function getUserClearanceLabel');
  const helperEnd = html.indexOf('      function getUserStatus', helperStart);
  const context = {
    securityGroupNames: Object.fromEntries(groups.map((group) => [group.id, group.name])),
    securityGroupsLoaded: true
  };
  vm.runInNewContext(html.slice(helperStart, helperEnd), context);
  return context.getUserClearanceLabel(user);
}

test('resolves a user security group to the matching clearance name', () => {
  const user = { securityGroups: [{ id: 'GroupEverythingSecurityId' }] };
  const clearanceGroups = [{ id: 'GroupEverythingSecurityId', name: 'Administrator' }];

  assert.equal(getClearanceLabel(user, clearanceGroups), 'Administrator');
});

test('normalizes the built-in EverythingSecurity technical name to Administrator', () => {
  const user = { securityGroups: [{ id: 'GroupEverythingSecurityId' }] };
  const clearanceGroups = [{ id: 'GroupEverythingSecurityId', name: '**EverythingSecurity**' }];

  assert.equal(getClearanceLabel(user, clearanceGroups), 'Administrator');
});

test('normalizes all built-in technical names to their MyGeotab UI labels', () => {
  const builtInClearances = [
    ['GroupEverythingSecurityId', '**EverythingSecurity**', 'Administrator'],
    ['GroupSupervisorSecurityId', '**SupervisorSecurity**', 'Supervisor'],
    ['GroupDefaultSecurityId', '**DefaultSecurity**', 'Default user'],
    ['GroupDriveUserSecurityId', '**DriveUserSecurity**', 'Drive App user'],
    ['GroupViewOnlySecurityId', '**ViewOnlySecurity**', 'View only'],
    ['GroupNothingSecurityId', '**NothingSecurity**', 'Nothing']
  ];

  for (const [id, name, expected] of builtInClearances) {
    assert.equal(getClearanceLabel({ securityGroups: [{ id }] }, [{ id, name }]), expected);
  }
});

test('preserves names for custom clearances', () => {
  const customGroup = { id: 'custom-clearance-id', name: 'Regional Fleet Approver' };

  assert.equal(getClearanceLabel({ securityGroups: [{ id: customGroup.id }] }, [customGroup]), customGroup.name);
});

test('keeps unknown security group IDs distinguishable from missing clearance', () => {
  assert.equal(getClearanceLabel({ securityGroups: [{ id: 'custom-clearance-id' }] }, []), 'Unmapped clearance');
  assert.equal(getClearanceLabel({ securityGroups: [] }, []), 'Not available');
});

test('queries only MyGeotab security-clearance groups for name resolution', () => {
  assert.match(html, /typeName: 'Group',[\s\S]*?search: \{ id: 'GroupSecurityId' \}/);
});
