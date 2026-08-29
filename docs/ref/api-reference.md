# LCSC / EasyEDA API Reference

Discovered API endpoints for programmatic component data retrieval.
All endpoints are public (no authentication required).

## 1. LCSC Component Detail

```
GET https://wmsc.lcsc.com/ftps/wm/product/detail?productCode={LCSC_CODE}
Headers: User-Agent, Accept: application/json
```

Returns: product info, parameters, pricing, stock, **datasheet PDF URL**.

Key fields:
```json
{
  "result": {
    "productCode": "C668215",
    "productModel": "TP4054",
    "brandNameEn": "UMW",
    "encapStandard": "SOT-23-5L",
    "pdfUrl": "https://datasheet.lcsc.com/datasheet/pdf/xxx.pdf?productCode=C668215",
    "paramVOList": [
      {"paramNameEn": "Voltage - Supply", "paramValueEn": "4.2V~6.5V"},
      {"paramNameEn": "Charge Current - Max", "paramValueEn": "500mA"},
      ...
    ]
  }
}
```

## 2. EasyEDA Pro Component Search

```
GET https://pro.easyeda.com/api/eda/product/search?keyword={QUERY}&type=3&page=1&pageSize=10
Headers: User-Agent, Accept: application/json
```

Returns: list of components with LCSC code, price, stock, package.

Key fields per product:
```json
{
  "mpn": "RT9080-33GJ5",
  "number": "C20617299",
  "package": "SOT-23-5",
  "manufacturer": "TECH PUBLIC",
  "stock": 16590,
  "price": [[5, "0.1249"], [50, "0.0984"], ...],
  "hasDevice": true
}
```

## 3. EasyEDA Symbol + Footprint Data (v6 format)

```
GET https://easyeda.com/api/products/{LCSC_CODE}/components?version=6.5.44
Headers: User-Agent, Accept: application/json
```

Returns: complete component definition including schematic symbol and PCB footprint.

Key fields:
```json
{
  "result": {
    "uuid": "d394ab736d3c46629c4e68017539660a",
    "title": "TP4054_C668215",
    "dataStr": {
      "head": {
        "x": 400, "y": 300,
        "c_para": {"pre": "U?", "name": "TP4054_C668215", "package": "..."}
      },
      "shape": [
        "R~365~280~2~2~70~40~#880000~1~0~none~gge1~0~",
        "P~show~0~1~355~290~180~gge5~0^^355~290^^M355,290h10~#880000^^1~368.7~294~0~CHRG~start~~~#0000FF^^1~364.5~289~0~1~end~~~#0000FF^^...",
        ...
      ]
    }
  }
}
```

### v6 Pin Format

Pin shape string: `P~{visibility}~{elec_type}~{spice_pin}~{x}~{y}~{rotation}~{id}~{locked}`

Sections separated by `^^`:
- `[0]` Pin header: `P~show~0~1~355~290~180~gge5~0`
- `[1]` Pin dot position: `355~290`
- `[2]` Pin line SVG path: `M355,290h10~#880000`
- `[3]` Pin name text: `1~368.7~294~0~CHRG~start~~~#0000FF`
- `[4]` Pin number text: `1~364.5~289~0~1~end~~~#0000FF`
- `[5]` Pin shape indicator: `0~362~290`
- `[6]` Pin shape path: `0~M 365 293 L 368 290 L 365 287`

### v6 Shape Types

| Prefix | Type | Example |
|--------|------|---------|
| `R` | Rectangle | `R~365~280~2~2~70~40~#880000~1~0~none~gge1~0~` |
| `E` | Ellipse | `E~370~285~1.5~1.5~#880000~1~0~#880000~gge2~0` |
| `P` | Pin | See above |
| `PL` | Polyline | `PL~x1~y1~x2~y2~...~#color~width~style~id` |
| `A` | Arc | `A~...` |
| `T` | Text | `T~...` |

## 4. EasyEDA Symbol SVG

```
GET https://easyeda.com/api/products/{LCSC_CODE}/svgs
Headers: User-Agent, Accept: application/json
```

Returns: SVG images of symbol and footprint (for preview/display only).

## 5. Datasheet PDF Download

```
GET {pdfUrl from LCSC detail API}
```

Returns: actual PDF file. Can be read by Claude for:
- Pin descriptions and functions
- Typical application circuits (capacitor values, resistor values)
- Electrical characteristics
- Maximum ratings

## 6. Usage Workflow

```python
import requests

# 1. Search for component
r = requests.get('https://pro.easyeda.com/api/eda/product/search',
    params={'keyword': 'TP4054', 'type': 3, 'pageSize': 5})
products = r.json()['result']['productList']

# 2. Get detailed specs
lcsc_code = products[0]['number']  # e.g. "C668215"
r = requests.get('https://wmsc.lcsc.com/ftps/wm/product/detail',
    params={'productCode': lcsc_code})
detail = r.json()['result']
pdf_url = detail['pdfUrl']
params = {p['paramNameEn']: p['paramValueEn'] for p in detail['paramVOList']}

# 3. Get symbol/footprint data
r = requests.get(f'https://easyeda.com/api/products/{lcsc_code}/components',
    params={'version': '6.5.44'})
component = r.json()['result']
pins = [s for s in component['dataStr']['shape'] if s.startswith('P~')]

# 4. Download and read datasheet for application circuit
r = requests.get(pdf_url)
with open(f'/tmp/{lcsc_code}.pdf', 'wb') as f:
    f.write(r.content)
```

## 7. v6 → epru Conversion Rules

EasyEDA Pro internally converts v6 library data to epru format when placing components.
The conversion rules (reverse-engineered by comparing API output with .epro2 file content):

### Pin Coordinates

```
epru_relative_x = v6_absolute_x - v6_origin_x
epru_relative_y = v6_absolute_y - v6_origin_y
```

The v6 origin is in `dataStr.head.x` and `dataStr.head.y` (typically 400, 300).

### Pin Rotation

```
epru_rotation = (v6_rotation + 180) % 360
```

v6 rotation points **outward** (from IC body toward the wire connection point).
epru rotation points **inward** (from wire connection point toward IC body).

### Verified Example (TP4054, C668215)

| Pin | v6 abs (x,y) | v6 rot | epru rel (x,y) | epru rot | Match |
|-----|-------------|--------|----------------|----------|-------|
| 1 CHRG | (355, 290) | 180 | (-45, -10) | 0 | OK |
| 2 GND | (355, 300) | 180 | (-45, 0) | 0 | OK |
| 3 BAT | (355, 310) | 180 | (-45, 10) | 0 | OK |
| 4 VCC | (445, 310) | 0 | (45, 10) | 180 | OK |
| 5 PROG | (445, 290) | 0 | (45, -10) | 180 | OK |

### Shape Conversion

| v6 Type | epru Type | Notes |
|---------|-----------|-------|
| `R~x~y~rx~ry~w~h~...` | `RECT` | Coordinates shifted by origin |
| `E~cx~cy~rx~ry~...` | `ELLIPSE` | |
| `PL~x1~y1~x2~y2~...` | `POLY` | Converted to points array |
| `A~...` | `ARC` | |
| `T~...` | `TEXT` | |

## 8. Limitations

- Search API may rate-limit under heavy use
- Some components may not have EasyEDA library entries (`hasDevice: false`)
- FOOTPRINT conversion is not yet implemented (only DEVICE + SYMBOL)
- Complex symbol shapes (arcs, filled polygons) may need manual verification
