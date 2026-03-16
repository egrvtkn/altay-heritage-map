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

map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

// Подложка карты
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19
}).addTo(map);

// Зум справа по центру — только для десктопа
L.control.zoom({ position: 'topright' }).addTo(map);

// Настройки кластеров
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

// Определяем мобильное устройство
function isMobile() {
  return window.innerWidth <= 768;
}

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

// ===== МОБИЛЬНЫЕ BOTTOM SHEETS =====

const filterSheet = document.getElementById('mobile-filter-sheet');
const detailsSheet = document.getElementById('mobile-details-sheet');

function openFilterSheet() {
  // Закрываем детали если открыты
  detailsSheet.classList.remove('open');
  filterSheet.classList.toggle('open');
}

function closeFilterSheet() {
  filterSheet.classList.remove('open');
}

function openDetailsSheet(html) {
  document.getElementById('mobile-details-content').innerHTML = html;
  filterSheet.classList.remove('open');
  detailsSheet.classList.add('open');
}

function closeDetailsSheet() {
  detailsSheet.classList.remove('open');
  if (activeMarker) {
    activeMarker.setIcon(defaultIcon);
    activeMarker = null;
  }
}

// Закрытие details sheet по тапу на ручку
document.getElementById('close-details-sheet').addEventListener('click', closeDetailsSheet);

// Закрытие filter sheet при клике за пределами
document.addEventListener('click', (e) => {
  if (filterSheet.classList.contains('open') &&
      !filterSheet.contains(e.target) &&
      e.target.id !== 'mob-filter-btn') {
    closeFilterSheet();
  }
});

// Мобильные кнопки зума
document.getElementById('mob-zoom-in').addEventListener('click', () => map.zoomIn());
document.getElementById('mob-zoom-out').addEventListener('click', () => map.zoomOut());

// Кнопка фильтра
document.getElementById('mob-filter-btn').addEventListener('click', openFilterSheet);

// Кнопка "О проекте" (мобильная)
document.getElementById('mob-about-btn').addEventListener('click', () => {
  closeFilterSheet();
  detailsSheet.classList.remove('open');
  document.getElementById('about-modal').style.display = 'block';
});

// ===== ОСНОВНАЯ ЛОГИКА =====

function clearSelection() {
  if (activeMarker) {
    activeMarker.setIcon(defaultIcon);
    activeMarker = null;
  }
  document.getElementById('details').innerHTML = `<p class="placeholder">Выберите объект на карте</p>`;
  if (isMobile()) closeDetailsSheet();
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

      // Popup только на десктопе
      marker.bindPopup(`<b>${p.name}</b><br>${p.address}`);

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (isMobile()) marker.closePopup();
        if (activeMarker) activeMarker.setIcon(defaultIcon);
        activeMarker = marker;
        marker.setIcon(redIcon);

        const detailsHTML = `
          <h3>${p.name}</h3>
          ${p.photo_url ? `<img src="${p.photo_url}" class="monument-photo">` : ''}
          <div class="info-block">
              <p><b>Адрес:</b> ${p.address}</p>
              <p><b>Категория:</b> ${p.category}</p>
              <p><b>Тип:</b> ${p.type}</p>
              <p><b>Рег. номер:</b> ${p.registration_number || '—'}</p>
          </div>
        `;

        if (isMobile()) {
          openDetailsSheet(detailsHTML);
        } else {
          // Десктоп: инфо-панель слева
          document.getElementById('details').innerHTML = detailsHTML;
        }
      });

      allMarkers.push(marker);
      markers.addLayer(marker);
    });

    map.addLayer(markers);

    // Заполняем фильтры — десктоп И мобильный sheet синхронно
    const distSelect = document.getElementById('district-filter');
    const distSelectMob = document.getElementById('district-filter-mob');

    Array.from(districts).sort().forEach(d => {
      [distSelect, distSelectMob].forEach(sel => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = d;
        sel.appendChild(opt);
      });
    });

    const catCont = document.getElementById('category-filters');
    const catContMob = document.getElementById('category-filters-mob');
    categories.forEach(c => {
      const html = `<label class="filter-label"><input type="checkbox" class="cat-cb" value="${c}" checked> ${c}</label>`;
      catCont.innerHTML += html;
      catContMob.innerHTML += html;
    });

    const typeCont = document.getElementById('type-filters');
    const typeContMob = document.getElementById('type-filters-mob');
    types.forEach(t => {
      const html = `<label class="filter-label"><input type="checkbox" class="type-cb" value="${t}" checked> ${t}</label>`;
      typeCont.innerHTML += html;
      typeContMob.innerHTML += html;
    });

    // Десктоп: изменения фильтров
    distSelect.addEventListener('change', () => {
      distSelectMob.value = distSelect.value;
      applyFilters(true);
    });
    document.getElementById('sidebar').addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        syncCheckboxes(e.target, 'mob');
        applyFilters(false);
      }
    });
    document.getElementById('reset-filters').addEventListener('click', reset);

    // Мобильный sheet: изменения фильтров
    distSelectMob.addEventListener('change', () => {
      distSelect.value = distSelectMob.value;
      applyFilters(true);
    });
    document.getElementById('mobile-filter-sheet').addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        syncCheckboxes(e.target, 'desktop');
        applyFilters(false);
      }
    });
    document.getElementById('reset-filters-mob').addEventListener('click', reset);

  } catch (e) { console.error("Что-то пошло не так с загрузкой данных:", e); }
}

// Синхронизируем чекбоксы между десктопом и мобильным sheet
function syncCheckboxes(sourceCheckbox, target) {
  const cls = sourceCheckbox.className;
  const val = sourceCheckbox.value;
  if (target === 'mob') {
    const mob = document.querySelector(`#mobile-filter-sheet input.${cls}[value="${val}"]`);
    if (mob) mob.checked = sourceCheckbox.checked;
  } else {
    const desk = document.querySelector(`#sidebar input.${cls}[value="${val}"]`);
    if (desk) desk.checked = sourceCheckbox.checked;
  }
}

function applyFilters(shouldZoom) {
  // Берём значения из активного контекста (десктоп или мобильный)
  const selDist = isMobile()
    ? document.getElementById('district-filter-mob').value
    : document.getElementById('district-filter').value;

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
  document.getElementById('district-filter-mob').value = 'all';
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  clearSelection();
  applyFilters(false);
  map.setView([53.3, 83.7], 7);
  closeFilterSheet();
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
