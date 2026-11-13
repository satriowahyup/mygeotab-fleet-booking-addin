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

test('keeps unknown security group IDs distinguishable from missing clearance', () => {
  assert.equal(getClearanceLabel({ securityGroups: [{ id: 'custom-clearance-id' }] }, []), 'Unmapped clearance');
  assert.equal(getClearanceLabel({ securityGroups: [] }, []), 'Not available');
});

test('queries only MyGeotab security-clearance groups for name resolution', () => {
  assert.match(html, /typeName: 'Group',[\s\S]*?search: \{ id: 'GroupSecurityId' \}/);
});
