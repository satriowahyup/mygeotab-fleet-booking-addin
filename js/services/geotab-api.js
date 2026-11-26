(function (root) {
  'use strict';

  var ADDIN_ID = 'U8LviU9x8j93HrLBQUHL8bB';

  function apiCall(api, method, parameters) {
    return new Promise(function (resolve, reject) {
      api.call(method, parameters, resolve, reject);
    });
  }

  function getSession(api) {
    return new Promise(function (resolve, reject) {
      try {
        api.getSession(resolve);
      } catch (error) {
        reject(error);
      }
    });
  }

  function normalizeRecords(records) {
    return (Array.isArray(records) ? records : []).map(function (record) {
      var details = record.details;
      if (typeof details === 'string') {
        try {
          details = JSON.parse(details);
        } catch (error) {
          throw new Error('Unable to read AddInData booking data for record ' + record.id + '.');
        }
      }
      if (!details || typeof details !== 'object') {
        throw new Error('AddInData record ' + record.id + ' has invalid details.');
      }
      return {
        id: record.id,
        groups: record.groups || [],
        details: details
      };
    });
  }

  function normalizeUser(user) {
    return {
      id: user.id,
      login: String(user.name || ''),
      firstName: String(user.firstName || ''),
      lastName: String(user.lastName || ''),
      userRole: user.userRole || null,
      customUserRole: String(user.customUserRole || '').trim(),
      securityGroups: Array.isArray(user.securityGroups) ? user.securityGroups.slice() : [],
      activeFrom: user.activeFrom || '',
      activeTo: user.activeTo || '',
      isDriver: user.isDriver === true
    };
  }

  function buildSecurityGroupMap(groups) {
    var map = {};
    if (Array.isArray(groups)) {
      groups.forEach(function (group) {
        if (group && group.id && group.name) {
          map[group.id] = String(group.name);
        }
      });
    }
    return map;
  }

  function getDevices(api) {
    return apiCall(api, 'Get', { typeName: 'Device' }).then(function (devices) {
      return (Array.isArray(devices) ? devices : []).filter(function (device) {
        return Boolean(device && device.id);
      });
    });
  }

  function getBookingRecords(api) {
    return apiCall(api, 'Get', {
      typeName: 'AddInData',
      search: { addinId: ADDIN_ID }
    }).then(normalizeRecords);
  }

  function addBookingRecord(api, details) {
    return apiCall(api, 'Add', {
      typeName: 'AddInData',
      entity: { addInId: ADDIN_ID, details: details }
    });
  }

  function updateBookingRecord(api, record, details) {
    return apiCall(api, 'Set', {
      typeName: 'AddInData',
      entity: {
        addInId: ADDIN_ID,
        id: record.id,
        groups: record.groups || [],
        details: details
      }
    });
  }

  function getSecurityGroups(api) {
    return apiCall(api, 'Get', {
      typeName: 'Group',
      search: { id: 'GroupSecurityId' }
    });
  }

  async function getUsersDirectory(api) {
    var results = await Promise.all([
      apiCall(api, 'Get', { typeName: 'User' }),
      getSecurityGroups(api).catch(function () { return null; })
    ]);
    var securityGroupsLoaded = Array.isArray(results[1]);
    var securityGroupNames = buildSecurityGroupMap(results[1]);
    var users = (Array.isArray(results[0]) ? results[0] : []).filter(function (user) {
      return Boolean(user && user.id);
    }).map(normalizeUser);

    return {
      users: users,
      securityGroupNames: securityGroupNames,
      securityGroupsLoaded: securityGroupsLoaded
    };
  }

  async function resolveCurrentUserClearance(api, userName, userDomain) {
    if (!api || !userName) {
      return {
        user: null,
        securityGroupNames: {},
        securityGroupsLoaded: false,
        isAdministrator: false
      };
    }

    try {
      var results = await Promise.all([
        apiCall(api, 'Get', {
          typeName: 'User',
          search: { name: userName }
        }),
        getSecurityGroups(api)
      ]);
      var users = Array.isArray(results[0]) ? results[0] : [];
      var matched = users.find(function (item) {
        return item && String(item.name || '').toLowerCase() === String(userName).toLowerCase();
      }) || users[0] || null;

      var normalizedUser = matched ? normalizeUser(matched) : null;
      var securityGroupsLoaded = Array.isArray(results[1]);
      var securityGroupNames = buildSecurityGroupMap(results[1]);
      var isAdmin = userDomain.isAdministrator(normalizedUser, securityGroupNames, securityGroupsLoaded);

      return {
        user: normalizedUser,
        securityGroupNames: securityGroupNames,
        securityGroupsLoaded: securityGroupsLoaded,
        isAdministrator: isAdmin
      };
    } catch (error) {
      return {
        user: null,
        securityGroupNames: {},
        securityGroupsLoaded: false,
        isAdministrator: false
      };
    }
  }

  function createBookingKey() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.GeotabApi = {
    ADDIN_ID: ADDIN_ID,
    addBookingRecord: addBookingRecord,
    apiCall: apiCall,
    createBookingKey: createBookingKey,
    getBookingRecords: getBookingRecords,
    getDevices: getDevices,
    getSecurityGroups: getSecurityGroups,
    getSession: getSession,
    getUsersDirectory: getUsersDirectory,
    normalizeRecords: normalizeRecords,
    normalizeUser: normalizeUser,
    resolveCurrentUserClearance: resolveCurrentUserClearance,
    updateBookingRecord: updateBookingRecord
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
