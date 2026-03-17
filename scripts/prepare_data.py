"""
Подготовка данных для карты культурного наследия Алтайского края.

Источник: PDF с официального сайта Управления государственной охраны
объектов культурного наследия Алтайского края.
https://ukn.alregn.ru/kulturnoe-nasledie/obekty-kulturnogo-naslediya/

PDF был конвертирован в xlsx через сторонний сервис, после чего
этим скриптом очищен, склеен и преобразован в итоговый xlsx.
Геокодирование выполнено отдельно.
"""

import pandas as pd

# ===== ПУТИ =====
INPUT_PATH  = "raw_data/Spisok-obektov-kulturnogo-naslediya.xlsx"
OUTPUT_PATH = "raw_data/Spisok-obektov-kulturnogo-naslediya-otfiltrovannyy.xlsx"

# Слова в названии, по которым отфильтровываем не-архитектурные объекты
# (мемориалы, стелы, скульптуры и т.п.)
EXCLUDE_WORDS = [
    "Памятник", "Мемориальный", "Могила", "Обелиск", "Мемориал",
    "Бюст", "Погибшим", "Могилы", "Сквер", "Скульптура",
    "Место", "Стела", "Знак"
]

# ===== ЗАГРУЗКА =====
df = pd.read_excel(INPUT_PATH, sheet_name="Table 1")
df = df.replace(r'\n', ' ', regex=True)
df = df.replace('', None)
df = df.dropna(how='all')
df = df.reset_index(drop=True)
print(f"До склейки: {len(df)} строк")


# ===== СКЛЕЙКА СТРОК =====
# PDF-конвертер разбил длинные ячейки на несколько строк.
# Признак "лишней" строки — пустое поле Район при заполненном Типе.
# Сначала склеиваем тройные разрывы, затем двойные.

COLS_TO_MERGE = [
    'Общая видовая принадлежность',
    'Входит в ансамбль',
    'Категория',
    'Вид ОКН',
    'Наименование объекта культурного наследия',
]

def merge_rows(df, n):
    """Склеивает n последовательных строк если район пустой начиная со второй."""
    i = 0
    while i < len(df) - (n - 1):
        raion_first = df.at[i, 'Район']
        raions_rest = [df.at[i + k, 'Район'] for k in range(1, n)]

        if not pd.isna(raion_first) and all(pd.isna(r) for r in raions_rest):
            for col in COLS_TO_MERGE:
                parts = [str(df.at[i + k, col]).strip() for k in range(n)]
                df.at[i, col] = ' '.join(parts)
                for k in range(1, n):
                    df.at[i + k, col] = None
            i += n
        else:
            i += 1
    return df

df = merge_rows(df, 3)
df = df[df['Общая видовая принадлежность'].notna()].reset_index(drop=True)

df = merge_rows(df, 2)
df = df[df['Общая видовая принадлежность'].notna()].reset_index(drop=True)

print(f"После склейки: {len(df)} строк")


# ===== ФИЛЬТРАЦИЯ =====
# Убираем объекты, не являющиеся зданиями/сооружениями
mask = df['Наименование объекта культурного наследия'].str.contains(
    '|'.join(EXCLUDE_WORDS), case=False, na=False
)
df = df[~mask].reset_index(drop=True)
print(f"После фильтрации: {len(df)} строк")


# ===== ПАРСИНГ АДРЕСА =====
# Адреса бывают двух форматов:
# 1. С районом: "Бийский район, с. Сростки, ул. Ленина, 1"
# 2. Без района: "г. Барнаул, ул. Ленина, 1"

def clean_street(addr_str):
    """Убирает префиксы типа ул., просп., пер. из названия улицы."""
    if not addr_str:
        return addr_str
    prefixes = ['ул.', 'просп.', 'пер.', 'пл.', 'переулок', 'проезд', 'бульвар']
    for prefix in prefixes:
        if prefix in addr_str:
            addr_str = addr_str.split(prefix)[1].strip()
            # Убираем возможную точку в конце сокращения
            if '.' in addr_str:
                addr_str = addr_str.split('.')[-1].strip()
            break
    return addr_str

def clean_house(addr_house):
    """Нормализует номер дома — убирает дроби, скобки, префикс д."""
    if not addr_house:
        return addr_house
    for sep in ('/', ';', '('):
        if sep in addr_house:
            addr_house = addr_house.split(sep)[0].strip()
    if 'д.' in addr_house:
        addr_house = addr_house.split('д.')[1].strip()
    return addr_house

def get_address_parts(address):
    """Разбивает адресную строку на район, город, улицу и дом."""
    if not address or not isinstance(address, str):
        return None, None, None, None

    address = address.replace('\n', ' ')
    parts = [p.strip() for p in address.split(',')]

    if 'район' in address.lower():
        # Иногда после района сразу идёт номер — значит это просто район без города
        if len(parts) > 1 and parts[1] and parts[1][0].isdigit():
            return parts[0], None, None, None

        addr_district = parts[0] if len(parts) > 0 else None
        # Убираем тип населённого пункта (г., с., п. и т.п.)
        addr_city    = parts[1].split(' ', 1)[1] if len(parts) > 1 else None
        addr_street  = clean_street(parts[2]) if len(parts) > 2 else None
        addr_house   = clean_house(parts[3])  if len(parts) > 3 else None
    else:
        addr_district = None
        addr_city    = parts[0].split(' ', 1)[1] if len(parts) > 0 else None
        addr_street  = clean_street(parts[1]) if len(parts) > 1 else None
        addr_house   = clean_house(parts[2])  if len(parts) > 2 else None

    return addr_district, addr_city, addr_street, addr_house


# Применяем парсинг
df[['addr_district', 'addr_city', 'addr_street', 'addr_house']] = df[
    'Местонахождение объекта культурного наследия'
].apply(lambda x: pd.Series(get_address_parts(x)))


# ===== СОХРАНЕНИЕ =====
df = df.replace('nan', '')
df.to_excel(OUTPUT_PATH, index=False)
print(f"Сохранено: {OUTPUT_PATH}")

