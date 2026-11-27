(function (root) {
  'use strict';

  var ADDIN_ID = 'ai5fRp8iC8N8GSxWdIg7PTw';

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

  async function resolveDriverIdentity(api, userName) {
    var fallbackLogin = String(userName || '').trim();
    var fallback = {
      id: '',
      login: fallbackLogin,
      firstName: '',
      lastName: '',
      fullName: fallbackLogin,
      isDriver: null
    };
    if (!api || !fallbackLogin) return fallback;

    try {
      var users = await apiCall(api, 'Get', {
        typeName: 'User',
        search: { name: fallbackLogin }
      });
      var list = Array.isArray(users) ? users : [];
      var matched = list.find(function (item) {
        return item && String(item.name || '').toLowerCase() === fallbackLogin.toLowerCase();
      }) || list[0] || null;
      if (!matched) return fallback;

      var normalized = normalizeUser(matched);
      var fullName = [normalized.firstName, normalized.lastName].filter(Boolean).join(' ').trim();
      return {
        id: normalized.id || '',
        login: normalized.login || fallbackLogin,
        firstName: normalized.firstName,
        lastName: normalized.lastName,
        fullName: fullName || normalized.login || fallbackLogin,
        isDriver: normalized.isDriver
      };
    } catch (error) {
      return fallback;
    }
  }

  function sendDriverTextMessage(api, params) {
    params = params || {};
    var driverId = String(params.driverId || '').trim();
    var message = String(params.message || '').trim();
    if (!api || !driverId || !message) {
      return Promise.reject(new Error('Driver ID and notification message are required.'));
    }

    var entity = {
      recipient: { id: driverId },
      isDirectionToVehicle: true,
      activeFrom: new Date().toISOString(),
      messageContent: {
        contentType: 'Normal',
        message: message
      }
    };
    if (params.senderUserId) {
      entity.user = { id: String(params.senderUserId) };
    }

    return apiCall(api, 'Add', {
      typeName: 'TextMessage',
      entity: entity
    });
  }

  async function notifyDriverBestEffort(api, params) {
    params = params || {};
    if (!api || !params.driverId || !params.message) {
      return { sent: false, skipped: true, error: null };
    }
    try {
      await sendDriverTextMessage(api, params);
      return { sent: true, skipped: false, error: null };
    } catch (error) {
      return { sent: false, skipped: false, error: error };
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
    notifyDriverBestEffort: notifyDriverBestEffort,
    resolveCurrentUserClearance: resolveCurrentUserClearance,
    resolveDriverIdentity: resolveDriverIdentity,
    sendDriverTextMessage: sendDriverTextMessage,
    updateBookingRecord: updateBookingRecord
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
