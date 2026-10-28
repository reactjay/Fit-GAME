# JustUs

A private little world for exactly two people: real-time chat with photos and voice notes, browser-to-browser voice and video calls, a shared storybook with branching stories, mini-games, a shared home you decorate, a memory vault, a love calendar, and **Port Amara: a full-screen 3D open-world city for the two of you**. You walk with realistic characters, drive cars, ride the train together, fly a private jet, and see each other in real time.

**Stack:** Next.js 16 · TypeScript · Tailwind CSS 4 · Motion · PostgreSQL (row-level security) · a small WebSocket server for realtime · WebRTC calls · Cloudflare R2 (photos/voice) · Cloudflare TURN (call relay). It's built to run as **one Railway service + Railway Postgres**, with Cloudflare as the only outside service.

```
Browser ──HTTPS──▶ Railway: server.mjs ──▶ Next.js pages + /api routes ──▶ Railway Postgres (RLS)
   │   ◀──WebSocket /ws── realtime (presence, typing, calls, 3D world) ◀── LISTEN/NOTIFY ──┘
   ├──signed PUT/GET──▶ Cloudflare R2 (private photos & voice notes)
   └──WebRTC media──▶ partner's device (direct, or via Cloudflare TURN)
```

---

## Lagos — the 3D world (`/city`, the "World" tab)

A compressed, game-scale Lagos of about 4 × 4 km. It uses real place names on simplified geography, built with Three.js, React Three Fiber and Rapier physics.

**Places:**
- Lagos Island: Isale Eko, Balogun Market, Marina, Broad Street and Tafawa Balewa Square.
- Victoria Island, Eko Atlantic's glass towers and Bar Beach.
- Lekki Phase 1 (Admiralty Way), reached over the Lekki–Ikoyi Link Bridge, plus the Lekki toll gate.
- Yaba and Ebute Metta (Yaba market), the National Theatre at Iganmu, and Ikeja with Murtala Muhammed Airport.
- Ikorodu, Tarkwa Bay and the Lagos Lagoon.

**Roads and rail:** the Third Mainland and Eko bridges (with the "Welcome to Lagos · Eko o ni baje" gateway), Ahmadu Bello Way, Ikorodu Road, Airport Road and the Apapa–Oworonshoki Expressway. A rail loop has Ikeja, Yaba, Marina, Victoria Island and Ikorodu stations.

**Street life:**
- **Traffic:** yellow danfos with black stripes and luggage on the roof, blue BRT buses, okadas with riders, yellow keke napep, saloon cars and SUVs. Everything moves on the shared clock, so both of you see the same traffic.
- **Riding a danfo:** flag one down or board at a bus stop, and shout "Owa o!" (E) to get down. The conductor calls out stops.
- **People:** about 1,100 pedestrians, market shoppers and traders, with ankara colours, kaftans, wrappers, gele and fila. The people nearest you (up to 10 on High, 4 on Low) become realistic rigged Rocketbox locals (Emeka, Musa, Tunde, Chidi, Ngozi, Bisi) who walk and idle. Further away the crowd stays as stylised stand-ins.
- **Markets:** stalls with striped umbrellas, plus mama-put and recharge-card kiosks.
- **Roads:** yellow-and-black painted kerbs and medians, green overhead direction signs, bus-stop shelters, billboards with original Naija adverts, and open gutters.
- **Neighbourhoods:** electric poles with sagging wires and transformers, red laterite ground, corrugated roofs, rooftop water tanks, compound walls with gates, and "This house is not for sale".

**Also in the world:**
- Realistic rigged Rocketbox characters (Amara or Kofi).
- The Ferrari to drive.
- The train, a flyable jet and the parked airliner.
- Two-player sync, plus an in-world HUD: chat, calls, photos, emotes, minimap and a map with shared pins.

**Controls (desktop):**
- On foot: WASD to move, Shift to sprint, Space to jump, drag or double-click to look, mouse wheel to zoom, E to interact, V for first/third person, M for the map, T for chat.
- Car: W/S to drive and reverse, A/D to steer, Space for the handbrake.
- Jet: W/S for throttle, ↑/↓ to pitch (↓ pulls up), ←/→ to roll, A/D for rudder.

**Controls (phone):** left joystick to move, drag on the right half to look, plus Run, Jump, Brake and throttle buttons.

**Graphics:** Low, Medium or High, auto-picked from the device and changeable in Settings. Low also thins the crowds, traffic and market stalls. Measured per frame in three different views: Low draws about 410–480k triangles in 89–197 calls with no shadows; High about 1.3–1.4M triangles in 136–179 calls.

**First visit downloads:** about 1.1 MB of gzipped engine JavaScript plus about 10 MB of models, textures and animations; after that the browser cache serves them.

Asset sources and licences are listed in [`public/assets/manifest.json`](public/assets/manifest.json) and [`public/assets/ASSETS.md`](public/assets/ASSETS.md).

**What's procedural, not imported:** the train, aircraft, buildings, traffic vehicles, distant crowds, market stalls, landmarks and vegetation are generated in code. They look clean but stylised, not photoreal. The manifest lists the exact models that would replace them, and the code has drop-in slots for them.

---

## Run it on your Mac (no cloud accounts needed)

Uses your local Homebrew PostgreSQL. Photos and voice notes are saved under `.data/uploads`.

```bash
createdb justus_dev
```

```bash
cp .env.example .env.local
```

`.env.local` already points at `postgres://localhost/justus_dev`. Leave the R2 and TURN lines empty for now.

```bash
npm install
```

```bash
npm run migrate
```

```bash
npm run seed:demo
```

```bash
npm run dev
```

Open http://localhost:3000. The seed creates three demo accounts (password `justus-demo-2026`, local only — the script refuses to run in production):

| Account | What it's for |
|---|---|
| `ada@justus.test` | Creator of "Ada & Tobi's Corner", with sample messages, memories and dates |
| `tobi@justus.test` | Partner, already moved in |
| `outsider@justus.test` | Has no world. Shows that a third person can't get in |

Sign in as Ada in a normal window and Tobi in a **private/incognito** window to use both sides at once.

> Camera and microphone need a secure origin. `localhost` counts, but your phone on the LAN doesn't. To test calls on phones, deploy to Railway (HTTPS) first.

---

## Deploy to Railway (≈15 min)

### 1. Create the project
1. Push this folder to a **private** GitHub repo.
2. At [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** → pick the repo.
3. In the same project: **+ Create → Database → PostgreSQL**.

### 2. Connect the app to the database
In the app service → **Variables** → **New Variable**:

| Name | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway fills it in; uses the private network) |

`railway.json` already sets the build (`npm run build`), the start command (`npm start`, which applies database migrations then starts the server), a health check at `/api/health`, and **1 replica**. Keep it at one: live presence is held in memory.

### 3. Get a public URL
App service → **Settings → Networking → Generate Domain**. You'll get something like `https://justus-production.up.railway.app`. You can attach your own domain here later.

### 4. Cloudflare R2 for photos and voice notes
Without R2, files would be written to the container's disk and **lost on every redeploy**. So R2 is required in production.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage** → **Create bucket** (e.g. `justus-media`). Keep it **private**: no public access, no custom domain.
2. R2 → **Manage API tokens** → **Create API token** → permission **Object Read & Write**, limited to that bucket. Copy the **Access Key ID** and **Secret Access Key**. The secret is shown only once.
3. Your **Account ID** is on the R2 overview page.
4. Bucket → **Settings → CORS policy** → add the policy below, using your Railway URL:
   ```json
   [
     {
       "AllowedOrigins": ["https://YOUR-APP.up.railway.app"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
5. Add these to Railway **Variables**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.

### 5. Cloudflare TURN for calls on mobile data
1. Cloudflare dashboard → **Realtime → TURN Server → Create**.
2. Copy the **Turn Token ID** and **API Token** into Railway as `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN`.

Railway redeploys automatically after you change variables. Open your URL, sign up, create your world, and send your partner the invite link.

### Cost (check current pricing)
- **Railway**: Hobby plan $5/month, which includes $5 of usage. One small app plus a small Postgres for two people should mostly fit inside it.
- **Cloudflare R2**: free up to 10 GB stored, and egress is free.
- **Cloudflare TURN**: free monthly allowance, far beyond two people's calls.

---

## Forgot a password?

JustUs doesn't send email, so there are no reset links. Reset from the server instead:

- **On Railway:** install the [Railway CLI](https://docs.railway.com/guides/cli), run `railway link` in this folder, then:
  ```bash
  railway run npm run reset-password -- someone@example.com
  ```
- **Locally:**
  ```bash
  npm run reset-password -- someone@example.com
  ```

You're asked for the new password, which is never shown or logged. That account is signed out on every device. Signed-in users can also change their own password in **Settings**.

---

## Privacy and security model

- **Accounts:** passwords are hashed with scrypt. Sessions are random tokens in `HttpOnly`, `Secure`, `SameSite=Lax` cookies, and only a SHA-256 hash is stored. Sessions last 30 days and extend while used. Sign-in is rate-limited. Changing your password signs out other devices.
- **Every query runs as you.** The server switches to the restricted `authenticated` role with your user id, so **Postgres row-level security** decides what you can see and change. The `/api/db` endpoint only accepts whitelisted tables and functions, validates every identifier and binds every value as a parameter. It can never read `auth.users` or `auth.sessions`.
- **Exactly two people:** worlds are created and joined only through database functions. A trigger caps every world at two members under a row lock. Invite links work once, expire in 7 days, and only their hash is stored.
- **Realtime:** the WebSocket needs a valid session and world membership, and rejects other origins (no cross-site hijacking). Database changes reach only that world's sockets. The sender id is set by the server, so it can't be spoofed.
- **Media:** private R2 bucket with 10-minute upload and 1-hour read URLs, issued only to members of that world. After an upload, the server re-checks the stored file's real size and type and deletes anything wrong.
- **Defence in depth:** same-origin checks on every state-changing API call, `X-Frame-Options: DENY`, `nosniff`, and a strict referrer policy.

---

## Project layout

```
server.mjs              Next.js + WebSocket realtime server (what Railway runs)
db/migrations/          001 bootstrap (roles, auth tables) · 002 schema + RLS · 003 change feed
db/tests/               RLS, data API and change-feed tests on a throwaway local database
scripts/                migrate · seed-demo · reset-password
src/app/                pages; (world)/ is the signed-in area, gated on the server
src/app/api/            auth · db · media · turn · health
src/lib/server/         pg pool + "run as user", sessions, db translator, R2/local storage
src/lib/db/client.ts    browser query builder → /api/db
src/lib/live-socket.ts  reconnecting WebSocket (backoff, resync)
src/content/            stories, game prompts
src/game/               3D world: world/ (layout, terrain, roads, buildings, rail), actors/ (player, cars, train, jet), hud/
public/assets/          characters, animations, car, textures, sky + manifest.json
```

**Adding a story:** copy a file in `src/content/stories/` and register it in `index.ts`. `npm test` validates the graph.

## Checks

```bash
npm run typecheck
npm run lint
npm test          # stories, world layout + train timetable, flight model, reconnect logic, media, music links
npm run test:db   # migrations + RLS + data API + change feed on a throwaway local database
npm run build
```

## Verification status (3D world)

| Check | Status |
|---|---|
| World loads full-screen with a real loading bar; realistic character renders and animates | ✅ Seen in the browser |
| Enter, drive, steer, brake and exit a car; camera follows | ✅ Scripted in the browser (0→55 km/h in 5 s, braking 50→4 km/h, server seat released on exit) |
| Two players in the same world (second client as Tobi): partner visible, animated, distance in HUD | ✅ Seen in the browser |
| Seat rules: no double driver, ride-along, one seat per person, only the driver moves the car, seats freed on disconnect | ✅ Two-client script against the server |
| Train follows the track and timetable, never teleports; tracks clear the lagoon | ✅ Unit tests + seen in the browser |
| Jet: take-off within the runway, no take-off without rotating, banked turns, landing vs crash, stall | ✅ Unit tests of the flight model |
| Boarding the train / flying the jet by hand in the browser | ⏳ Logic implemented and unit-tested; not yet played end to end in the browser |
| Phone performance and touch controls on a real device | ⏳ Not yet tested on a phone |

## Verification status (app)

| Check | Status |
|---|---|
| Third account can't join; outsiders see nothing; points can't be forged; rewards paid once; hidden answers; sealed capsules | ✅ Automated (`test:db`, 22 tests on real Postgres) |
| Data API rejects unknown tables/functions and injection attempts; can't read passwords | ✅ Automated |
| Reconnect after outages (backoff, resync, session loss) | ✅ Automated (`live-socket.test.ts`) |
| Two users live on the local server: presence, typing, messages both ways, read receipts | ✅ Checked (browser + second client) |
| Incoming video call reaches the partner; decline is recorded and can't be overwritten | ✅ Checked |
| Would You Rather syncs between both; duplicate submit ignored; points update live | ✅ Checked (and fixed a reveal race) |
| Uploads: member upload/read-back; outsider/anonymous blocked; >10 MB, SVG and mislabelled files refused | ✅ Checked (local storage, production build) |
| Sign-up → create world → invite → partner joins → third refused | ✅ Checked (production build) |
| Cloudflare R2 driver | ⏳ Written to R2's S3 API; not yet run against a real bucket (needs your keys) |
| Actual audio/video between two real devices; TURN on mobile data | ⏳ Needs the Railway deployment and two phones |

## Not included (yet)

- Emails (confirmation, password-reset links): see "Forgot a password?" above. Resend or similar can be added later.
- Push notifications while the app is fully closed. Notifications work while it's open in a background tab.
- Running more than one server instance (presence lives in memory).
