/**
 * Transport Cost & Trip Tracker - Chart.js Visualizations
 */

let routeCostChartInstance = null;
let vehicleCostChartInstance = null;
let costBreakdownChartInstance = null;
let trendChartInstance = null;

const AppCharts = {
    renderAllCharts: function(trips, sites, vehicles) {
        this.renderRouteCostChart(trips, sites);
        this.renderVehicleEfficiencyChart(trips, vehicles);
        this.renderCostBreakdownChart(trips);
        this.renderDailyTrendChart(trips);
    },

    renderRouteCostChart: function(trips, sites) {
        const ctx = document.getElementById('routeCostChart');
        if (!ctx) return;

        const matrix = TransportCalculator.computeSiteToSiteMatrix(trips, sites);
        const topRoutes = matrix.slice(0, 6);

        const labels = topRoutes.map(r => {
            const rawFrom = r.originSiteName || r.originName || r.originCode || 'Origin';
            const rawTo = r.destSiteName || r.destName || r.destCode || 'Dest';
            const from = rawFrom.split('-')[0].trim().replace('Central Logistics Hub (Main HQ)', 'HQ');
            const to = rawTo.split('-')[0].trim().replace('Central Logistics Hub (Main HQ)', 'HQ');
            return `${from} → ${to}`;
        });
        const totalCosts = topRoutes.map(r => r.totalCost);
        const avgCosts = topRoutes.map(r => r.avgTotalCost);

        if (routeCostChartInstance) {
            routeCostChartInstance.destroy();
        }

        routeCostChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['No Completed Routes'],
                datasets: [
                    {
                        label: 'Total Route Spend (₹)',
                        data: totalCosts.length ? totalCosts : [0],
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: '#2563eb',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Avg Trip Cost (₹)',
                        data: avgCosts.length ? avgCosts : [0],
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderColor: '#059669',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 },
                        padding: 10
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { size: 11 } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        ticks: { color: '#94a3b8', callback: val => `₹${val}` },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
    },

    renderVehicleEfficiencyChart: function(trips, vehicles) {
        const ctx = document.getElementById('vehicleCostChart');
        if (!ctx) return;

        const vehicleStats = TransportCalculator.computeVehicleAnalytics(trips, vehicles);
        const labels = vehicleStats.map(v => `${v.plate.slice(0, 8)} (${v.fuelType})`);
        const totalDistances = vehicleStats.map(v => v.totalDistance);
        const totalCosts = vehicleStats.map(v => v.totalCost);

        if (vehicleCostChartInstance) {
            vehicleCostChartInstance.destroy();
        }

        vehicleCostChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['No Vehicles'],
                datasets: [
                    {
                        label: 'Total Cost (₹)',
                        data: totalCosts.length ? totalCosts : [0],
                        backgroundColor: 'rgba(239, 68, 68, 0.75)',
                        borderColor: '#dc2626',
                        borderWidth: 1,
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Distance (km)',
                        data: totalDistances.length ? totalDistances : [0],
                        backgroundColor: 'rgba(99, 102, 241, 0.75)',
                        borderColor: '#4f46e5',
                        borderWidth: 1,
                        borderRadius: 6,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#94a3b8', font: { size: 12 } }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { size: 11 } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        ticks: { color: '#ef4444', callback: val => `₹${val}` },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        ticks: { color: '#6366f1', callback: val => `${val} km` },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    },

    renderCostBreakdownChart: function(trips) {
        const ctx = document.getElementById('costBreakdownChart');
        if (!ctx) return;

        const completed = trips.filter(t => t.status === 'COMPLETED');
        const fuelCost = completed.reduce((sum, t) => sum + (parseFloat(t.fuelCost) || 0), 0);
        const tollsCost = completed.reduce((sum, t) => sum + (parseFloat(t.tollsAndMisc) || 0), 0);

        if (costBreakdownChartInstance) {
            costBreakdownChartInstance.destroy();
        }

        costBreakdownChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Fuel Cost', 'Tolls & Misc Expenses'],
                datasets: [
                    {
                        data: [fuelCost || 1, tollsCost || 0],
                        backgroundColor: ['#3b82f6', '#f59e0b'],
                        borderColor: '#0f172a',
                        borderWidth: 3,
                        hoverOffset: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94a3b8', padding: 15 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const total = fuelCost + tollsCost;
                                const val = ctx.raw;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ₹${val.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '70%'
            }
        });
    },

    renderDailyTrendChart: function(trips) {
        const ctx = document.getElementById('dailyTrendChart');
        if (!ctx) return;

        const completed = trips.filter(t => t.status === 'COMPLETED');
        const dateMap = {};

        completed.forEach(t => {
            const day = new Date(t.checkInTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            if (!dateMap[day]) {
                dateMap[day] = { cost: 0, distance: 0, count: 0 };
            }
            dateMap[day].cost += (parseFloat(t.totalCost) || 0);
            dateMap[day].distance += (parseFloat(t.distance) || 0);
            dateMap[day].count += 1;
        });

        const labels = Object.keys(dateMap);
        const costs = labels.map(l => parseFloat(dateMap[l].cost.toFixed(2)));
        const distances = labels.map(l => parseFloat(dateMap[l].distance.toFixed(1)));

        if (trendChartInstance) {
            trendChartInstance.destroy();
        }

        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['No Data'],
                datasets: [
                    {
                        label: 'Daily Transport Spend (₹)',
                        data: costs.length ? costs : [0],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2,
                        pointBackgroundColor: '#10b981',
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#94a3b8' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        ticks: { color: '#94a3b8', callback: val => `₹${val}` },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
    }
};

window.AppCharts = AppCharts;
