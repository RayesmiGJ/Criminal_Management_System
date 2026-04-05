    // Firebase Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyBnMI6S8fig-fl8exIAt5tDz9qWWrWGHAM",
        authDomain: "crime-management-fdd43.firebaseapp.com",
        projectId: "crime-management-fdd43",
        storageBucket: "crime-management-fdd43.firebasestorage.app",
        messagingSenderId: "990509285734",
        appId: "1:990509285734:web:4798f9666ff2dea537c8a7"
    };
    
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    // Global variables
    let map;
    let heatLayer;
    let markers = [];
    let allIncidents = [];

    // Initialize map when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof L === 'undefined') {
            console.error('Leaflet failed to load');
            return;
        }
        initMap();
    });

    // Initialize map
    function initMap() {
        try {
            map = L.map('map').setView([8.2, 77.3], 10);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(map);

            if (typeof L.heatLayer === 'function') {
                heatLayer = L.heatLayer([], {
                    radius: 25,
                    blur: 15,
                    maxZoom: 12,
                    gradient: {
                        0.2: '#22c55e',
                        0.4: '#f59e0b',
                        0.8: '#ef4444'
                    }
                }).addTo(map);
            } else {
                heatLayer = { setLatLngs: function() {} };
            }

            loadIncidents();
        } catch (error) {
            console.error('Map initialization error:', error);
        }
    }

    // Load incidents from Firebase
    async function loadIncidents() {
        try {
            const snapshot = await db.collection("firs").get();
            allIncidents = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.latitude && data.longitude) {
                    const incident = {
                        id: doc.id,
                        refID: data.refID || data.refNo || doc.id,
                        category: data.category || 'Unknown',
                        location: data.incidentLocation || 'Unknown',
                        date: data.date || new Date().toLocaleDateString(),
                        status: data.status || 'Pending',
                        lat: data.latitude,
                        lng: data.longitude,
                        severity: getSeverity(data.category),
                        description: data.incidentDescription || '',
                        victimCount: data.victimCount || 0
                    };
                    allIncidents.push(incident);
                }
            });

            if (allIncidents.length === 0) {
                document.getElementById('loadingHotspots').innerHTML = 
                    '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--accent-gold);">' +
                    '<i class="fas fa-map-marked-alt" style="font-size: 3rem; margin-bottom: 20px;"></i>' +
                    '<p>No geocoded incidents yet.</p>' +
                    '<p style="color: var(--text-dim);">Register FIRs with complete addresses to see crime hotspots.</p>' +
                    '</div>';
                return;
            }

            updateMap();
            identifyHotspots();
            document.getElementById('loadingHotspots').innerHTML = '';
        } catch (error) {
            console.error("Error loading incidents:", error);
            document.getElementById('loadingHotspots').innerHTML = 
                '<p style="color: #ef4444; text-align: center; padding: 50px;">Error loading data. Please refresh the page.</p>';
        }
    }

    function getSeverity(category) {
        const severityMap = {
            'Murder': 1.0, 'Homicide': 1.0, 'Assault': 0.8,
            'Kidnapping': 0.9, 'Theft': 0.5, 'Robbery': 0.6,
            'Burglary': 0.5, 'Cyber Crime': 0.4, 'Fraud': 0.4, 'Riot': 0.7
        };
        for (let key in severityMap) {
            if (category && category.toLowerCase().includes(key.toLowerCase())) {
                return severityMap[key];
            }
        }
        return 0.3;
    }

    // Update map with markers
    function updateMap() {
        markers.forEach(m => map.removeLayer(m));
        markers = [];
        const heatData = allIncidents.map(incident => [incident.lat, incident.lng, incident.severity]);
        if (heatLayer && typeof heatLayer.setLatLngs === 'function') {
            heatLayer.setLatLngs(heatData);
        }

        allIncidents.forEach(incident => {
            const markerIcon = L.divIcon({
                html: `<div class="custom-marker"><i class="fas fa-map-marker-alt"></i></div>`,
                className: '',
                iconSize: [24, 24],
                popupAnchor: [0, -12]
            });

            const marker = L.marker([incident.lat, incident.lng], {
                icon: markerIcon,
                riseOnHover: true
            }).addTo(map);

            const popupContent = `
                <div style="background: #1e293b; color: white;">
                    <h3 style="color: #fbbf24; margin: 0 0 15px; font-size: 1.2rem; border-bottom: 1px solid #334155; padding-bottom: 10px;">
                        <i class="fas fa-file-alt"></i> FIR: ${incident.refID}
                    </h3>
                    <div style="margin: 12px 0;">
                        <div style="display: flex; margin-bottom: 8px;">
                            <i class="fas fa-folder" style="color: #38bdf8; width: 24px;"></i>
                            <div><strong>Category:</strong> ${incident.category}</div>
                        </div>
                        <div style="display: flex; margin-bottom: 8px;">
                            <i class="fas fa-map-pin" style="color: #38bdf8; width: 24px;"></i>
                            <div><strong>Location:</strong> ${incident.location}</div>
                        </div>
                        <div style="display: flex; margin-bottom: 8px;">
                            <i class="fas fa-calendar" style="color: #38bdf8; width: 24px;"></i>
                            <div><strong>Date:</strong> ${incident.date}</div>
                        </div>
                        <div style="display: flex; margin-bottom: 8px;">
                            <i class="fas fa-info-circle" style="color: #38bdf8; width: 24px;"></i>
                            <div><strong>Status:</strong> 
                                <span style="color: ${incident.status === 'Pending' ? '#f59e0b' : '#22c55e'}; font-weight: bold;">
                                    ${incident.status}
                                </span>
                            </div>
                        </div>
                        <div style="display: flex; margin-bottom: 8px;">
                            <i class="fas fa-users" style="color: #38bdf8; width: 24px;"></i>
                            <div><strong>Victims:</strong> ${incident.victimCount}</div>
                        </div>
                        ${incident.description ? `
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155;">
                            <strong>Description:</strong>
                            <p style="margin: 8px 0 0; color: #94a3b8; font-style: italic;">
                                ${incident.description.substring(0, 150)}${incident.description.length > 150 ? '...' : ''}
                            </p>
                        </div>
                        ` : ''}
                    </div>
                    <button class="detail-btn" onclick="showFullCaseDetails('${incident.refID}')">
                        <i class="fas fa-external-link-alt"></i> View Complete Details
                    </button>
                </div>
            `;

            marker.bindPopup(popupContent, {
                className: 'custom-popup',
                maxWidth: 320,
                minWidth: 280
            });
            markers.push(marker);
        });

        if (markers.length > 0) {
            try {
                const group = L.featureGroup(markers);
                map.fitBounds(group.getBounds().pad(0.2));
            } catch (e) {
                console.log('Error fitting map bounds');
            }
        }
    }

    // Identify hotspots
    function identifyHotspots(silent = false) {
        const hotspots = [];
        const radius = 1.50;
        for (let i = 0; i < allIncidents.length; i++) {
            let found = false;
            for (let j = 0; j < hotspots.length; j++) {
                const dist = getDistance(
                    allIncidents[i].lat, allIncidents[i].lng,
                    hotspots[j].center.lat, hotspots[j].center.lng
                );
                if (dist < radius) {
                    hotspots[j].incidents.push(allIncidents[i]);
                    hotspots[j].count++;
                    hotspots[j].center.lat = (hotspots[j].center.lat * (hotspots[j].count - 1) + allIncidents[i].lat) / hotspots[j].count;
                    hotspots[j].center.lng = (hotspots[j].center.lng * (hotspots[j].count - 1) + allIncidents[i].lng) / hotspots[j].count;
                    found = true;
                    break;
                }
            }
            if (!found) {
                hotspots.push({
                    center: { lat: allIncidents[i].lat, lng: allIncidents[i].lng },
                    incidents: [allIncidents[i]],
                    count: 1
                });
            }
        }
        const significantHotspots = hotspots.filter(h => h.count >= 2);
        if (!silent) displayHotspots(significantHotspots);
        return significantHotspots;
    }

    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function displayHotspots(hotspots) {
        const container = document.getElementById('hotspotsList');
        if (hotspots.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-dim);">No significant hotspots identified</div>';
            return;
        }
        hotspots.sort((a, b) => b.count - a.count);
        let html = '';
        hotspots.forEach((hotspot, index) => {
            const crimeTypes = {};
            hotspot.incidents.forEach(i => crimeTypes[i.category] = (crimeTypes[i.category] || 0) + 1);
            const topCrimes = Object.entries(crimeTypes).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([crime]) => crime);
            const riskLevel = hotspot.count >= 8 ? 'high' : (hotspot.count >= 4 ? 'medium' : 'low');
            const riskColor = riskLevel === 'high' ? '#ef4444' : (riskLevel === 'medium' ? '#f59e0b' : '#22c55e');
            const locations = hotspot.incidents.map(i => i.location).filter(l => l !== 'Unknown');
            const primaryLocation = locations.length > 0 ? [...new Set(locations)].slice(0,2).join(', ') : 'Area radius ~5km';
            html += `
                <div class="hotspot-card" style="border-left-color: ${riskColor};">
                    <div class="hotspot-title">Hotspot #${index + 1}</div>
                    <div class="hotspot-stats">
                        <span class="hotspot-stat"><i class="fas fa-map-pin"></i> ${hotspot.count} incidents</span>
                        <span class="hotspot-stat"><i class="fas fa-calendar"></i> Latest: ${hotspot.incidents[0].date}</span>
                    </div>
                    <p style="color: var(--text-dim); margin: 10px 0;">
                        <i class="fas fa-location-dot"></i> ${primaryLocation}
                    </p>
                    <div>${topCrimes.map(crime => `<span class="crime-tag">${crime}</span>`).join('')}</div>
                    <div style="margin-top: 15px;">
                        <button class="btn" style="padding: 5px 10px; font-size: 0.85rem; width: 100%;" 
                                onclick="focusHotspot(${hotspot.center.lat}, ${hotspot.center.lng})">
                            <i class="fas fa-crosshairs"></i> Zoom to Area
                        </button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    function focusHotspot(lat, lng) {
        map.setView([lat, lng], 13);
    }

    function refreshHotspotData() {
        const timeRange = document.getElementById('timeRange').value;
        const crimeType = document.getElementById('crimeType').value;
        const searchTerm = document.getElementById('locationSearch').value.toLowerCase();
        let filtered = [...allIncidents];
        if (timeRange !== 'all') {
            const now = new Date();
            const cutoff = new Date();
            if (timeRange === 'month') cutoff.setMonth(now.getMonth() - 1);
            else if (timeRange === 'week') cutoff.setDate(now.getDate() - 7);
            else if (timeRange === 'today') cutoff.setHours(0, 0, 0, 0);
            filtered = filtered.filter(i => {
                const parts = i.date.split('/');
                if (parts.length === 3) {
                    const incidentDate = new Date(parts[2], parts[1] - 1, parts[0]);
                    return incidentDate >= cutoff;
                }
                return true;
            });
        }
        if (crimeType !== 'all') {
            filtered = filtered.filter(i => i.category && i.category.includes(crimeType));
        }
        if (searchTerm) {
            filtered = filtered.filter(i => i.location && i.location.toLowerCase().includes(searchTerm));
        }
        if (filtered.length === 0) {
            document.getElementById('hotspotsList').innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-dim);">No incidents match your filters</div>';
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            if (heatLayer && typeof heatLayer.setLatLngs === 'function') heatLayer.setLatLngs([]);
            return;
        }
        const originalIncidents = allIncidents;
        allIncidents = filtered;
        updateMap();
        const hotspots = identifyHotspots();
        displayHotspots(hotspots);
        allIncidents = originalIncidents;
    }

    document.getElementById('locationSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') refreshHotspotData();
    });

    // ========== NEW: Show full case details in modal ==========
    async function showFullCaseDetails(refID) {
        const modal = document.getElementById('caseModal');
        const modalBody = document.getElementById('modalBody');
        modal.style.display = 'flex';
        modalBody.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner" style="width:30px;height:30px;"></div><p>Loading case details...</p></div>';

        try {
            // Query FIR by refID
            const querySnapshot = await db.collection("firs").where("refID", "==", refID).get();
            if (querySnapshot.empty) {
                modalBody.innerHTML = '<p style="color: #ef4444;">Case not found.</p>';
                return;
            }
            const record = querySnapshot.docs[0].data();
            
            let detailsHtml = `
                <div class="person-section">
                    <h3 class="person-title"><i class="fas fa-barcode"></i> Case Information</h3>
                    <div class="person-card">
                        <p><strong>Reference ID:</strong> ${record.refID || ''}</p>
                        <p><strong>Date:</strong> ${record.date || ''}</p>
                        <p><strong>Category:</strong> ${record.category || ''}</p>
                        <p><strong>Incident Location:</strong> ${record.incidentLocation || ''}</p>
                        <p><strong>Incident Description:</strong> ${record.incidentDescription || ''}</p>
                        <p><strong>Complaint Statement:</strong> ${record.complaint || ''}</p>
                        <p><strong>Property Seizure:</strong> ${record.propertySeizure || 'None'}</p>
                        <p><strong>Investigation Status:</strong> <span class="${getStatusClass(record.status)}">${record.status || 'Pending'}</span></p>
                    </div>
                </div>
            `;

            // Victims
            if (record.victims && record.victims.length > 0) {
                detailsHtml += `<div class="person-section"><h3 class="person-title"><i class="fas fa-user-injured"></i> Victim Details</h3>`;
                record.victims.forEach((v, idx) => {
                    detailsHtml += `
                        <div class="person-card">
                            <h4>Victim ${idx+1}</h4>
                            <div class="person-grid">
                                <p><strong>Name:</strong> ${v.name || 'N/A'}</p>
                                <p><strong>Age:</strong> ${v.age || 'N/A'}</p>
                                <p><strong>Contact:</strong> ${v.contact || 'N/A'}</p>
                                <p><strong>Address:</strong> ${v.address || 'N/A'}</p>
                                <p><strong>ID Proof:</strong> ${v.idProof || 'N/A'}</p>
                                <p><strong>Occupation:</strong> ${v.occupation || 'N/A'}</p>
                            </div>
                        </div>
                    `;
                });
                detailsHtml += `</div>`;
            } else if (record.victimName) {
                detailsHtml += `
                    <div class="person-section"><h3 class="person-title"><i class="fas fa-user-injured"></i> Victim Details</h3>
                    <div class="person-card">
                        <div class="person-grid">
                            <p><strong>Name:</strong> ${record.victimName || 'N/A'}</p>
                            <p><strong>Age:</strong> ${record.victimAge || 'N/A'}</p>
                            <p><strong>Contact:</strong> ${record.victimContact || 'N/A'}</p>
                            <p><strong>Address:</strong> ${record.victimAddress || 'N/A'}</p>
                            <p><strong>ID Proof:</strong> ${record.victimIdProof || 'N/A'}</p>
                            <p><strong>Occupation:</strong> ${record.victimOccupation || 'N/A'}</p>
                        </div>
                    </div></div>
                `;
            }

            // Witnesses
            if (record.witnesses && record.witnesses.length > 0) {
                detailsHtml += `<div class="person-section"><h3 class="person-title"><i class="fas fa-user"></i> Witness Details</h3>`;
                record.witnesses.forEach((w, idx) => {
                    detailsHtml += `
                        <div class="person-card">
                            <h4>Witness ${idx+1}</h4>
                            <div class="person-grid">
                                <p><strong>Name:</strong> ${w.name || 'N/A'}</p>
                                <p><strong>Age:</strong> ${w.age || 'N/A'}</p>
                                <p><strong>Contact:</strong> ${w.contact || 'N/A'}</p>
                                <p><strong>Address:</strong> ${w.address || 'N/A'}</p>
                                <p><strong>Statement:</strong> ${w.statement || 'N/A'}</p>
                            </div>
                        </div>
                    `;
                });
                detailsHtml += `</div>`;
            }

            // Suspects
            if (record.suspects && record.suspects.length > 0) {
                detailsHtml += `<div class="person-section"><h3 class="person-title"><i class="fas fa-user-secret"></i> Suspect Details</h3>`;
                record.suspects.forEach((s, idx) => {
                    detailsHtml += `
                        <div class="person-card">
                            <h4>Suspect ${idx+1}</h4>
                            <div class="person-grid">
                                <p><strong>Name:</strong> ${s.name || 'N/A'}</p>
                                <p><strong>Age:</strong> ${s.age || 'N/A'}</p>
                                <p><strong>Gender:</strong> ${s.gender || 'N/A'}</p>
                                <p><strong>Height:</strong> ${s.height || 'N/A'}</p>
                                <p><strong>Build:</strong> ${s.build || 'N/A'}</p>
                                <p><strong>Marks:</strong> ${s.marks || 'N/A'}</p>
                                <p><strong>Last Seen:</strong> ${s.lastSeen || 'N/A'}</p>
                            </div>
                        </div>
                    `;
                });
                detailsHtml += `</div>`;
            }

            // Criminals
            if (record.criminals && record.criminals.length > 0) {
                detailsHtml += `<div class="person-section"><h3 class="person-title"><i class="fas fa-skull-crosswalk"></i> Criminal Details</h3>`;
                record.criminals.forEach((c, idx) => {
                    detailsHtml += `
                        <div class="person-card">
                            <h4>Criminal ${idx+1}</h4>
                            <div class="person-grid">
                                <p><strong>Name:</strong> ${c.name || 'N/A'}</p>
                                <p><strong>Alias:</strong> ${c.alias || 'N/A'}</p>
                                <p><strong>Age:</strong> ${c.age || 'N/A'}</p>
                                <p><strong>Gender:</strong> ${c.gender || 'N/A'}</p>
                                <p><strong>Address:</strong> ${c.address || 'N/A'}</p>
                                <p><strong>Previous Record:</strong> ${c.record || 'N/A'}</p>
                            </div>
                        </div>
                    `;
                });
                detailsHtml += `</div>`;
            } else if (record.criminalDetails) {
                detailsHtml += `
                    <div class="person-section"><h3 class="person-title"><i class="fas fa-skull-crosswalk"></i> Criminal Details</h3>
                    <div class="person-card">
                        <div class="person-grid">
                            <p><strong>Name:</strong> ${record.criminalDetails.name || record.criminalDetails.cName || 'N/A'}</p>
                            <p><strong>Age:</strong> ${record.criminalDetails.age || record.criminalDetails.cAge || 'N/A'}</p>
                            <p><strong>Address:</strong> ${record.criminalDetails.address || record.criminalDetails.cAddress || 'N/A'}</p>
                            <p><strong>Marks:</strong> ${record.criminalDetails.marks || record.criminalDetails.cMarks || 'N/A'}</p>
                            <p><strong>Extra:</strong> ${record.criminalDetails.extra || record.criminalDetails.cExtra || 'N/A'}</p>
                        </div>
                    </div></div>
                `;
            }

            // Judgement if closed
            if (record.status === 'Case Closed' && record.judgement) {
                detailsHtml += `
                    <div class="person-section">
                        <h3 class="person-title"><i class="fas fa-gavel"></i> Court Judgement</h3>
                        <div class="person-card"><p style="font-style:italic;">${record.judgement}</p></div>
                    </div>
                `;
            }

            modalBody.innerHTML = detailsHtml;
        } catch (err) {
            console.error(err);
            modalBody.innerHTML = '<p style="color:#ef4444;">Error loading case details. Please try again.</p>';
        }
    }

    function getStatusClass(status) {
        if (status === 'Pending') return 'status-pending';
        if (status === 'Arrested') return 'status-arrested';
        if (status === 'Case Closed') return 'status-closed';
        return '';
    }

    function closeCaseModal() {
        document.getElementById('caseModal').style.display = 'none';
    }