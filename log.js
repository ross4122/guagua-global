// Load log from localStorage
const log = JSON.parse(localStorage.getItem("busLog") || "[]");
const tbody = document.querySelector("#logTable tbody");

function renderTable(data) {
  tbody.innerHTML = "";

  data.forEach(entry => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${entry.time}</td>
      <td>${entry.fleet}</td>
      <td>${entry.route}</td>
      <td>${entry.direction}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Populate dropdown filter options
function populateFilters() {
  const timeSet = new Set();
  const fleetSet = new Set();
  const routeSet = new Set();
  const dirSet = new Set();

  log.forEach(entry => {
    timeSet.add(entry.time.split(",")[0]); // group by date (optional)
    fleetSet.add(entry.fleet);
    routeSet.add(entry.route);
    dirSet.add(entry.dest);
  });

  fillSelect("filterTime", timeSet);
  fillSelect("filterFleet", fleetSet);
  fillSelect("filterRoute", routeSet);
  fillSelect("filterDir", dirSet);
}

function fillSelect(id, values) {
  const select = document.getElementById(id);
  [...values].sort().forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

// Apply filters to the table
function applyFilters() {
  const fTime = document.getElementById("filterTime").value;
  const fFleet = document.getElementById("filterFleet").value;
  const fRoute = document.getElementById("filterRoute").value;
  const fDir = document.getElementById("filterDir").value;

  const result = log.filter(entry => {
    return (
      (!fTime || entry.time.startsWith(fTime)) &&
      (!fFleet || entry.fleet === fFleet) &&
      (!fRoute || entry.route === fRoute) &&
      (!fDir || entry.dest === fDir)
    );
  });

  renderTable(result);
}

// Add event listeners for filters
["filterTime", "filterFleet", "filterRoute", "filterDir"].forEach(id => {
  document.getElementById(id).addEventListener("change", applyFilters);
});

// Initial load
populateFilters();
renderTable(log);
