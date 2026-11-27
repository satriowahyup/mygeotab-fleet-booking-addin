(function (root) {
  'use strict';

  function createApprovalView(deps) {
    var domain = deps.bookingDomain;
    var driverDomain = deps.driverScheduleDomain;
    var userDomain = deps.userDomain;
    var apiService = deps.apiService;
    var fmt = deps.formatters;
    var reviewFormBuilder = deps.reviewFormBuilder;
    var state = deps.state;
    var onDataChanged = deps.onDataChanged;
    var onRefreshDrivers = deps.onRefreshDrivers;

    var workspace = document.getElementById('approvalWorkspace');
    var restrictedNotice = document.getElementById('approvalRestrictedNotice');
    var statusBanner = document.getElementById('approvalStatusBanner');
    var statusFilter = document.getElementById('approvalStatusFilter');
    var refreshButton = document.getElementById('refreshApprovalButton');
    var approvalList = document.getElementById('approvalList');

    var reviewingRecordId = null;
    var isSubmitting = false;

    function setBanner(message, isError) {
      statusBanner.textContent = message;
      statusBanner.setAttribute('data-error', isError ? 'true' : 'false');
    }

    function notifyDriver(details, eventType) {
      if (!driverDomain || !details || !details.driverId || !apiService.notifyDriverBestEffort) {
        return Promise.resolve({ sent: false, skipped: true, error: null });
      }
      var text = eventType === 'cancel'
        ? driverDomain.buildCancellationNotificationText(details, fmt)
        : driverDomain.buildAssignmentNotificationText(details, fmt);
      return apiService.notifyDriverBestEffort(state.api, {
        driverId: details.driverId,
        senderUserId: state.currentUser && state.currentUser.id,
        message: text
      });
    }

    function getActiveDevices() {
      return state.devices.filter(fmt.isDeviceActive).sort(function (first, second) {
        return String(first.name || first.id).localeCompare(String(second.name || second.id));
      });
    }

    function buildCard(record) {
      var details = record.details || {};
      var status = domain.normalizeStatus(details.status);
      var card = document.createElement('article');
      card.className = 'approval-card';

      var top = document.createElement('div');
      top.className = 'approval-card-top';

      var info = document.createElement('div');
      info.className = 'booking-details';

      var headerRow = document.createElement('div');
      headerRow.className = 'booking-header-row';
      var title = document.createElement('p');
      title.className = 'booking-title';
      title.textContent = details.destination || details.purpose || 'Booking request';
      headerRow.appendChild(title);
      headerRow.appendChild(fmt.createStatusBadge(status));
      info.appendChild(headerRow);

      var purposeLine = document.createElement('p');
      purposeLine.className = 'booking-purpose';
      purposeLine.textContent = 'Purpose: ' + (details.purpose || 'Not specified');
      info.appendChild(purposeLine);

      top.appendChild(info);

      if (status === 'pending' || domain.canAdminCancel(details, state.isAdministrator)) {
        var actions = document.createElement('div');
        actions.className = 'booking-actions';
        var actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        var isOpen = String(reviewingRecordId) === String(record.id);
        if (status === 'pending') {
          actionBtn.className = isOpen ? 'secondary' : '';
          actionBtn.textContent = isOpen ? 'Close review' : 'Review';
        } else {
          actionBtn.className = isOpen ? 'secondary' : 'fm-btn-reject';
          actionBtn.textContent = isOpen ? 'Close' : 'Cancel booking';
        }
        actionBtn.setAttribute('data-toggle-review', record.id);
        actionBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        actions.appendChild(actionBtn);
        top.appendChild(actions);
      }

      card.appendChild(top);
      card.appendChild(reviewFormBuilder.buildTripSummaryGrid({
        details: details,
        users: state.users,
        userDomain: userDomain,
        formatters: fmt
      }));

      if (status === 'approved' || status === 'confirmed') {
        var assignmentMeta = document.createElement('p');
        assignmentMeta.className = 'booking-meta';
        assignmentMeta.textContent = 'Assigned vehicle: ' + fmt.resolveDeviceName(details, state.devices) +
          ' | Driver: ' + (details.driverName || details.driverLogin || 'Unassigned') +
          (details.reviewedBy ? ' | Approved by: ' + details.reviewedBy : '');
        card.appendChild(assignmentMeta);
      } else if (status === 'rejected' && details.reviewedBy) {
        var rejectedMeta = document.createElement('p');
        rejectedMeta.className = 'booking-meta';
        rejectedMeta.textContent = 'Rejected by: ' + details.reviewedBy +
          (details.reviewedAtUtc ? ' on ' + fmt.formatDate(details.reviewedAtUtc) : '');
        card.appendChild(rejectedMeta);
      } else if (status === 'cancelled' && details.cancelledBy) {
        var cancelledMeta = document.createElement('p');
        cancelledMeta.className = 'booking-meta';
        cancelledMeta.textContent = 'Cancelled by: ' + details.cancelledBy +
          (details.cancelledAtUtc ? ' on ' + fmt.formatDate(details.cancelledAtUtc) : '');
        card.appendChild(cancelledMeta);
      }

      if (details.approvalNotes) {
        var notes = document.createElement('p');
        notes.className = status === 'rejected'
          ? 'notes-callout notes-callout-rejected'
          : 'notes-callout';
        notes.textContent = (status === 'rejected' ? 'Rejection reason: ' : 'Notes: ') + details.approvalNotes;
        card.appendChild(notes);
      }

      if (status === 'cancelled' && details.cancellationReason) {
        var cancelNotes = document.createElement('p');
        cancelNotes.className = 'notes-callout notes-callout-rejected';
        cancelNotes.textContent = 'Cancellation reason: ' + details.cancellationReason;
        card.appendChild(cancelNotes);
      }

      if (String(reviewingRecordId) === String(record.id)) {
        if (status === 'pending') {
          var conflicts = domain.getConflictingResources(
            state.bookings,
            details.startUtc,
            details.endUtc,
            record.id
          );
          card.appendChild(reviewFormBuilder.build({
            record: record,
            conflicts: conflicts,
            activeDevices: getActiveDevices(),
            activeDrivers: userDomain.getActiveDrivers(state.users),
            usersLoadState: state.usersLoadState,
            userDomain: userDomain,
            formatters: fmt,
            isSubmitting: isSubmitting
          }));
        } else if (domain.canAdminCancel(details, state.isAdministrator)) {
          card.appendChild(reviewFormBuilder.buildCancelForm({
            record: record,
            isSubmitting: isSubmitting
          }));
        }
      }

      return card;
    }

    function render() {
      if (!state.isAdministrator) {
        workspace.hidden = true;
        restrictedNotice.hidden = false;
        return;
      }

      workspace.hidden = false;
      restrictedNotice.hidden = true;

      var filterValue = statusFilter.value || 'pending';
      var items = domain.filterApprovalQueue(state.bookings, filterValue).slice();
      items.sort(function (first, second) {
        var firstStart = Date.parse(first.details && first.details.startUtc);
        var secondStart = Date.parse(second.details && second.details.startUtc);
        return filterValue === 'pending' ? firstStart - secondStart : secondStart - firstStart;
      });

      var pendingTotal = domain.filterApprovalQueue(state.bookings, 'pending').length;
      if (!statusBanner.getAttribute('data-sticky')) {
        setBanner(
          pendingTotal === 0
            ? 'No pending booking requests right now.'
            : pendingTotal + (pendingTotal === 1 ? ' pending booking request' : ' pending booking requests') +
              ' awaiting administrator review.',
          false
        );
      }

      approvalList.textContent = '';
      if (items.length === 0) {
        approvalList.appendChild(fmt.createEmptyBlock(
          filterValue === 'pending'
            ? 'All caught up. There are no pending bookings to review.'
            : 'No bookings match the selected approval status.'
        ));
        return;
      }

      items.forEach(function (record) {
        approvalList.appendChild(buildCard(record));
      });
    }

    async function handleReviewSubmit(form) {
      if (!state.isAdministrator || isSubmitting) return;

      var recordId = form.getAttribute('data-review-form');
      var inlineError = form.querySelector('.approval-inline-error');
      var decisionRadio = form.querySelector('input[name="decision"]:checked');
      var deviceSelect = form.querySelector('select[name="deviceId"]');
      var driverSelect = form.querySelector('select[name="driverId"]');
      var notesInput = form.querySelector('textarea[name="approvalNotes"]');
      var submitBtn = form.querySelector('[data-review-submit]');

      inlineError.hidden = true;
      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;

      try {
        var validated = domain.validateApprovalDecision({
          decision: decisionRadio ? decisionRadio.value : '',
          deviceId: deviceSelect ? deviceSelect.value : '',
          driverId: driverSelect ? driverSelect.value : '',
          approvalNotes: notesInput ? notesInput.value : ''
        });

        var freshRecords = await apiService.getBookingRecords(state.api);
        var targetRecord = freshRecords.find(function (item) {
          return String(item.id) === String(recordId);
        });
        if (!targetRecord || domain.normalizeStatus(targetRecord.details.status) !== 'pending') {
          throw new Error('This booking is no longer pending. Refresh the queue to see the latest status.');
        }

        var now = new Date().toISOString();
        var updatedDetails;
        var assignedDevice = null;
        var assignedDriver = null;

        if (validated.decision === 'approve') {
          assignedDevice = getActiveDevices().find(function (item) {
            return String(item.id) === validated.deviceId;
          });
          if (!assignedDevice) {
            throw new Error('Selected vehicle is not active or unavailable.');
          }

          assignedDriver = userDomain.getActiveDrivers(state.users).find(function (item) {
            return String(item.id) === validated.driverId;
          });
          if (!assignedDriver) {
            throw new Error('Selected driver is not an active driver account.');
          }

          if (domain.hasVehicleConflict(
            freshRecords,
            assignedDevice.id,
            targetRecord.details.startUtc,
            targetRecord.details.endUtc,
            targetRecord.id
          )) {
            throw new Error('Selected vehicle already has an approved booking in this time range.');
          }

          if (domain.hasDriverConflict(
            freshRecords,
            assignedDriver.id,
            targetRecord.details.startUtc,
            targetRecord.details.endUtc,
            targetRecord.id
          )) {
            throw new Error('Selected driver is already assigned to another approved booking in this time range.');
          }

          updatedDetails = Object.assign({}, targetRecord.details, {
            status: 'approved',
            deviceId: assignedDevice.id,
            deviceName: assignedDevice.name || assignedDevice.id,
            driverId: assignedDriver.id,
            driverName: userDomain.getUserFullName(assignedDriver),
            driverLogin: assignedDriver.login || '',
            approvalNotes: validated.approvalNotes,
            reviewedBy: state.currentUserName,
            reviewedAtUtc: now,
            updatedAtUtc: now
          });
        } else {
          updatedDetails = Object.assign({}, targetRecord.details, {
            status: 'rejected',
            deviceId: null,
            deviceName: null,
            driverId: null,
            driverName: null,
            driverLogin: null,
            approvalNotes: validated.approvalNotes,
            reviewedBy: state.currentUserName,
            reviewedAtUtc: now,
            updatedAtUtc: now
          });
        }

        await apiService.updateBookingRecord(state.api, targetRecord, updatedDetails);
        reviewingRecordId = null;
        statusBanner.setAttribute('data-sticky', 'true');

        var refreshed = await onDataChanged(true);
        if (!refreshed) {
          setBanner('Decision saved, but the queue could not be refreshed. Reload to verify.', true);
          return;
        }

        if (validated.decision === 'approve') {
          var vehicleConcurrent = domain.hasVehicleConflict(
            refreshed,
            assignedDevice.id,
            updatedDetails.startUtc,
            updatedDetails.endUtc,
            targetRecord.id
          );
          var driverConcurrent = domain.hasDriverConflict(
            refreshed,
            assignedDriver.id,
            updatedDetails.startUtc,
            updatedDetails.endUtc,
            targetRecord.id
          );
          if (vehicleConcurrent || driverConcurrent) {
            setBanner(
              'Booking approved, but a concurrent assignment conflict was detected. Review the schedule immediately.',
              true
            );
            return;
          }
          var approveNotify = await notifyDriver(updatedDetails, 'approve');
          var approveSuffix = approveNotify.sent
            ? ' Notification sent to Geotab Drive.'
            : (approveNotify.skipped
              ? ''
              : ' Geotab Drive notification failed: ' + fmt.errorText(approveNotify.error));
          setBanner(
            'Booking approved and assigned to ' + updatedDetails.deviceName +
              ' with driver ' + updatedDetails.driverName + '.' + approveSuffix,
            false
          );
        } else {
          setBanner('Booking rejected with notes recorded.', false);
        }
      } catch (error) {
        inlineError.textContent = fmt.errorText(error);
        inlineError.hidden = false;
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        statusBanner.removeAttribute('data-sticky');
      }
    }

    async function handleAdminCancelSubmit(form) {
      if (!state.isAdministrator || isSubmitting) return;
      var recordId = form.getAttribute('data-admin-cancel-form');
      var inlineError = form.querySelector('.approval-inline-error');
      var reasonInput = form.querySelector('textarea[name="cancellationReason"]');
      var submitBtn = form.querySelector('[data-review-submit]');

      inlineError.hidden = true;
      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;

      try {
        var validated = domain.validateAdminCancellation({
          cancellationReason: reasonInput ? reasonInput.value : ''
        });
        var freshRecords = await apiService.getBookingRecords(state.api);
        var targetRecord = freshRecords.find(function (item) {
          return String(item.id) === String(recordId);
        });
        if (!targetRecord || !domain.canAdminCancel(targetRecord.details, state.isAdministrator)) {
          throw new Error('This booking can no longer be cancelled. Refresh the queue to see the latest status.');
        }

        var now = new Date().toISOString();
        var updatedDetails = Object.assign({}, targetRecord.details, {
          status: 'cancelled',
          cancelledBy: state.currentUserName,
          cancelledAtUtc: now,
          cancellationReason: validated.cancellationReason,
          updatedAtUtc: now
        });

        await apiService.updateBookingRecord(state.api, targetRecord, updatedDetails);
        var cancelNotify = await notifyDriver(updatedDetails, 'cancel');
        reviewingRecordId = null;
        statusBanner.setAttribute('data-sticky', 'true');
        var refreshed = await onDataChanged(true);
        var cancelSuffix = cancelNotify.sent
          ? ' Cancellation notice sent to Geotab Drive.'
          : (cancelNotify.skipped
            ? ''
            : ' Geotab Drive notice failed: ' + fmt.errorText(cancelNotify.error));
        setBanner(
          refreshed
            ? 'Approved booking cancelled. The assigned vehicle and driver are now available again.' + cancelSuffix
            : 'Booking cancelled, but the queue could not be refreshed. Reload to verify.' + cancelSuffix,
          !refreshed
        );
      } catch (error) {
        inlineError.textContent = fmt.errorText(error);
        inlineError.hidden = false;
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        statusBanner.removeAttribute('data-sticky');
      }
    }

    function bind() {
      statusFilter.addEventListener('change', function () {
        reviewingRecordId = null;
        render();
      });
      refreshButton.addEventListener('click', function () {
        statusBanner.removeAttribute('data-sticky');
        onDataChanged(true);
        onRefreshDrivers(true);
      });
      approvalList.addEventListener('click', function (event) {
        var toggleBtn = event.target.closest('[data-toggle-review]');
        if (toggleBtn) {
          var id = toggleBtn.getAttribute('data-toggle-review');
          reviewingRecordId = String(reviewingRecordId) === String(id) ? null : id;
          render();
          return;
        }
        if (event.target.closest('[data-close-review]')) {
          reviewingRecordId = null;
          render();
        }
      });
      approvalList.addEventListener('submit', function (event) {
        var reviewForm = event.target.closest('[data-review-form]');
        if (reviewForm) {
          event.preventDefault();
          handleReviewSubmit(reviewForm);
          return;
        }
        var cancelForm = event.target.closest('[data-admin-cancel-form]');
        if (cancelForm) {
          event.preventDefault();
          handleAdminCancelSubmit(cancelForm);
        }
      });
      approvalList.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && reviewingRecordId !== null) {
          reviewingRecordId = null;
          render();
        }
      });
    }

    function isReviewOpen() {
      return reviewingRecordId !== null || isSubmitting;
    }

    return {
      bind: bind,
      isReviewOpen: isReviewOpen,
      render: render
    };
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.ApprovalView = {
    create: createApprovalView
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
