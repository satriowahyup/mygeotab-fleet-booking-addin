(function (root) {
  'use strict';

  function createBookingView(deps) {
    var domain = deps.bookingDomain;
    var driverDomain = deps.driverScheduleDomain;
    var apiService = deps.apiService;
    var fmt = deps.formatters;
    var state = deps.state;
    var onDataChanged = deps.onDataChanged;

    var formPanel = document.getElementById('bookingFormPanel');
    var form = document.getElementById('bookingForm');
    var formTitle = document.getElementById('formTitle');
    var startInput = document.getElementById('startLocal');
    var endInput = document.getElementById('endLocal');
    var purposeInput = document.getElementById('purpose');
    var destinationInput = document.getElementById('destination');
    var submitButton = document.getElementById('submitButton');
    var cancelEditButton = document.getElementById('cancelEditButton');
    var statusElement = document.getElementById('status');
    var statusFilter = document.getElementById('bookingStatusFilter');
    var rangeFilter = document.getElementById('bookingRangeFilter');
    var scheduleSummary = document.getElementById('bookingListSummary');
    var bookingTableBody = document.getElementById('bookingTableBody');

    var editingRecordId = null;

    function setStatus(message, isError) {
      statusElement.textContent = message || '';
      statusElement.setAttribute('data-error', isError ? 'true' : 'false');
      statusElement.hidden = !message;
    }

    function clearStatus() {
      statusElement.textContent = '';
      statusElement.removeAttribute('data-error');
      statusElement.hidden = true;
    }

    function setDefaultTimes() {
      var start = new Date();
      start.setMinutes(Math.ceil((start.getMinutes() + 1) / 30) * 30, 0, 0);
      var end = new Date(start.getTime() + 60 * 60 * 1000);
      startInput.value = fmt.formatLocalInput(start);
      endInput.value = fmt.formatLocalInput(end);
    }

    function updateFormState() {
      var formEnabled = state.canBook && !state.isBusy;
      startInput.disabled = !formEnabled;
      endInput.disabled = !formEnabled;
      purposeInput.disabled = !formEnabled;
      destinationInput.disabled = !formEnabled;
      submitButton.disabled = !formEnabled;
      cancelEditButton.disabled = state.isBusy;
    }

    function resetForm() {
      editingRecordId = null;
      form.reset();
      formTitle.textContent = 'Create booking';
      submitButton.textContent = 'Submit request';
      cancelEditButton.hidden = true;
      if (formPanel) formPanel.classList.remove('is-editing');
      setDefaultTimes();
      updateFormState();
    }

    function getRecordById(id) {
      return state.bookings.find(function (record) {
        return String(record.id) === String(id);
      });
    }

    function beginEdit(id) {
      var record = getRecordById(id);
      if (!record || !domain.canRequesterEdit(record.details, state.currentUserName)) return;

      editingRecordId = record.id;
      startInput.value = domain.toLocalDateTimeInput(record.details.startUtc);
      endInput.value = domain.toLocalDateTimeInput(record.details.endUtc);
      purposeInput.value = record.details.purpose || '';
      destinationInput.value = record.details.destination || '';
      formTitle.textContent = 'Edit pending booking';
      submitButton.textContent = 'Save changes';
      cancelEditButton.hidden = false;
      if (formPanel) {
        formPanel.classList.add('is-editing');
        formPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      startInput.focus();
    }

    function appendCellLine(parent, text, className) {
      var span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      parent.appendChild(span);
    }

    function matchesStatusFilter(status, selected) {
      if (!selected || selected === 'all') return true;
      if (selected === 'approved') return status === 'approved' || status === 'confirmed';
      return status === selected;
    }

    function renderAssignmentCell(cell, details, status) {
      if (status === 'approved' || status === 'confirmed') {
        appendCellLine(cell, fmt.resolveDeviceName(details, state.devices), 'cell-primary');
        appendCellLine(cell, 'Driver: ' + (details.driverName || details.driverLogin || 'Unassigned'), 'cell-sub');
        return;
      }
      if (status === 'pending') {
        appendCellLine(cell, 'Awaiting approval', 'cell-primary cell-muted');
        appendCellLine(cell, 'Assigned by administrator', 'cell-sub');
        return;
      }
      if (status === 'rejected') {
        appendCellLine(cell, 'Not assigned', 'cell-primary cell-muted');
        appendCellLine(cell, details.reviewedBy ? 'Rejected by ' + details.reviewedBy : 'Rejected by administrator', 'cell-sub');
        return;
      }
      var cancelledByOther = details.cancelledBy &&
        String(details.cancelledBy).toLowerCase() !== String(state.currentUserName || '').toLowerCase();
      var vehicleText = (details.deviceName || details.deviceId)
        ? fmt.resolveDeviceName(details, state.devices)
        : 'Not assigned';
      appendCellLine(cell, vehicleText, 'cell-primary cell-muted');
      appendCellLine(cell, cancelledByOther ? 'Cancelled by ' + details.cancelledBy : 'Cancelled by you', 'cell-sub');
    }

    function buildBookingRow(record) {
      var details = record.details || {};
      var status = domain.normalizeStatus(details.status);
      var row = document.createElement('tr');

      var scheduleCell = document.createElement('td');
      var summary = fmt.getScheduleSummary(details.startUtc, details.endUtc);
      appendCellLine(scheduleCell, summary.dateText, 'cell-primary');
      appendCellLine(
        scheduleCell,
        summary.timeText + (summary.durationText ? ' (' + summary.durationText + ')' : ''),
        'cell-sub'
      );
      row.appendChild(scheduleCell);

      var tripCell = document.createElement('td');
      appendCellLine(tripCell, details.destination || 'Not specified', 'cell-primary');
      appendCellLine(tripCell, details.purpose || 'Not specified', 'cell-sub');
      row.appendChild(tripCell);

      var assignmentCell = document.createElement('td');
      renderAssignmentCell(assignmentCell, details, status);
      row.appendChild(assignmentCell);

      var statusCell = document.createElement('td');
      statusCell.appendChild(fmt.createStatusBadge(status));
      if (details.approvalNotes) {
        appendCellLine(
          statusCell,
          (status === 'rejected' ? 'Reason: ' : 'Note: ') + details.approvalNotes,
          status === 'rejected' ? 'cell-sub cell-sub-danger' : 'cell-sub'
        );
      }
      if (status === 'cancelled' && details.cancellationReason) {
        appendCellLine(statusCell, 'Reason: ' + details.cancellationReason, 'cell-sub cell-sub-danger');
      }
      row.appendChild(statusCell);

      var actionsCell = document.createElement('td');
      actionsCell.className = 'col-actions';
      var canEdit = domain.canRequesterEdit(details, state.currentUserName);
      var canCancel = domain.canRequesterCancel(details, state.currentUserName);
      if (canEdit || canCancel) {
        var actions = document.createElement('div');
        actions.className = 'table-actions';
        if (canEdit) {
          var editButton = document.createElement('button');
          editButton.type = 'button';
          editButton.className = 'secondary btn-sm';
          editButton.textContent = 'Edit';
          editButton.setAttribute('data-edit-id', record.id);
          actions.appendChild(editButton);
        }
        if (canCancel) {
          var cancelButton = document.createElement('button');
          cancelButton.type = 'button';
          cancelButton.className = 'danger-subtle btn-sm';
          cancelButton.textContent = 'Cancel';
          cancelButton.setAttribute('data-cancel-id', record.id);
          actions.appendChild(cancelButton);
        }
        actionsCell.appendChild(actions);
      } else {
        appendCellLine(actionsCell, '-', 'cell-muted');
      }
      row.appendChild(actionsCell);

      return row;
    }

    function renderList() {
      bookingTableBody.textContent = '';
      var preset = rangeFilter.value || 'this_week';
      var selectedStatus = statusFilter ? statusFilter.value : 'all';
      var myBookings = domain.filterMyBookings(state.bookings, state.currentUserName, preset)
        .filter(function (record) {
          return matchesStatusFilter(domain.normalizeStatus(record.details && record.details.status), selectedStatus);
        });
      myBookings.sort(function (first, second) {
        return Date.parse(first.details.startUtc) - Date.parse(second.details.startUtc);
      });

      var totalMine = state.bookings.filter(function (record) {
        return domain.isBookingOwner(record.details, state.currentUserName);
      }).length;

      scheduleSummary.textContent = '(' + myBookings.length + ' of ' + totalMine + ')';

      if (myBookings.length === 0) {
        var emptyMessage = totalMine > 0
          ? 'No bookings match the selected filters. Adjust Status or Time range to see other schedules.'
          : 'You have not created any bookings yet.';
        bookingTableBody.appendChild(fmt.createTableEmptyRow(5, emptyMessage));
        return;
      }

      myBookings.forEach(function (record) {
        bookingTableBody.appendChild(buildBookingRow(record));
      });
    }

    async function submitBooking(event) {
      event.preventDefault();
      if (!state.canBook || state.isBusy) return;

      state.isBusy = true;
      updateFormState();
      try {
        var validated = domain.validateBookingInput({
          startLocal: startInput.value,
          endLocal: endInput.value,
          purpose: purposeInput.value,
          destination: destinationInput.value
        });

        var existingRecord = null;
        if (editingRecordId) {
          var freshRecords = await apiService.getBookingRecords(state.api);
          existingRecord = freshRecords.find(function (record) {
            return String(record.id) === String(editingRecordId);
          }) || null;
          if (!existingRecord) {
            throw new Error('Booking not found. Reload the list and try again.');
          }
          if (!domain.canRequesterEdit(existingRecord.details, state.currentUserName)) {
            throw new Error('Only pending bookings created by you can be edited.');
          }
        }

        var now = new Date().toISOString();
        var details = Object.assign({}, existingRecord ? existingRecord.details : {}, {
          bookingKey: existingRecord ? existingRecord.details.bookingKey : apiService.createBookingKey(),
          status: 'pending',
          startUtc: validated.startUtc,
          endUtc: validated.endUtc,
          startEpoch: validated.startEpoch,
          endEpoch: validated.endEpoch,
          purpose: validated.purpose,
          destination: validated.destination,
          createdBy: existingRecord ? existingRecord.details.createdBy : state.currentUserName,
          createdAtUtc: existingRecord ? existingRecord.details.createdAtUtc : now,
          updatedAtUtc: now,
          deviceId: existingRecord ? (existingRecord.details.deviceId || null) : null,
          deviceName: existingRecord ? (existingRecord.details.deviceName || null) : null,
          driverId: existingRecord ? (existingRecord.details.driverId || null) : null,
          driverName: existingRecord ? (existingRecord.details.driverName || null) : null,
          driverLogin: existingRecord ? (existingRecord.details.driverLogin || null) : null,
          approvalNotes: existingRecord ? (existingRecord.details.approvalNotes || '') : '',
          reviewedBy: existingRecord ? (existingRecord.details.reviewedBy || null) : null,
          reviewedAtUtc: existingRecord ? (existingRecord.details.reviewedAtUtc || null) : null,
          cancelledAtUtc: existingRecord ? (existingRecord.details.cancelledAtUtc || null) : null
        });

        if (existingRecord) {
          await apiService.updateBookingRecord(state.api, existingRecord, details);
        } else {
          await apiService.addBookingRecord(state.api, details);
        }

        var updatedRecords = await onDataChanged(true);
        resetForm();
        if (!updatedRecords) {
          setStatus('Booking saved, but the list could not be refreshed. Reload the add-in to verify.', true);
          return;
        }

        var bounds = domain.getTimeRangeBounds(rangeFilter.value || 'this_week');
        var visibleInCurrentFilter = domain.isBookingInBounds(details, bounds) &&
          matchesStatusFilter('pending', statusFilter ? statusFilter.value : 'all');
        var baseMessage = existingRecord
          ? 'Pending booking updated.'
          : 'Booking request submitted (status: Pending approval).';
        setStatus(
          visibleInCurrentFilter
            ? baseMessage
            : baseMessage + ' This booking is hidden by the current filters; adjust Status or Time range to view it.',
          false
        );
      } catch (error) {
        setStatus('Unable to save booking: ' + fmt.errorText(error), true);
      } finally {
        state.isBusy = false;
        updateFormState();
      }
    }

    async function cancelBooking(id) {
      if (state.isBusy) return;
      var localRecord = getRecordById(id);
      var isScheduled = localRecord && domain.isScheduledStatus(localRecord.details && localRecord.details.status);
      var promptText = isScheduled
        ? 'Cancel this approved booking? To change the schedule or assignment, you will need to create a new booking request.'
        : 'Cancel this pending booking request?';
      if (!window.confirm(promptText)) return;

      state.isBusy = true;
      updateFormState();
      try {
        var freshRecords = await apiService.getBookingRecords(state.api);
        var record = freshRecords.find(function (item) {
          return String(item.id) === String(id);
        });
        if (!record) {
          throw new Error('Booking not found. Reload the list and try again.');
        }
        if (!domain.canRequesterCancel(record.details, state.currentUserName)) {
          throw new Error('This booking cannot be cancelled.');
        }

        var wasScheduled = domain.isScheduledStatus(record.details && record.details.status);
        var now = new Date().toISOString();
        var details = Object.assign({}, record.details, {
          status: 'cancelled',
          cancelledBy: state.currentUserName,
          cancelledAtUtc: now,
          updatedAtUtc: now
        });
        await apiService.updateBookingRecord(state.api, record, details);

        var notifyResult = { sent: false, skipped: true, error: null };
        if (wasScheduled && details.driverId && driverDomain && apiService.notifyDriverBestEffort) {
          notifyResult = await apiService.notifyDriverBestEffort(state.api, {
            driverId: details.driverId,
            senderUserId: state.currentUser && state.currentUser.id,
            message: driverDomain.buildCancellationNotificationText(details, fmt)
          });
        }

        var refreshed = await onDataChanged(true);
        if (String(editingRecordId) === String(id)) resetForm();
        var notifySuffix = notifyResult.sent
          ? ' Cancellation notice sent to the assigned driver.'
          : (notifyResult.skipped
            ? ''
            : ' Driver notification could not be delivered.');
        if (!refreshed) {
          setStatus('Booking cancelled, but the list could not be refreshed. Reload the add-in to verify.' + notifySuffix, true);
          return;
        }
        setStatus('Booking cancelled successfully.' + notifySuffix, false);
      } catch (error) {
        setStatus('Unable to cancel booking: ' + fmt.errorText(error), true);
      } finally {
        state.isBusy = false;
        updateFormState();
      }
    }

    function bind() {
      form.addEventListener('submit', submitBooking);
      cancelEditButton.addEventListener('click', resetForm);
      if (statusFilter) statusFilter.addEventListener('change', renderList);
      rangeFilter.addEventListener('change', renderList);
      bookingTableBody.addEventListener('click', function (event) {
        var editButton = event.target.closest('[data-edit-id]');
        var cancelButton = event.target.closest('[data-cancel-id]');
        if (editButton) beginEdit(editButton.getAttribute('data-edit-id'));
        if (cancelButton) cancelBooking(cancelButton.getAttribute('data-cancel-id'));
      });
      setDefaultTimes();
    }

    return {
      bind: bind,
      clearStatus: clearStatus,
      renderList: renderList,
      resetForm: resetForm,
      setStatus: setStatus,
      updateFormState: updateFormState
    };
  }

  root.FleetAddIn = root.FleetAddIn || {};
  root.FleetAddIn.BookingView = {
    create: createBookingView
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
