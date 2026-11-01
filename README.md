# Slop Cockroach

A silly mod of [Slop New York](https://github.com/mrdoob/slop-newyork) by [Mr.doob](https://github.com/mrdoob): you are a 4 cm cockroach in a full-size Manhattan.

- W/S crawl (and climb), A/D turn, Space jump / let go
- Walk into anything (buildings, poles, people, cars) and keep pushing to climb it
- You only die from below: a pedestrian's footstep or a car wheel while you are on the street
- Gold crumbs on the street give 60 s of car speed
- Red crumbs turn you into a car-sized giant for 30 s (smooth grow and shrink). Car speed, same climbing, camera pulls back. You cannot be squished while giant. People treat you as a vehicle: they dodge, dive, and run away screaming. Touching someone knocks them down; hitting a car or bus shoves it the way the player's car would
- M toggles Matrix mode: every surface is replaced by world-space green glyphs (no original textures or lighting). M again puts the original materials back. Open it directly with `?matrix=1`. Shift+M still opens the street map. `?lite` skips post FX, so the glyph bloom needs the normal renderer

Run: `python3 -m http.server` in this folder, open http://localhost:8000 (WebGPU browser recommended; `?lite` turns off shadows and post FX for slow machines).
The mod lives in `js/cockroach.js` and `js/matrix-mode.js`, plus small hooks in `js/main.js`, `js/controllers.js`, `js/traffic.js` and `js/post-processing.js`.

The page loads a minified bundle (`dist/city-*.js`, rebuilt with `node tools/build-pages.mjs`). Boroughs, surveyed street trees, audio, Matrix mode, and drops start after the first frame. Repeat visits are served from a small service worker cache of that hashed bundle.

## Drops

GrokBots spit objects into the city. Built-in records live in `data/drops.json`. Newer ones are read from `azkian1/slop-newyork-drops` (`drops.json` on `main`) and kept only when they match the whitelist in `js/drop-validate.js`. A bad or missing remote file leaves the built-in drawings in place. New drops (ones this browser has not seen) fall out of the sky. Older ones are already on the ground. A car, or the giant roach, can shove them. Shoves stay on this machine. See `SECURITY.md`.

### Size

Heights are meters, capped at 300. `js/drop-size.js` is the shared rule:

| Name | Height |
| --- | --- |
| cat | 0.4 |
| piano / grand piano | 1.5 |
| car | 4.5 |
| tank | 7 |
| whale | 25 |

Unknown names use a size class: tiny 0.3, human 1.8, car 4.5, house 12, building 50. Words in the request override that: `tiny` and `mini` shrink it, `huge` and `giant` grow it, `skyscraper-sized` is at least 200 m. A number such as `4 meter` or `4m` wins over the dictionary. An explicit `height` on the record wins over the text.

### Record

```json
{
  "id": "drop-demo-piano",
  "author": "azaticus",
  "sourceId": "demo-piano",
  "request": "a grand piano",
  "name": "grand piano",
  "created": "2026-11-01T12:00:00.000Z",
  "height": 1.5,
  "x": 495.47,
  "z": -1045.28,
  "yaw": 1.234,
  "surface": "street",
  "spec": {
    "width": 1.6,
    "height": 1.45,
    "shapes": [
      { "type": "rect", "x0": 0.1, "y0": 0.95, "x1": 0.2, "y1": 1.4, "color": [30, 30, 30] },
      { "type": "polygon", "points": [[0, 0.45], [1.2, 0.05], [1.55, 0.45], [1.55, 0.95], [0, 0.95]], "color": [25, 25, 25] },
      { "type": "ellipse", "cx": 1.3, "cy": 0.8, "rx": 0.2, "ry": 0.1, "color": [255, 30, 30] },
      { "type": "line", "points": [[0, 0], [1, 1]], "color": [15, 15, 15] }
    ]
  }
}
```

`surface` is `street`, `sidewalk`, or `roof`. Drawing coordinates are meters in the object's own picture (y grows downward) and stay inside that picture. Colors are RGB integers 0-255. At most 80 shapes and 64 points each. World height is 0.5 m to 30 m. `sourceId` is unique. Text is plain ASCII, with no angle brackets or backticks.

To append from a payload `{ author, sourceId, request, name, height?, spec }` (the tool fills id, time, and the landing spot):

```
node tools/add-drop.mjs payload.json
```

A writer can also append a full record to the JSON array by hand. It has to match the record above, and `x` / `z` / `yaw` / `surface` should come from the same seeded landing rule in `js/drop-place.js` (seeded by `sourceId`).

All credit for the city, traffic and pedestrians goes to Mr.doob's Slop New York (MIT, see LICENSE).

---

# Slop New York

A New York City simulation built with [three.js](https://threejs.org/), WebGPURenderer, and TSL. Explore Manhattan on foot, by car, by bicycle, or by helicopter.

[Try it live](https://mrdoob.github.io/slop-newyork/)

## Make it your own

Fork it, remix it, improve it, break it. Make games, animations, films, experiments, or something completely different. Use it as a starting point and take it wherever you want. Have fun!

Explore other cities and community remixes in [Slop Cities](https://github.com/zz85/slop-cities).

## License and data

The project code is available under the [MIT License](LICENSE).

Geographic data: NYC Open Data (including [building footprints and heights](https://data.cityofnewyork.us/City-Government/BUILDING/5zhs-2jue) and [tree locations](https://data.cityofnewyork.us/Environment/Forestry-Tree-Points/hn5i-inap)), [MTA subway entrances](https://data.ny.gov/Transportation/MTA-Subway-Entrances-and-Exits-2024/i9wp-a4ja), and © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Third-party data and dependencies retain their respective licenses.
