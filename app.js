function bootApp() {
    try {
        if (window.App && typeof window.App.init === 'function') {
            window.App.init();
        }
    } catch (e) {
        console.error('Error booting FleetCost App:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    setTimeout(bootApp, 10);
}

const App = {
    currentTab: 'driver',
    currentRole: 'driver', // 'driver' or 'management'
    currentActiveTripId: null,
    startPhotoBase64: null,
    endPhotoBase64: null,
    startGPSLocation: null,   // GPS for check-in
    endGPSLocation: null,     // GPS for check-out
    selectedCheckinRegion: 'ALL',  // Region filter for check-in
    selectedCheckoutRegion: 'ALL', // Region filter for check-out
    tripFilters: {
        status: 'ALL',
        originCode: 'ALL',
        destCode: 'ALL',
        fuelType: 'ALL',
        dateFrom: '',
        dateTo: '',
        search: ''
    },

    init: function() {
        if (!TransportDB.getSites() || TransportDB.getSites().length === 0) {
            if (window.EMBEDDED_SITES && window.EMBEDDED_SITES.length > 0) {
                TransportDB.saveSites(window.EMBEDDED_SITES);
            }
        }
        this.currentRole = TransportDB.getRole() || 'driver';
        this.bindEvents();
        this.applyRoleView();
        this.populateDropdowns();
        this.renderActiveTrips();
        this.renderTripTable();
        this.renderSiteMatrix();
        this.renderFleetKPIs();
        this.renderSitesList();
        this.renderVehicleFleet();
        this.renderDriversList();
        this.renderFuelRatesForm();
        this.renderActivePinDisplay();
        this.renderFirebaseConfigForm();
        this.renderGoogleSheetsConfigForm();
        this.updateAutoSiteCodeSuggestion();
        this.startTimer();
    },

    bindEvents: function() {
        // Tab switching
        document.querySelectorAll('[data-tab-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.getAttribute('data-tab-target'));
            });
        });

        // Role Switch Toggle
        const roleToggleBtn = document.getElementById('roleToggleBtn');
        if (roleToggleBtn) {
            roleToggleBtn.addEventListener('click', () => {
                this.toggleRole();
            });
        }

        // Origin Site Change -> Display Supervisor & Asst Manager
        const originSelect = document.getElementById('checkinOriginSelect');
        if (originSelect) {
            originSelect.addEventListener('change', (e) => {
                this.updateOriginSiteDetails(e.target.value);
            });
        }

        // Destination Site Change -> Display Supervisor & Asst Manager
        const destSelect = document.getElementById('checkoutDestSelect');
        if (destSelect) {
            destSelect.addEventListener('change', (e) => {
                this.updateDestSiteDetails(e.target.value);
            });
        }

        // Fuel Type selector change -> Update rates & default mileage
        document.querySelectorAll('input[name="checkinFuelType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.handleFuelTypeChange(e.target.value);
            });
        });

        // Photo Upload Listeners
        document.getElementById('checkinStartPhoto')?.addEventListener('change', (e) => {
            this.handlePhotoUpload(e.target.files[0], 'start');
        });
        document.getElementById('checkoutEndPhoto')?.addEventListener('change', (e) => {
            this.handlePhotoUpload(e.target.files[0], 'end');
        });

        // Check-In Submit
        document.getElementById('driverCheckinForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDriverCheckIn();
        });

        // Check-Out Reactive Inputs
        document.getElementById('checkoutEndOdo')?.addEventListener('input', () => this.recalculateCheckoutPreview());
        document.getElementById('checkoutTolls')?.addEventListener('input', () => this.recalculateCheckoutPreview());

        // Check-Out Submit
        document.getElementById('checkoutForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDriverCheckOut();
        });

        // Filter events
        ['filterStatus', 'filterOrigin', 'filterDest', 'filterFuelType', 'filterDateFrom', 'filterDateTo'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.handleFilterChange());
        });
        document.getElementById('filterSearch')?.addEventListener('input', () => this.handleFilterChange());

        // Export Buttons
        document.getElementById('btnExportTrips')?.addEventListener('click', () => {
            const trips = TransportCalculator.filterTrips(TransportDB.getTrips(), this.tripFilters);
            AppExporter.exportTripsToExcel(trips);
        });
        document.getElementById('btnExportMatrix')?.addEventListener('click', () => {
            const routes = TransportCalculator.computeSiteToSiteMatrix(TransportDB.getTrips(), TransportDB.getSites());
            AppExporter.exportRouteMatrixToExcel(routes);
        });

        // Add Site Submit
        document.getElementById('addSiteForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddSite();
        });

        // Add Vehicle Submit
        document.getElementById('addVehicleForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddVehicle();
        });

        // Add Driver Submit
        document.getElementById('addDriverForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddDriver();
        });

        // Fuel Rates Save
        document.getElementById('fuelRatesForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveFuelRates();
        });

        // Sync / Import Excel File
        document.getElementById('inputImportExcel')?.addEventListener('change', (e) => {
            this.handleExcelImport(e.target.files[0]);
        });
        // PIN Modal Submit
        document.getElementById('mgmtPinForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePinSubmit();
        });

        // Change PIN Form Submit
        document.getElementById('changePinForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleChangePin();
        });

        // Verify Trip Form Submit
        document.getElementById('verifyTripForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleConfirmVerification();
        });
    },

    toggleRole: function() {
        if (this.currentRole === 'driver') {
            this.openPinModal();
        } else {
            // Lock back to driver mode immediately
            this.currentRole = 'driver';
            TransportDB.setRole('driver');
            this.applyRoleView();
            if (this.currentTab !== 'driver') {
                this.switchTab('driver');
            }
            this.showNotification('Locked and switched to 👨‍✈️ Driver Terminal', 'info');
        }
    },

    openPinModal: function() {
        const modal = document.getElementById('mgmtPinModal');
        const input = document.getElementById('mgmtPinInput');
        const errEl = document.getElementById('mgmtPinError');
        const promptEl = document.getElementById('mgmtPinPromptText');

        if (errEl) errEl.classList.add('hidden');
        if (promptEl) {
            promptEl.textContent = 'Enter PIN to unlock executive analytics & rates';
        }
        if (input) {
            input.value = '';
            input.placeholder = '••••';
            setTimeout(() => input.focus(), 150);
        }
        if (modal) modal.classList.remove('hidden');
    },

    closePinModal: function() {
        const modal = document.getElementById('mgmtPinModal');
        if (modal) modal.classList.add('hidden');
    },

    handlePinSubmit: function() {
        const input = document.getElementById('mgmtPinInput');
        const errEl = document.getElementById('mgmtPinError');
        const enteredPin = input ? String(input.value).trim() : '';
        const correctPin = String(TransportDB.getManagementPin() || '1234').trim();

        if (enteredPin === correctPin) {
            this.closePinModal();
            this.currentRole = 'management';
            TransportDB.setRole('management');
            this.applyRoleView();
            this.showNotification('🔓 Management Portal Unlocked successfully!', 'success');
        } else {
            if (errEl) {
                errEl.textContent = '❌ Incorrect PIN. Please try again.';
                errEl.classList.remove('hidden');
            }
            if (input) {
                input.value = '';
                input.focus();
            }
        }
    },

    handleChangePin: function() {
        const curInput = document.getElementById('curMgmtPin')?.value.trim();
        const newInput = document.getElementById('newMgmtPin')?.value.trim();
        const confInput = document.getElementById('confMgmtPin')?.value.trim();
        const correctPin = String(TransportDB.getManagementPin() || '1234').trim();

        if (curInput && curInput !== correctPin) {
            this.showNotification('Current PIN is incorrect.', 'error');
            return;
        }
        if (!newInput || newInput.length < 4) {
            this.showNotification('New PIN must be at least 4 digits.', 'error');
            return;
        }
        if (newInput !== confInput) {
            this.showNotification('New PIN and Confirm PIN do not match.', 'error');
            return;
        }

        TransportDB.setManagementPin(newInput);
        document.getElementById('changePinForm')?.reset();
        this.showNotification('Management Security PIN updated successfully!', 'success');
    },

    renderActivePinDisplay: function() {
        const pinBadge = document.getElementById('activeMgmtPinBadge');
        if (pinBadge) {
            const currentPin = TransportDB.getManagementPin();
            pinBadge.textContent = `Active PIN: ${currentPin}`;
        }
    },

    setRole: function(role) {
        this.currentRole = role;
        TransportDB.setRole(role);
        this.applyRoleView();
    },

    applyRoleView: function() {
        const isMgmt = this.currentRole === 'management';
        
        // Update header role toggle button text and styling
        const roleBtn = document.getElementById('roleToggleBtn');
        if (roleBtn) {
            if (isMgmt) {
                roleBtn.innerHTML = '<i class="fa-solid fa-user-shield text-emerald-400"></i> <span>Management Mode</span> <span class="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-mono">Full Access</span>';
                roleBtn.className = "px-3.5 py-1.5 rounded-xl bg-slate-900 border border-emerald-500/40 text-xs font-semibold text-white hover:bg-slate-800 transition flex items-center gap-2 cursor-pointer shadow-sm";
            } else {
                roleBtn.innerHTML = '<i class="fa-solid fa-id-card text-blue-400"></i> <span>Driver Terminal</span> <span class="bg-blue-500/20 text-blue-300 text-[10px] px-1.5 py-0.5 rounded font-mono">Tap for Management</span>';
                roleBtn.className = "px-3.5 py-1.5 rounded-xl bg-slate-900 border border-blue-500/40 text-xs font-semibold text-white hover:bg-slate-800 transition flex items-center gap-2 cursor-pointer shadow-sm";
            }
        }

        // Show/hide management tabs in top navigation
        document.querySelectorAll('.mgmt-only-tab').forEach(el => {
            if (isMgmt) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        // Top KPI Highlights Bar: in driver mode, hide financial metrics
        document.querySelectorAll('.mgmt-only-kpi').forEach(el => {
            if (isMgmt) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        // Checkout Modal costing preview: hide from driver, show to management
        const costPreview = document.getElementById('checkoutCostPreviewBox');
        if (costPreview) {
            if (isMgmt) {
                costPreview.classList.remove('hidden');
            } else {
                costPreview.classList.add('hidden');
            }
        }

        // Rate display in check-in
        const rateNote = document.getElementById('fuelTypeRateDisplay');
        if (rateNote) {
            if (isMgmt) {
                rateNote.classList.remove('hidden');
            } else {
                rateNote.classList.add('hidden');
            }
        }
    },

    switchTab: function(tabName) {
        // If driver role tries to open management tab, block or switch role
        if (this.currentRole === 'driver' && tabName !== 'driver') {
            this.showNotification('Management tabs require Management Portal mode.', 'info');
            return;
        }

        this.currentTab = tabName;

        // Hide all tab content panels
        document.querySelectorAll('.tab-content').forEach(tc => {
            tc.classList.remove('active');
        });

        // Show the target tab
        const target = document.getElementById('tab-' + tabName);
        if (target) target.classList.add('active');

        // Update button active/inactive state
        document.querySelectorAll('[data-tab-target]').forEach(btn => {
            const isMatch = btn.getAttribute('data-tab-target') === tabName;
            btn.classList.toggle('tab-active', isMatch);
            btn.classList.toggle('tab-inactive', !isMatch);
        });

        if (tabName === 'analytics') {
            setTimeout(() => {
                AppCharts.renderAllCharts(TransportDB.getTrips(), TransportDB.getSites(), TransportDB.getVehicles());
            }, 100);
        } else if (tabName === 'matrix') {
            this.renderSiteMatrix();
        } else if (tabName === 'trips') {
            this.renderTripTable();
        } else if (tabName === 'driver') {
            this.renderActiveTrips();
        } else if (tabName === 'fleet') {
            this.renderSitesList();
            this.renderVehicleFleet();
            this.renderDriversList();
            this.renderActivePinDisplay();
            this.renderFirebaseConfigForm();
        }
    },

    refreshAll: function() {
        this.populateDropdowns();
        this.renderActiveTrips();
        this.renderTripTable();
        this.renderSiteMatrix();
        this.renderFleetKPIs();
        this.renderSitesList();
        this.renderVehicleFleet();
        this.renderDriversList();
        this.renderFuelRatesForm();
        this.renderActivePinDisplay();
        this.updateAutoSiteCodeSuggestion();
        if (this.currentTab === 'analytics') {
            AppCharts.renderAllCharts(TransportDB.getTrips(), TransportDB.getSites(), TransportDB.getVehicles());
        }
    },

    populateDropdowns: function() {
        let sites = TransportDB.getSites();
        if (!sites || sites.length === 0) {
            if (window.EMBEDDED_SITES && window.EMBEDDED_SITES.length > 0) {
                sites = window.EMBEDDED_SITES;
                TransportDB.saveSites(sites);
            }
        }

        const drivers = TransportDB.getDrivers();
        const vehicles = TransportDB.getVehicles();

        // Preserve current active selections so background sync never wipes form data
        const driverSelect = document.getElementById('checkinDriverSelect');
        const vehSelect = document.getElementById('checkinVehicleSelect');
        const originSelect = document.getElementById('checkinOriginSelect');
        const destSelect = document.getElementById('checkoutDestSelect');

        const savedDriverVal = driverSelect ? driverSelect.value : '';
        const savedVehVal = vehSelect ? vehSelect.value : '';
        const savedOriginVal = originSelect ? originSelect.value : '';
        const savedDestVal = destSelect ? destSelect.value : '';

        // 1. Driver Dropdown
        if (driverSelect) {
            let options = '<option value="">-- Select Driver --</option>';
            options += '<option value="__NEW__">➕ Add New Driver (Enter Name & Phone)</option>';
            drivers.forEach(d => {
                const phoneStr = d.phone && d.phone !== 'Not Provided' ? ` (${d.phone})` : '';
                options += `<option value="${d.name}" data-phone="${d.phone || ''}">${d.name}${phoneStr}</option>`;
            });
            driverSelect.innerHTML = options;
            if (savedDriverVal && Array.from(driverSelect.options).some(o => o.value === savedDriverVal)) {
                driverSelect.value = savedDriverVal;
            }
        }

        // 2. Vehicle Dropdown
        if (vehSelect) {
            let options = '<option value="">-- Select Vehicle --</option>';
            options += '<option value="__NEW__">➕ Add New Vehicle</option>';
            vehicles.forEach(v => {
                options += `<option value="${v.plate}" data-fuel="${v.fuelType}" data-mileage="${v.mileage}">${v.plate} (${v.fuelType} · ${v.mileage} km/L)</option>`;
            });
            vehSelect.innerHTML = options;
            if (savedVehVal && Array.from(vehSelect.options).some(o => o.value === savedVehVal)) {
                vehSelect.value = savedVehVal;
            }
        }

        // 3. Origin Sites Dropdown (respects region filter)
        const originRegion = this.selectedCheckinRegion || 'ALL';
        const filteredOriginSites = originRegion !== 'ALL' ? TransportDB.getSitesByRegion(originRegion) : sites;
        if (originSelect) {
            originSelect.innerHTML =
                `<option value="">-- Search / Select Departure Site (${filteredOriginSites.length} Sites Available) --</option>` +
                `<option value="__NEW_SITE__" class="font-bold text-blue-400 bg-blue-950/40">➕ + Add New Site (Not in List)</option>` +
                filteredOriginSites.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Supervisor: ${s.supervisor || 'Unassigned'})</option>`).join('');
            if (savedOriginVal && Array.from(originSelect.options).some(o => o.value === savedOriginVal)) {
                originSelect.value = savedOriginVal;
            }
        }
        const originBadge = document.getElementById('originSiteCountBadge');
        if (originBadge) originBadge.textContent = `${filteredOriginSites.length} Sites`;

        // 4. Destination Sites Dropdown (respects region filter)
        const destRegion = this.selectedCheckoutRegion || 'ALL';
        const filteredDestSites = destRegion !== 'ALL' ? TransportDB.getSitesByRegion(destRegion) : sites;
        if (destSelect) {
            destSelect.innerHTML =
                `<option value="">-- Search / Select Arrival Site (${filteredDestSites.length} Sites Available) --</option>` +
                `<option value="__NEW_SITE__" class="font-bold text-emerald-400 bg-emerald-950/40">➕ + Add New Site (Not in List)</option>` +
                filteredDestSites.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Supervisor: ${s.supervisor || 'Unassigned'})</option>`).join('');
            if (savedDestVal && Array.from(destSelect.options).some(o => o.value === savedDestVal)) {
                destSelect.value = savedDestVal;
            }
        }
        const destBadge = document.getElementById('destSiteCountBadge');
        if (destBadge) destBadge.textContent = `${filteredDestSites.length} Sites`;

        // 5. Filter Dropdowns for Trip Ledger
        const fOrigin = document.getElementById('filterOrigin');
        const fDest = document.getElementById('filterDest');
        if (fOrigin) {
            const savedFOrg = fOrigin.value;
            fOrigin.innerHTML = '<option value="ALL">All Origin Sites</option>' + sites.map(s => `<option value="${s.code}">[${s.code}] ${s.name}</option>`).join('');
            if (savedFOrg) fOrigin.value = savedFOrg;
        }
        if (fDest) {
            const savedFDst = fDest.value;
            fDest.innerHTML = '<option value="ALL">All Destination Sites</option>' + sites.map(s => `<option value="${s.code}">[${s.code}] ${s.name}</option>`).join('');
            if (savedFDst) fDest.value = savedFDst;
        }

        // 6. Region Filter Dropdowns
        this.populateRegionDropdowns();
    },

    filterOriginSites: function(searchTerm) {
        const query = (searchTerm || '').trim().toLowerCase();
        const originSelect = document.getElementById('checkinOriginSelect');
        const countBadge = document.getElementById('originSiteCountBadge');
        if (!originSelect) return;

        const sites = TransportDB.getSites();
        const filtered = query ? sites.filter(s => 
            (s.code && s.code.toLowerCase().includes(query)) || 
            (s.name && s.name.toLowerCase().includes(query)) || 
            (s.supervisor && s.supervisor.toLowerCase().includes(query)) ||
            (s.customerGroup && s.customerGroup.toLowerCase().includes(query))
        ) : sites;

        if (countBadge) countBadge.textContent = `${filtered.length} of ${sites.length} Sites`;

        let html = `<option value="">-- Select Departure Site (${filtered.length} match${filtered.length === 1 ? '' : 'es'}) --</option>`;
        html += filtered.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Supervisor: ${s.supervisor || 'Unassigned'})</option>`).join('');
        originSelect.innerHTML = html;

        // If exactly 1 match found, auto-select it and show info card
        if (filtered.length === 1 && query.length >= 2) {
            originSelect.value = filtered[0].code;
            this.updateOriginSiteDetails(filtered[0].code);
        }
    },

    filterDestSites: function(searchTerm) {
        const query = (searchTerm || '').trim().toLowerCase();
        const destSelect = document.getElementById('checkoutDestSelect');
        const countBadge = document.getElementById('destSiteCountBadge');
        if (!destSelect) return;

        const sites = TransportDB.getSites();
        const filtered = query ? sites.filter(s => 
            (s.code && s.code.toLowerCase().includes(query)) || 
            (s.name && s.name.toLowerCase().includes(query)) || 
            (s.supervisor && s.supervisor.toLowerCase().includes(query)) ||
            (s.customerGroup && s.customerGroup.toLowerCase().includes(query))
        ) : sites;

        if (countBadge) countBadge.textContent = `${filtered.length} of ${sites.length} Sites`;

        let html = `<option value="">-- Select Arrival Site (${filtered.length} match${filtered.length === 1 ? '' : 'es'}) --</option>`;
        html += filtered.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Supervisor: ${s.supervisor || 'Unassigned'})</option>`).join('');
        destSelect.innerHTML = html;

        if (filtered.length === 1 && query.length >= 2) {
            destSelect.value = filtered[0].code;
            this.updateDestSiteDetails(filtered[0].code);
        }
    },

    handleDriverSelectChange: function(selectEl) {
        const val = selectEl.value;
        const customBox = document.getElementById('checkinCustomDriverBox');
        if (val === '__NEW__') {
            if (customBox) customBox.classList.remove('hidden');
            const nameInput = document.getElementById('checkinCustomDriverName');
            if (nameInput) nameInput.focus();
        } else {
            if (customBox) customBox.classList.add('hidden');
            const nameInput = document.getElementById('checkinCustomDriverName');
            const phoneInput = document.getElementById('checkinCustomDriverPhone');
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
        }
    },

    handleVehicleSelectChange: function(selectEl) {
        const val = selectEl.value;
        const customBox = document.getElementById('checkinCustomVehicleBox');
        if (val === '__NEW__') {
            if (customBox) customBox.classList.remove('hidden');
            const plateInput = document.getElementById('checkinCustomPlate');
            if (plateInput) plateInput.focus();
            return;
        }

        if (customBox) customBox.classList.add('hidden');
        if (!val) return;

        const vehicles = TransportDB.getVehicles();
        const match = vehicles.find(v => v.plate === val);
        if (match) {
            // Fill mileage with vehicle's average mileage (keeps it editable!)
            const mileageInput = document.getElementById('checkinMileage');
            if (mileageInput) mileageInput.value = match.mileage;

            // Select fuel type radio
            const fuelRadio = document.querySelector(`input[name="checkinFuelType"][value="${match.fuelType}"]`);
            if (fuelRadio) fuelRadio.checked = true;

            // Set placeholder for odometer if known
            if (match.currentOdo) {
                const startOdo = document.getElementById('checkinStartOdo');
                if (startOdo) startOdo.placeholder = `Last recorded: ${match.currentOdo} km`;
            }
            this.handleFuelTypeChange(match.fuelType);
        }
    },

    handleOriginSiteSelectChange: function(val) {
        const customBox = document.getElementById('checkinCustomOriginBox');
        if (val === '__NEW_SITE__') {
            if (customBox) customBox.classList.remove('hidden');
            const card = document.getElementById('originSiteInfoCard');
            if (card) card.classList.add('hidden');
            const nameInput = document.getElementById('checkinCustomOriginName');
            if (nameInput) nameInput.focus();
        } else {
            if (customBox) customBox.classList.add('hidden');
            this.updateOriginSiteDetails(val);
        }
    },

    cancelCustomOriginSite: function() {
        const select = document.getElementById('checkinOriginSelect');
        const customBox = document.getElementById('checkinCustomOriginBox');
        if (customBox) customBox.classList.add('hidden');
        if (select) select.value = '';
        this.updateOriginSiteDetails('');
    },

    handleDestSiteSelectChange: function(val) {
        const customBox = document.getElementById('checkoutCustomDestBox');
        if (val === '__NEW_SITE__') {
            if (customBox) customBox.classList.remove('hidden');
            const card = document.getElementById('destSiteInfoCard');
            if (card) card.classList.add('hidden');
            const nameInput = document.getElementById('checkoutCustomDestName');
            if (nameInput) nameInput.focus();
        } else {
            if (customBox) customBox.classList.add('hidden');
            this.updateDestSiteDetails(val);
        }
        this.recalculateCheckoutPreview();
    },

    cancelCustomDestSite: function() {
        const select = document.getElementById('checkoutDestSelect');
        const customBox = document.getElementById('checkoutCustomDestBox');
        if (customBox) customBox.classList.add('hidden');
        if (select) select.value = '';
        this.updateDestSiteDetails('');
        this.recalculateCheckoutPreview();
    },

    filterOriginSites: function(searchTerm) {
        const query = (searchTerm || '').trim().toLowerCase();
        const originSelect = document.getElementById('checkinOriginSelect');
        const countBadge = document.getElementById('originSiteCountBadge');
        if (!originSelect) return;

        const sites = TransportDB.getSites();
        const filtered = query ? sites.filter(s => 
            (s.code && s.code.toLowerCase().includes(query)) || 
            (s.name && s.name.toLowerCase().includes(query)) || 
            (s.supervisor && s.supervisor.toLowerCase().includes(query)) ||
            (s.customerGroup && s.customerGroup.toLowerCase().includes(query))
        ) : sites;

        if (countBadge) countBadge.textContent = `${filtered.length} Sites`;

        let html = `<option value="">-- Search / Select Departure Site (${filtered.length} Sites) --</option>`;
        html += `<option value="__NEW_SITE__" class="font-bold text-blue-400 bg-blue-950/40">➕ + Add New Site (Not in List)</option>`;
        html += filtered.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Supervisor: ${s.supervisor || 'Unassigned'})</option>`).join('');
        originSelect.innerHTML = html;

        if (filtered.length === 1 && query.length >= 2) {
            originSelect.value = filtered[0].code;
            this.updateOriginSiteDetails(filtered[0].code);
        }
    },

    filterDestSites: function(searchTerm) {
        const query = (searchTerm || '').trim().toLowerCase();
        const destSelect = document.getElementById('checkoutDestSelect');
        const countBadge = document.getElementById('destSiteCountBadge');
        if (!destSelect) return;

        const sites = TransportDB.getSites();
        const filtered = query ? sites.filter(s => 
            (s.code && s.code.toLowerCase().includes(query)) || 
            (s.name && s.name.toLowerCase().includes(query)) || 
            (s.supervisor && s.supervisor.toLowerCase().includes(query)) ||
            (s.customerGroup && s.customerGroup.toLowerCase().includes(query))
        ) : sites;

        if (countBadge) countBadge.textContent = `${filtered.length} Sites`;

        let html = `<option value="">-- Search / Select Arrival Site (${filtered.length} Sites) --</option>`;
        html += `<option value="__NEW_SITE__" class="font-bold text-emerald-400 bg-emerald-950/40">➕ + Add New Site (Not in List)</option>`;
        html += filtered.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Supervisor: ${s.supervisor || 'Unassigned'})</option>`).join('');
        destSelect.innerHTML = html;

        if (filtered.length === 1 && query.length >= 2) {
            destSelect.value = filtered[0].code;
            this.updateDestSiteDetails(filtered[0].code);
            this.recalculateCheckoutPreview();
        }
    },

    updateOriginSiteDetails: function(siteCode) {
        const sites = TransportDB.getSites();
        const site = sites.find(s => s.code === siteCode);
        const card = document.getElementById('originSiteInfoCard');
        if (!card) return;

        if (site) {
            document.getElementById('originSiteSupervisor').textContent = site.supervisor || 'Unassigned';
            document.getElementById('originSiteAsstManager').textContent = site.asstManager || 'Unassigned';
            document.getElementById('originSiteManager').textContent = site.manager || 'Prabhugouda Patil';
            document.getElementById('originSiteCustGroup').textContent = site.customerGroup || site.name;
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    },

    updateDestSiteDetails: function(siteCode) {
        const sites = TransportDB.getSites();
        const site = sites.find(s => s.code === siteCode);
        const card = document.getElementById('destSiteInfoCard');
        if (!card) return;

        if (site) {
            document.getElementById('destSiteSupervisor').textContent = site.supervisor || 'Unassigned';
            document.getElementById('destSiteAsstManager').textContent = site.asstManager || 'Unassigned';
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    },

    handleFuelTypeChange: function(fuelType) {
        // Use region-aware fuel rates
        const region = this.selectedCheckinRegion || 'ALL';
        const rates = TransportDB.getFuelRates(region !== 'ALL' ? region : null);
        const rateObj = rates[fuelType] || rates.Diesel;
        const note = document.getElementById('fuelTypeRateDisplay');
        if (note) {
            const regionLabel = region !== 'ALL' ? ` [${region}]` : '';
            note.textContent = `Live ${fuelType} Rate${regionLabel}: ₹${rateObj.rate}/${rateObj.unit}`;
            note.classList.remove('hidden');
        }
        const mileageInput = document.getElementById('checkinMileage');
        if (mileageInput && (!mileageInput.value || mileageInput.value === '0')) {
            mileageInput.value = rateObj.avgMileage || 10;
        }
    },

    // --- REGION FILTER ---
    handleCheckinRegionChange: function(region) {
        this.selectedCheckinRegion = region || 'ALL';
        this.populateCheckinSiteDropdowns(region);
        // Update fuel rates for the selected region
        const fuelType = document.querySelector('input[name="checkinFuelType"]:checked')?.value || 'Diesel';
        this.handleFuelTypeChange(fuelType);
    },

    handleCheckoutRegionChange: function(region) {
        this.selectedCheckoutRegion = region || 'ALL';
        this.populateCheckoutSiteDropdown(region);
    },

    populateCheckinSiteDropdowns: function(region) {
        const sites = region && region !== 'ALL' ? TransportDB.getSitesByRegion(region) : TransportDB.getSites();
        const originSelect = document.getElementById('checkinOriginSelect');
        const badge = document.getElementById('originSiteCountBadge');

        if (originSelect) {
            originSelect.innerHTML =
                `<option value="">-- Search / Select Departure Site (${sites.length} Sites) --</option>` +
                `<option value="__NEW_SITE__" class="font-bold text-blue-400">➕ + Add New Site</option>` +
                sites.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Supervisor: ${s.supervisor || 'Unassigned'})</option>`).join('');
        }
        if (badge) badge.textContent = `${sites.length} Sites`;

        // Reset search
        const search = document.getElementById('checkinOriginSearch');
        if (search) search.value = '';
        const infoCard = document.getElementById('originSiteInfoCard');
        if (infoCard) infoCard.classList.add('hidden');
    },

    populateCheckoutSiteDropdown: function(region) {
        const sites = region && region !== 'ALL' ? TransportDB.getSitesByRegion(region) : TransportDB.getSites();
        const destSelect = document.getElementById('checkoutDestSelect');
        const badge = document.getElementById('destSiteCountBadge');

        if (destSelect) {
            destSelect.innerHTML =
                `<option value="">-- Search / Select Arrival Site (${sites.length} Sites) --</option>` +
                `<option value="__NEW_SITE__" class="font-bold text-emerald-400">➕ + Add New Site</option>` +
                sites.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Supervisor: ${s.supervisor || 'Unassigned'})</option>`).join('');
        }
        if (badge) badge.textContent = `${sites.length} Sites`;

        // Reset search
        const search = document.getElementById('checkoutDestSearch');
        if (search) search.value = '';
        const infoCard = document.getElementById('destSiteInfoCard');
        if (infoCard) infoCard.classList.add('hidden');
    },

    populateRegionDropdowns: function() {
        const regions = TransportDB.getRegions();
        const checkinRegionSel = document.getElementById('checkinRegionFilter');
        const checkoutRegionSel = document.getElementById('checkoutRegionFilter');

        [checkinRegionSel, checkoutRegionSel].forEach((sel) => {
            if (!sel) return;
            const currentVal = sel.value;
            sel.innerHTML =
                '<option value="ALL">🌍 All Regions</option>' +
                regions.filter(r => r && String(r).trim() !== '').map(r => `<option value="${r}">${r}</option>`).join('');
            if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
                sel.value = currentVal;
            }
        });
    },

    // --- GPS CAPTURE ---
    captureGPS: async function(type) {
        // type = 'checkin' or 'checkout'
        const btnId = type === 'checkin' ? 'gpsCheckinBtn' : 'gpsCheckoutBtn';
        const displayId = type === 'checkin' ? 'gpsCheckinDisplay' : 'gpsCheckoutDisplay';
        const btn = document.getElementById(btnId);
        const display = document.getElementById(displayId);

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Getting GPS...';
        }

        try {
            const loc = await TransportDB.getCurrentGPSLocation();

            if (type === 'checkin') {
                this.startGPSLocation = loc;
            } else {
                this.endGPSLocation = loc;
            }

            if (display) {
                display.innerHTML = `
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-emerald-400 font-semibold text-[11px]">
                            <i class="fa-solid fa-location-dot"></i> ${loc.formattedStr}
                        </span>
                        <a href="${loc.mapsUrl}" target="_blank" rel="noopener noreferrer"
                           class="text-blue-400 underline text-[10px] font-semibold hover:text-blue-300">
                            📌 Open in Maps
                        </a>
                    </div>`;
                display.classList.remove('hidden');
            }

            this.showNotification(`📍 GPS location captured: ${loc.formattedStr}`, 'success');
        } catch (err) {
            this.showNotification(`GPS Error: ${err.message}`, 'error');
            if (display) {
                display.innerHTML = `<span class="text-rose-400 text-[11px]"><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</span>`;
                display.classList.remove('hidden');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Capture GPS Location';
            }
        }
    },

    handlePhotoUpload: function(file, type) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Client-side image resizing & compression to 800px max dimension, quality 0.7
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 800;

                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

                if (type === 'start') {
                    this.startPhotoBase64 = compressedBase64;
                    const thumb = document.getElementById('startPhotoPreview');
                    if (thumb) {
                        thumb.src = compressedBase64;
                        thumb.classList.remove('hidden');
                    }
                } else {
                    this.endPhotoBase64 = compressedBase64;
                    const thumb = document.getElementById('endPhotoPreview');
                    if (thumb) {
                        thumb.src = compressedBase64;
                        thumb.classList.remove('hidden');
                    }
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    handleDriverCheckIn: function() {
        try {
            // Driver Identification
            const driverSelect = document.getElementById('checkinDriverSelect');
            const customDriverName = document.getElementById('checkinCustomDriverName')?.value.trim();
            const customDriverPhone = document.getElementById('checkinCustomDriverPhone')?.value.trim();

            let driverName = '';
            let driverPhone = '';

            if (driverSelect && driverSelect.value === '__NEW__') {
                if (!customDriverName) throw new Error("Please enter the new Driver's Name.");
                driverName = customDriverName;
                driverPhone = customDriverPhone;
            } else if (customDriverName) {
                driverName = customDriverName;
                driverPhone = customDriverPhone;
            } else if (driverSelect && driverSelect.value) {
                driverName = driverSelect.value;
                const selectedOpt = driverSelect.options[driverSelect.selectedIndex];
                driverPhone = selectedOpt ? selectedOpt.getAttribute('data-phone') : '';
            }

            if (!driverName) throw new Error("Please select or enter Driver Name.");

            // Vehicle Identification
            const vehSelect = document.getElementById('checkinVehicleSelect');
            const customPlate = document.getElementById('checkinCustomPlate')?.value.trim();
            let vehiclePlate = '';

            if (vehSelect && vehSelect.value === '__NEW__') {
                if (!customPlate) throw new Error("Please enter the new Vehicle Plate Number.");
                vehiclePlate = customPlate.toUpperCase().replace(/\s+/g, '');
            } else if (customPlate) {
                vehiclePlate = customPlate.toUpperCase().replace(/\s+/g, '');
            } else if (vehSelect && vehSelect.value) {
                vehiclePlate = vehSelect.value;
            }

            if (!vehiclePlate) throw new Error("Please select or enter Vehicle Plate Number.");

            const fuelType = document.querySelector('input[name="checkinFuelType"]:checked')?.value || 'Diesel';
            const mileage = parseFloat(document.getElementById('checkinMileage')?.value) || 10.0;
            const originCode = document.getElementById('checkinOriginSelect')?.value;
            const startOdo = document.getElementById('checkinStartOdo')?.value;
            const notes = document.getElementById('checkinNotes')?.value.trim();

            if (!originCode) throw new Error("Please select the Departure / Origin Site.");
            if (!startOdo || isNaN(startOdo)) throw new Error("Please enter a valid Starting Meter Reading.");

            let originSite = null;
            if (originCode === '__NEW_SITE__') {
                const customName = document.getElementById('checkinCustomOriginName')?.value.trim();
                const customCode = document.getElementById('checkinCustomOriginCode')?.value.trim();
                const customSup = document.getElementById('checkinCustomOriginSupervisor')?.value.trim();
                const customLoc = document.getElementById('checkinCustomOriginLocation')?.value.trim();

                if (!customName) throw new Error("Please enter the New Departure Site Name.");
                originSite = TransportDB.addSite({
                    name: customName,
                    code: customCode,
                    supervisor: customSup || 'Unassigned',
                    location: customLoc
                });
            } else {
                const sites = TransportDB.getSites();
                originSite = sites.find(s => s.code === originCode) || {
                    code: originCode,
                    name: originCode,
                    supervisor: 'Unassigned',
                    asstManager: 'Unassigned'
                };
            }

            const newTrip = TransportDB.checkInTrip({
                driverName,
                driverPhone,
                vehiclePlate,
                fuelType,
                mileage,
                originSiteCode: originSite.code,
                originSiteName: originSite.name,
                originSupervisor: originSite.supervisor,
                originAsstManager: originSite.asstManager,
                startOdo,
                startPhoto: this.startPhotoBase64,
                startLocation: this.startGPSLocation || null,
                notes
            });

            document.getElementById('driverCheckinForm').reset();
            document.getElementById('checkinCustomDriverBox')?.classList.add('hidden');
            document.getElementById('checkinCustomVehicleBox')?.classList.add('hidden');
            document.getElementById('checkinCustomOriginBox')?.classList.add('hidden');
            this.startPhotoBase64 = null;
            this.startGPSLocation = null;
            document.getElementById('startPhotoPreview')?.classList.add('hidden');
            document.getElementById('originSiteInfoCard')?.classList.add('hidden');
            const gpsCheckinDisplay = document.getElementById('gpsCheckinDisplay');
            if (gpsCheckinDisplay) gpsCheckinDisplay.classList.add('hidden');

            this.showNotification(`Trip Started! Vehicle ${newTrip.vehiclePlate} is In Transit from [${originSite.code}] ${originSite.name}.`, 'success');
            if (window.GoogleSheetsSync) window.GoogleSheetsSync.syncTrip(newTrip);
            this.refreshAll();
        } catch (err) {
            this.showNotification(err.message, 'error');
        }
    },

    renderActiveTrips: function() {
        const container = document.getElementById('activeTripsContainer');
        const activeTripsCount = document.getElementById('activeTripsCountBadge');
        if (!container) return;

        const activeTrips = TransportDB.getActiveTrips();
        if (activeTripsCount) {
            activeTripsCount.textContent = `${activeTrips.length} Active Trip${activeTrips.length === 1 ? '' : 's'}`;
        }

        if (activeTrips.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 px-4 bg-slate-900/60 rounded-3xl border border-dashed border-slate-800">
                    <div class="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-3 text-lg">
                        <i class="fa-solid fa-truck-moving"></i>
                    </div>
                    <h4 class="font-bold text-white text-base">No Active Trips in Transit</h4>
                    <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        Vehicles that check in will appear here with live transit tracking. Complete a check-in to begin.
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = activeTrips.map(trip => {
            const checkInDate = new Date(trip.checkInTime);
            const timeStr = checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = checkInDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

            const startLoc = trip.startLocation;
            let gpsHtml = '';
            if (startLoc) {
                const locStr = typeof startLoc === 'object' ? (startLoc.formattedStr || `${startLoc.lat}, ${startLoc.lng}`) : startLoc;
                gpsHtml = `
                    <div class="flex items-center justify-between p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs">
                        <span class="text-emerald-300 font-semibold text-[11px] truncate">
                            <i class="fa-solid fa-location-dot text-emerald-400 mr-1"></i> Start GPS: ${locStr}
                        </span>
                        <button onclick="App.openGPSModal('${trip.id}')" class="px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1">
                            <i class="fa-solid fa-map-location-dot"></i> View GPS Map
                        </button>
                    </div>
                `;
            } else {
                gpsHtml = `
                    <div class="flex items-center justify-between p-2 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                        <span><i class="fa-solid fa-location-crosshairs text-slate-500 mr-1"></i> Departure GPS: Not captured</span>
                        <button onclick="App.openGPSModal('${trip.id}')" class="text-blue-400 underline font-semibold text-[10px]">
                            📍 GPS Tracker
                        </button>
                    </div>
                `;
            }

            return `
                <div class="bg-slate-900/95 border border-blue-500/30 rounded-3xl p-5 shadow-2xl space-y-4 hover:border-blue-500/50 transition">
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center text-lg">
                                <i class="fa-solid fa-truck-fast"></i>
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h3 class="font-bold text-white text-base font-mono">${trip.vehiclePlate}</h3>
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                                        ● IN TRANSIT
                                    </span>
                                </div>
                                <p class="text-xs text-slate-300 font-semibold mt-0.5">
                                    <i class="fa-solid fa-user text-blue-400 mr-1"></i> ${trip.driverName} ${trip.driverPhone ? `<span class="text-slate-400 text-[11px]">(${trip.driverPhone})</span>` : ''}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <div class="text-right text-[11px] text-slate-400 mr-1">
                                <div class="font-bold text-slate-200">${timeStr}</div>
                                <div>${dateStr}</div>
                            </div>
                            <button onclick="App.openGPSModal('${trip.id}')" class="w-8 h-8 rounded-xl bg-emerald-950/60 text-emerald-400 hover:bg-emerald-900/80 border border-emerald-800/60 flex items-center justify-center transition" title="View Live GPS Location">
                                <i class="fa-solid fa-location-dot text-xs"></i>
                            </button>
                            <button onclick="App.openEditTripModal('${trip.id}')" class="w-8 h-8 rounded-xl bg-blue-950/60 text-blue-400 hover:bg-blue-900/80 border border-blue-800/60 flex items-center justify-center transition" title="Edit Trip Details">
                                <i class="fa-solid fa-pen-to-square text-xs"></i>
                            </button>
                            <button onclick="App.deleteTrip('${trip.id}')" class="w-8 h-8 rounded-xl bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 border border-rose-900/40 flex items-center justify-center transition" title="Cancel / Delete Trip">
                                <i class="fa-solid fa-trash-can text-xs"></i>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800 text-xs">
                        <div>
                            <div class="text-[10px] text-slate-400 uppercase font-semibold">Origin / Departure</div>
                            <div class="font-bold text-blue-400 font-mono text-[11px] truncate">[${trip.originSiteCode}] ${trip.originSiteName}</div>
                            <div class="text-[10px] text-slate-400 mt-0.5">Sup: ${trip.originSupervisor}</div>
                        </div>
                        <div class="border-l border-slate-800/80 pl-2">
                            <div class="text-[10px] text-slate-400 uppercase font-semibold">Start Meter & Mileage</div>
                            <div class="font-bold text-slate-200 font-mono text-xs">${trip.startOdo} km</div>
                            <div class="text-[10px] text-emerald-400">${trip.mileage} km/L (${trip.fuelType})</div>
                        </div>
                    </div>

                    ${gpsHtml}

                    <div class="pt-1">
                        <div class="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1.5 font-medium">
                            <i class="fa-solid fa-location-dot text-emerald-400"></i> Vehicle is en route. When arrived, tap below:
                        </div>
                        <button onclick="App.openCheckOutModal('${trip.id}')" class="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2">
                            <i class="fa-solid fa-flag-checkered"></i> Reached Destination? Select Destination & Check Out
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    openCheckOutModal: function(tripId) {
        const trip = TransportDB.getTripById(tripId);
        if (!trip) return;

        this.currentActiveTripId = tripId;
        this.endPhotoBase64 = null;
        document.getElementById('checkoutTripId').textContent = trip.id;
        document.getElementById('checkoutDriverName').textContent = `${trip.driverName} ${trip.driverPhone ? `(${trip.driverPhone})` : ''}`;
        document.getElementById('checkoutVehicle').textContent = trip.vehiclePlate;
        document.getElementById('checkoutOrigin').textContent = `[${trip.originSiteCode}] ${trip.originSiteName}`;
        document.getElementById('checkoutStartOdo').textContent = `${trip.startOdo} km`;
        document.getElementById('checkoutMileage').textContent = `${trip.mileage} km/L`;
        document.getElementById('checkoutFuelRate').textContent = `₹${trip.fuelRate}/${trip.fuelUnit} (${trip.fuelType})`;

        document.getElementById('checkoutEndOdo').value = '';
        document.getElementById('checkoutEndOdo').min = trip.startOdo;
        document.getElementById('checkoutTolls').value = '0';
        const checkoutNotesEl = document.getElementById('checkoutNotes');
        if (checkoutNotesEl) checkoutNotesEl.value = '';
        document.getElementById('endPhotoPreview')?.classList.add('hidden');
        document.getElementById('destSiteInfoCard')?.classList.add('hidden');

        // Reset GPS state for checkout
        this.endGPSLocation = null;
        const gpsCheckoutDisplay = document.getElementById('gpsCheckoutDisplay');
        if (gpsCheckoutDisplay) gpsCheckoutDisplay.classList.add('hidden');

        // Reset region filter for checkout modal
        const checkoutRegionFilter = document.getElementById('checkoutRegionFilter');
        if (checkoutRegionFilter) checkoutRegionFilter.value = 'ALL';
        this.selectedCheckoutRegion = 'ALL';

        document.getElementById('calcDistance').textContent = '0 km';
        document.getElementById('calcFuelConsumed').textContent = `0 ${trip.fuelUnit}`;
        document.getElementById('calcFuelCost').textContent = '₹0.00';
        document.getElementById('calcTotalCost').textContent = '₹0.00';
        document.getElementById('calcCostPerKm').textContent = '₹0.00/km';
        document.getElementById('checkoutAnomalyWarning')?.classList.add('hidden');

        // Apply role view inside modal
        this.applyRoleView();

        document.getElementById('checkoutModal').classList.remove('hidden');
    },

    closeCheckOutModal: function() {
        document.getElementById('checkoutModal').classList.add('hidden');
        this.currentActiveTripId = null;
    },

    recalculateCheckoutPreview: function() {
        if (!this.currentActiveTripId) return;
        const trip = TransportDB.getTripById(this.currentActiveTripId);
        if (!trip) return;

        const endOdo = parseFloat(document.getElementById('checkoutEndOdo').value);
        const tolls = parseFloat(document.getElementById('checkoutTolls').value) || 0;

        if (isNaN(endOdo) || endOdo < trip.startOdo) {
            document.getElementById('calcDistance').textContent = 'Invalid Odo';
            document.getElementById('calcFuelConsumed').textContent = '-';
            document.getElementById('calcFuelCost').textContent = '-';
            document.getElementById('calcTotalCost').textContent = '-';
            document.getElementById('calcCostPerKm').textContent = '-';
            return;
        }

        const metrics = TransportCalculator.calculateLiveTrip(trip.startOdo, endOdo, trip.mileage, trip.fuelRate, tolls);
        document.getElementById('calcDistance').textContent = `${metrics.distance} km`;
        document.getElementById('calcFuelConsumed').textContent = `${metrics.fuelConsumed} ${trip.fuelUnit}`;
        document.getElementById('calcFuelCost').textContent = `₹${metrics.fuelCost.toLocaleString()}`;
        document.getElementById('calcTotalCost').textContent = `₹${metrics.totalCost.toLocaleString()}`;
        document.getElementById('calcCostPerKm').textContent = `₹${metrics.costPerKm}/km`;

        const destCode = document.getElementById('checkoutDestSelect').value;
        if (destCode) {
            const matrix = TransportCalculator.computeSiteToSiteMatrix(TransportDB.getTrips(), TransportDB.getSites());
            const route = matrix.find(r => r.originCode === trip.originSiteCode && r.destCode === destCode);
            const warnEl = document.getElementById('checkoutAnomalyWarning');
            if (route && route.count >= 2) {
                const diff = metrics.distance - route.avgDistance;
                if (Math.abs(diff) > 5) {
                    warnEl.textContent = `⚠️ Note: This trip distance (${metrics.distance} km) differs from historical average for this route (${route.avgDistance} km).`;
                    warnEl.classList.remove('hidden');
                } else {
                    warnEl.classList.add('hidden');
                }
            } else {
                warnEl?.classList.add('hidden');
            }
        }
    },

    handleDriverCheckOut: function() {
        try {
            if (!this.currentActiveTripId) throw new Error("No active trip selected.");

            const destCode = document.getElementById('checkoutDestSelect').value;
            const endOdo = document.getElementById('checkoutEndOdo').value;
            const tolls = document.getElementById('checkoutTolls').value;
            const notes = document.getElementById('checkoutNotes')?.value.trim() || '';

            if (!destCode) throw new Error("Please select the Destination / Arrival Site.");
            if (!endOdo || isNaN(endOdo)) throw new Error("Please enter ending meter reading.");

            let destSite = null;
            if (destCode === '__NEW_SITE__') {
                const customName = document.getElementById('checkoutCustomDestName')?.value.trim();
                const customCode = document.getElementById('checkoutCustomDestCode')?.value.trim();
                const customSup = document.getElementById('checkoutCustomDestSupervisor')?.value.trim();
                const customLoc = document.getElementById('checkoutCustomDestLocation')?.value.trim();

                if (!customName) throw new Error("Please enter the New Arrival Site Name.");
                destSite = TransportDB.addSite({
                    name: customName,
                    code: customCode,
                    supervisor: customSup || 'Unassigned',
                    location: customLoc
                });
            } else {
                const sites = TransportDB.getSites();
                destSite = sites.find(s => s.code === destCode) || {
                    code: destCode,
                    name: destCode,
                    supervisor: 'Unassigned',
                    asstManager: 'Unassigned'
                };
            }

            const completedTrip = TransportDB.checkOutTrip(this.currentActiveTripId, {
                destSiteCode: destSite.code,
                destSiteName: destSite.name,
                destSupervisor: destSite.supervisor,
                destAsstManager: destSite.asstManager,
                endOdo,
                tollsAndMisc: tolls,
                endPhoto: this.endPhotoBase64,
                endLocation: this.endGPSLocation || null,
                notes
            });

            this.endGPSLocation = null;
            this.closeCheckOutModal();
            this.showNotification(`Trip ${completedTrip.id} Completed! Reached [${destSite.code}] ${destSite.name} (${completedTrip.distance} km).`, 'success');
            if (window.GoogleSheetsSync) window.GoogleSheetsSync.syncTrip(completedTrip);
            this.refreshAll();
        } catch (err) {
            this.showNotification(err.message, 'error');
        }
    },

    // --- FLEET & VEHICLE MANAGEMENT ---
    handleAddVehicle: function() {
        const plate = document.getElementById('newVehiclePlate')?.value.trim();
        const fuelType = document.getElementById('newVehicleFuelType')?.value;
        const mileage = document.getElementById('newVehicleMileage')?.value;

        if (!plate) { this.showNotification('Enter vehicle plate number.', 'error'); return; }
        if (!mileage || isNaN(mileage) || parseFloat(mileage) <= 0) { this.showNotification('Enter valid mileage (km/L).', 'error'); return; }

        try {
            TransportDB.addVehicle(plate, fuelType, mileage);
            document.getElementById('newVehiclePlate').value = '';
            document.getElementById('newVehicleMileage').value = '';
            this.showNotification(`Vehicle ${plate.toUpperCase()} added to fleet!`, 'success');
            this.renderVehicleFleet();
            this.populateDropdowns();
        } catch (e) {
            this.showNotification(e.message, 'error');
        }
    },

    handleUpdateVehicleMileage: function(plate, inputEl) {
        const newMileage = parseFloat(inputEl.value);
        if (isNaN(newMileage) || newMileage <= 0) {
            this.showNotification('Please enter a valid mileage number (e.g. 10.0)', 'error');
            return;
        }
        try {
            TransportDB.updateVehicle(plate, { mileage: newMileage });
            this.showNotification(`Updated ${plate} average to ${newMileage} km/L`, 'success');
            this.populateDropdowns();
        } catch (e) {
            this.showNotification(e.message, 'error');
        }
    },

    handleDeleteVehicle: function(plate) {
        if (!confirm(`Remove vehicle ${plate} from fleet list?`)) return;
        TransportDB.deleteVehicle(plate);
        this.showNotification(`Vehicle ${plate} removed.`, 'success');
        this.renderVehicleFleet();
        this.populateDropdowns();
    },

    renderVehicleFleet: function() {
        const container = document.getElementById('vehicleFleetList');
        if (!container) return;
        const vehicles = TransportDB.getVehicles();
        if (!vehicles || vehicles.length === 0) {
            container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">No vehicles registered yet.</p>';
            return;
        }

        container.innerHTML = vehicles.map(v => `
            <div class="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-3.5 hover:border-slate-700 transition">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-base">
                        <i class="fa-solid fa-truck"></i>
                    </div>
                    <div>
                        <div class="font-bold text-white font-mono text-sm tracking-wide">${v.plate}</div>
                        <div class="text-[11px] text-slate-400">${v.fuelType} · Transport Vehicle</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-2 py-1">
                        <span class="text-[10px] text-slate-400 font-semibold">Avg:</span>
                        <input type="number" step="0.1" min="1" max="40" value="${v.mileage}"
                            class="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-emerald-300 font-mono text-xs font-bold text-center focus:outline-none focus:border-emerald-500"
                            title="Average km/L (editable)"
                            onchange="App.handleUpdateVehicleMileage('${v.plate}', this)">
                        <span class="text-[10px] text-slate-400">km/L</span>
                    </div>
                    <button onclick="App.handleDeleteVehicle('${v.plate}')" class="w-8 h-8 rounded-xl bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 border border-rose-900/50 flex items-center justify-center transition" title="Delete Vehicle">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
            </div>
        `).join('');
    },

    // --- DRIVERS MANAGEMENT ---
    handleAddDriver: function() {
        const name = document.getElementById('newDriverName')?.value.trim();
        const phone = document.getElementById('newDriverPhone')?.value.trim();

        if (!name) { this.showNotification('Enter driver name.', 'error'); return; }

        try {
            TransportDB.addDriver(name, phone);
            document.getElementById('newDriverName').value = '';
            document.getElementById('newDriverPhone').value = '';
            this.showNotification(`Driver "${name}" saved!`, 'success');
            this.renderDriversList();
            this.populateDropdowns();
        } catch (e) {
            this.showNotification(e.message, 'error');
        }
    },

    handleDeleteDriver: function(idOrName) {
        if (!confirm(`Delete driver record?`)) return;
        TransportDB.deleteDriver(idOrName);
        this.showNotification('Driver removed.', 'success');
        this.renderDriversList();
        this.populateDropdowns();
    },

    renderDriversList: function() {
        const container = document.getElementById('driversListContainer');
        if (!container) return;
        const drivers = TransportDB.getDrivers();
        if (!drivers || drivers.length === 0) {
            container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">No drivers registered yet. Add driver above or enter during check-in.</p>';
            return;
        }

        container.innerHTML = drivers.map(d => `
            <div class="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-3 hover:border-slate-700 transition text-xs">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-xs">
                        <i class="fa-solid fa-id-card"></i>
                    </div>
                    <div>
                        <div class="font-bold text-white text-xs">${d.name}</div>
                        <div class="text-[11px] text-slate-400"><i class="fa-solid fa-phone text-[10px] text-emerald-400 mr-1"></i>${d.phone || 'No Mobile'}</div>
                    </div>
                </div>
                <button onclick="App.handleDeleteDriver('${d.id || d.name}')" class="w-7 h-7 rounded-lg bg-rose-950/30 text-rose-400 hover:bg-rose-900/50 border border-rose-900/40 flex items-center justify-center transition" title="Delete Driver">
                    <i class="fa-solid fa-trash text-[11px]"></i>
                </button>
            </div>
        `).join('');
    },

    // --- SITE-TO-SITE MATRIX ---
    renderSiteMatrix: function() {
        const container = document.getElementById('siteMatrixContainer') || document.getElementById('matrixTableBody');
        const countBadge = document.getElementById('matrixRoutesCount');
        if (!container) return;

        const trips = TransportDB.getTrips();
        const sites = TransportDB.getSites();
        const routes = TransportCalculator.computeSiteToSiteMatrix(trips, sites);

        if (countBadge) countBadge.textContent = `${routes.length} Route${routes.length === 1 ? '' : 's'}`;

        if (routes.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-16 px-4 bg-slate-900/60 rounded-3xl border border-dashed border-slate-800">
                    <div class="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-3 text-lg">
                        <i class="fa-solid fa-route"></i>
                    </div>
                    <h4 class="font-bold text-white text-base">No Completed Site-to-Site Routes Yet</h4>
                    <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                        As drivers complete trips between facilities, route averages, fuel costs, distance benchmarks, and anomaly alerts will appear here automatically.
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = routes.map(r => `
            <div class="bg-slate-900/90 border border-slate-800 hover:border-blue-500/40 rounded-3xl p-5 shadow-xl transition space-y-4 flex flex-col justify-between">
                <div>
                    <!-- Route Header -->
                    <div class="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                        <span class="bg-blue-500/20 text-blue-300 font-mono text-[11px] font-bold px-2.5 py-1 rounded-xl border border-blue-500/30">
                            ${r.tripCount} Trip${r.tripCount === 1 ? '' : 's'} Logged
                        </span>
                        <span class="font-mono font-bold text-emerald-400 text-sm">
                            ₹${r.totalCost.toLocaleString()} <span class="text-[10px] text-slate-400 font-normal">Total</span>
                        </span>
                    </div>

                    <!-- Origin to Destination Visual -->
                    <div class="space-y-2 mt-3 text-xs">
                        <div class="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                            <div class="text-[10px] text-blue-400 uppercase font-semibold">Origin Site</div>
                            <div class="font-bold text-white text-xs truncate">[${r.originCode}] ${r.originSiteName}</div>
                            <div class="text-[10px] text-slate-400 mt-0.5"><i class="fa-solid fa-user-tie text-emerald-400 mr-1"></i>Sup: ${r.originSupervisor || 'Unassigned'}</div>
                        </div>

                        <div class="flex items-center justify-center text-slate-500 text-xs py-0.5">
                            <i class="fa-solid fa-arrow-down"></i>
                        </div>

                        <div class="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                            <div class="text-[10px] text-emerald-400 uppercase font-semibold">Destination Site</div>
                            <div class="font-bold text-white text-xs truncate">[${r.destCode}] ${r.destSiteName}</div>
                            <div class="text-[10px] text-slate-400 mt-0.5"><i class="fa-solid fa-user-tie text-blue-400 mr-1"></i>Sup: ${r.destSupervisor || 'Unassigned'}</div>
                        </div>
                    </div>

                    <!-- Metrics Grid -->
                    <div class="grid grid-cols-3 gap-2 mt-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                        <div>
                            <div class="text-[10px] text-slate-400">Avg Distance</div>
                            <div class="font-bold text-white font-mono text-xs">${r.avgDistance} km</div>
                        </div>
                        <div>
                            <div class="text-[10px] text-slate-400">Avg Cost/Trip</div>
                            <div class="font-bold text-blue-400 font-mono text-xs">₹${r.avgTotalCost.toFixed(2)}</div>
                        </div>
                        <div>
                            <div class="text-[10px] text-slate-400">Rate / km</div>
                            <div class="font-bold text-purple-400 font-mono text-xs">₹${r.avgCostPerKm}/km</div>
                        </div>
                    </div>
                </div>

                ${r.anomalyCount > 0 ? `
                    <div class="bg-amber-950/40 border border-amber-800/60 p-2 rounded-xl text-amber-300 text-[10px] flex items-center gap-1.5">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>${r.anomalyCount} trip(s) deviated >20% from route benchmark</span>
                    </div>
                ` : ''}
            </div>
        `).join('');
    },

    // --- TRIP LEDGER TABLE ---
    renderTripTable: function() {
        const container = document.getElementById('tripTableBody');
        const countBadge = document.getElementById('tripsFilteredCount');
        if (!container) return;

        const allTrips = TransportDB.getTrips();
        const trips = TransportCalculator.filterTrips(allTrips, this.tripFilters);

        if (countBadge) countBadge.textContent = `${trips.length} of ${allTrips.length} Trips`;

        if (trips.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-12 text-slate-500 text-xs">
                        No trips found matching the selected filters.
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = trips.map(t => {
            const checkInDate = new Date(t.checkInTime);
            const timeStr = checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = checkInDate.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });

            const isComp = t.status === 'COMPLETED';

            const distNum = parseFloat(t.distance) || 0;
            const milNum = parseFloat(t.mileage) || 10.0;
            const rawFuel = parseFloat(t.fuelConsumed);
            const safeFuelConsumed = (!isNaN(rawFuel) && rawFuel > 0) ? rawFuel : (distNum > 0 && milNum > 0 ? parseFloat((distNum / milNum).toFixed(1)) : 0);
            const safeFuelUnit = t.fuelUnit || 'Litre';

            return `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/30 transition text-xs">
                    <td class="py-3.5 px-4 font-mono font-bold text-blue-400">
                        <div class="flex items-center gap-1.5">
                            <span>${t.id}</span>
                            <button onclick="App.openEditTripModal('${t.id}')" class="px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 hover:bg-blue-900 border border-blue-800/80 text-[10px] font-sans font-semibold transition flex items-center gap-1" title="Edit Trip Details">
                                <i class="fa-solid fa-pen text-[9px]"></i> Edit
                            </button>
                        </div>
                        ${t.isEdited ? `
                            <div class="mt-1">
                                <span class="inline-flex items-center gap-1 text-[9px] text-amber-400 font-sans font-medium bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-800/60" title="Edited by ${t.editedBy} on ${new Date(t.editedAt).toLocaleString()}${t.editReason ? ` (${t.editReason})` : ''}">
                                    <i class="fa-solid fa-clock-rotate-left text-[8px]"></i> by ${t.editedBy}
                                </span>
                            </div>
                        ` : ''}
                    </td>
                    <td class="py-3.5 px-4 text-slate-300">
                        <div>${dateStr}</div>
                        <div class="text-[10px] text-slate-500">${timeStr}</div>
                    </td>
                    <td class="py-3.5 px-4 font-semibold text-white">
                        <div>${t.driverName}</div>
                        ${t.driverPhone ? `<div class="text-[10px] text-slate-400 font-mono">${t.driverPhone}</div>` : ''}
                    </td>
                    <td class="py-3.5 px-4">
                        <div class="font-mono text-slate-200 font-semibold">${t.vehiclePlate}</div>
                        <div class="text-[10px] text-amber-400">${t.fuelType} (₹${t.fuelRate})</div>
                    </td>
                    <td class="py-3.5 px-4 text-[11px]">
                        <div class="flex items-center gap-1.5 text-blue-300 truncate max-w-xs font-semibold">
                            <span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span> [${t.originSiteCode}] ${t.originSiteName}
                        </div>
                        <div class="text-[10px] text-slate-400 pl-3">Supervisor: <strong>${t.originSupervisor || 'N/A'}</strong> | Asst. Mgr: ${t.originAsstManager || 'N/A'}</div>
                        ${isComp ? `
                            <div class="flex items-center gap-1.5 text-emerald-300 truncate max-w-xs font-semibold mt-1">
                                <i class="fa-solid fa-arrow-right text-[9px] text-slate-500"></i> [${t.destSiteCode}] ${t.destSiteName}
                            </div>
                        ` : '<div class="text-[10px] text-amber-400 font-semibold mt-1">En Route...</div>'}
                    </td>
                    <td class="py-3.5 px-4 font-mono">
                        ${isComp ? `
                            <div class="font-bold text-slate-200">${t.distance} km</div>
                            <div class="text-[10px] text-slate-500">${t.startOdo} → ${t.endOdo}</div>
                        ` : `<div class="text-slate-400">${t.startOdo} km</div>`}
                    </td>
                    <td class="py-3.5 px-4 font-mono">
                        ${isComp ? `
                            <div class="font-semibold text-slate-200">${safeFuelConsumed} ${safeFuelUnit}</div>
                            <div class="text-[10px] text-slate-500">${t.mileage} km/L</div>
                        ` : '-'}
                    </td>
                    <td class="py-3.5 px-4 font-mono">
                        ${isComp ? `
                            <div class="font-bold text-emerald-400">₹${t.totalCost.toFixed(2)}</div>
                            <div class="text-[10px] text-slate-400">₹${t.costPerKm}/km</div>
                        ` : '-'}
                    </td>
                    <td class="py-3.5 px-4">
                        ${t.startPhoto || t.endPhoto ? `
                            <button onclick="App.viewTripPhotos('${t.id}')" class="px-2.5 py-1 rounded-xl bg-blue-950 text-blue-300 border border-blue-800 text-[11px] font-semibold hover:bg-blue-900 transition flex items-center gap-1">
                                <i class="fa-solid fa-camera"></i> Photos
                            </button>
                        ` : '<span class="text-slate-600 text-[11px]">None</span>'}
                    </td>
                    <td class="py-3.5 px-4">
                        ${isComp ? (
                            t.isVerified ? `
                                <div class="flex flex-col items-start gap-0.5">
                                    <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                        <i class="fa-solid fa-circle-check text-[10px]"></i> Verified
                                    </span>
                                    <span class="text-[10px] text-emerald-400 font-medium truncate max-w-[130px]" title="Verified by ${t.verifiedBy}">by ${t.verifiedBy || 'Supervisor'}</span>
                                </div>
                            ` : `
                                <button onclick="App.openVerifyModal('${t.id}')" class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition flex items-center gap-1.5 shadow-sm">
                                    <i class="fa-solid fa-signature text-[10px]"></i> Verify
                                </button>
                            `
                        ) : '<span class="text-slate-500 text-[11px]">In Transit</span>'}
                    </td>
                    <td class="py-3.5 px-4 text-right">
                        <div class="flex items-center justify-end gap-1.5">
                            <button onclick="App.openEditTripModal('${t.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition" title="Edit Trip Record">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            ${isComp ? `
                                <button onclick="App.printTrip('${t.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition" title="Print Slip">
                                    <i class="fa-solid fa-print"></i>
                                </button>
                            ` : ''}
                            <button onclick="App.deleteTrip('${t.id}')" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    handleFilterChange: function() {
        this.tripFilters.status = document.getElementById('filterStatus')?.value || 'ALL';
        this.tripFilters.originCode = document.getElementById('filterOrigin')?.value || 'ALL';
        this.tripFilters.destCode = document.getElementById('filterDest')?.value || 'ALL';
        this.tripFilters.fuelType = document.getElementById('filterFuelType')?.value || 'ALL';
        this.tripFilters.dateFrom = document.getElementById('filterDateFrom')?.value || '';
        this.tripFilters.dateTo = document.getElementById('filterDateTo')?.value || '';
        this.tripFilters.search = document.getElementById('filterSearch')?.value || '';
        this.renderTripTable();
    },

    openVerifyModal: function(tripId) {
        const trip = TransportDB.getTripById(tripId);
        if (!trip) return;

        const modal = document.getElementById('verifyTripModal');
        const targetIdInput = document.getElementById('verifyTripTargetId');
        const badgeEl = document.getElementById('verifyTripIdBadge');
        const summaryEl = document.getElementById('verifyTripRouteSummary');
        const supervisorInput = document.getElementById('verifySupervisorName');
        const notesInput = document.getElementById('verifyNotes');

        if (targetIdInput) targetIdInput.value = trip.id;
        if (badgeEl) badgeEl.textContent = trip.id;

        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="flex justify-between">
                    <span class="text-slate-400">Route:</span>
                    <span class="font-bold text-white">[${trip.originSiteCode}] ${trip.originSiteName} ➔ [${trip.destSiteCode || '-'}] ${trip.destSiteName || 'Destination'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-400">Driver &amp; Vehicle:</span>
                    <span class="text-white font-mono">${trip.driverName} · ${trip.vehiclePlate}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-400">Distance &amp; Total Cost:</span>
                    <span class="font-mono font-bold text-emerald-400">${trip.distance} km (₹${trip.totalCost})</span>
                </div>
            `;
        }

        if (supervisorInput) {
            supervisorInput.value = trip.destSupervisor || trip.originSupervisor || '';
            setTimeout(() => supervisorInput.focus(), 150);
        }
        if (notesInput) notesInput.value = '';

        if (modal) modal.classList.remove('hidden');
    },

    closeVerifyModal: function() {
        const modal = document.getElementById('verifyTripModal');
        if (modal) modal.classList.add('hidden');
    },

    handleConfirmVerification: function() {
        const tripId = document.getElementById('verifyTripTargetId')?.value;
        const supervisorName = document.getElementById('verifySupervisorName')?.value.trim();
        const notes = document.getElementById('verifyNotes')?.value.trim();

        if (!supervisorName) {
            this.showNotification('Please enter the verifier / supervisor name.', 'error');
            return;
        }

        TransportDB.verifyTrip(tripId, supervisorName, notes);
        this.closeVerifyModal();
        this.showNotification(`Trip ${tripId} verified by ${supervisorName}.`, 'success');
        this.refreshAll();
    },

    // --- MANAGEMENT TRIP EDIT & AUDIT TRAIL ---
    openEditTripModal: function(tripId) {
        const trip = TransportDB.getTripById(tripId);
        if (!trip) return;

        const modal = document.getElementById('editTripModal');
        const idBadge = document.getElementById('editTripIdBadge');
        const targetId = document.getElementById('editTripTargetId');
        const managerInput = document.getElementById('editManagerName');
        const reasonInput = document.getElementById('editReason');
        const originSelect = document.getElementById('editOriginSelect');
        const destSelect = document.getElementById('editDestSelect');
        const driverInput = document.getElementById('editDriverName');
        const plateInput = document.getElementById('editVehiclePlate');
        const startOdoInput = document.getElementById('editStartOdo');
        const endOdoInput = document.getElementById('editEndOdo');
        const tollsInput = document.getElementById('editTolls');
        const notesInput = document.getElementById('editNotes');

        const sites = TransportDB.getSites();

        if (targetId) targetId.value = trip.id;
        if (idBadge) idBadge.textContent = trip.id;
        if (managerInput) {
            managerInput.value = trip.editedBy || '';
            setTimeout(() => managerInput.focus(), 150);
        }
        if (reasonInput) reasonInput.value = trip.editReason || '';

        // Reset and populate Origin select
        if (originSelect) {
            originSelect.innerHTML = sites.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Sup: ${s.supervisor || 'Unassigned'})</option>`).join('');
            originSelect.value = trip.originSiteCode;
        }

        // Reset and populate Dest select
        if (destSelect) {
            let opts = '<option value="">-- No Destination Assigned (In Transit) --</option>';
            opts += sites.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Sup: ${s.supervisor || 'Unassigned'})</option>`).join('');
            destSelect.innerHTML = opts;
            destSelect.value = trip.destSiteCode || '';
        }

        const originSearch = document.getElementById('editOriginSearch');
        const destSearch = document.getElementById('editDestSearch');
        if (originSearch) originSearch.value = '';
        if (destSearch) destSearch.value = '';

        const originBadge = document.getElementById('editOriginSiteBadge');
        const destBadge = document.getElementById('editDestSiteBadge');
        if (originBadge) originBadge.textContent = `${sites.length} Sites`;
        if (destBadge) destBadge.textContent = `${sites.length} Sites`;

        if (driverInput) driverInput.value = trip.driverName || '';
        if (plateInput) plateInput.value = trip.vehiclePlate || '';
        if (startOdoInput) startOdoInput.value = trip.startOdo || 0;
        if (endOdoInput) endOdoInput.value = trip.endOdo !== null && trip.endOdo !== undefined ? trip.endOdo : '';
        if (tollsInput) tollsInput.value = trip.tollsAndMisc || 0;
        if (notesInput) notesInput.value = trip.notes || '';

        if (modal) modal.classList.remove('hidden');
    },

    closeEditTripModal: function() {
        const modal = document.getElementById('editTripModal');
        if (modal) modal.classList.add('hidden');
    },

    filterEditOriginSites: function(searchTerm) {
        const query = (searchTerm || '').trim().toLowerCase();
        const originSelect = document.getElementById('editOriginSelect');
        const countBadge = document.getElementById('editOriginSiteBadge');
        if (!originSelect) return;

        const sites = TransportDB.getSites();
        const filtered = query ? sites.filter(s => 
            (s.code && s.code.toLowerCase().includes(query)) || 
            (s.name && s.name.toLowerCase().includes(query)) || 
            (s.supervisor && s.supervisor.toLowerCase().includes(query))
        ) : sites;

        if (countBadge) countBadge.textContent = `${filtered.length} of ${sites.length} Sites`;

        let html = `<option value="">-- Select Departure Site (${filtered.length} match${filtered.length === 1 ? '' : 'es'}) --</option>`;
        html += filtered.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Sup: ${s.supervisor || 'Unassigned'})</option>`).join('');
        originSelect.innerHTML = html;

        if (filtered.length === 1 && query.length >= 2) {
            originSelect.value = filtered[0].code;
        }
    },

    filterEditDestSites: function(searchTerm) {
        const query = (searchTerm || '').trim().toLowerCase();
        const destSelect = document.getElementById('editDestSelect');
        const countBadge = document.getElementById('editDestSiteBadge');
        if (!destSelect) return;

        const sites = TransportDB.getSites();
        const filtered = query ? sites.filter(s => 
            (s.code && s.code.toLowerCase().includes(query)) || 
            (s.name && s.name.toLowerCase().includes(query)) || 
            (s.supervisor && s.supervisor.toLowerCase().includes(query))
        ) : sites;

        if (countBadge) countBadge.textContent = `${filtered.length} of ${sites.length} Sites`;

        let html = `<option value="">-- No Destination Assigned / In Transit --</option>`;
        html += filtered.map(s => `<option value="${s.code}">[${s.code}] ${s.name} (Sup: ${s.supervisor || 'Unassigned'})</option>`).join('');
        destSelect.innerHTML = html;

        if (filtered.length === 1 && query.length >= 2) {
            destSelect.value = filtered[0].code;
        }
    },

    handleSaveTripEdit: function() {
        try {
            const tripId = document.getElementById('editTripTargetId')?.value;
            const managerName = document.getElementById('editManagerName')?.value.trim();
            const editReason = document.getElementById('editReason')?.value.trim();
            const originCode = document.getElementById('editOriginSelect')?.value;
            const destCode = document.getElementById('editDestSelect')?.value;
            const driverName = document.getElementById('editDriverName')?.value.trim();
            const vehiclePlate = document.getElementById('editVehiclePlate')?.value.trim().toUpperCase().replace(/\s+/g, '');
            const startOdo = parseFloat(document.getElementById('editStartOdo')?.value);
            const endOdoRaw = document.getElementById('editEndOdo')?.value.trim();
            const endOdo = endOdoRaw !== '' ? parseFloat(endOdoRaw) : null;
            const tolls = parseFloat(document.getElementById('editTolls')?.value) || 0;
            const notes = document.getElementById('editNotes')?.value.trim() || '';

            if (!tripId) throw new Error("Trip ID missing.");
            if (!managerName) throw new Error("Manager name is required to record the audit log.");
            if (!originCode) throw new Error("Departure / Origin Site is required.");
            if (!driverName) throw new Error("Driver name is required.");
            if (!vehiclePlate) throw new Error("Vehicle plate is required.");
            if (isNaN(startOdo)) throw new Error("Valid start odometer reading is required.");
            if (endOdo !== null && !isNaN(endOdo) && endOdo < startOdo) {
                throw new Error(`Ending meter (${endOdo}) cannot be less than start meter (${startOdo}).`);
            }

            const sites = TransportDB.getSites();
            const originSite = sites.find(s => s.code === originCode) || { code: originCode, name: originCode, supervisor: 'N/A', asstManager: 'N/A' };
            const destSite = destCode ? (sites.find(s => s.code === destCode) || { code: destCode, name: destCode, supervisor: 'N/A', asstManager: 'N/A' }) : null;

            const updatedFields = {
                originSiteCode: originSite.code,
                originSiteName: originSite.name,
                originSupervisor: originSite.supervisor || 'N/A',
                originAsstManager: originSite.asstManager || 'N/A',
                destSiteCode: destSite ? destSite.code : null,
                destSiteName: destSite ? destSite.name : null,
                destSupervisor: destSite ? (destSite.supervisor || 'N/A') : null,
                destAsstManager: destSite ? (destSite.asstManager || 'N/A') : null,
                driverName,
                vehiclePlate,
                startOdo,
                endOdo,
                tollsAndMisc: tolls,
                notes
            };

            TransportDB.updateTrip(tripId, updatedFields, managerName, editReason);
            this.closeEditTripModal();
            this.showNotification(`Trip ${tripId} updated by Manager ${managerName}.`, 'success');
            this.refreshAll();
        } catch (err) {
            this.showNotification(`Update failed: ${err.message}`, 'error');
        }
    },

    printTrip: function(tripId) {
        const trip = TransportDB.getTripById(tripId);
        if (trip) AppExporter.printTripSlip(trip);
    },

    deleteTrip: function(tripId) {
        if (confirm(`Are you sure you want to permanently delete trip record ${tripId}? This will remove it from both your device and cloud storage.`)) {
            TransportDB.deleteTrip(tripId);
            this.showNotification(`Trip ${tripId} permanently deleted.`, 'success');
            this.refreshAll();
        }
    },

    handleClearAllTrips: async function() {
        const total = TransportDB.getTrips().length;
        if (total === 0) {
            this.showNotification('No past trips to delete.', 'info');
            return;
        }

        const pin = prompt(`⚠️ CAUTION: You are about to permanently delete all ${total} past trip records from both this device and Cloud Database.\n\nPlease enter Management PIN to confirm:`);
        if (!pin) return;

        const correctPin = TransportDB.getManagementPin();
        if (pin.trim() !== correctPin) {
            this.showNotification('❌ Incorrect PIN. Clear cancelled.', 'error');
            return;
        }

        try {
            await TransportDB.clearAllTrips();
            this.showNotification('✓ All past trip records have been permanently cleared.', 'success');
            this.refreshAll();
        } catch (e) {
            this.showNotification(`Clear failed: ${e.message}`, 'error');
        }
    },

    viewTripPhotos: function(tripId) {
        const trip = TransportDB.getTripById(tripId);
        if (!trip) return;
        let html = '';
        if (trip.startPhoto) html += `<div><h5 class="font-bold text-slate-300 text-xs mb-1">Departure Meter Photo</h5><img src="${trip.startPhoto}" class="rounded-xl border border-slate-700 max-h-64 object-cover"/></div>`;
        if (trip.endPhoto) html += `<div><h5 class="font-bold text-slate-300 text-xs mb-1">Arrival Meter Photo</h5><img src="${trip.endPhoto}" class="rounded-xl border border-slate-700 max-h-64 object-cover"/></div>`;
        
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4";
        modal.innerHTML = `
            <div class="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4">
                <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 class="font-bold text-white text-sm">Meter Verification Photos - ${trip.id}</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="space-y-3">${html}</div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    renderFleetKPIs: function() {
        const trips = TransportDB.getTrips();
        const kpis = TransportCalculator.computeFleetKPIs(trips);

        if (document.getElementById('kpiTotalSpend')) document.getElementById('kpiTotalSpend').textContent = `₹${kpis.totalCost.toLocaleString()}`;
        if (document.getElementById('kpiTotalDistance')) document.getElementById('kpiTotalDistance').textContent = `${kpis.totalDistance.toLocaleString()} km`;
        if (document.getElementById('kpiTotalFuel')) document.getElementById('kpiTotalFuel').textContent = `${kpis.totalFuelConsumed.toLocaleString()} L`;
        if (document.getElementById('kpiAvgCostPerKm')) document.getElementById('kpiAvgCostPerKm').textContent = `₹${kpis.avgCostPerKm}/km`;
        if (document.getElementById('kpiCompletedCount')) document.getElementById('kpiCompletedCount').textContent = `${kpis.completedTripsCount} Trips`;
        if (document.getElementById('kpiActiveCount')) document.getElementById('kpiActiveCount').textContent = `${kpis.activeTripsCount} Active`;
    },

    updateAutoSiteCodeSuggestion: function() {
        const codeInput = document.getElementById('siteCode');
        if (codeInput) {
            const nextCode = TransportDB.getNextSiteCode();
            codeInput.value = nextCode;
            codeInput.placeholder = nextCode;
        }
    },

    handleAddSite: function() {
        const name = document.getElementById('siteName').value.trim();
        const code = document.getElementById('siteCode').value.trim();
        const supervisor = document.getElementById('siteSupervisor').value.trim();
        const asstManager = document.getElementById('siteAsstManager').value.trim();
        const manager = document.getElementById('siteManager').value.trim();
        const region = document.getElementById('siteRegion').value.trim();

        if (!name) {
            alert('Please enter site name.');
            return;
        }

        const newSite = TransportDB.addSite({
            name,
            code,
            supervisor,
            asstManager,
            manager,
            region
        });

        document.getElementById('addSiteForm').reset();
        this.updateAutoSiteCodeSuggestion();
        this.showNotification(`Site "${newSite.name}" added with Auto Code: ${newSite.code}!`, 'success');
        this.refreshAll();
    },

    renderSitesList: function() {
        const container = document.getElementById('sitesListContainer');
        const sitesCountBadge = document.getElementById('sitesTotalCountBadge');
        if (!container) return;

        const sites = TransportDB.getSites();
        if (sitesCountBadge) {
            sitesCountBadge.textContent = `${sites.length} Facilities in System`;
        }

        container.innerHTML = sites.slice(0, 30).map(s => `
            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between text-xs hover:border-slate-700 transition">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <span class="bg-blue-950 text-blue-400 font-mono font-bold px-2 py-0.5 rounded text-[11px] border border-blue-900">${s.code}</span>
                        <span class="text-[10px] text-slate-500 uppercase font-semibold">${s.salesModel || 'PAAS'} • ${s.region || 'GTS'}</span>
                    </div>
                    <h4 class="font-bold text-white text-sm mb-1">${s.name}</h4>
                    <div class="space-y-1 text-[11px] text-slate-400 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 mt-2">
                        <div><i class="fa-solid fa-user-tie text-emerald-400 mr-1"></i> Supervisor: <strong class="text-slate-200">${s.supervisor || 'Unassigned'}</strong></div>
                        <div><i class="fa-solid fa-user-gear text-blue-400 mr-1"></i> Asst. Manager: <strong class="text-slate-200">${s.asstManager || 'Unassigned'}</strong></div>
                        <div><i class="fa-solid fa-building-user text-purple-400 mr-1"></i> Manager: <strong class="text-slate-200">${s.manager || 'Prabhugouda Patil'}</strong></div>
                    </div>
                </div>
            </div>
        `).join('');
    },

    handleExcelImport: function(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                const sites = [];
                jsonData.forEach((row, idx) => {
                    const code = row['Site code'] || row['Site Code'] || `HYD${(idx + 1).toString().padStart(3, '0')}`;
                    const name = row['Site Name'] || row['Site name'] || row['Client Name'] || `Facility Site ${idx + 1}`;
                    if (name) {
                        sites.push({
                            id: `site-excel-${idx}`,
                            code: String(code).trim().toUpperCase(),
                            name: String(name).trim(),
                            supervisor: row['Supervisor'] || 'Unassigned',
                            asstManager: row['Assistant Manager'] || row['Asst Manager'] || 'Unassigned',
                            manager: row['Manager'] || 'Prabhugouda Patil',
                            salesModel: row['Sales Model'] || 'PAAS',
                            region: row['Region'] || 'GTS',
                            serviceProvider: row['Service Provider'] || 'GAMLAA',
                            customerGroup: row['Customer Group'] || name.split(' ')[0],
                            status: 'ACTIVE'
                        });
                    }
                });

                if (sites.length > 0) {
                    TransportDB.saveSites(sites);
                    this.showNotification(`Successfully imported ${sites.length} facility sites from Excel!`, 'success');
                    this.refreshAll();
                } else {
                    throw new Error("No site rows found in Excel.");
                }
            } catch (err) {
                this.showNotification(`Excel import failed: ${err.message}`, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    renderFuelRatesForm: function() {
        const rates = TransportDB.getFuelRates();
        if (document.getElementById('rateDiesel')) document.getElementById('rateDiesel').value = rates.Diesel?.rate || 92.50;
        if (document.getElementById('ratePetrol')) document.getElementById('ratePetrol').value = rates.Petrol?.rate || 104.20;
        if (document.getElementById('rateCNG')) document.getElementById('rateCNG').value = rates.CNG?.rate || 84.00;
        if (document.getElementById('rateElectric')) document.getElementById('rateElectric').value = rates.Electric?.rate || 12.50;
    },

    handleSaveFuelRates: function() {
        const rates = {
            Diesel: { rate: parseFloat(document.getElementById('rateDiesel').value), unit: 'Litre', currency: '₹', avgMileage: 10.0 },
            Petrol: { rate: parseFloat(document.getElementById('ratePetrol').value), unit: 'Litre', currency: '₹', avgMileage: 14.5 },
            CNG: { rate: parseFloat(document.getElementById('rateCNG').value), unit: 'Kg', currency: '₹', avgMileage: 18.0 },
            Electric: { rate: parseFloat(document.getElementById('rateElectric').value), unit: 'kWh', currency: '₹', avgMileage: 7.5 }
        };
        TransportDB.saveFuelRates(rates);
        this.showNotification('Market fuel rates updated successfully!', 'success');
        this.handleFuelTypeChange(document.querySelector('input[name="checkinFuelType"]:checked')?.value || 'Diesel');
    },

    // --- FIREBASE CLOUD SYNC HANDLERS ---
    handleSaveFirebaseConfig: function() {
        const rawJson = document.getElementById('firebaseConfigJson')?.value.trim();
        if (!rawJson) {
            this.showNotification('Please paste your Firebase configuration object.', 'error');
            return;
        }

        try {
            // Support both JSON format and direct JS object format
            let config;
            try {
                config = JSON.parse(rawJson);
            } catch (e) {
                // Try evaluating sanitized object
                const sanitized = rawJson.replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":').replace(/'/g, '"');
                config = JSON.parse(sanitized);
            }

            if (!config.apiKey || !config.projectId) {
                throw new Error("Invalid config. 'apiKey' and 'projectId' are required.");
            }

            const success = FirebaseSync.saveConfig(config);
            if (success) {
                this.renderFirebaseConfigForm();
                this.showNotification('🟢 Connected to Firebase Cloud! Multi-device sync is now active.', 'success');
            } else {
                throw new Error("Could not initialize Firebase with provided credentials.");
            }
        } catch (err) {
            this.showNotification(`Firebase connection failed: ${err.message}`, 'error');
        }
    },

    handleMigrateToCloud: async function() {
        try {
            this.showNotification('Uploading local trips to Firebase Cloud...', 'info');
            const count = await FirebaseSync.migrateLocalToCloud();
            this.showNotification(`✓ Successfully synced ${count} trips to Cloud!`, 'success');
        } catch (e) {
            this.showNotification(`Cloud sync failed: ${e.message}`, 'error');
        }
    },

    handleClearFirebaseConfig: function() {
        if (confirm("Disconnect from Firebase Cloud and revert to local storage?")) {
            FirebaseSync.clearConfig();
            this.renderFirebaseConfigForm();
            this.showNotification('Disconnected from Cloud. Now in Local Storage mode.', 'info');
        }
    },

    renderFirebaseConfigForm: function() {
        const config = FirebaseSync.getConfig();
        const textarea = document.getElementById('firebaseConfigJson');
        const statusLabel = document.getElementById('fbSyncStatusLabel');

        if (textarea && config) {
            textarea.value = JSON.stringify(config, null, 2);
        }

        if (statusLabel) {
            if (FirebaseSync.isInitialized) {
                statusLabel.innerHTML = '<span class="text-emerald-400 font-bold">🟢 Connected</span>';
            } else {
                statusLabel.innerHTML = '<span class="text-slate-500 font-bold">⚪ Not Connected</span>';
            }
        }

        FirebaseSync.updateSyncBadge(FirebaseSync.isInitialized);
    },

    // --- GOOGLE SHEETS SYNC HANDLERS ---
    openGoogleSheetsModal: function() {
        const modal = document.getElementById('googleSheetsSyncModal');
        if (modal) {
            this.renderGoogleSheetsConfigForm();
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
    },

    closeGoogleSheetsModal: function() {
        const modal = document.getElementById('googleSheetsSyncModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    },

    renderGoogleSheetsConfigForm: function() {
        const input = document.getElementById('googleSheetsWebAppUrlInput');
        const statusLabel = document.getElementById('googleSheetsSyncStatusLabel');
        const currentUrl = window.GoogleSheetsSync ? window.GoogleSheetsSync.getUrl() : '';

        if (input) input.value = currentUrl;
        if (statusLabel) {
            if (currentUrl) {
                statusLabel.innerHTML = '<span class="text-emerald-400 font-bold">🟢 Connected to Google Sheets</span>';
            } else {
                statusLabel.innerHTML = '<span class="text-slate-500 font-bold">⚪ Local Storage Mode</span>';
            }
        }
    },

    handleSaveGoogleSheetsUrl: async function() {
        const input = document.getElementById('googleSheetsWebAppUrlInput');
        const url = input ? input.value.trim() : '';

        if (!url) {
            if (confirm("Clear Web App URL and revert to Local Storage mode?")) {
                if (window.GoogleSheetsSync) window.GoogleSheetsSync.setUrl('');
                this.renderGoogleSheetsConfigForm();
                this.showNotification('Google Sheets disconnected. App is now in Local Storage mode.', 'info');
                this.closeGoogleSheetsModal();
            }
            return;
        }

        this.showNotification('Testing Google Sheets Web App Connection...', 'info');
        const testRes = await window.GoogleSheetsSync.testConnection(url);

        if (testRes.success) {
            window.GoogleSheetsSync.setUrl(url);
            this.renderGoogleSheetsConfigForm();
            this.showNotification('🟢 Connected to Google Sheets! Master Sites & Responses will now sync live.', 'success');
            this.closeGoogleSheetsModal();
        } else {
            this.showNotification(`⚠️ Connection Test Failed: ${testRes.error}`, 'error');
        }
    },

    handleTestGoogleSheetsConnection: async function() {
        const input = document.getElementById('googleSheetsWebAppUrlInput');
        const url = input ? input.value.trim() : '';

        if (!url) {
            this.showNotification('Please enter a Google Apps Script Web App URL first.', 'error');
            return;
        }

        this.showNotification('Testing connection to Google Sheet API...', 'info');
        const res = await window.GoogleSheetsSync.testConnection(url);

        if (res.success) {
            this.showNotification(`✅ Connection Successful! ${res.message}`, 'success');
        } else {
            this.showNotification(`❌ Test Failed: ${res.error}`, 'error');
        }
    },

    handleSyncGoogleSheetsNow: function() {
        if (window.GoogleSheetsSync) {
            this.showNotification('Syncing Master Sites & Responses with Google Sheet...', 'info');
            window.GoogleSheetsSync.syncAll();
        }
    },

    startTimer: function() {
        setInterval(() => {
            if (this.currentTab === 'driver') {
                const badge = document.getElementById('activeTripsCountBadge');
                if (badge && TransportDB.getActiveTrips().length > 0) {
                    // subtle live pulse
                }
            }
        }, 10000);
    },

    showNotification: function(msg, type = 'info') {
        const el = document.getElementById('appNotification');
        if (!el) return;

        let bg = 'bg-blue-600';
        let icon = '<i class="fa-solid fa-info-circle"></i>';
        if (type === 'success') {
            bg = 'bg-emerald-600';
            icon = '<i class="fa-solid fa-circle-check"></i>';
        } else if (type === 'error') {
            bg = 'bg-rose-600';
            icon = '<i class="fa-solid fa-circle-exclamation"></i>';
        }

        el.innerHTML = `${icon} <span>${msg}</span>`;
        el.className = `fixed bottom-6 right-6 z-50 ${bg} text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-semibold text-xs transition transform duration-300`;
        el.classList.remove('hidden', 'translate-y-12', 'opacity-0');

        setTimeout(() => {
            el.classList.add('translate-y-12', 'opacity-0');
            setTimeout(() => el.classList.add('hidden'), 300);
        }, 4000);
    }
};

window.App = App;
