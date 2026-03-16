// Ограничиваем карту Алтайским краем, чтобы не улетали в океан
const altaiBounds = [
  [50.5, 77.5],
  [54.5, 88.0]
];

const map = L.map('map', {
  zoomControl: false,
  maxBounds: altaiBounds,
  maxBoundsViscosity: 1.0,
  minZoom: 7.4
}).setView([52.9, 82.0], 7);

map.attributionControl.setPrefix(false);

// Подложка карты
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19
}).addTo(map);

// Зум справа по центру
L.control.zoom({ position: 'topright' }).addTo(map);

// Настройки кластеров, чтобы не вырвиглазные были
const markers = L.markerClusterGroup({
  polygonOptions: {
    fillColor: '#808080',
    color: '#808080',
    weight: 2,
    opacity: 0.6,
    fillOpacity: 0.2
  }
});

const allMarkers = [];
let activeMarker = null;

// Иконки для маркеров
const defaultIcon = new L.Icon.Default();
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

// Вытаскиваем название района из адреса
function getDistrict(address) {
  return address ? address.split(',')[0].trim() : "Не указан";
}

// Приводим типы к единому виду для фильтрации
function normalizeTypes(rawType) {
  if (!rawType) return [];
  const t = [];
  if (rawType.includes("истории")) t.push("Памятник истории");
  if (rawType.includes("архитектуры")) t.push("Памятник архитектуры");
  if (rawType.includes("искусства")) t.push("Памятник искусства");
  return t;
}

function clearSelection() {
  if (activeMarker) {
    activeMarker.setIcon(defaultIcon);
    activeMarker = null;
  }
  document.getElementById('details').innerHTML = `<p class="placeholder">Выберите объект на карте</p>`;
}

// Сбрасываем выбор, если кликнули в пустую область карты
map.on('click', (e) => {
  if (e.originalEvent.target.id === 'map' || e.originalEvent.target.classList.contains('leaflet-container')) {
    clearSelection();
  }
});

async function init() {
  try {
    const res = await fetch('monuments.geojson');
    const data = await res.json();

    const districts = new Set();
    const categories = new Set();
    const types = new Set(["Памятник истории", "Памятник архитектуры", "Памятник искусства"]);

    data.features.forEach(f => {
      const p = f.properties;
      const dist = getDistrict(p.address);
      districts.add(dist);
      categories.add(p.category);

      const marker = L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]]);
      marker.featureData = f;
      marker.district = dist;

      marker.bindPopup(`<b>${p.name}</b><br>${p.address}`);

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (activeMarker) activeMarker.setIcon(defaultIcon);
        activeMarker = marker;
        marker.setIcon(redIcon);

        // Инфо-панель слева
        document.getElementById('details').innerHTML = `
                    <h3>${p.name}</h3>
                    ${p.photo_url ? `<img src="${p.photo_url}" class="monument-photo">` : ''}
                    <div class="info-block">
                        <p><b>Адрес:</b> ${p.address}</p>
                        <p><b>Категория:</b> ${p.category}</p>
                        <p><b>Тип:</b> ${p.type}</p>
                        <p><b>Рег. номер:</b> ${p.registration_number || '—'}</p>
                    </div>
                `;
      });
      allMarkers.push(marker);
      markers.addLayer(marker);
    });

    map.addLayer(markers);

    // Заполняем выпадашку и чекбоксы
    const distSelect = document.getElementById('district-filter');
    Array.from(districts).sort().forEach(d => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = d;
      distSelect.appendChild(opt);
    });

    const catCont = document.getElementById('category-filters');
    categories.forEach(c => {
      catCont.innerHTML += `<label class="filter-label"><input type="checkbox" class="cat-cb" value="${c}" checked> ${c}</label>`;
    });

    const typeCont = document.getElementById('type-filters');
    types.forEach(t => {
      typeCont.innerHTML += `<label class="filter-label"><input type="checkbox" class="type-cb" value="${t}" checked> ${t}</label>`;
    });

    distSelect.addEventListener('change', () => applyFilters(true));
    document.getElementById('sidebar').addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') applyFilters(false);
    });
    document.getElementById('reset-filters').addEventListener('click', reset);

  } catch (e) { console.error("Что-то пошло не так с загрузкой данных:", e); }
}

function applyFilters(shouldZoom) {
  const selDist = document.getElementById('district-filter').value;
  const selCats = Array.from(document.querySelectorAll('.cat-cb:checked')).map(cb => cb.value);
  const selTypes = Array.from(document.querySelectorAll('.type-cb:checked')).map(cb => cb.value);

  markers.clearLayers();
  const visibleMarkers = [];

  if (selCats.length === 0 || selTypes.length === 0) return;

  allMarkers.forEach(m => {
    const p = m.featureData.properties;
    const distMatch = (selDist === 'all' || m.district === selDist);
    const catMatch = selCats.includes(p.category);
    const normTypes = normalizeTypes(p.type);
    const typeMatch = normTypes.some(t => selTypes.includes(t));

    if (distMatch && catMatch && typeMatch) {
      markers.addLayer(m);
      visibleMarkers.push(m);
    }
  });

  if (shouldZoom && selDist !== 'all' && visibleMarkers.length > 0) {
    map.fitBounds(L.featureGroup(visibleMarkers).getBounds(), { padding: [30, 30] });
  }
}

function reset() {
  document.getElementById('district-filter').value = 'all';
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  clearSelection();
  applyFilters(false);
  map.setView([53.3, 83.7], 7);
}

// Управление модалкой
const modal = document.getElementById("about-modal");
const btn = document.getElementById("open-about");
const span = document.getElementsByClassName("close-modal")[0];

btn.onclick = () => modal.style.display = "block";
span.onclick = () => modal.style.display = "none";

window.onclick = (event) => {
  if (event.target == modal) modal.style.display = "none";
};

init();