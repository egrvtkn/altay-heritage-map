"""
Геокодирование объектов культурного наследия и экспорт в GeoJSON.

Шаг 2 из 2 — запускать после prepare_data.py.

Для геокодирования используется Nominatim (OpenStreetMap).
Стратегия fallback: если точный адрес не найден — пробуем без дома,
затем только город/район.
"""

import json
import time
import pandas as pd
from geopy.geocoders import Nominatim

# ===== ПУТИ =====
INPUT_PATH   = "raw_data/Spisok-obektov-kulturnogo-naslediya-otfiltrovannyy.xlsx"
GEOCODED_PATH = "raw_data/Spisok-obektov-kulturnogo-naslediya-geocoded.xlsx"
GEOJSON_PATH  = "monuments.geojson"

REGION = "Алтайский край"


# ===== СБОРКА АДРЕСОВ ДЛЯ ГЕОКОДЕРА =====

def build_address(row, level="full"):
    """
    Собирает адресную строку с нужной детализацией:
      full   — регион + район + город + улица + дом
      street — регион + район + город + улица
      city   — регион + район + город
    """
    parts = [REGION]
    if pd.notna(row.get('addr_district')):
        parts.append(row['addr_district'])
    if pd.notna(row.get('addr_city')):
        parts.append(row['addr_city'])
    if level in ('full', 'street') and pd.notna(row.get('addr_street')):
        parts.append(row['addr_street'])
    if level == 'full' and pd.notna(row.get('addr_house')):
        parts.append(row['addr_house'])
    return ', '.join(parts)


# ===== ГЕОКОДИРОВАНИЕ =====

def geocode_with_fallback(geolocator, row, idx):
    """
    Пробует геокодировать с тремя уровнями детализации.
    Возвращает (lat, lon) или (None, None).
    """
    for level in ('full', 'street', 'city'):
        address = build_address(row, level)
        try:
            location = geolocator.geocode(address, timeout=10)
        except Exception as e:
            print(f"  Строка {idx}: ошибка геокодера — {e}")
            return None, None

        if location:
            if level != 'full':
                print(f"  Строка {idx}: найдено через fallback '{level}' — {address}")
            return location.latitude, location.longitude

        time.sleep(1)  # уважаем лимиты Nominatim

    print(f"  Строка {idx}: не найдено — {build_address(row, 'full')}")
    return None, None


df = pd.read_excel(INPUT_PATH)
geolocator = Nominatim(user_agent='altai_culture_heritage_map')

df['Latitude'] = None
df['Longitude'] = None

for idx, row in df.iterrows():
    full_addr = build_address(row, 'full')
    if not full_addr.strip():
        print(f"Строка {idx}: пустой адрес, пропускаем")
        continue

    lat, lon = geocode_with_fallback(geolocator, row, idx)
    df.loc[idx, 'Latitude'] = lat
    df.loc[idx, 'Longitude'] = lon

    if lat:
        print(f"Строка {idx}: {full_addr} => {lat}, {lon}")

df.to_excel(GEOCODED_PATH, index=False)
print(f"\nГеокодирование завершено. Сохранено: {GEOCODED_PATH}")
found = df['Latitude'].notna().sum()
print(f"Найдено координат: {found} из {len(df)}")


# ===== ЭКСПОРТ В GEOJSON =====

df = pd.read_excel(GEOCODED_PATH)

# Переименовываем длинные колонки
df.rename(columns={
    'Наименование объекта культурного наследия': 'Наименование',
    'Местонахождение объекта культурного наследия': 'Местонахождение',
}, inplace=True)

features = []
skipped = 0

for _, row in df.iterrows():
    if pd.isna(row['Latitude']) or pd.isna(row['Longitude']):
        skipped += 1
        continue

    feature = {
        'type': 'Feature',
        'geometry': {
            'type': 'Point',
            'coordinates': [row['Longitude'], row['Latitude']]
        },
        'properties': {
            'name': row['Наименование'],
            'address': row['Местонахождение'],
            'category': row['Категория'],
            'type': row['Общая видовая принадлежность'],
            'registration_number': row.get('Регистрационный номер в едином государственном реестре объектов культурного наследия народов РФ'),
        }
    }
    features.append(feature)

geojson = {'type': 'FeatureCollection', 'features': features}

with open(GEOJSON_PATH, 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)

print(f"\nGeoJSON сохранён: {GEOJSON_PATH}")
print(f"Объектов в файле: {len(features)}, пропущено (нет координат): {skipped}")
