/**
 * Transport Cost & Trip Tracker - Calculation & Verification Engine
 */

const TransportCalculator = {
    calculateLiveTrip: function(startOdo, endOdo, mileage, fuelRate, tolls = 0) {
        const start = parseFloat(startOdo) || 0;
        const end = parseFloat(endOdo) || 0;
        const mil = parseFloat(mileage) || 0;
        const rate = parseFloat(fuelRate) || 0;
        const extra = parseFloat(tolls) || 0;

        const distance = Math.max(0, parseFloat((end - start).toFixed(2)));
        const fuelConsumed = (mil > 0 && distance > 0) ? parseFloat((distance / mil).toFixed(2)) : 0;
        const fuelCost = parseFloat((fuelConsumed * rate).toFixed(2));
        const totalCost = parseFloat((fuelCost + extra).toFixed(2));
        const costPerKm = distance > 0 ? parseFloat((totalCost / distance).toFixed(2)) : 0;

        return {
            distance,
            fuelConsumed,
            fuelCost,
            tolls: extra,
            totalCost,
            costPerKm,
            isValid: end >= start && start >= 0
        };
    },

    computeFleetKPIs: function(trips = []) {
        const completed = trips.filter(t => t.status === 'COMPLETED');
        const active = trips.filter(t => t.status === 'ACTIVE');

        const totalDistance = completed.reduce((sum, t) => sum + (parseFloat(t.distance) || 0), 0);
        const totalFuelConsumed = completed.reduce((sum, t) => sum + (parseFloat(t.fuelConsumed) || 0), 0);
        const totalFuelCost = completed.reduce((sum, t) => sum + (parseFloat(t.fuelCost) || 0), 0);
        const totalTolls = completed.reduce((sum, t) => sum + (parseFloat(t.tollsAndMisc) || 0), 0);
        const totalCost = completed.reduce((sum, t) => sum + (parseFloat(t.totalCost) || 0), 0);

        const avgCostPerKm = totalDistance > 0 ? parseFloat((totalCost / totalDistance).toFixed(2)) : 0;
        const avgTripCost = completed.length > 0 ? parseFloat((totalCost / completed.length).toFixed(2)) : 0;
        const avgTripDistance = completed.length > 0 ? parseFloat((totalDistance / completed.length).toFixed(2)) : 0;
        const avgEfficiency = totalFuelConsumed > 0 ? parseFloat((totalDistance / totalFuelConsumed).toFixed(2)) : 0;

        return {
            totalTrips: trips.length,
            completedTripsCount: completed.length,
            activeTripsCount: active.length,
            totalDistance: parseFloat(totalDistance.toFixed(1)),
            totalFuelConsumed: parseFloat(totalFuelConsumed.toFixed(1)),
            totalFuelCost: parseFloat(totalFuelCost.toFixed(2)),
            totalTolls: parseFloat(totalTolls.toFixed(2)),
            totalCost: parseFloat(totalCost.toFixed(2)),
            avgCostPerKm,
            avgTripCost,
            avgTripDistance,
            avgEfficiency
        };
    },

    computeSiteToSiteMatrix: function(trips = [], sites = []) {
        const completed = trips.filter(t => t.status === 'COMPLETED');
        const routeMap = {};

        completed.forEach(trip => {
            const orgCode = trip.originSiteCode || trip.originCode || (trip.origin && trip.origin.code) || 'HYD001';
            const dstCode = trip.destSiteCode || trip.destCode || (trip.dest && trip.dest.code) || 'HYD002';
            
            let orgName = trip.originSiteName || trip.originName || (trip.origin && trip.origin.name) || '';
            let dstName = trip.destSiteName || trip.destName || (trip.dest && trip.dest.name) || '';

            if (!orgName && sites && sites.length) {
                const s = sites.find(x => x.code === orgCode);
                if (s) orgName = s.name;
            }
            if (!dstName && sites && sites.length) {
                const s = sites.find(x => x.code === dstCode);
                if (s) dstName = s.name;
            }
            if (!orgName) orgName = orgCode;
            if (!dstName) dstName = dstCode;

            const key = `${orgCode}-->${dstCode}`;
            if (!routeMap[key]) {
                routeMap[key] = {
                    routeKey: key,
                    originCode: orgCode,
                    originName: orgName,
                    originSiteName: orgName,
                    originSupervisor: trip.originSupervisor || (trip.origin && trip.origin.supervisor) || 'Unassigned',
                    originAsstManager: trip.originAsstManager || (trip.origin && trip.origin.asstManager) || 'Unassigned',
                    destCode: dstCode,
                    destName: dstName,
                    destSiteName: dstName,
                    destSupervisor: trip.destSupervisor || (trip.dest && trip.dest.supervisor) || 'Unassigned',
                    destAsstManager: trip.destAsstManager || (trip.dest && trip.dest.asstManager) || 'Unassigned',
                    trips: [],
                    totalDistance: 0,
                    totalFuelCost: 0,
                    totalTolls: 0,
                    totalCost: 0,
                    minDistance: Infinity,
                    maxDistance: -Infinity,
                    vehiclesUsed: new Set(),
                    drivers: new Set()
                };
            }

            const r = routeMap[key];
            const dist = parseFloat(trip.distance) || 0;
            const fCost = parseFloat(trip.fuelCost) || 0;
            const tCost = parseFloat(trip.totalCost) || 0;
            const tolls = parseFloat(trip.tollsAndMisc) || 0;

            r.trips.push(trip);
            r.totalDistance += dist;
            r.totalFuelCost += fCost;
            r.totalTolls += tolls;
            r.totalCost += tCost;
            if (dist < r.minDistance) r.minDistance = dist;
            if (dist > r.maxDistance) r.maxDistance = dist;
            if (trip.vehiclePlate) r.vehiclesUsed.add(trip.vehiclePlate);
            if (trip.driverName) r.drivers.add(trip.driverName);
        });

        const routes = Object.values(routeMap).map(r => {
            const count = r.trips.length;
            const avgDistance = count > 0 ? parseFloat((r.totalDistance / count).toFixed(2)) : 0;
            const avgFuelCost = count > 0 ? parseFloat((r.totalFuelCost / count).toFixed(2)) : 0;
            const avgTotalCost = count > 0 ? parseFloat((r.totalCost / count).toFixed(2)) : 0;
            const avgCostPerKm = avgDistance > 0 ? parseFloat((avgTotalCost / avgDistance).toFixed(2)) : 0;

            const anomalies = r.trips.filter(t => {
                const d = parseFloat(t.distance) || 0;
                return Math.abs(d - avgDistance) / (avgDistance || 1) > 0.20;
            });

            return {
                routeKey: r.routeKey,
                originCode: r.originCode,
                originName: r.originName,
                originSiteName: r.originName,
                originSupervisor: r.originSupervisor || 'N/A',
                originAsstManager: r.originAsstManager || 'N/A',
                destCode: r.destCode,
                destName: r.destName,
                destSiteName: r.destName,
                destSupervisor: r.destSupervisor || 'N/A',
                destAsstManager: r.destAsstManager || 'N/A',
                tripCount: count,
                count: count,
                totalDistance: parseFloat(r.totalDistance.toFixed(1)),
                totalCost: parseFloat(r.totalCost.toFixed(2)),
                totalFuelCost: parseFloat(r.totalFuelCost.toFixed(2)),
                totalTolls: parseFloat(r.totalTolls.toFixed(2)),
                avgDistance,
                minDistance: r.minDistance === Infinity ? 0 : r.minDistance,
                maxDistance: r.maxDistance === -Infinity ? 0 : r.maxDistance,
                avgFuelCost,
                avgTotalCost,
                avgCostPerKm,
                vehicleCount: r.vehiclesUsed.size,
                driverCount: r.drivers.size,
                anomalyCount: anomalies.length,
                trips: r.trips
            };
        });

        return routes.sort((a, b) => b.tripCount - a.tripCount);
    },

    computeVehicleAnalytics: function(trips = [], vehicles = []) {
        const completed = trips.filter(t => t.status === 'COMPLETED');
        const map = {};

        (vehicles || []).forEach(v => {
            map[v.plate] = {
                plate: v.plate,
                model: v.model || 'Vehicle',
                fuelType: v.fuelType || 'Diesel',
                mileage: v.mileage || 12.0,
                tripCount: 0,
                totalDistance: 0,
                totalFuelCost: 0,
                totalCost: 0
            };
        });

        completed.forEach(t => {
            if (!t.vehiclePlate) return;
            if (!map[t.vehiclePlate]) {
                map[t.vehiclePlate] = {
                    plate: t.vehiclePlate,
                    model: 'Fleet Vehicle',
                    fuelType: t.fuelType || 'Diesel',
                    mileage: t.mileage || 12.0,
                    tripCount: 0,
                    totalDistance: 0,
                    totalFuelCost: 0,
                    totalCost: 0
                };
            }
            const v = map[t.vehiclePlate];
            v.tripCount += 1;
            v.totalDistance += (parseFloat(t.distance) || 0);
            v.totalFuelCost += (parseFloat(t.fuelCost) || 0);
            v.totalCost += (parseFloat(t.totalCost) || 0);
        });

        return Object.values(map).map(v => ({
            ...v,
            totalDistance: parseFloat(v.totalDistance.toFixed(1)),
            totalFuelCost: parseFloat(v.totalFuelCost.toFixed(2)),
            totalCost: parseFloat(v.totalCost.toFixed(2)),
            avgCostPerKm: v.totalDistance > 0 ? parseFloat((v.totalCost / v.totalDistance).toFixed(2)) : 0
        }));
    },

    filterTrips: function(trips, filters = {}) {
        return trips.filter(t => {
            if (filters.status && filters.status !== 'ALL' && t.status !== filters.status) return false;
            if (filters.originCode && filters.originCode !== 'ALL' && t.originSiteCode !== filters.originCode) return false;
            if (filters.destCode && filters.destCode !== 'ALL' && t.destSiteCode !== filters.destCode) return false;
            if (filters.fuelType && filters.fuelType !== 'ALL' && t.fuelType !== filters.fuelType) return false;
            if (filters.dateFrom) {
                const tDate = new Date(t.checkInTime).toISOString().slice(0, 10);
                if (tDate < filters.dateFrom) return false;
            }
            if (filters.dateTo) {
                const tDate = new Date(t.checkInTime).toISOString().slice(0, 10);
                if (tDate > filters.dateTo) return false;
            }
            if (filters.search) {
                const q = filters.search.toLowerCase();
                const matchStr = `${t.id} ${t.driverName} ${t.vehiclePlate} ${t.fuelType} ${t.originSiteName} ${t.originSiteCode} ${t.destSiteName || ''} ${t.destSiteCode || ''} ${t.originSupervisor || ''} ${t.destSupervisor || ''} ${t.notes || ''}`.toLowerCase();
                if (!matchStr.includes(q)) return false;
            }
            return true;
        });
    }
};

window.TransportCalculator = TransportCalculator;

