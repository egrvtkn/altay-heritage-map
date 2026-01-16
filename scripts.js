

const markers = L.markerClusterGroup();

async function addClusteredMarkers() {
  const response = await fetch('monuments.geojson');
  const data = await response.json();
  L.geoJSON(data, {
    onEachFeature: function(feature, layer) {
      layer.bindPopup("<b>" + feature.properties.name + "</b><br>Адрес: " + feature.properties.address);
    }
  }).addTo(markers);
  markers.addTo(map);
}
addClusteredMarkers();
