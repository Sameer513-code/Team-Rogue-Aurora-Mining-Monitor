const API_URL = "http://127.0.0.1:8000";
const MINE_IMAGE_BASE = `${API_URL}/static/`; 
let currentPredictions = { legal: 0, nogo: 0 };
let map;
let legalGeoJSON = null;
let nogoGeoJSON = null;
let currentData = { legal: [], nogo: [] };
let activeTab = 'legal';
let quantifiedMaps = [];
let myChart;

// --- 1. File Uploads ---
const legalInput = document.getElementById("legalFile");
const nogoInput = document.getElementById("nogoFile");
const runBtn = document.getElementById("runBtn");

function handleFileUpload(input, labelId, isLegal) {
    const file = input.files[0];
    if (!file) return;

    const label = document.getElementById(labelId);
    label.innerText = file.name;
    label.classList.add("uploaded");

    const reader = new FileReader();
    reader.onload = (e) => {
        const json = JSON.parse(e.target.result);
        if (isLegal) legalGeoJSON = json;
        else nogoGeoJSON = json;
        checkReady();
    };
    reader.readAsText(file);
}

if(legalInput) legalInput.addEventListener("change", () => handleFileUpload(legalInput, "legalLabel", true));
if(nogoInput) nogoInput.addEventListener("change", () => handleFileUpload(nogoInput, "nogoLabel", false));

function checkReady() {
    if (legalGeoJSON && nogoGeoJSON) {
        runBtn.disabled = false;
        runBtn.style.opacity = "1";
        runBtn.style.cursor = "pointer";
    }
}

// --- 2. Run Analysis ---
if(runBtn) {
    runBtn.addEventListener("click", () => {
        switchScreen("loaderScreen");

        fetch(`${API_URL}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mine_geojson: legalGeoJSON,
                no_go_geojson_list: [nogoGeoJSON]
            })
        })
        .then(res => {
            if (res.ok) startPolling();
            else alert("Server Error");
        })
        .catch(err => {
            console.error(err);
            alert("Failed to connect to backend");
            switchScreen("uploadScreen");
        });
    });
}

function startPolling() {
    const interval = setInterval(() => {
        fetch(`${API_URL}/progress`)
            .then(res => res.json())
            .then(data => {
                const p = data.progress;
                document.getElementById("progressFill").style.width = p + "%";
                document.getElementById("progressPercent").innerText = p + "%";

                if (data.status === "done") {
                    clearInterval(interval);
                    loadResults();
                } else if (data.status === "error") {
                    clearInterval(interval);
                    alert("Analysis Failed. Check server terminal.");
                    switchScreen("uploadScreen");
                }
            });
    }, 1000);
}

// --- 3. Load Results ---
function loadResults() {
    fetch(`${API_URL}/results`)
        .then(res => res.json())
        .then(data => {
            currentData.legal = data.mine.timeseries;
            
            // Extract Predictions
            currentPredictions.legal = data.mine.predicted_next_area || data.mine.predicted_next_month_area || 0;
            
            const nogoKeys = Object.keys(data.no_go_zones);
            if (nogoKeys.length > 0) {
                currentData.nogo = data.no_go_zones[nogoKeys[0]].timeseries;
                currentPredictions.nogo = data.no_go_zones[nogoKeys[0]].predicted_next_area || 0;
            }

            // Image Mapping
            quantifiedMaps = currentData.legal.map(r => { 
                const dateKey = r.date;
                const relativePath = data.mine.quantified_maps[dateKey];
                return {
                   date: dateKey,
                   src: `${API_URL}${relativePath}` 
                };
            });

            switchScreen("resultsScreen");
            initMap();
            setupChart();
            updateDashboard(currentData.legal.length - 1);
        });
}

function switchScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

// --- 4. Visualization ---
function initMap() {
    if (map) return;
    map = L.map('mapCanvas').setView([0, 0], 2);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri'
    }).addTo(map);

    if (legalGeoJSON) {
        const l = L.geoJSON(legalGeoJSON, { style: { color: '#10b981', fill: false } }).addTo(map);
        map.fitBounds(l.getBounds());
    }
    if (nogoGeoJSON) {
        L.geoJSON(nogoGeoJSON, { style: { color: '#ef4444', fill: false, dashArray: '5, 5' } }).addTo(map);
    }
    setTimeout(() => map.invalidateSize(), 200);
}

function setupChart() {
    const ctx = document.getElementById("chart").getContext("2d");
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Legal Area (km²)', borderColor: '#10b981', data: [], tension: 0.1 },
                { label: 'No-Go Impact (km²)', borderColor: '#ef4444', data: [], tension: 0.1 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function updateDashboard(index) {
    // 1. Safety Check
    if (!currentData.legal || !currentData.legal[index]) return;

    const row = currentData.legal[index];
    const nogoRow = currentData.nogo && currentData.nogo[index] ? currentData.nogo[index] : { area_km2: 0 };

    // --- DYNAMIC KPI LOGIC ---
    const kpiTitles = document.querySelectorAll(".kpi h4");
    const valBox1 = document.getElementById("legalVal"); 
    const valBox2 = document.getElementById("nogoVal"); 
    
    let currentArea = 0;
    let prevArea = 0;
    let growth = 0;

    if (activeTab === 'legal') {
        currentArea = row.area_km2;
        prevArea = index > 0 ? currentData.legal[index - 1].area_km2 : currentArea;
        
        kpiTitles[0].innerText = "Current Legal Area";
        kpiTitles[1].innerText = "Monthly Growth";
        
        if (prevArea > 0) growth = ((currentArea - prevArea) / prevArea) * 100;
        valBox2.style.color = growth >= 0 ? "#10b981" : "#f59e0b"; 

    } else {
        currentArea = nogoRow.area_km2;
        const prevNogo = index > 0 ? (currentData.nogo[index - 1] || { area_km2: 0 }) : nogoRow;
        prevArea = prevNogo.area_km2;

        kpiTitles[0].innerText = "Illegal Mining Area";
        kpiTitles[1].innerText = "Illegal Growth";

        if (prevArea > 0) growth = ((currentArea - prevArea) / prevArea) * 100;
        else if (currentArea > 0) growth = 100;

        valBox2.style.color = growth > 0 ? "#ef4444" : "#10b981";
    }

    valBox1.innerText = (currentArea || 0).toFixed(4) + " km²";
    valBox2.innerText = (growth > 0 ? "+" : "") + growth.toFixed(2) + "%";

    // --- STATUS UPDATE ---
    const VIOLATION_LIMIT = 0.002;
    const isViolated = nogoRow.area_km2 > VIOLATION_LIMIT;
    const statusElem = document.getElementById("status");

    if (isViolated) {
        statusElem.innerText = "VIOLATION DETECTED";
        statusElem.style.color = "#ef4444"; 
    } else {
        statusElem.innerText = "OK";
        statusElem.style.color = "#10b981"; 
    }

    // ---------------------------------------------------------
    // FIXED: PREDICTION KPI UPDATE
    // ---------------------------------------------------------
    const predValElem = document.getElementById("predictionVal");
    let predValue = 0;

    if (activeTab === 'legal') {
        predValue = currentPredictions.legal;
    } else {
        predValue = currentPredictions.nogo;
    }

    const safePredValue = (predValue !== undefined && predValue !== null) ? predValue : 0;
    // Update the text in the new KPI card
    if(predValElem) {
        predValElem.innerText = `${safePredValue.toFixed(4)} km²`;
    }

    // --- SLIDER & DATE ---
    const dateElem = document.getElementById("date");
    const sliderValElem = document.getElementById("sliderValue");
    if(dateElem) dateElem.innerText = row.date;
    if(sliderValElem) sliderValElem.innerText = row.date;

    // --- CHART UPDATE ---
    const labels = currentData.legal.slice(0, index + 1).map(x => x.date);
    const legalVals = currentData.legal.slice(0, index + 1).map(x => x.area_km2);
    const nogoVals = currentData.legal.slice(0, index + 1).map((_, i) => {
        return currentData.nogo[i] ? currentData.nogo[i].area_km2 : 0;
    });

    if(myChart) {
        myChart.data.labels = labels;
        myChart.data.datasets[0].data = legalVals;
        myChart.data.datasets[1].data = nogoVals;

        if (activeTab === 'legal') {
            myChart.data.datasets[0].hidden = false; 
            myChart.data.datasets[1].hidden = true;  
        } else {
            myChart.data.datasets[0].hidden = true;  
            myChart.data.datasets[1].hidden = false; 
        }
        myChart.update('none'); 
    }

    // Slider Sync
    const slider = document.getElementById("slider");
    if(slider) {
        slider.max = currentData.legal.length - 1;
        slider.value = index;
    }

    updateTimeline(index);
}

function updateTimeline(currentIndex) {
    const container = document.getElementById("timeline");
    if(!container) return;
    
    // Clear previous entries
    container.innerHTML = ""; 

    // Get Data
    const row = currentData.legal[currentIndex];
    const nogoRow = currentData.nogo && currentData.nogo[currentIndex] ? currentData.nogo[currentIndex] : { area_km2: 0, date: row.date };
    const VIOLATION_LIMIT = 0.002;
    const isViolated = nogoRow.area_km2 > VIOLATION_LIMIT;
    
    // Find first historical violation
    let firstViolationDate = null;
    if(currentData.nogo) {
        for (let i = 0; i <= currentIndex; i++) {
            const area = currentData.nogo[i] ? currentData.nogo[i].area_km2 : 0;
            if (area > VIOLATION_LIMIT) {
                firstViolationDate = currentData.nogo[i].date;
                break; 
            }
        }
    }

    // --- CREATE ENTRY ELEMENT ---
    const div = document.createElement("div");
    
    // Add Base Class + Dynamic Status Class
    div.classList.add("audit-entry");
    div.classList.add(isViolated ? "status-danger" : "status-safe");

    // Dynamic Content
    const titleText = isViolated ? "VIOLATION DETECTED" : "OK";
    const icon = isViolated ? "⚠️" : "🛡️";

    // Historical Context HTML (Conditional)
    let historyHTML = "";
    if (firstViolationDate) {
        historyHTML = `
        <div class="audit-history">
            <span>First Breach Recorded:</span> <b>${firstViolationDate}</b>
        </div>`;
    }

    // Assemble HTML
    div.innerHTML = `
        <div class="audit-date">
            <span>LOG_ID: ${currentIndex.toString().padStart(4, '0')}</span>
            <span>${row.date}</span>
        </div>
        
        <div class="audit-title">
            ${icon} ${titleText}
        </div>
        
        <div class="audit-metric">
            Illegal Excavation: <b>${nogoRow.area_km2.toFixed(4)} km²</b>
            <br>
            <span style="opacity:0.7">Threshold Limit: ${VIOLATION_LIMIT} km²</span>
        </div>
        
        ${historyHTML}
    `;

    container.appendChild(div);
}
// Event Listeners
const slider = document.getElementById("slider");
if(slider) slider.addEventListener("input", (e) => updateDashboard(parseInt(e.target.value)));

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeTab = btn.dataset.tab;
        
        const sl = document.getElementById("slider");
        if(sl) updateDashboard(parseInt(sl.value));
    });
});

// Modal for Images
const modal = document.getElementById("modalOverlay");
const modalImg = document.getElementById("modalImage");
const modalSlider = document.getElementById("modalSlider");
const qBtn = document.getElementById("quantifiedBtn");

if(qBtn) {
    qBtn.addEventListener("click", () => {
        if (!quantifiedMaps.length) return;
        modal.classList.add("active");
        modalSlider.max = quantifiedMaps.length - 1;
        modalSlider.value = 0;
        updateModal(0);
    });
}

document.getElementById("modalClose").addEventListener("click", () => {
    modal.classList.remove("active");
});

if(modalSlider) modalSlider.addEventListener("input", (e) => updateModal(e.target.value));

function updateModal(idx) {
    if(!quantifiedMaps[idx]) return;
    const item = quantifiedMaps[idx];
    modalImg.src = item.src;
    document.getElementById("modalInfo").innerText = `${item.date} (${parseInt(idx)+1}/${quantifiedMaps.length})`;
}