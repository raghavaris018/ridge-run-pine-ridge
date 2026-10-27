# Ridge Run — Pine Ridge

An original, browser-based 3D arcade racer prototype. The first milestone has one Pine Ridge circuit, server-synchronized rooms for up to eight racers, a one-lap finish, three paint choices, nitro, drifting, checkpoints, a live leaderboard, practice mode, and keyboard/touch controls. Track and scenery are procedurally created with Three.js.

Cover artwork: `public/ridge-run-pine-ridge.png` (1800 × 1200 PNG, 3:2). Editable source: `public/preview.svg`.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder, run `npm install` once.
3. Run `npm start` and open `http://localhost:3000`.
4. Enter a name and choose **Create a room**. In the lobby, choose a paint and **Ready up**.
5. Open the invite URL in a second browser profile/private window or on another device. Enter a different name, choose paint, and ready up. The host starts the race when everyone is ready.

To test on a phone over the same Wi-Fi, open `http://<computer-LAN-IP>:3000/?room=<ROOMCODE>` on the phone. Allow inbound connections to port 3000 in the computer firewall if asked. `localhost` on the phone points to the phone itself, so use the computer's local network IP.

### Controls

- W or ↑ accelerates; S or ↓ brakes and reverses when stopped.
- A/← and D/→ steer. Space drifts; steering while accelerating also drifts.
- Shift uses nitro; R resets the car to the road; Esc pauses.
- Phones show touch steering, gas, brake, drift, and nitro controls. Landscape is recommended.

Choose **Drive solo in practice** to play without room setup. Room progress, countdown, movement, and finish times are controlled by the Node.js server. Other cars are smoothed between server updates. A reconnecting browser can resume using its room-specific browser token.

## Deploy for friends on the internet

The project includes `render.yaml` for a Render Node.js Web Service. To create a stable public URL, push this project to a Git repository you control, connect that repository to Render, then create a Blueprint from `render.yaml`. Render builds with `npm ci` and starts the game with `npm start`; the service's HTTPS `onrender.com` address becomes the invite-link base. Render supports WebSockets for web services.

The included Blueprint selects Render's Free plan, which is suitable for a demo but can spin down after 15 minutes idle and take about a minute to wake. Active rooms live in server memory, so a restart clears them. A deployment account and a connected Git repository are required; no game API keys are needed.

## Next stages

The starter stage is Pine Ridge. Additional planned regions are Coastal Run, Desert Circuit, Alpine Pass, and Neon District. Further work can add a first-race tutorial, sound design, road arrows, richer barriers/checkpoint art, optimized mobile landscape layout, and those four regions. The current circuit has procedural scenery, road edges, lane marks, curbs, start/finish, checkpoints, chase camera, and simple fictional cars; it is not a final commercial-grade 3D racer.
