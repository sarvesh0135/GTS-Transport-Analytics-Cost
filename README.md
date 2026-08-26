# 🚚 FleetCost - Transport & Site-to-Site Trip Cost Tracker

A modern, responsive web application designed for fleet logistics, transport cost tracking, driver check-in/check-out with meter readings, and site-to-site transportation analytics.

---

## 🌟 Key Features

### 1. Driver Check-In & Check-Out Terminal
- **Departure Check-In**:
  - Driver selects profile, assigned vehicle, and departure origin site.
  - Automatically loads and validates vehicle's last recorded odometer (starting meter reading).
  - Flags vehicle as **In Transit** and starts trip timer.
- **Arrival Check-Out**:
  - Selects destination arrival site.
  - Enters ending meter reading (with built-in validation enforcing `End Odometer >= Start Odometer`).
  - **Live Reactive Calculation Matrix**: Instantly previews distance traveled ($km$), fuel consumed ($L$ or $kg$/$kWh$), fuel cost ($₹$), toll charges, total trip cost, and cost per kilometer ($₹/km$).
  - One-click generation of printable **Official Trip Receipt Slips**.

### 2. Site-to-Site Transportation Cost Matrix
- Aggregates all completed trips across connected facilities (e.g., *Central Logistics Hub $\rightarrow$ Site Alpha*).
- Route metrics include:
  - **Total Trips Completed**
  - **Average Distance** ($km$), Min & Max distance benchmarks
  - **Average Total Cost** ($₹$) & Fuel cost breakdown
  - **Average Rate per Kilometer** ($₹/km$)
  - **Anomaly Detection**: Flags any trip where distance or cost deviates by $>20\%$ from historical route benchmarks (detects detours or traffic idling).

### 3. Executive Dashboard & Visual Analytics
- **Fleet KPI Cards**: Total fleet spend, total distance driven ($km$), total fuel used ($L$), average cost per $km$, completed trips, and active in-transit vehicles.
- **Interactive Chart.js Visualizations**:
  - Top Site Routes by Total Spend & Average Trip Cost.
  - Vehicle Cost vs Distance distribution.
  - Expense Category breakdown (Fuel vs Tolls/Misc).
  - Daily/Weekly Transport Spend timeline trends.

### 4. Trip Logs Master Ledger & Exports
- Search and filter trips by driver name, vehicle plate, route origin/destination, status, or date range.
- **Export to Excel (`.xlsx`)**: One-click download of the complete trip ledger or site-to-site cost matrix using SheetJS.
- Detailed trip slips with printable layout.

### 5. Fleet & Fuel Rate Configuration
- **Vehicle Registry**: Add and manage vehicles with plate numbers, models, fuel types (Diesel, Petrol, CNG, EV), and rated mileage efficiency ($km/L$).
- **Live Fuel Market Rates**: Configure live prices per liter/kg/kWh to dynamically calculate trip costs.
- **Data Backup & Restore**: Download full database backup as JSON or restore data anytime.

---

## 🚀 How to Launch and Use

1. Open `index.html` in any web browser (Chrome, Edge, Firefox, Safari, or mobile browser):
   ```
   C:\Users\Sarvesh\.gemini\antigravity\scratch\transport_cost_tracker\index.html
   ```
2. The app loads with sample demo sites, vehicles, fuel rates, and historical trips ready to explore.
3. Test creating a new trip:
   - Go to **Driver Check-In/Out** tab.
   - Select Driver **Ramesh Kumar**, Vehicle **MH-12-TR-4590**, Origin **Central Logistics Hub**.
   - Click **Start Trip & Check In**.
   - Under *Active Trips Underway*, click **Check Out & Calculate Cost**.
   - Select Destination **Site Alpha**, enter End Meter Reading (e.g. `48560`), add tolls (e.g. `80`).
   - Observe the live instant cost preview and click **Complete Trip & Save**.
   - View your updated **Site-to-Site Matrix** and **Cost Analytics**!

---

## 📁 Project Architecture

```
transport_cost_tracker/
├── index.html           # Main Single-Page Web Application UI
├── README.md            # Comprehensive documentation
└── js/
    ├── db.js            # Storage layer with LocalStorage persistence & seed data
    ├── calculator.js    # Mathematical calculation & route analytics engine
    ├── charts.js        # Chart.js visualization controllers
    ├── exporter.js      # Excel (.xlsx) generator & printable slip engine
    └── app.js           # Main event listeners, form handlers, & reactive state
```
