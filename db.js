/**
 * Transport Cost & Trip Tracker - Database & Storage Layer
 * Integrated with Real Sites Data (314 Sites from Transport cost Tracker.xlsx)
 */

const DB_KEYS = {
    TRIPS: 'tct_trips_v2',
    VEHICLES: 'tct_vehicles_v2',
    SITES: 'tct_sites_v2',
    FUEL_RATES: 'tct_fuel_rates_v2',
    DRIVERS: 'tct_drivers_v2',
    USER_ROLE: 'tct_user_role_v2'
};

const DEFAULT_FUEL_RATES = {
    Diesel: { rate: 92.50, unit: 'Litre', currency: '₹', avgMileage: 10.0 },
    Petrol: { rate: 104.20, unit: 'Litre', currency: '₹', avgMileage: 14.5 },
    CNG: { rate: 84.00, unit: 'Kg', currency: '₹', avgMileage: 18.0 },
    Electric: { rate: 12.50, unit: 'kWh', currency: '₹', avgMileage: 7.5 }
};

const DEFAULT_VEHICLES = [
    { plate: 'TS07UF6428', model: 'Transport Vehicle', type: 'Transport', fuelType: 'Diesel', mileage: 10.0, currentOdo: 0 },
    { plate: 'TS07UH4642', model: 'Transport Vehicle', type: 'Transport', fuelType: 'Diesel', mileage: 10.0, currentOdo: 0 },
    { plate: 'TS07UM0701', model: 'Transport Vehicle', type: 'Transport', fuelType: 'Diesel', mileage: 10.0, currentOdo: 0 },
    { plate: 'TG07U8012',  model: 'Transport Vehicle', type: 'Transport', fuelType: 'Diesel', mileage: 7.0,  currentOdo: 0 }
];

const DEFAULT_DRIVERS = [];

// Memory store fallback
const _memStore = {
    sites: null,
    trips: null,
    vehicles: null,
    fuelRates: null,
    drivers: null,
    role: null
};

const TransportDB = {
    init: function() {
        try {
            const existingSites = this.getSites();
            if (!existingSites || existingSites.length < 50) {
                if (window.EMBEDDED_SITES && window.EMBEDDED_SITES.length > 0) {
                    this.saveSites(window.EMBEDDED_SITES);
                }
            }
            
            // Ensure vehicles are initialized with user's real fleet
            const currentVehicles = this.getVehicles();
            const hasRealVehicles = currentVehicles.some(v => v.plate === 'TS07UF6428' || v.plate === 'TG07U8012');
            if (!hasRealVehicles) {
                this.saveVehicles(DEFAULT_VEHICLES);
            }

            // Initialize Cloud Sync (Firebase)
            if (typeof FirebaseSync !== 'undefined') {
                FirebaseSync.init();
            }
        } catch (e) {
            console.error('[TransportDB] Init warning:', e);
        }
    },

    // --- ROLE MANAGEMENT (Driver vs Management) & PIN SECURITY ---
    getRole: function() {
        try {
            const saved = localStorage.getItem(DB_KEYS.USER_ROLE);
            if (saved === 'management' || saved === 'driver') return saved;
        } catch (e) {}
        return _memStore.role || 'driver';
    },

    setRole: function(role) {
        _memStore.role = role;
        try { localStorage.setItem(DB_KEYS.USER_ROLE, role); } catch (e) {}
    },

    getManagementPin: function() {
        try {
            const pin = localStorage.getItem('tct_mgmt_pin');
            if (pin && String(pin).trim() !== '') return String(pin).trim();
        } catch (e) {}
        return '1234';
    },

    setManagementPin: function(pin) {
        const clean = String(pin).trim();
        try {
            localStorage.setItem('tct_mgmt_pin', clean || '1234');
        } catch (e) {}
    },

    // --- SITES ---
    getSites: function() {
        try {
            const raw = localStorage.getItem(DB_KEYS.SITES);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    _memStore.sites = parsed;
                    return parsed;
                }
            }
        } catch (e) {}

        if (Array.isArray(_memStore.sites) && _memStore.sites.length > 0) {
            return _memStore.sites;
        }

        if (window.EMBEDDED_SITES && Array.isArray(window.EMBEDDED_SITES) && window.EMBEDDED_SITES.length > 0) {
            _memStore.sites = window.EMBEDDED_SITES;
            try { localStorage.setItem(DB_KEYS.SITES, JSON.stringify(window.EMBEDDED_SITES)); } catch(e){}
            return window.EMBEDDED_SITES;
        }
        return [];
    },

    saveSites: function(sites) {
        if (Array.isArray(sites)) {
            _memStore.sites = sites;
            try { localStorage.setItem(DB_KEYS.SITES, JSON.stringify(sites)); } catch(e){}
        }
    },

    getNextSiteCode: function() {
        const sites = this.getSites();
        let maxNum = 0;
        sites.forEach(s => {
            if (s.code && s.code.startsWith('HYD')) {
                const num = parseInt(s.code.replace('HYD', ''), 10);
                if (!isNaN(num) && num > maxNum) {
                    maxNum = num;
                }
            }
        });
        const nextNum = maxNum + 1;
        return `HYD${nextNum.toString().padStart(3, '0')}`;
    },

    addSite: function(siteData) {
        const sites = this.getSites();
        const code = siteData.code && siteData.code.trim() !== '' ? siteData.code.trim().toUpperCase() : this.getNextSiteCode();
        
        const newSite = {
            id: `site-${Date.now()}`,
            code: code,
            name: siteData.name.trim(),
            supervisor: siteData.supervisor ? siteData.supervisor.trim() : 'Unassigned',
            asstManager: siteData.asstManager ? siteData.asstManager.trim() : 'Unassigned',
            manager: siteData.manager ? siteData.manager.trim() : 'Prabhugouda Patil',
            salesModel: siteData.salesModel || 'PAAS',
            region: siteData.region || 'GTS',
            serviceProvider: siteData.serviceProvider || 'GAMLAA',
            customerGroup: siteData.customerGroup || siteData.name.split(' ')[0],
            status: 'ACTIVE'
        };

        sites.push(newSite);
        this.saveSites(sites);
        return newSite;
    },

    deleteSite: function(codeOrId) {
        let sites = this.getSites();
        sites = sites.filter(s => s.code !== codeOrId && s.id !== codeOrId);
        this.saveSites(sites);
    },

    // --- TRIPS ---
    getTrips: function() {
        try {
            const raw = localStorage.getItem(DB_KEYS.TRIPS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    _memStore.trips = parsed;
                    return parsed;
                }
            }
        } catch (e) {}
        if (Array.isArray(_memStore.trips)) return _memStore.trips;
        return [];
    },

    saveTrips: function(trips) {
        if (Array.isArray(trips)) {
            _memStore.trips = trips;
            try { localStorage.setItem(DB_KEYS.TRIPS, JSON.stringify(trips)); } catch (e) {}
        }
    },

    getActiveTrips: function() {
        return this.getTrips().filter(t => t.status === 'ACTIVE');
    },

    getTripById: function(id) {
        return this.getTrips().find(t => t.id === id);
    },

    checkInTrip: function(data) {
        const trips = this.getTrips();
        const vehiclePlate = data.vehiclePlate.trim().toUpperCase().replace(/\s+/g, '');

        const activeTrip = trips.find(t => t.vehiclePlate === vehiclePlate && t.status === 'ACTIVE');
        if (activeTrip) {
            throw new Error(`Vehicle ${vehiclePlate} already has an active trip (${activeTrip.id}). Please check out that trip first.`);
        }

        const fuelRates = this.getFuelRates();
        const fuelRateObj = fuelRates[data.fuelType] || fuelRates.Diesel || { rate: 92.50, unit: 'Litre' };
        const mileage = parseFloat(data.mileage) || 10.0;
        const startOdo = parseFloat(data.startOdo);

        if (isNaN(startOdo) || startOdo < 0) {
            throw new Error("Please enter a valid Starting Meter Reading.");
        }

        // Auto-register or update vehicle current Odo and mileage
        this.autoRegisterVehicle({
            plate: vehiclePlate,
            fuelType: data.fuelType || 'Diesel',
            mileage: mileage,
            currentOdo: startOdo
        });

        // If driver provided, save driver
        if (data.driverName) {
            this.addDriver(data.driverName, data.driverPhone || '');
        }

        const newTrip = {
            id: `TRIP-${Date.now().toString().slice(-6)}`,
            driverName: data.driverName ? data.driverName.trim() : 'Driver',
            driverPhone: data.driverPhone ? data.driverPhone.trim() : '',
            vehiclePlate: vehiclePlate,
            fuelType: data.fuelType || 'Diesel',
            mileage: mileage,
            fuelRate: parseFloat(fuelRateObj.rate),
            fuelUnit: fuelRateObj.unit,
            currency: '₹',
            originSiteCode: data.originSiteCode,
            originSiteName: data.originSiteName,
            originSupervisor: data.originSupervisor || 'N/A',
            originAsstManager: data.originAsstManager || 'N/A',
            destSiteCode: null,
            destSiteName: null,
            destSupervisor: null,
            destAsstManager: null,
            startOdo: startOdo,
            endOdo: null,
            distance: 0,
            checkInTime: data.checkInTime || new Date().toISOString(),
            checkOutTime: null,
            durationMinutes: 0,
            fuelConsumed: 0,
            fuelCost: 0,
            tollsAndMisc: 0,
            totalCost: 0,
            costPerKm: 0,
            status: 'ACTIVE',
            startPhoto: data.startPhoto || null,
            endPhoto: null,
            startLocation: data.startLocation || null,
            endLocation: null,
            isVerified: false,
            verifiedBy: null,
            notes: data.notes || ''
        };

        trips.unshift(newTrip);
        this.saveTrips(trips);
        if (typeof FirebaseSync !== 'undefined') FirebaseSync.syncTrip(newTrip);
        return newTrip;
    },

    checkOutTrip: function(tripId, checkOutData) {
        const trips = this.getTrips();
        const tripIndex = trips.findIndex(t => t.id === tripId);
        if (tripIndex === -1) throw new Error("Trip not found.");

        const trip = trips[tripIndex];
        if (trip.status !== 'ACTIVE') throw new Error("Trip is already completed.");

        const endOdo = parseFloat(checkOutData.endOdo);
        if (isNaN(endOdo) || endOdo < trip.startOdo) {
            throw new Error(`Ending meter reading (${endOdo}) cannot be less than start reading (${trip.startOdo}).`);
        }

        const distance = parseFloat((endOdo - trip.startOdo).toFixed(2));
        const checkOutTime = checkOutData.checkOutTime || new Date().toISOString();
        const durationMinutes = Math.max(1, Math.round((new Date(checkOutTime) - new Date(trip.checkInTime)) / 60000));
        
        const mileage = parseFloat(trip.mileage) || 10.0;
        const fuelRate = parseFloat(trip.fuelRate) || 92.50;
        const tolls = parseFloat(checkOutData.tollsAndMisc || 0);

        const fuelConsumed = mileage > 0 ? parseFloat((distance / mileage).toFixed(2)) : 0;
        const fuelCost = parseFloat((fuelConsumed * fuelRate).toFixed(2));
        const totalCost = parseFloat((fuelCost + tolls).toFixed(2));
        const costPerKm = distance > 0 ? parseFloat((totalCost / distance).toFixed(2)) : 0;

        trip.destSiteCode = checkOutData.destSiteCode;
        trip.destSiteName = checkOutData.destSiteName;
        trip.destSupervisor = checkOutData.destSupervisor || 'N/A';
        trip.destAsstManager = checkOutData.destAsstManager || 'N/A';
        trip.endOdo = endOdo;
        trip.distance = distance;
        trip.checkOutTime = checkOutTime;
        trip.durationMinutes = durationMinutes;
        trip.fuelConsumed = fuelConsumed;
        trip.fuelCost = fuelCost;
        trip.tollsAndMisc = tolls;
        trip.totalCost = totalCost;
        trip.costPerKm = costPerKm;
        trip.status = 'COMPLETED';
        trip.endPhoto = checkOutData.endPhoto || null;
        trip.endLocation = checkOutData.endLocation || null;
        if (checkOutData.notes) {
            trip.notes = trip.notes ? `${trip.notes} | ${checkOutData.notes}` : checkOutData.notes;
        }

        trips[tripIndex] = trip;
        this.saveTrips(trips);

        this.autoRegisterVehicle({
            plate: trip.vehiclePlate,
            fuelType: trip.fuelType,
            mileage: trip.mileage,
            currentOdo: endOdo
        });

        if (typeof FirebaseSync !== 'undefined') FirebaseSync.syncTrip(trip);
        return trip;
    },

    verifyTrip: function(tripId, verifiedBy, notes) {
        const trips = this.getTrips();
        const trip = trips.find(t => t.id === tripId);
        if (trip) {
            trip.isVerified = true;
            trip.verifiedBy = (verifiedBy || '').trim() || trip.destSupervisor || 'Site Supervisor';
            trip.verifiedAt = new Date().toISOString();
            if (notes) trip.verificationNotes = notes;
            this.saveTrips(trips);
            if (typeof FirebaseSync !== 'undefined') FirebaseSync.syncTrip(trip);
            return trip;
        }
        throw new Error('Trip not found');
    },

    deleteTrip: function(tripId) {
        let trips = this.getTrips();
        trips = trips.filter(t => t.id !== tripId);
        this.saveTrips(trips);
        if (typeof FirebaseSync !== 'undefined') FirebaseSync.deleteTrip(tripId);
    },

    // --- VEHICLES MANAGEMENT ---
    getVehicles: function() {
        try {
            const raw = localStorage.getItem(DB_KEYS.VEHICLES);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    _memStore.vehicles = parsed;
                    return parsed;
                }
            }
        } catch (e) {}
        if (Array.isArray(_memStore.vehicles) && _memStore.vehicles.length > 0) return _memStore.vehicles;
        
        // Initial fallback to default 4 vehicles
        this.saveVehicles(DEFAULT_VEHICLES);
        return DEFAULT_VEHICLES;
    },

    saveVehicles: function(vehicles) {
        if (Array.isArray(vehicles)) {
            _memStore.vehicles = vehicles;
            try { localStorage.setItem(DB_KEYS.VEHICLES, JSON.stringify(vehicles)); } catch(e){}
        }
    },

    addVehicle: function(plate, fuelType, mileage) {
        const vehicles = this.getVehicles();
        const normalized = plate.trim().toUpperCase().replace(/\s+/g, '');
        if (!normalized) throw new Error('Vehicle plate number is required.');
        const existing = vehicles.find(v => v.plate === normalized);
        if (existing) {
            existing.fuelType = fuelType || existing.fuelType;
            if (mileage) existing.mileage = parseFloat(mileage);
            this.saveVehicles(vehicles);
            return existing;
        }
        const newVeh = {
            plate: normalized,
            model: 'Transport Vehicle',
            type: 'Transport',
            fuelType: fuelType || 'Diesel',
            mileage: parseFloat(mileage) || 10.0,
            currentOdo: 0
        };
        vehicles.push(newVeh);
        this.saveVehicles(vehicles);
        return newVeh;
    },

    updateVehicle: function(plate, fields) {
        const vehicles = this.getVehicles();
        const idx = vehicles.findIndex(v => v.plate === plate);
        if (idx === -1) throw new Error(`Vehicle ${plate} not found.`);
        if (fields.mileage !== undefined) vehicles[idx].mileage = parseFloat(fields.mileage) || vehicles[idx].mileage;
        if (fields.fuelType !== undefined) vehicles[idx].fuelType = fields.fuelType;
        if (fields.currentOdo !== undefined) vehicles[idx].currentOdo = parseFloat(fields.currentOdo) || vehicles[idx].currentOdo;
        this.saveVehicles(vehicles);
        return vehicles[idx];
    },

    deleteVehicle: function(plate) {
        const vehicles = this.getVehicles().filter(v => v.plate !== plate);
        this.saveVehicles(vehicles);
    },

    autoRegisterVehicle: function(vehData) {
        const vehicles = this.getVehicles();
        const plate = vehData.plate.toUpperCase().replace(/\s+/g, '');
        const existing = vehicles.find(v => v.plate === plate);
        if (existing) {
            existing.fuelType = vehData.fuelType || existing.fuelType;
            if (vehData.mileage) existing.mileage = vehData.mileage;
            existing.currentOdo = vehData.currentOdo || existing.currentOdo;
        } else {
            vehicles.push({
                plate: plate,
                model: vehData.model || 'Transport Vehicle',
                type: vehData.type || 'Transport',
                fuelType: vehData.fuelType || 'Diesel',
                mileage: vehData.mileage || 10.0,
                currentOdo: vehData.currentOdo || 0
            });
        }
        this.saveVehicles(vehicles);
    },

    // --- DRIVERS MANAGEMENT ---
    getDrivers: function() {
        try {
            const raw = localStorage.getItem(DB_KEYS.DRIVERS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    _memStore.drivers = parsed;
                    return parsed;
                }
            }
        } catch (e) {}
        if (Array.isArray(_memStore.drivers)) return _memStore.drivers;
        return DEFAULT_DRIVERS;
    },

    saveDrivers: function(drivers) {
        if (Array.isArray(drivers)) {
            _memStore.drivers = drivers;
            try { localStorage.setItem(DB_KEYS.DRIVERS, JSON.stringify(drivers)); } catch(e){}
        }
    },

    addDriver: function(name, phone) {
        const cleanName = name ? name.trim() : '';
        if (!cleanName) throw new Error("Driver name is required.");
        const cleanPhone = phone ? phone.trim() : '';
        const drivers = this.getDrivers();
        const existing = drivers.find(d => d.name.toLowerCase() === cleanName.toLowerCase());
        if (existing) {
            if (cleanPhone && cleanPhone !== existing.phone) {
                existing.phone = cleanPhone;
                this.saveDrivers(drivers);
            }
            return existing;
        }
        const newDriver = {
            id: `drv-${Date.now()}`,
            name: cleanName,
            phone: cleanPhone || 'Not Provided'
        };
        drivers.push(newDriver);
        this.saveDrivers(drivers);
        return newDriver;
    },

    deleteDriver: function(idOrName) {
        let drivers = this.getDrivers();
        drivers = drivers.filter(d => d.id !== idOrName && d.name !== idOrName);
        this.saveDrivers(drivers);
    },

    // --- FUEL RATES ---
    getFuelRates: function() {
        try {
            const raw = localStorage.getItem(DB_KEYS.FUEL_RATES);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return DEFAULT_FUEL_RATES;
    },

    saveFuelRates: function(rates) {
        try { localStorage.setItem(DB_KEYS.FUEL_RATES, JSON.stringify(rates)); } catch(e){}
    }
};

// =============================================================
// REAL-TIME CLOUD SYNCHRONIZATION ENGINE (FIREBASE FIRESTORE)
// =============================================================
const FirebaseSync = {
    app: null,
    db: null,
    isInitialized: false,
    unsubscribeTrips: null,

    getConfig: function() {
        try {
            const raw = localStorage.getItem('tct_firebase_config');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        if (window.FIREBASE_CONFIG && typeof window.FIREBASE_CONFIG === 'object') {
            return window.FIREBASE_CONFIG;
        }
        return null;
    },

    saveConfig: function(configObj) {
        try {
            localStorage.setItem('tct_firebase_config', JSON.stringify(configObj));
            return this.init();
        } catch (e) {
            return false;
        }
    },

    clearConfig: function() {
        try {
            localStorage.removeItem('tct_firebase_config');
            if (this.unsubscribeTrips) this.unsubscribeTrips();
            this.isInitialized = false;
            this.updateSyncBadge(false);
        } catch (e) {}
    },

    init: function() {
        const config = this.getConfig();
        if (!config || !config.apiKey || !config.projectId) {
            this.isInitialized = false;
            this.updateSyncBadge(false);
            return false;
        }

        try {
            if (typeof firebase === 'undefined') {
                console.warn('[FirebaseSync] Firebase SDK not loaded.');
                this.updateSyncBadge(false);
                return false;
            }

            if (!firebase.apps.length) {
                this.app = firebase.initializeApp(config);
            } else {
                this.app = firebase.app();
            }

            this.db = firebase.firestore();
            this.isInitialized = true;
            this.updateSyncBadge(true);
            this.startTripsListener();
            return true;
        } catch (e) {
            console.error('[FirebaseSync] Initialization error:', e);
            this.isInitialized = false;
            this.updateSyncBadge(false);
            return false;
        }
    },

    updateSyncBadge: function(isConnected) {
        const badge = document.getElementById('cloudSyncStatusBadge');
        if (badge) {
            if (isConnected) {
                badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> <span>Cloud Synced (Live)</span>';
                badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-semibold";
            } else {
                badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> <span>Local Storage Mode</span>';
                badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-[11px] font-semibold";
            }
        }
    },

    startTripsListener: function() {
        if (!this.isInitialized || !this.db) return;
        if (this.unsubscribeTrips) this.unsubscribeTrips();

        try {
            this.unsubscribeTrips = this.db.collection('trips').onSnapshot(snapshot => {
                const cloudTrips = [];
                snapshot.forEach(doc => {
                    cloudTrips.push(doc.data());
                });

                if (cloudTrips.length > 0) {
                    // Sort descending by checkInTime
                    cloudTrips.sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));
                    _memStore.trips = cloudTrips;
                    try {
                        localStorage.setItem(DB_KEYS.TRIPS, JSON.stringify(cloudTrips));
                    } catch (e) {}
                    if (window.App && typeof window.App.refreshAll === 'function') {
                        window.App.refreshAll();
                    }
                }
            }, err => {
                console.warn('[FirebaseSync] Snapshot listener warning:', err);
            });
        } catch (e) {}
    },

    syncTrip: function(trip) {
        if (!this.isInitialized || !this.db || !trip || !trip.id) return;
        try {
            this.db.collection('trips').doc(trip.id).set(trip, { merge: true });
        } catch (e) {
            console.error('[FirebaseSync] Failed to sync trip:', e);
        }
    },

    deleteTrip: function(tripId) {
        if (!this.isInitialized || !this.db || !tripId) return;
        try {
            this.db.collection('trips').doc(tripId).delete();
        } catch (e) {
            console.error('[FirebaseSync] Failed to delete trip in cloud:', e);
        }
    },

    migrateLocalToCloud: async function() {
        if (!this.isInitialized || !this.db) throw new Error("Firebase is not connected. Please save your Firebase credentials first.");
        const trips = TransportDB.getTrips();
        let count = 0;
        for (const t of trips) {
            await this.db.collection('trips').doc(t.id).set(t, { merge: true });
            count++;
        }
        return count;
    }
};

window.TransportDB = TransportDB;
window.FirebaseSync = FirebaseSync;
TransportDB.init();
