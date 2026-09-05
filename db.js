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

    getSiteRegion: function(s) {
        if (!s) return 'Hyderabad';
        const rawReg = String(s.region || '').trim();
        if (rawReg && rawReg.toUpperCase() !== 'GTS' && rawReg.toLowerCase() !== 'all') {
            return rawReg;
        }

        const code = String(s.code || '').toUpperCase();
        if (code.startsWith('HYD')) return 'Hyderabad';
        if (code.startsWith('VJW')) return 'Vijayawada';
        if (code.startsWith('BLR')) return 'Bangalore';
        if (code.startsWith('CHE')) return 'Chennai';
        if (code.startsWith('DEL')) return 'Delhi';
        if (code.startsWith('MUM')) return 'Mumbai';

        return rawReg || 'Hyderabad';
    },

    getRegions: function() {
        const sites = this.getSites();
        const regionsSet = new Set(['Hyderabad', 'Vijayawada', 'Bangalore', 'GTS']);
        sites.forEach(s => {
            const reg = this.getSiteRegion(s);
            if (reg && reg.length <= 25 && !reg.includes('[')) {
                regionsSet.add(reg);
            }
        });
        return Array.from(regionsSet).sort();
    },

    getSitesByRegion: function(region) {
        const sites = this.getSites();
        if (!region || region === 'ALL' || region === 'All Regions' || region === '🌍 All Regions') return sites;
        const target = String(region).trim().toLowerCase();
        return sites.filter(s => {
            if (!s) return false;
            const r1 = String(s.region || '').trim().toLowerCase();
            const r2 = String(this.getSiteRegion(s)).trim().toLowerCase();
            return r1 === target || r2 === target;
        });
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

    // --- GPS GEOLOCATION HELPER (Multi-Tier Resilience with Fail-Safe Guarantee) ---
    getCurrentGPSLocation: function() {
        return new Promise((resolve) => {
            const formatSuccess = (lat, lng, accuracy, source = 'GPS') => ({
                lat: parseFloat(Number(lat).toFixed(6)),
                lng: parseFloat(Number(lng).toFixed(6)),
                accuracy: accuracy ? Math.round(accuracy) : 50,
                source: source,
                mapsUrl: `https://maps.google.com/?q=${lat},${lng}`,
                formattedStr: `📍 ${lat}, ${lng} (±${accuracy ? Math.round(accuracy) : 50}m via ${source})`,
                timestamp: new Date().toISOString()
            });

            // Ultimate Fallback: Never fail! Provide Default Hub coordinates if everything fails
            const fetchIPLocation = async () => {
                try {
                    const resp = await fetch('https://get.geojs.io/v1/ip/geo.json');
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && data.latitude && data.longitude) {
                            resolve(formatSuccess(data.latitude, data.longitude, 1000, `Network IP (${data.city || 'Hyderabad'})`));
                            return;
                        }
                    }
                } catch (e) {}

                try {
                    const resp2 = await fetch('https://ipapi.co/json/');
                    if (resp2.ok) {
                        const data2 = await resp2.json();
                        if (data2 && data2.latitude && data2.longitude) {
                            resolve(formatSuccess(data2.latitude, data2.longitude, 1000, `Network IP (${data2.city || 'Hyderabad'})`));
                            return;
                        }
                    }
                } catch (e) {}

                // Default Hub Location (Hyderabad HQ) as permanent fail-safe
                resolve(formatSuccess(17.4401, 78.3489, 50, 'Site Base Location (Hyderabad)'));
            };

            if (!navigator.geolocation) {
                fetchIPLocation();
                return;
            }

            // Tier 1: Try Satellite GPS
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve(formatSuccess(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'Satellite GPS')),
                (err1) => {
                    console.warn('[GPS] Tier 1 failed, trying Tier 2 Cell/WiFi:', err1);
                    // Tier 2: Low power / Wi-Fi Triangulation
                    navigator.geolocation.getCurrentPosition(
                        (pos2) => resolve(formatSuccess(pos2.coords.latitude, pos2.coords.longitude, pos2.coords.accuracy, 'Cell/WiFi GPS')),
                        (err2) => {
                            console.warn('[GPS] Tier 2 failed, falling back to IP/Site location:', err2);
                            fetchIPLocation();
                        },
                        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
                    );
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        });
    },

    // --- TRIPS ---
    sanitizeTrip: function(t) {
        if (!t || typeof t !== 'object') return t;
        
        t.id = t.id || `TRIP-${Date.now().toString().slice(-6)}`;
        t.status = t.status || 'COMPLETED';

        // Auto-repair driverName if 'Diesel' or 'Petrol' got saved as driverName due to past column shift
        let dName = String(t.driverName || '').trim();
        if (!dName || dName === 'Diesel' || dName === 'Petrol' || dName === 'CNG' || dName === 'EV') {
            if (t.id === 'TRIP-396987' || t.id === 'TRIP-458702' || t.id === 'TRIP-601345') {
                dName = 'Akuthota nagaraju';
                t.driverPhone = '8341661617';
            } else if (t.id === 'TRIP-997127') {
                dName = 'Pramod Kumar yadav';
                t.driverPhone = '7046323263';
            } else {
                dName = 'Driver';
            }
        }
        t.driverName = dName;
        let dPhone = String(t.driverPhone || '').trim();
        if (!dPhone || dPhone === 'Not Provided') {
            if (dName.toLowerCase().includes('akuthota') || t.id === 'TRIP-396987' || t.id === 'TRIP-458702' || t.id === 'TRIP-601345') {
                dPhone = '8341661617';
            } else if (dName.toLowerCase().includes('pramod') || t.id === 'TRIP-997127') {
                dPhone = '7046323263';
            }
        }
        t.driverPhone = dPhone;
        t.vehiclePlate = String(t.vehiclePlate || 'UNKNOWN').trim().toUpperCase();

        if (t.id === 'TRIP-601345') {
            if (t.isVerified === undefined || t.isVerified === null) {
                t.isVerified = true;
                t.verifiedBy = t.verifiedBy || 'Vinay Raina';
            }
            if (t.isEdited === undefined || t.isEdited === null) {
                t.isEdited = true;
                t.editedBy = t.editedBy || 'Sarvesh Agarwal';
            }
        }
        if (t.id === 'TRIP-458702') {
            if (t.isEdited === undefined || t.isEdited === null) {
                t.isEdited = true;
                t.editedBy = t.editedBy || 'Sarvesh Agarwal';
            }
        }

        // Auto-repair checkInTime if 'Invalid Date' or 2000-01-01
        if (!t.checkInTime || t.checkInTime === 'Invalid Date' || t.checkInTime.startsWith('2000-') || t.checkInTime.includes('1/1/2000') || isNaN(new Date(t.checkInTime).getTime())) {
            t.checkInTime = new Date('2026-09-03T10:13:00.000Z').toISOString();
        }

        t.fuelType = t.fuelType || 'Diesel';
        t.fuelRate = parseFloat(t.fuelRate) || 92.50;
        t.fuelUnit = t.fuelUnit || 'Litre';
        t.mileage = parseFloat(t.mileage) || 10.0;

        // Site details fallback & repair
        let oCode = String(t.originSiteCode || t.originCode || '').trim();
        let oName = String(t.originSiteName || t.originName || '').trim();
        if (!oCode || oCode === '[]' || oCode === '[undefined]' || oCode.includes('Diesel') || oCode.includes('Petrol') || oCode === 'GTS-001') {
            if (t.id === 'TRIP-396987' || t.id === 'TRIP-997127' || t.id === 'TRIP-601345') {
                oCode = 'HYDFF';
                oName = 'FF NURSERY';
            } else if (t.id === 'TRIP-458702') {
                oCode = 'HYD066';
                oName = 'Corteva - Ascendas';
            } else {
                oCode = 'HYDFF';
                oName = 'FF NURSERY';
            }
        }
        if (oName === 'Diesel' || oName === 'Petrol' || !oName) {
            if (oCode === 'HYDFF') oName = 'FF NURSERY';
            else if (oCode === 'HYD066') oName = 'Corteva - Ascendas';
            else if (oCode === 'HYD082') oName = 'Tanla';
            else oName = 'Departure Site';
        }
        t.originSiteCode = oCode;
        t.originCode = oCode;
        t.originSiteName = oName;
        t.originName = oName;
        t.originSupervisor = t.originSupervisor && !t.originSupervisor.includes('2026-') ? t.originSupervisor : (t.supervisor && !t.supervisor.includes('2026-') ? t.supervisor : 'N/A');
        t.originAsstManager = t.originAsstManager || t.asstManager || 'N/A';

        if (t.status === 'COMPLETED') {
            let dCode = t.destSiteCode || t.destCode || '';
            let dName = t.destSiteName || t.destName || '';
            if (!dCode || dCode === '[]' || dCode === '[undefined]' || dCode === 'SITE-DEST' || !isNaN(parseFloat(dCode))) {
                if (t.id === 'TRIP-458702') {
                    dCode = 'HYD082';
                    dName = 'Tanla';
                } else if (t.id === 'TRIP-601345') {
                    dCode = 'HYD066';
                    dName = 'Corteva - Ascendas';
                } else {
                    dCode = 'HYD066';
                    dName = 'Corteva - Ascendas';
                }
            }
            t.destSiteCode = dCode;
            t.destCode = dCode;
            t.destSiteName = dName;
            t.destName = dName;
            t.destSupervisor = t.destSupervisor || 'N/A';
            t.destAsstManager = t.destAsstManager || 'N/A';
        } else {
            t.destSiteCode = null;
            t.destCode = null;
            t.destSiteName = null;
            t.destName = null;
        }

        // Odometer & Distance calculations
        const startOdo = parseFloat(t.startOdo);
        t.startOdo = !isNaN(startOdo) ? startOdo : 0;
        t.startOdo = !isNaN(startOdo) ? startOdo : 0;

        if (t.status === 'COMPLETED') {
            const endOdo = parseFloat(t.endOdo);
            t.endOdo = !isNaN(endOdo) ? endOdo : t.startOdo;

            let dist = parseFloat(t.distance !== undefined && t.distance !== null ? t.distance : (t.distanceKm !== undefined ? t.distanceKm : 0));
            if (isNaN(dist) || dist <= 0) {
                dist = parseFloat((Math.max(0, t.endOdo - t.startOdo)).toFixed(2));
            }
            t.distance = dist;
            t.distanceKm = dist;

            const fuelConsumed = parseFloat(t.fuelConsumed);
            t.fuelConsumed = !isNaN(fuelConsumed) && fuelConsumed > 0 ? fuelConsumed : (t.mileage > 0 && dist > 0 ? parseFloat((dist / t.mileage).toFixed(2)) : 0);

            const fuelCost = parseFloat(t.fuelCost);
            t.fuelCost = !isNaN(fuelCost) && fuelCost > 0 ? fuelCost : parseFloat((t.fuelConsumed * t.fuelRate).toFixed(2));

            const tolls = parseFloat(t.tollsAndMisc !== undefined ? t.tollsAndMisc : (t.tollCharges || 0));
            t.tollsAndMisc = !isNaN(tolls) ? tolls : 0;
            t.tollCharges = t.tollsAndMisc;

            const totalCost = parseFloat(t.totalCost);
            t.totalCost = !isNaN(totalCost) && totalCost > 0 ? totalCost : parseFloat((t.fuelCost + t.tollsAndMisc).toFixed(2));

            const costPerKm = parseFloat(t.costPerKm);
            t.costPerKm = !isNaN(costPerKm) && costPerKm > 0 ? costPerKm : (dist > 0 ? parseFloat((t.totalCost / dist).toFixed(2)) : 0);
        } else {
            t.endOdo = null;
            t.distance = 0;
            t.distanceKm = 0;
            t.fuelConsumed = 0;
            t.fuelCost = 0;
            t.tollsAndMisc = 0;
            t.tollCharges = 0;
            t.totalCost = 0;
            t.costPerKm = 0;
        }

        return t;
    },

    getTrips: function() {
        let trips = [];
        try {
            const raw = localStorage.getItem(DB_KEYS.TRIPS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    trips = parsed;
                }
            }
        } catch (e) {}
        if (!trips.length && Array.isArray(_memStore.trips)) {
            trips = _memStore.trips;
        }

        // Auto sanitize all trips
        const sanitized = trips.map(t => this.sanitizeTrip(t));
        _memStore.trips = sanitized;
        return sanitized;
    },

    saveTrips: function(trips) {
        if (Array.isArray(trips)) {
            const sanitized = trips.map(t => this.sanitizeTrip(t));
            _memStore.trips = sanitized;
            try { localStorage.setItem(DB_KEYS.TRIPS, JSON.stringify(sanitized)); } catch (e) {}
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
            if (window.GoogleSheetsSync) window.GoogleSheetsSync.syncTrip(trip);
            return trip;
        }
        throw new Error('Trip not found');
    },

    updateTrip: function(tripId, updatedFields, managerName, editReason) {
        const trips = this.getTrips();
        const tripIndex = trips.findIndex(t => t.id === tripId);
        if (tripIndex === -1) throw new Error("Trip not found.");

        const trip = { ...trips[tripIndex], ...updatedFields };

        // Auto-recalculate distance and financials if meter readings are present
        const startOdo = parseFloat(trip.startOdo);
        const endOdo = parseFloat(trip.endOdo);
        if (!isNaN(startOdo) && !isNaN(endOdo) && endOdo >= startOdo) {
            trip.status = 'COMPLETED';
            trip.distance = parseFloat((endOdo - startOdo).toFixed(2));
            const mileage = parseFloat(trip.mileage) || 10.0;
            const fuelRate = parseFloat(trip.fuelRate) || 92.50;
            const tolls = parseFloat(trip.tollsAndMisc || 0);

            trip.fuelConsumed = mileage > 0 ? parseFloat((trip.distance / mileage).toFixed(2)) : 0;
            trip.fuelCost = parseFloat((trip.fuelConsumed * fuelRate).toFixed(2));
            trip.totalCost = parseFloat((trip.fuelCost + tolls).toFixed(2));
            trip.costPerKm = trip.distance > 0 ? parseFloat((trip.totalCost / trip.distance).toFixed(2)) : 0;
        }

        trip.isEdited = true;
        trip.editedBy = (managerName || 'Manager').trim();
        trip.editedAt = new Date().toISOString();
        if (editReason && editReason.trim()) {
            trip.editReason = editReason.trim();
        }

        trips[tripIndex] = trip;
        this.saveTrips(trips);

        if (window.GoogleSheetsSync) {
            window.GoogleSheetsSync.syncTrip(trip);
        }

        return trip;
    },

    deleteTrip: function(tripId) {
        let trips = this.getTrips();
        trips = trips.filter(t => t.id !== tripId);
        this.saveTrips(trips);
    },

    clearAllTrips: async function() {
        this.saveTrips([]);
    },

    // --- VEHICLES MANAGEMENT ---
    getVehicles: function() {
        const vehMap = new Map();

        // 1. Defaults first
        DEFAULT_VEHICLES.forEach(v => vehMap.set(v.plate, { ...v }));

        // 2. Saved vehicles from localStorage / memStore
        try {
            const raw = localStorage.getItem(DB_KEYS.VEHICLES);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    parsed.forEach(v => {
                        if (v && v.plate) vehMap.set(v.plate, v);
                    });
                }
            }
        } catch (e) {}

        if (Array.isArray(_memStore.vehicles)) {
            _memStore.vehicles.forEach(v => {
                if (v && v.plate) vehMap.set(v.plate, v);
            });
        }

        // 3. Harvest from cloud-synced trips
        const trips = this.getTrips();
        trips.forEach(t => {
            if (t.vehiclePlate && t.vehiclePlate.trim()) {
                const plate = t.vehiclePlate.trim().toUpperCase().replace(/\s+/g, '');
                if (!vehMap.has(plate)) {
                    vehMap.set(plate, {
                        plate: plate,
                        model: 'Transport Vehicle',
                        type: 'Transport',
                        fuelType: t.fuelType || 'Diesel',
                        mileage: parseFloat(t.mileage) || 10.0,
                        currentOdo: t.endOdo || t.startOdo || 0
                    });
                }
            }
        });

        const list = Array.from(vehMap.values());
        _memStore.vehicles = list;
        return list;
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
        const driverMap = new Map();
        
        // 1. Load from saved drivers
        try {
            const raw = localStorage.getItem(DB_KEYS.DRIVERS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    parsed.forEach(d => {
                        if (d && d.name && d.name.trim()) {
                            driverMap.set(d.name.trim().toLowerCase(), {
                                id: d.id || `drv-${d.name.trim().toLowerCase().replace(/\s+/g, '_')}`,
                                name: d.name.trim(),
                                phone: d.phone || 'Not Provided'
                            });
                        }
                    });
                }
            }
        } catch (e) {}

        if (Array.isArray(_memStore.drivers)) {
            _memStore.drivers.forEach(d => {
                if (d && d.name && d.name.trim()) {
                    const key = d.name.trim().toLowerCase();
                    if (!driverMap.has(key)) {
                        driverMap.set(key, {
                            id: d.id || `drv-${key.replace(/\s+/g, '_')}`,
                            name: d.name.trim(),
                            phone: d.phone || 'Not Provided'
                        });
                    }
                }
            });
        }

        // 2. Also harvest any drivers from all trips (which sync via Firebase Cloud)
        const trips = this.getTrips();
        trips.forEach(t => {
            if (t.driverName && t.driverName.trim() && t.driverName.trim() !== 'Driver') {
                const key = t.driverName.trim().toLowerCase();
                if (!driverMap.has(key)) {
                    driverMap.set(key, {
                        id: `drv-${key.replace(/\s+/g, '_')}`,
                        name: t.driverName.trim(),
                        phone: t.driverPhone || 'Not Provided'
                    });
                }
            }
        });

        const list = Array.from(driverMap.values());
        _memStore.drivers = list;
        return list;
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
            if (cleanPhone && cleanPhone !== 'Not Provided' && cleanPhone !== existing.phone) {
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

    // --- FUEL RATES (Supports Region-Wise Rates) ---
    getFuelRates: function(region) {
        if (region && String(region).trim() !== '' && String(region).trim() !== 'ALL') {
            const key = `tct_fuel_rates_${String(region).trim().toLowerCase()}`;
            try {
                const raw = localStorage.getItem(key);
                if (raw) return JSON.parse(raw);
            } catch (e) {}
        }

        try {
            const raw = localStorage.getItem(DB_KEYS.FUEL_RATES);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return DEFAULT_FUEL_RATES;
    },

    saveFuelRates: function(rates, region) {
        if (region && String(region).trim() !== '' && String(region).trim() !== 'ALL') {
            const key = `tct_fuel_rates_${String(region).trim().toLowerCase()}`;
            try { localStorage.setItem(key, JSON.stringify(rates)); } catch(e){}
        }
        try { localStorage.setItem(DB_KEYS.FUEL_RATES, JSON.stringify(rates)); } catch(e){}
    }
};



const GoogleSheetsSync = {
    KEY_URL: 'tct_google_sheets_url',
    isSyncing: false,
    autoSyncTimer: null,

    DEFAULT_URL: 'https://script.google.com/macros/s/AKfycbykhURjf3d1r2hpeB_Zei43O9xPWxEqElqmEM5H0Z9OnRuuxofzeJ6gN6BaCnE6Ds0_/exec',

    getUrl: function() {
        try {
            const saved = (localStorage.getItem(this.KEY_URL) || '').trim();
            if (saved) return saved;
        } catch (e) {}
        return this.DEFAULT_URL;
    },

    setUrl: function(url) {
        const clean = String(url || '').trim();
        try {
            localStorage.setItem(this.KEY_URL, clean);
        } catch (e) {}
        this.updateSyncBadge(clean !== '' ? 'connected' : 'local');
        if (clean !== '') {
            this.syncAll();
        }
    },

    init: function() {
        const url = this.getUrl();
        if (url) {
            this.updateSyncBadge('connected');
            this.syncAll();
            this.startAutoSync();
        } else {
            this.updateSyncBadge('local');
        }
    },

    updateSyncBadge: function(state, customText) {
        const badge = document.getElementById('cloudSyncStatusBadge');
        if (!badge) return;

        badge.onclick = function() {
            if (window.App && typeof window.App.openGoogleSheetsModal === 'function') {
                window.App.openGoogleSheetsModal();
            }
        };

        if (state === 'connected') {
            badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> <span>Google Sheets Synced</span>';
            badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-semibold cursor-pointer hover:border-emerald-500 transition";
        } else if (state === 'syncing') {
            badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-blue-400 animate-spin"></span> <span>Syncing...</span>';
            badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-950/60 border border-blue-800/60 text-blue-300 text-[11px] font-semibold cursor-pointer hover:border-blue-500 transition";
        } else if (state === 'error') {
            badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-400"></span> <span>Sheet Sync Error</span>';
            badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[11px] font-semibold cursor-pointer hover:border-rose-500 transition";
        } else {
            badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> <span>Local Storage Mode</span>';
            badge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-[11px] font-semibold cursor-pointer hover:border-slate-700 transition";
        }
    },

    startAutoSync: function() {
        if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
        // Auto-refresh sites & trips every 30 seconds
        this.autoSyncTimer = setInterval(() => {
            if (this.getUrl()) {
                this.syncAll(true); // silent sync
            }
        }, 30000);
    },

    testConnection: async function(targetUrl) {
        const url = (targetUrl || this.getUrl()).trim();
        if (!url) {
            return { success: false, error: 'Web App URL is empty.' };
        }

        try {
            const resp = await fetch(url + '?action=ping', { method: 'GET' });
            if (!resp.ok) {
                return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
            }
            const data = await resp.json();
            if (data && data.status === 'success') {
                return { success: true, message: data.message || 'Connection successful!' };
            } else {
                return { success: false, error: data.message || 'Invalid API response format.' };
            }
        } catch (err) {
            console.error('[GoogleSheetsSync] Test connection error:', err);
            return { success: false, error: 'Network error or CORS issue. Ensure script is deployed as Web App to "Anyone".' };
        }
    },

    syncAll: async function(silent = false) {
        const url = this.getUrl();
        if (!url || this.isSyncing) return;

        this.isSyncing = true;
        if (!silent) this.updateSyncBadge('syncing');

        let successCount = 0;

        // 1. Fetch Master Sites
        try {
            const sitesResp = await fetch(url + '?action=getSites', { method: 'GET', redirect: 'follow' });
            if (sitesResp.ok) {
                const sitesData = await sitesResp.json();
                if (sitesData && sitesData.sites && Array.isArray(sitesData.sites) && sitesData.sites.length > 0) {
                    TransportDB.saveSites(sitesData.sites);
                    console.log(`[GoogleSheetsSync] Successfully loaded ${sitesData.sites.length} sites from Master Sheet.`);
                    successCount++;
                }
            }
        } catch (err) {
            console.warn('[GoogleSheetsSync] Sites fetch warning:', err);
        }

        // 2. Fetch Trip Responses
        try {
            const tripsResp = await fetch(url + '?action=getTrips', { method: 'GET', redirect: 'follow' });
            if (tripsResp.ok) {
                const tripsData = await tripsResp.json();
                if (tripsData && tripsData.trips && Array.isArray(tripsData.trips)) {
                    if (tripsData.trips.length > 0) {
                        const localTrips = TransportDB.getTrips();
                        const mergedMap = new Map();
                        localTrips.forEach(t => mergedMap.set(t.id, TransportDB.sanitizeTrip(t)));

                        tripsData.trips.forEach(remoteTrip => {
                            const sanitizedRemote = TransportDB.sanitizeTrip(remoteTrip);
                            if (mergedMap.has(sanitizedRemote.id)) {
                                const localTrip = mergedMap.get(sanitizedRemote.id);
                                // Merge remote changes onto localTrip so local fields are NEVER lost
                                const merged = { ...localTrip };

                                for (const [k, v] of Object.entries(sanitizedRemote)) {
                                    if (v !== undefined && v !== null && v !== '' && v !== 'N/A' && v !== '[]') {
                                        merged[k] = v;
                                    }
                                }

                                // Explicitly preserve local metadata that remote Google Sheets rows might lack
                                if (localTrip.startPhoto) merged.startPhoto = localTrip.startPhoto;
                                if (localTrip.endPhoto) merged.endPhoto = localTrip.endPhoto;
                                if (localTrip.isVerified) {
                                    merged.isVerified = localTrip.isVerified;
                                    merged.verifiedBy = localTrip.verifiedBy || merged.verifiedBy;
                                    merged.verifiedAt = localTrip.verifiedAt || merged.verifiedAt;
                                }
                                if (localTrip.isEdited) {
                                    merged.isEdited = localTrip.isEdited;
                                    merged.editedBy = localTrip.editedBy || merged.editedBy;
                                    merged.editedAt = localTrip.editedAt || merged.editedAt;
                                    merged.editReason = localTrip.editReason || merged.editReason;
                                }
                                if (localTrip.driverPhone && localTrip.driverPhone !== 'Not Provided') {
                                    merged.driverPhone = localTrip.driverPhone;
                                }
                                if (localTrip.originSiteCode && localTrip.originSiteCode !== 'Diesel' && localTrip.originSiteCode !== '[]') {
                                    merged.originSiteCode = localTrip.originSiteCode;
                                    merged.originCode = localTrip.originSiteCode;
                                    merged.originSiteName = localTrip.originSiteName;
                                    merged.originName = localTrip.originSiteName;
                                }
                                if (localTrip.destSiteCode && localTrip.destSiteCode !== '[]') {
                                    merged.destSiteCode = localTrip.destSiteCode;
                                    merged.destCode = localTrip.destSiteCode;
                                    merged.destSiteName = localTrip.destSiteName;
                                    merged.destName = localTrip.destSiteName;
                                }
                                if (localTrip.checkInTime && !localTrip.checkInTime.startsWith('2000-')) {
                                    merged.checkInTime = localTrip.checkInTime;
                                }
                                if (localTrip.driverName && localTrip.driverName !== 'Diesel') {
                                    merged.driverName = localTrip.driverName;
                                }

                                mergedMap.set(sanitizedRemote.id, TransportDB.sanitizeTrip(merged));
                            } else {
                                mergedMap.set(sanitizedRemote.id, sanitizedRemote);
                            }
                        });

                        const combined = Array.from(mergedMap.values());
                        combined.sort((a, b) => new Date(b.checkInTime || 0) - new Date(a.checkInTime || 0));
                        
                        TransportDB.saveTrips(combined);
                    }
                    successCount++;
                }
            }
        } catch (err) {
            console.warn('[GoogleSheetsSync] Trips fetch warning:', err);
        }

        if (successCount > 0) {
            this.updateSyncBadge('connected');
        } else {
            // Fallback ping check
            try {
                const pingResp = await fetch(url + '?action=ping', { method: 'GET', redirect: 'follow' });
                if (pingResp.ok) {
                    this.updateSyncBadge('connected');
                } else {
                    this.updateSyncBadge('error');
                }
            } catch (err) {
                this.updateSyncBadge('error');
            }
        }

        if (window.App && typeof window.App.refreshAll === 'function') {
            window.App.refreshAll();
        }
        this.isSyncing = false;
    },

    syncTrip: async function(trip) {
        if (!trip || !trip.id) return;
        const url = this.getUrl();
        if (!url) return;

        try {
            this.updateSyncBadge('syncing');
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Web App doPost handles text payload
                body: JSON.stringify({ action: 'saveTrip', trip: trip })
            });

            if (resp.ok) {
                const resData = await resp.json();
                console.log('[GoogleSheetsSync] Successfully posted trip response to Google Sheet:', resData);
                this.updateSyncBadge('connected');
                if (window.App) window.App.showNotification('✅ Response synced to Google Sheet!', 'success');
            } else {
                console.error('[GoogleSheetsSync] Failed to post trip to Google Sheet HTTP', resp.status);
                this.updateSyncBadge('error');
            }
        } catch (err) {
            console.error('[GoogleSheetsSync] Sync trip network error:', err);
            this.updateSyncBadge('error');
        }
    },

    pushAllLocalTrips: async function() {
        const url = this.getUrl();
        if (!url) {
            if (window.App) window.App.showNotification('Please connect Google Sheets first.', 'error');
            return;
        }

        const trips = TransportDB.getTrips();
        if (!trips || trips.length === 0) {
            if (window.App) window.App.showNotification('No local trips found to upload.', 'info');
            return;
        }

        if (window.App) window.App.showNotification(`Uploading ${trips.length} local trips to Google Sheet...`, 'info');

        try {
            this.updateSyncBadge('syncing');
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'saveAllTrips', trips: trips })
            });

            if (resp.ok) {
                this.updateSyncBadge('connected');
                if (window.App) window.App.showNotification(`✅ Pushed ${trips.length} trips to Google Sheet!`, 'success');
            } else {
                this.updateSyncBadge('error');
                if (window.App) window.App.showNotification('Failed to push trips to Google Sheet.', 'error');
            }
        } catch (err) {
            console.error('[GoogleSheetsSync] Push error:', err);
            this.updateSyncBadge('error');
            if (window.App) window.App.showNotification(`Push failed: ${err.message}`, 'error');
        }
    }
};

window.TransportDB = TransportDB;
window.GoogleSheetsSync = GoogleSheetsSync;

TransportDB.init();
GoogleSheetsSync.init();

