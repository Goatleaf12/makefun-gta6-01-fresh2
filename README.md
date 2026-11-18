# Port Vesper — 3D Open-World Harbor Action

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Goatleaf12/makefun-gta6-01-fresh2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Goatleaf12/makefun-gta6-01-fresh2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Port Vesper** is a 3D open-world GTA-like set in a rain-slick harbor city, built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01) ($1,666 prize pool). You are **Nia Kessler**, night courier of Port Vesper — steal cars, dodge the Vesper PD, and run five chained missions to earn your way out of the harbor.

## Play

Serve the game locally and open it in a browser (no network needed at runtime — three.js is vendored, audio is generated with WebAudio):

```sh
node serve.ts
# open http://localhost:8080
```

## Features

- **Procedural harbor city** — grid streets, varied buildings with lit windows and neon roof signs, sidewalks, street lights, docks, warehouses, cranes, containers, boats and the sea
- **Third-person on foot** — walk, run, jump, orbit camera (mouse)
- **Cars** — enter/exit, drive with acceleration/braking/steering, collisions, steal parked and traffic cars
- **Traffic AI** — cars cruise the road grid, slow for traffic ahead, turn at intersections
- **Pedestrian AI** — walkers on the streets who flee from danger
- **Wanted 1–5** — rises on visible crime (theft, hits, assault), cools off while hidden; police AI chases and rams, roadblocks at wanted 3+
- **5 chained missions** — courier pickup, car theft, target chase, police escape, final pier delivery — with HUD objectives, beacon markers and cash rewards
- **Combat** — punch (F) and shoot (mouse click) with feedback
- **HUD** — live minimap, wanted stars, money, active objective, mission messages, speedometer
- **Screens & save** — start screen, pause, busted/game over, progress saved to localStorage
- **Generative audio** — engine hum, police sirens and a moody bassline, all synthesized with WebAudio (no audio files)
- **Performance** — shared geometries/materials, capped rain particles, runs smoothly in a normal desktop browser

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse | Orbit camera (click to lock, drag works too) |
| Shift | Run |
| Space | Jump |
| E | Enter / exit car |
| F | Punch |
| Click | Shoot |
| M | Start next mission |
| P / Esc | Pause |
| H | Mute |

## Layout

- `game/index.html` — entry point (≤ 1 MiB)
- `game/src/` — fresh modules: city, player, AI (traffic/peds/police), missions, HUD/audio/save, main loop
- `game/vendor/three.module.min.js` — vendored three.js 0.170.0
- `screenshots/` — 4 gameplay screenshots
- `main.ts` / `serve.ts` / `vendor/makefun-game.ts` — make.fun kit plumbing

## License

MIT — see [LICENSE](LICENSE).
