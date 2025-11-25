// ================================
//     INITIAL SETUP
// ================================

const map = L.map("map").setView([27.843, -15.600], 12);

let availableRoutes = new Set();
let routeInfo = {};
let routeDetailsCache = {};
let activeBusData = {};
let vehicleMarkers = new Map();

let lastOpenedFleetNumber = null;
let popupWasOpen = false;
let activeRoutePolyline = null;


// ================================
//    LOAD ROUTE INFO
// ================================

async function loadRouteInfo() {
  try {
    const url =
      "https://global.ross4122-ff0.workers.dev/?url=" +
      encodeURIComponent(
        "http://sat2globalapp.com:44040/App_MiLineaGlobal-Project-context-root/jersey/lineas"
      );

    const res = await fetch(url);
    const data = await res.json();

    const list = data.Respuesta?.Concesiones?.Concesion || [];

    list.forEach(r => {
      routeInfo[r.Numero.toString()] = {
        name: r.Nombre,
        color: r.Color
      };
    });

  } catch (e) {
    console.error("Route info error:", e);
  }
}

loadRouteInfo();


// ================================
//     ROUTE + VARIANT DETAILS
// ================================

async function getRouteDetails(route) {
  if (routeDetailsCache[route]) return routeDetailsCache[route];

  try {
    const url =
      "https://global.ross4122-ff0.workers.dev/?url=" +
      encodeURIComponent(
        `http://sat2globalapp.com:44040/App_MiLineaGlobal-Project-context-root/jersey/lineas/${route}`
      );

    const res = await fetch(url);
    const data = await res.json();

    routeDetailsCache[route] = data;
    return data;

  } catch {
    return null;
  }
}

async function getDestination(route, variant) {
  const details = await getRouteDetails(route);
  if (!details?.Concesion?.Variantes) return "Unknown";

  const v = details.Concesion.Variantes.find(x => x.Variante == variant);
  if (!v?.Paradas?.length) return "Unknown";

  return v.Paradas[v.Paradas.length - 1].Nombre || "Unknown";
}

// ================================
//         DRAW ROUTE MAP
// ================================

async function drawRoutePolyline(route, variant, currentLat, currentLon) {
  const details = await getRouteDetails(route);
  if (!details?.Concesion?.Variantes) return;

  const v = details.Concesion.Variantes.find(x => x.Variante == variant);
  if (!v || !v.Paradas || v.Paradas.length === 0) return;

  // Convert stops to coordinates
  let stops = v.Paradas
    .map(p => ({
      lat: parseFloat(p.Lat),
      lon: parseFloat(p.Lon),
      order: parseInt(p.Orden)
    }))
    .filter(p => p.lat && p.lon);

  if (!stops.length) return;

  // Find NEXT STOP — closest one ahead of the bus
  let nextStop = null;
  let minDist = Infinity;

  stops.forEach(s => {
    const d = Math.hypot(s.lat - currentLat, s.lon - currentLon);
    if (d < minDist) {
      minDist = d;
      nextStop = s;
    }
  });

  if (!nextStop) return;

  // Keep only stops from nextStop onwards
  const remainingStops = stops.filter(s => s.order >= nextStop.order);

  if (remainingStops.length === 0) return;

  const latlngs = remainingStops.map(s => [s.lat, s.lon]);

  // Clear previous polyline
  if (activeRoutePolyline) {
    map.removeLayer(activeRoutePolyline);
  }

  // Draw remaining route polyline
  activeRoutePolyline = L.polyline(latlngs, {
    color: "#0066ff",
    weight: 4,
    opacity: 0.9
  }).addTo(map);
}

// ================================
//       MAP + CONTROLS
// ================================

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

L.control.locate({ position: "topleft", follow: true }).addTo(map);


// ================================
//       CLEAN ICON STYLE
// ================================

function createVehicleIcon(fleetNumber) {
  return L.divIcon({
    iconSize: [32, 13],
    html: `<div class="newicon">${fleetNumber}</div>`,
    className: "",
    popupAnchor: [0, -5]
  });
}


// ================================
//    SMOOTH MARKER MOVEMENT
// ================================

function animateMarker(marker, newLat, newLon) {
  const start = marker.getLatLng();
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min((now - startTime) / 1000, 1);
    marker.setLatLng([
      start.lat + (newLat - start.lat) * t,
      start.lng + (newLon - start.lng) * t
    ]);
    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}


// ================================
//  VEHICLE FETCHING
// ================================

function getDynamicApiUrl() {
  const c = map.getCenter();
  const b = map.getBounds();
  const dist = c.distanceTo(b.getNorthEast());

  return (
    "http://sat2globalapp.com:44040/App_MiLineaGlobal-Project-context-root/jersey/posicionvehiculos" +
    `?lat=${c.lat}&lon=${c.lng}&dist=${Math.round(dist)}`
  );
}

async function fetchVehicleData() {
  try {
    const raw = getDynamicApiUrl();
    const url =
      "https://global.ross4122-ff0.workers.dev/?url=" +
      encodeURIComponent(raw);

    const res = await fetch(url);
    const data = await res.json();

    if (!data.Vehiculos) return;
	
	console.log("Fetched vehicles:", data.Vehiculos?.length, data);

    popupWasOpen = !!map._popup;

    const currentFeedRoutes = new Set();

    const search = document.getElementById("vehicleSearch").value.trim();
    const prefix = search.replace("*", "");

 for (const v of data.Vehiculos) {
  const fleet = v.Vehiculo.toString();
  const lat = +v.Latitud;
  const lon = +v.Longitud;
  const route = v.Concesion.toString();
  const variant = v.Variante;

  if (!lat || !lon) continue;

  // Fetch destination for logging
  let dest = "Unknown";
  try {
    dest = await getDestination(route, variant);
  } catch {}
  
  // --- Get first/last stops ---
async function getFirstLastStops(route, variant) {
  const details = await getRouteDetails(route);
  if (!details?.Concesion?.Variantes) return "Unknown";

  const v = details.Concesion.Variantes.find(x => x.Variante == variant);
  if (!v?.Paradas?.length) return "Unknown";

  const first = v.Paradas[0].Nombre || "Unknown";
  const last = v.Paradas[v.Paradas.length - 1].Nombre || "Unknown";

  return `${first} > ${last}`;
}

// --- Fetch first/last for this bus ---
const firstLast = await getFirstLastStops(route, variant);


// -------------------------------
//   LOGGING SYSTEM (FIXED KEY)
// -------------------------------
if (!window.busLog) window.busLog = JSON.parse(localStorage.getItem("busLog") || "[]");
if (!window.lastLogState) window.lastLogState = {};

const direction = firstLast;   // rename for clarity

const prev = window.lastLogState[fleet];
const curr = { route, direction, variant };

const changed =
  !prev ||
  prev.route !== curr.route ||
  prev.direction !== curr.direction ||
  prev.variant !== curr.variant;

if (changed) {
  const timestamp = new Date().toLocaleString();

  const entry = {
    time: timestamp,
    fleet,
    route,
    direction     // <-- consistent key name
  };

  window.busLog.push(entry);
  localStorage.setItem("busLog", JSON.stringify(window.busLog));

  addLogRow(timestamp, fleet, route, direction);

  window.lastLogState[fleet] = curr;
}



  // -------------------------------
  //    (NORMAL BUS HANDLING)
  // -------------------------------

  currentFeedRoutes.add(route);

  const selectedRoute = document.getElementById("routeSelect").value;
  if (selectedRoute !== "all" && selectedRoute !== route) continue;

  const search = document.getElementById("vehicleSearch").value.trim();
  const prefix = search.replace("*", "");
  if (search && !fleet.startsWith(prefix)) continue;

  if (vehicleMarkers.has(fleet)) {
    animateMarker(vehicleMarkers.get(fleet), lat, lon);
  } else {
    const marker = L.marker([lat, lon], {
      icon: createVehicleIcon(fleet)
    }).addTo(map);

    marker.bindPopup("Loading...");
    marker.on("popupopen", async () => {
      const info = fleetData[fleet] || { plate: "Unknown", type: "Unknown" };

      await drawRoutePolyline(route, variant, lat, lon);

      marker.setPopupContent(`
        <b>${route}</b> to <b>${dest}</b><br>
        <b>${fleet}</b> - ${info.plate}<br>
        ${info.type}<br>
        <small>Variant: ${variant}</small>
      `);

      lastOpenedFleetNumber = fleet;
    });

    vehicleMarkers.set(fleet, marker);
  }
}



    updateRouteDropdown(currentFeedRoutes);

  } catch (e) {
    console.error("Vehicle fetch failed:", e);
  }
}


// ================================
//       ROUTE DROPDOWN
// ================================

function updateRouteDropdown(routes) {
  const select = document.getElementById("routeSelect");
  const previous = select.value;

  select.innerHTML = `<option value="all">All Routes</option>`;

  [...routes]
    .sort((a, b) => a - b)
    .forEach(r => {
      const info = routeInfo[r] || {};
      const name = info.name || "";

      select.innerHTML += `
        <option value="${r}">
          ${r}: ${name}
        </option>
      `;
    });

  if (previous === "all" || routes.has(previous)) {
    select.value = previous;
  }
}


// ================================
//          SEARCH FILTER
// ================================

document.getElementById("vehicleSearch").addEventListener("input", () => {
  const q = document.getElementById("vehicleSearch").value.trim();
  const prefix = q.replace("*", "");

  vehicleMarkers.forEach((marker, fleet) => {
    const match = !q || fleet.startsWith(prefix);
    if (match) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else {
      if (map.hasLayer(marker)) marker.remove();
    }
  });
});


document.getElementById("routeSelect").addEventListener("change", () => {
  vehicleMarkers.forEach(m => m.remove());
  vehicleMarkers.clear();
  fetchVehicleData();
});


// ================================
//          REFRESH LOOP
// ================================

fetchVehicleData();
setInterval(fetchVehicleData, 10000);

let fetchTimeout;

map.on("popupclose", () => {
  if (activeRoutePolyline) {
    map.removeLayer(activeRoutePolyline);
    activeRoutePolyline = null;
  }
});

map.on("moveend", () => {
  clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(fetchVehicleData, 800);
});

// ================================
//        LOAD EXISTING LOG
// ================================
window.addEventListener("DOMContentLoaded", () => {
  const saved = JSON.parse(localStorage.getItem("busLog") || "[]");
  window.busLog = saved;

  const tbody = document.querySelector("#logTable tbody");
  if (!tbody) return;

  saved.forEach(entry => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${entry.time}</td>
      <td>${entry.fleet}</td>
      <td>${entry.route}</td>
      <td>${entry.direction}</td>
    `;
    tbody.appendChild(tr);
  });
});


// ================================
//       ADD LOG ROW FUNCTION
// ================================
function addLogRow(time, fleet, route, direction) {
  const tbody = document.querySelector("#logTable tbody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${time}</td>
    <td>${fleet}</td>
    <td>${route}</td>
    <td>${direction}</td>
  `;

  tbody.prepend(tr);
}
