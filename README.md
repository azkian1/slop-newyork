# Slop Cockroach

A silly mod of [Slop New York](https://github.com/mrdoob/slop-newyork) by [Mr.doob](https://github.com/mrdoob): you are a 4 cm cockroach in a full-size Manhattan.

- W/S crawl (and climb), A/D turn, Space jump / let go
- Walk into anything (buildings, poles, people, cars) and keep pushing to climb it
- You only die from below: a pedestrian's footstep or a car wheel while you are on the street
- Gold crumbs on the street give 60 s of car speed
- Red crumbs turn you into a car-sized giant for 30 s (smooth grow and shrink). Car speed, same climbing, camera pulls back. You cannot be squished while giant. People treat you as a vehicle: they dodge, dive, and run away screaming. Touching someone knocks them down; hitting a car or bus shoves it the way the player's car would

Run: `python3 -m http.server` in this folder, open http://localhost:8000 (WebGPU browser recommended; `?lite` turns off shadows and post FX for slow machines).
The mod lives in `js/cockroach.js` plus small hooks in `js/main.js`, `js/controllers.js` and `js/traffic.js`.

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
