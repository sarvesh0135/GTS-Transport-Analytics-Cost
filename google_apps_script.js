/**
 * FleetCost Google Apps Script Sync Service (Dynamic Column Matching & Corruption Filter Edition)
 * -------------------------------------------------------------
 * INSTRUCTIONS FOR SETUP:
 * 1. Open your Web App Google Sheet (e.g., "FleetCost Web App Data").
 * 2. Go to Extensions -> Apps Script.
 * 3. Delete any old code and paste ALL of this updated code into Code.gs.
 * 4. Ensure MASTER_SITES_SHEET_ID below matches your Master Sheet ID.
 * 5. Click "Deploy" -> "Manage deployments" -> Edit (pencil icon) -> Version: "New version" -> "Deploy".
 */

// ====================================================================
// CONFIGURATION - UPDATE YOUR MASTER SHEET ID HERE
// ====================================================================
const MASTER_SITES_SHEET_ID = "1W8PJL5cAZCa053SX4z9OmhRAozm9Bj_0Ka9G_2X7b_M"; // Master Google Sheet ID
const MASTER_SITES_TAB_NAME = "Sites Info";
const RESPONSES_TAB_NAME = "Trip Responses";

/**
 * Handle GET Requests (Fetch Master Sites and Trip Responses)
 */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : "getAll";

    if (action === "ping") {
      return jsonResponse({ status: "success", message: "FleetCost Google Apps Script API is active and online!" });
    }

    let sites = [];
    let trips = [];

    // Fetch Master Sites from Master Sheet (Read-Only)
    try {
      sites = fetchMasterSites();
    } catch (err) {
      console.error("Error fetching master sites:", err);
    }

    // Fetch Trips from Web App Responses Sheet
    try {
      trips = fetchTripResponses();
    } catch (err) {
      console.error("Error fetching trip responses:", err);
    }

    if (action === "getSites") {
      return jsonResponse({ status: "success", count: sites.length, sites: sites });
    } else if (action === "getTrips") {
      return jsonResponse({ status: "success", count: trips.length, trips: trips });
    } else {
      return jsonResponse({ status: "success", sitesCount: sites.length, tripsCount: trips.length, sites: sites, trips: trips });
    }

  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * Handle POST Requests (Save Driver Check-Ins, Check-Outs, & Trips)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: "error", message: "No post data received." });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || "saveTrip";

    if (action === "saveTrip" || action === "checkIn" || action === "checkOut") {
      const trip = payload.trip;
      if (!trip || !trip.id) {
        return jsonResponse({ status: "error", message: "Invalid trip payload." });
      }

      const result = saveOrUpdateTripResponse(trip);
      return jsonResponse({ status: "success", tripId: trip.id, action: result.action });
    } else if (action === "saveAllTrips") {
      const trips = payload.trips || [];
      let saved = 0;
      trips.forEach(t => {
        saveOrUpdateTripResponse(t);
        saved++;
      });
      return jsonResponse({ status: "success", count: saved });
    }

    return jsonResponse({ status: "error", message: "Unknown action: " + action });

  } catch (error) {
    return jsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * Reads Master Sites from the Master Sheet tab 'sites info'
 */
function fetchMasterSites() {
  if (!MASTER_SITES_SHEET_ID || MASTER_SITES_SHEET_ID === "YOUR_MASTER_SHEET_ID_HERE") {
    return [];
  }

  const masterSs = SpreadsheetApp.openById(MASTER_SITES_SHEET_ID);
  
  let sheet = masterSs.getSheetByName(MASTER_SITES_TAB_NAME);
  if (!sheet) {
    const sheets = masterSs.getSheets();
    for (let s = 0; s < sheets.length; s++) {
      const nameClean = sheets[s].getName().trim().toLowerCase();
      if (nameClean.indexOf("sites") !== -1 || nameClean.indexOf("info") !== -1) {
        sheet = sheets[s];
        break;
      }
    }
    if (!sheet && sheets.length > 0) {
      sheet = sheets[0];
    }
  }

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 1) return [];

  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(10, data.length); r++) {
    const rowStr = data[r].join(" ").toLowerCase();
    if (rowStr.indexOf("site") !== -1 || rowStr.indexOf("code") !== -1 || rowStr.indexOf("name") !== -1) {
      headerRowIndex = r;
      break;
    }
  }

  const headers = data[headerRowIndex].map(h => String(h).trim().toLowerCase());
  
  function findCol(keywords) {
    for (let k = 0; k < keywords.length; k++) {
      const idx = headers.indexOf(keywords[k]);
      if (idx !== -1) return idx;
    }
    for (let k = 0; k < keywords.length; k++) {
      for (let h = 0; h < headers.length; h++) {
        if (headers[h].indexOf(keywords[k]) !== -1) return h;
      }
    }
    return -1;
  }

  const colMap = {
    sno: findCol(["s.no", "sno", "sr.no", "sl.no", "id"]),
    code: findCol(["site code", "sitecode", "code", "site_code"]),
    name: findCol(["site name", "sitename", "name", "site_name"]),
    region: findCol(["region", "zone", "location", "state"]),
    customerGroup: findCol(["customer group", "customergroup", "customer", "group"]),
    status: findCol(["site status", "sitestatus", "status", "active"]),
    projectType: findCol(["project type", "projecttype", "type"]),
    supervisor: findCol(["horticulturist", "supervisor", "super visor", "horticulturist name"]),
    asstManager: findCol(["assistant manager", "asst manager", "asstmanager", "assistant manager name"]),
    manager: findCol(["manager", "mgr", "manager name"]),
    srManager: findCol(["sr manager", "sr. manager", "senior manager", "sr manager name"])
  };

  const sites = [];
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    const codeVal = colMap.code !== -1 ? String(row[colMap.code]).trim() : "";
    const nameVal = colMap.name !== -1 ? String(row[colMap.name]).trim() : "";

    if (!codeVal && !nameVal) continue;

    sites.push({
      id: "site-" + (i + 1),
      code: codeVal || ("SITE-" + (i + 1)),
      name: nameVal || codeVal,
      region: colMap.region !== -1 ? String(row[colMap.region]).trim() : "",
      customerGroup: colMap.customerGroup !== -1 ? String(row[colMap.customerGroup]).trim() : "",
      status: colMap.status !== -1 ? String(row[colMap.status]).trim() : "ACTIVE",
      projectType: colMap.projectType !== -1 ? String(row[colMap.projectType]).trim() : "",
      supervisor: colMap.supervisor !== -1 ? String(row[colMap.supervisor]).trim() : "",
      asstManager: colMap.asstManager !== -1 ? String(row[colMap.asstManager]).trim() : "",
      manager: colMap.manager !== -1 ? String(row[colMap.manager]).trim() : "",
      srManager: colMap.srManager !== -1 ? String(row[colMap.srManager]).trim() : ""
    });
  }

  return sites;
}

/**
 * Saves or Updates a Trip response using Dynamic Column Name Lookup
 */
function saveOrUpdateTripResponse(trip) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RESPONSES_TAB_NAME);

  const defaultHeaders = [
    "Trip ID", "Status", "Region", "Driver Name", "Vehicle Plate", "Fuel Type",
    "Origin Code", "Origin Name", "Destination Code", "Destination Name",
    "Start Odometer", "End Odometer", "Distance (km)", "Fuel Cost (INR)",
    "Toll Charges (INR)", "Total Cost (INR)", "Cost Per Km (INR)",
    "Check-In Time", "Check-Out Time", "Start GPS Location", "End GPS Location",
    "Supervisor (Horticulturist)", "Assistant Manager", "Manager", "Created At"
  ];

  if (!sheet) {
    sheet = ss.insertSheet(RESPONSES_TAB_NAME);
    sheet.appendRow(defaultHeaders);
    sheet.getRange(1, 1, 1, defaultHeaders.length).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
  }

  const data = sheet.getDataRange().getValues();
  let headers = data[0].map(h => String(h).trim().toLowerCase());

  function getColIndex(keywords) {
    for (let k = 0; k < keywords.length; k++) {
      const idx = headers.indexOf(keywords[k].toLowerCase());
      if (idx !== -1) return idx;
    }
    for (let k = 0; k < keywords.length; k++) {
      const kw = keywords[k].toLowerCase();
      for (let h = 0; h < headers.length; h++) {
        if (headers[h].indexOf(kw) !== -1) return h;
      }
    }
    return -1;
  }

  const startGpsStr = trip.startLocation ? (typeof trip.startLocation === 'object' ? (trip.startLocation.mapsUrl || JSON.stringify(trip.startLocation)) : String(trip.startLocation)) : "";
  const endGpsStr = trip.endLocation ? (typeof trip.endLocation === 'object' ? (trip.endLocation.mapsUrl || JSON.stringify(trip.endLocation)) : String(trip.endLocation)) : "";

  let originCode = trip.originSiteCode || trip.originCode || "";
  let originName = trip.originSiteName || trip.originName || "";
  let destCode = trip.destSiteCode || trip.destCode || "";
  let destName = trip.destSiteName || trip.destName || "";

  if (originCode === "Diesel" || originCode === "Petrol" || originCode === "CNG" || originCode === "EV") originCode = "";
  if (originName === "Diesel" || originName === "Petrol" || originName === "CNG" || originName === "EV") originName = "";
  if (destCode === "Diesel" || destCode === "Petrol" || destCode === "CNG" || destCode === "EV") destCode = "";
  if (destName === "Diesel" || destName === "Petrol" || destName === "CNG" || destName === "EV") destName = "";

  const dist = trip.distance !== undefined ? trip.distance : (trip.distanceKm !== undefined ? trip.distanceKm : 0);
  const tolls = trip.tollsAndMisc !== undefined ? trip.tollsAndMisc : (trip.tollCharges || 0);

  const valMap = {
    id: trip.id || "",
    status: trip.status || "IN_TRANSIT",
    region: trip.region || trip.originRegion || "GTS",
    driverName: trip.driverName || "",
    vehiclePlate: trip.vehiclePlate || "",
    fuelType: trip.fuelType || "",
    originCode: originCode,
    originName: originName,
    destCode: destCode,
    destName: destName,
    startOdo: trip.startOdo !== undefined && trip.startOdo !== null ? trip.startOdo : "",
    endOdo: trip.endOdo !== undefined && trip.endOdo !== null ? trip.endOdo : "",
    distance: dist,
    fuelCost: trip.fuelCost !== undefined ? trip.fuelCost : "",
    tolls: tolls,
    totalCost: trip.totalCost !== undefined ? trip.totalCost : "",
    costPerKm: trip.costPerKm !== undefined ? trip.costPerKm : "",
    checkInTime: trip.checkInTime || "",
    checkOutTime: trip.checkOutTime || "",
    startGps: startGpsStr,
    endGps: endGpsStr,
    supervisor: trip.originSupervisor || trip.supervisor || "",
    asstManager: trip.originAsstManager || trip.asstManager || "",
    manager: trip.originManager || trip.manager || "",
    createdAt: new Date().toISOString()
  };

  const colIndices = {
    id: getColIndex(["trip id", "id"]),
    status: getColIndex(["status"]),
    region: getColIndex(["region", "zone"]),
    driverName: getColIndex(["driver name", "driver"]),
    vehiclePlate: getColIndex(["vehicle plate", "vehicle", "plate"]),
    fuelType: getColIndex(["fuel type", "fuel"]),
    originCode: getColIndex(["origin code", "origin site code", "departure code"]),
    originName: getColIndex(["origin name", "origin site name", "departure name"]),
    destCode: getColIndex(["destination code", "dest code", "arrival code"]),
    destName: getColIndex(["destination name", "dest name", "arrival name"]),
    startOdo: getColIndex(["start odometer", "start odo"]),
    endOdo: getColIndex(["end odometer", "end odo"]),
    distance: getColIndex(["distance (km)", "distance"]),
    fuelCost: getColIndex(["fuel cost (inr)", "fuel cost"]),
    tolls: getColIndex(["toll charges (inr)", "toll charges", "tolls"]),
    totalCost: getColIndex(["total cost (inr)", "total cost"]),
    costPerKm: getColIndex(["cost per km (inr)", "cost per km"]),
    checkInTime: getColIndex(["check-in time", "checkin time"]),
    checkOutTime: getColIndex(["check-out time", "checkout time"]),
    startGps: getColIndex(["start gps location", "start location"]),
    endGps: getColIndex(["end gps location", "end location"]),
    supervisor: getColIndex(["supervisor (horticulturist)", "supervisor"]),
    asstManager: getColIndex(["assistant manager", "asst manager"]),
    manager: getColIndex(["manager"]),
    createdAt: getColIndex(["created at"])
  };

  const rowValues = new Array(headers.length).fill("");

  for (const [key, idx] of Object.entries(colIndices)) {
    if (idx !== -1 && idx < rowValues.length) {
      rowValues[idx] = valMap[key] !== undefined ? valMap[key] : "";
    }
  }

  if (colIndices.id === -1) rowValues[0] = trip.id;

  let rowIndex = -1;
  const idColIndex = colIndices.id !== -1 ? colIndices.id : 0;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idColIndex]) === String(trip.id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    return { action: "updated", row: rowIndex };
  } else {
    sheet.appendRow(rowValues);
    return { action: "inserted", row: sheet.getLastRow() };
  }
}

/**
 * Fetches all Trip Responses from 'Trip Responses' sheet using Dynamic Column Name Lookup
 */
function fetchTripResponses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(RESPONSES_TAB_NAME);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h).trim().toLowerCase());

  function getColIndex(keywords) {
    for (let k = 0; k < keywords.length; k++) {
      const idx = headers.indexOf(keywords[k].toLowerCase());
      if (idx !== -1) return idx;
    }
    for (let k = 0; k < keywords.length; k++) {
      const kw = keywords[k].toLowerCase();
      for (let h = 0; h < headers.length; h++) {
        if (headers[h].indexOf(kw) !== -1) return h;
      }
    }
    return -1;
  }

  const cols = {
    id: getColIndex(["trip id", "id"]),
    status: getColIndex(["status"]),
    region: getColIndex(["region", "zone"]),
    driverName: getColIndex(["driver name", "driver"]),
    vehiclePlate: getColIndex(["vehicle plate", "vehicle", "plate"]),
    fuelType: getColIndex(["fuel type", "fuel"]),
    originCode: getColIndex(["origin code", "origin site code", "departure code"]),
    originName: getColIndex(["origin name", "origin site name", "departure name"]),
    destCode: getColIndex(["destination code", "dest code", "arrival code"]),
    destName: getColIndex(["destination name", "dest name", "arrival name"]),
    startOdo: getColIndex(["start odometer", "start odo"]),
    endOdo: getColIndex(["end odometer", "end odo"]),
    distance: getColIndex(["distance (km)", "distance"]),
    fuelCost: getColIndex(["fuel cost (inr)", "fuel cost"]),
    tolls: getColIndex(["toll charges (inr)", "toll charges", "tolls"]),
    totalCost: getColIndex(["total cost (inr)", "total cost"]),
    costPerKm: getColIndex(["cost per km (inr)", "cost per km"]),
    checkInTime: getColIndex(["check-in time", "checkin time"]),
    checkOutTime: getColIndex(["check-out time", "checkout time"]),
    startGps: getColIndex(["start gps location", "start location"]),
    endGps: getColIndex(["end gps location", "end location"]),
    supervisor: getColIndex(["supervisor (horticulturist)", "supervisor"]),
    asstManager: getColIndex(["assistant manager", "asst manager"]),
    manager: getColIndex(["manager"])
  };

  function getVal(row, colIdx, defaultVal) {
    if (colIdx === -1 || colIdx >= row.length) return defaultVal;
    const v = row[colIdx];
    return v !== undefined && v !== null && String(v).trim() !== "" ? v : defaultVal;
  }

  const trips = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const tripId = getVal(row, cols.id, "");
    if (!tripId) continue;

    const startOdo = Number(getVal(row, cols.startOdo, 0)) || 0;
    const endOdo = Number(getVal(row, cols.endOdo, 0)) || 0;
    let dist = Number(getVal(row, cols.distance, 0)) || 0;
    if (dist === 0 && endOdo >= startOdo && endOdo > 0) {
      dist = endOdo - startOdo;
    }

    let originCode = String(getVal(row, cols.originCode, "")).trim();
    let originName = String(getVal(row, cols.originName, "")).trim();
    let destCode = String(getVal(row, cols.destCode, "")).trim();
    let destName = String(getVal(row, cols.destName, "")).trim();

    // Ignore corrupted values where fuel type 'Diesel' was written into site code column
    if (originCode === "Diesel" || originCode === "Petrol" || originCode === "CNG" || originCode === "EV") originCode = "";
    if (originName === "Diesel" || originName === "Petrol" || originName === "CNG" || originName === "EV") originName = "";
    if (destCode === "Diesel" || destCode === "Petrol" || destCode === "CNG" || destCode === "EV") destCode = "";
    if (destName === "Diesel" || destName === "Petrol" || destName === "CNG" || destName === "EV") destName = "";

    trips.push({
      id: String(tripId),
      status: String(getVal(row, cols.status, "COMPLETED")),
      region: String(getVal(row, cols.region, "GTS")),
      driverName: String(getVal(row, cols.driverName, "Driver")),
      vehiclePlate: String(getVal(row, cols.vehiclePlate, "TS07UF6428")),
      fuelType: String(getVal(row, cols.fuelType, "Diesel")),
      originSiteCode: originCode,
      originCode: originCode,
      originSiteName: originName,
      originName: originName,
      destSiteCode: destCode,
      destCode: destCode,
      destSiteName: destName,
      destName: destName,
      startOdo: startOdo,
      endOdo: endOdo,
      distance: dist,
      distanceKm: dist,
      fuelCost: Number(getVal(row, cols.fuelCost, 0)) || 0,
      tollsAndMisc: Number(getVal(row, cols.tolls, 0)) || 0,
      tollCharges: Number(getVal(row, cols.tolls, 0)) || 0,
      totalCost: Number(getVal(row, cols.totalCost, 0)) || 0,
      costPerKm: Number(getVal(row, cols.costPerKm, 0)) || 0,
      checkInTime: String(getVal(row, cols.checkInTime, new Date().toISOString())),
      checkOutTime: String(getVal(row, cols.checkOutTime, "")),
      startLocation: String(getVal(row, cols.startGps, "")),
      endLocation: String(getVal(row, cols.endGps, "")),
      originSupervisor: String(getVal(row, cols.supervisor, "N/A")),
      supervisor: String(getVal(row, cols.supervisor, "N/A")),
      originAsstManager: String(getVal(row, cols.asstManager, "N/A")),
      asstManager: String(getVal(row, cols.asstManager, "N/A")),
      manager: String(getVal(row, cols.manager, "N/A")),
      fuelRate: 92.50,
      fuelUnit: 'Litre',
      mileage: 10
    });
  }

  return trips;
}

/**
 * Helper to build JSON responses with proper headers for Web App calls
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
