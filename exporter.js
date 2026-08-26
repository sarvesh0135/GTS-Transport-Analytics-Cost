/**
 * Transport Cost & Trip Tracker - Exporter & Print Engine
 */

const AppExporter = {
    exportTripsToExcel: function(trips) {
        if (!trips || trips.length === 0) {
            alert('No trips to export.');
            return;
        }

        const data = trips.map(t => ({
            'Trip ID': t.id,
            'Status': t.status,
            'Date': new Date(t.checkInTime).toLocaleDateString(),
            'Check-In Time': new Date(t.checkInTime).toLocaleTimeString(),
            'Check-Out Time': t.checkOutTime ? new Date(t.checkOutTime).toLocaleTimeString() : 'In Transit',
            'Driver': t.driverName,
            'Vehicle Plate': t.vehiclePlate,
            'Fuel Type': t.fuelType,
            'Origin Site Code': t.originSiteCode,
            'Origin Site Name': t.originSiteName,
            'Origin Supervisor': t.originSupervisor,
            'Origin Asst Manager': t.originAsstManager,
            'Dest Site Code': t.destSiteCode || 'Pending',
            'Dest Site Name': t.destSiteName || 'Pending',
            'Dest Supervisor': t.destSupervisor || 'Pending',
            'Dest Asst Manager': t.destAsstManager || 'Pending',
            'Start Meter (km)': t.startOdo,
            'End Meter (km)': t.endOdo || 'N/A',
            'Distance (km)': t.distance,
            'Mileage (km/L)': t.mileage,
            'Fuel Consumed': t.fuelConsumed,
            'Fuel Rate (₹)': t.fuelRate,
            'Fuel Cost (₹)': t.fuelCost,
            'Tolls & Misc (₹)': t.tollsAndMisc,
            'Total Trip Cost (₹)': t.totalCost,
            'Cost per km (₹)': t.costPerKm,
            'Meter Photo Verified': t.isVerified ? `Verified by ${t.verifiedBy}` : 'Pending Verification',
            'Notes': t.notes || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Fleet_Trips');
        
        const filename = `Fleet_Trips_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(workbook, filename);
    },

    exportRouteMatrixToExcel: function(routes) {
        if (!routes || routes.length === 0) {
            alert('No route data to export.');
            return;
        }

        const data = routes.map(r => ({
            'Origin Site Code': r.originCode,
            'Origin Site Name': r.originName,
            'Origin Supervisor': r.originSupervisor,
            'Origin Asst Manager': r.originAsstManager,
            'Destination Site Code': r.destCode,
            'Destination Site Name': r.destName,
            'Dest Supervisor': r.destSupervisor,
            'Dest Asst Manager': r.destAsstManager,
            'Total Trips Completed': r.tripCount,
            'Avg Distance (km)': r.avgDistance,
            'Min Distance (km)': r.minDistance,
            'Max Distance (km)': r.maxDistance,
            'Avg Fuel Cost (₹)': r.avgFuelCost,
            'Avg Total Cost (₹)': r.avgTotalCost,
            'Total Route Spend (₹)': r.totalCost,
            'Avg Rate per km (₹)': r.avgCostPerKm,
            'Anomalies / Deviations': r.anomalyCount
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Site_To_Site_Cost_Matrix');
        
        const filename = `Site_To_Site_Cost_Matrix_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(workbook, filename);
    },

    printTripSlip: function(trip) {
        if (!trip) return;

        const printWindow = window.open('', '_blank', 'width=800,height=800');
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Trip Receipt Slip - ${trip.id}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 24px; color: #1e293b; background: #fff; }
                    .slip-container { max-width: 650px; margin: auto; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; }
                    .header { text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 16px; margin-bottom: 20px; }
                    .title { font-size: 20px; font-weight: bold; color: #0f172a; margin: 0; }
                    .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
                    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
                    .label { color: #64748b; font-weight: 500; }
                    .value { font-weight: 600; color: #0f172a; }
                    .site-box { background: #f1f5f9; border-radius: 8px; padding: 12px; margin: 12px 0; font-size: 12px; }
                    .cost-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
                    .total-row { display: flex; justify-content: space-between; font-size: 17px; font-weight: bold; color: #2563eb; padding-top: 10px; border-top: 2px solid #cbd5e1; }
                    .photos { display: flex; gap: 12px; margin-top: 14px; }
                    .photo-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; text-align: center; }
                    .photo-box img { max-width: 100%; max-height: 140px; object-fit: contain; border-radius: 4px; }
                    .badge-v { display: inline-block; padding: 4px 10px; border-radius: 6px; background: #ecfdf5; color: #059669; font-weight: bold; font-size: 11px; }
                    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 20px; }
                    @media print { body { padding: 0; } .slip-container { border: none; } }
                </style>
            </head>
            <body>
                <div class="slip-container">
                    <div class="header">
                        <div class="title">🚚 TRANSPORT TRIP RECEIPT & COST SLIP</div>
                        <div class="sub">Trip ID: <strong>${trip.id}</strong> | Status: <strong>${trip.status}</strong></div>
                    </div>

                    <div class="row"><span class="label">Driver Name:</span><span class="value">${trip.driverName}</span></div>
                    <div class="row"><span class="label">Vehicle Number:</span><span class="value">${trip.vehiclePlate}</span></div>
                    <div class="row"><span class="label">Fuel Type:</span><span class="value">${trip.fuelType} (Rate: ₹${trip.fuelRate}/${trip.fuelUnit})</span></div>
                    <div class="row"><span class="label">Trip Departure:</span><span class="value">${new Date(trip.checkInTime).toLocaleString()}</span></div>
                    <div class="row"><span class="label">Trip Arrival:</span><span class="value">${trip.checkOutTime ? new Date(trip.checkOutTime).toLocaleString() : 'In Transit'}</span></div>

                    <div class="site-box">
                        <div style="font-weight:bold; color:#0f172a; margin-bottom:4px;">📍 ORIGIN: [${trip.originSiteCode}] ${trip.originSiteName}</div>
                        <div>Supervisor: <strong>${trip.originSupervisor}</strong> | Asst. Manager: <strong>${trip.originAsstManager}</strong></div>
                    </div>

                    <div class="site-box">
                        <div style="font-weight:bold; color:#0f172a; margin-bottom:4px;">🏁 DESTINATION: [${trip.destSiteCode || '-'}] ${trip.destSiteName || 'In Transit'}</div>
                        <div>Supervisor: <strong>${trip.destSupervisor || '-'}</strong> | Asst. Manager: <strong>${trip.destAsstManager || '-'}</strong></div>
                    </div>

                    <div class="cost-box">
                        <div class="row"><span class="label">Start Meter Reading:</span><span class="value">${trip.startOdo} km</span></div>
                        <div class="row"><span class="label">End Meter Reading:</span><span class="value">${trip.endOdo || '-'} km</span></div>
                        <div class="row"><span class="label">Total Distance Traveled:</span><span class="value">${trip.distance} km</span></div>
                        <div class="row"><span class="label">Vehicle Mileage:</span><span class="value">${trip.mileage} km/L</span></div>
                        <div class="row"><span class="label">Calculated Fuel Consumed:</span><span class="value">${trip.fuelConsumed} ${trip.fuelUnit}</span></div>
                        <div class="row"><span class="label">Fuel Cost:</span><span class="value">₹${trip.fuelCost}</span></div>
                        <div class="row"><span class="label">Tolls & Additional Expenses:</span><span class="value">₹${trip.tollsAndMisc}</span></div>
                        <div class="total-row"><span>Total Transport Cost:</span><span>₹${trip.totalCost}</span></div>
                        <div class="row" style="border-bottom:none; margin-top:4px;"><span class="label">Cost Per Kilometer:</span><span class="value">₹${trip.costPerKm}/km</span></div>
                    </div>

                    ${(trip.startPhoto || trip.endPhoto) ? `
                        <div class="photos">
                            ${trip.startPhoto ? `<div class="photo-box"><div style="font-size:10px; color:#64748b; margin-bottom:4px;">Start Meter Photo</div><img src="${trip.startPhoto}"/></div>` : ''}
                            ${trip.endPhoto ? `<div class="photo-box"><div style="font-size:10px; color:#64748b; margin-bottom:4px;">End Meter Photo</div><img src="${trip.endPhoto}"/></div>` : ''}
                        </div>
                    ` : ''}

                    <div style="margin-top:16px; border: 1.5px solid ${trip.isVerified ? '#059669' : '#cbd5e1'}; border-radius: 8px; padding: 12px; background:${trip.isVerified ? '#ecfdf5' : '#f8fafc'}; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-size:11px; color:#64748b; font-weight:600;">SUPERVISOR VERIFICATION:</div>
                            <div style="font-size:14px; font-weight:bold; color:${trip.isVerified ? '#059669' : '#d97706'}; margin-top:2px;">
                                ${trip.isVerified ? `✓ Verified by ${trip.verifiedBy}` : 'Verification Pending'}
                            </div>
                            ${trip.verifiedAt ? `<div style="font-size:10px; color:#64748b; margin-top:2px;">Verified on: ${new Date(trip.verifiedAt).toLocaleString()}</div>` : ''}
                            ${trip.verificationNotes ? `<div style="font-size:11px; color:#0f172a; margin-top:4px; font-style:italic;">"${trip.verificationNotes}"</div>` : ''}
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:10px; color:#64748b; margin-bottom: 24px;">Supervisor Signature</div>
                            <div style="border-top:1px dashed #64748b; width:150px; text-align:center; font-size:11px; font-weight:600; color:#0f172a; padding-top:4px;">
                                ${trip.isVerified ? trip.verifiedBy : 'Authorized Signatory'}
                            </div>
                        </div>
                    </div>

                    <div class="footer">
                        <p>Generated by Fleet Transport Cost System • Verified Driver Copy</p>
                    </div>
                </div>
                <scr' + 'ipt>
                    window.onload = function() { window.print(); }
                <\/script>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    }
};

window.AppExporter = AppExporter;
