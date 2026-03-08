# Fenrir Summit Client

A faster Summit interface built for players fighting for control.

Fenrir Summit Client is a high-performance [Loot Survivor Summit](https://lootsurvivor.io) client designed for players competing in heavily contested beast battles. It reduces latency between Summit state changes and player action, surfaces cleaner timing signals, and gives you an operational edge when multiple attackers are hitting the same beast.

## Why Fenrir

The default Summit UI wasn't built for high-contention scenarios. When dozens of players are attacking the same holder, timing and information clarity decide who captures.

**Lower perceived latency** — Optimized event handling and state polling reduce the gap between on-chain Summit changes and your next action.

**Cleaner timing signals** — HP changes, poison ticks, and Summit transitions are surfaced so you can react at the right moment instead of guessing.

**Built for contested battles** — Designed specifically for the Summit environment where many players interact with the same storage slot and every second matters.

**Focused interface** — Removes unnecessary friction and surfaces only the information you need to act.

**Operational advantage** — Better visibility into Summit state reduces wasted potions and missed capture windows.

## Quick Start

Fenrir runs **locally on your machine** with your own Cartridge wallet session. No API keys, no hosted services.

```bash
git clone https://github.com/GravitySignal/fenrir-summit-client.git
cd fenrir-summit-client
npm install
npm run hooks:install   # recommended: commit safety checks
npm run cockpit:user    # start local cockpit
```

Open `http://127.0.0.1:8788`, connect your Cartridge wallet, register a session, and start the runner.

## How the Summit Works

The Summit is a king-of-the-hill game in Loot Survivor. One beast holds the summit at a time, earning `$SURVIVOR` rewards. Anyone can challenge the holder with their own beasts. If you knock the holder off, your beast takes the summit and you start earning.

Fenrir handles the full attack loop:

1. **Monitors** the Summit via API polling and WebSocket events for real-time state
2. **Scores** your beasts against the current defender using power, type advantage, and crit chance
3. **Sends** up to 50 beasts per transaction with VRF combat randomness
4. **Recovers** from failed transactions with a three-layer retry strategy:
   - Summit holder changed mid-tx → instant retry with fresh data
   - Beast revival mismatch → exclude that beast, retry with remaining
   - Unknown error → full state refresh + backoff

## Type Triangle

Combat uses rock-paper-scissors type advantages:

| Attacker | Strong against | Weak against | Multiplier |
|----------|---------------|--------------|------------|
| **Magic** | Brute (1.5x) | Hunter (0.5x) | Same type: 1.0x |
| **Hunter** | Magic (1.5x) | Brute (0.5x) | Same type: 1.0x |
| **Brute** | Hunter (1.5x) | Magic (0.5x) | Same type: 1.0x |

Fenrir automatically selects beasts with type advantage against the current holder and avoids sending beasts into a disadvantage.

## Beast Scoring

```
score = basePower x typeAdvantage x critFactor
basePower = level x (6 - tier)     // T1 = x5, T5 = x1
critFactor = 1 + (luck / 100)
```

Beasts are ranked by score. The client uses dynamic rotation to cycle through your full army for quest coverage rather than always sending the same top beasts.

## Setup

### Prerequisites
- Node.js >= 20
- A Cartridge Controller account with beasts in the Summit game

### Configure

```bash
cp config/example.json config/yourprofile.json
# Edit with your controller address and username
```

### Create Session

Fenrir uses Cartridge session-based transactions (gasless via paymaster). Authenticate in the browser to create a session:

```bash
NODE_OPTIONS='--experimental-wasm-modules' npx tsx src/bootstrap/create-session.ts config/yourprofile.json
```

The session is stored locally and expires after 7 days.

### Run

```bash
NODE_OPTIONS='--experimental-wasm-modules' npx tsx src/index.ts config/yourprofile.json
```

Or run in background:

```bash
NODE_OPTIONS='--experimental-wasm-modules' nohup npx tsx src/index.ts config/yourprofile.json > summit.log 2>&1 &
```

## Cockpit (Web UI)

Fenrir includes a local cockpit for managing your Summit operations from a single interface:

- Connect your Cartridge wallet and register sessions directly
- Tune strategy, potion usage, and beast selection controls
- Manage alliances and non-aggression pacts (auto-synced to protected owners)
- Start/stop runners and watch live logs
- Edit full profile JSON when you need every field

**Local mode** (recommended):

```bash
npm run cockpit:user
```

Then open `http://127.0.0.1:8788`. Runs in isolated storage, bound to localhost.

**External/public access:**

```bash
npm run cockpit:public
```

- Binds to `0.0.0.0` — put behind HTTPS and authentication before exposing publicly
- Public users are isolated from your private `config/*.json` profiles
- Cartridge wallet bundle served locally (no external CDN dependency)

## Strategy Config

| Option | Default | Description |
|--------|---------|-------------|
| `maxBeastsPerAttack` | `1` | Max beasts per transaction |
| `avoidTypeDisadvantage` | `false` | Skip beasts with type disadvantage (0.5x) |
| `requireTypeAdvantage` | `false` | Only send beasts with type advantage (1.5x) |
| `attackCooldownMs` | `30000` | Minimum ms between attacks |
| `useAttackPotions` | `true` | Spend attack potions for bonus damage |
| `attackPotionsPerBeast` | `5` | Potions per beast (each adds 10% base damage) |
| `pauseOnAttackPotionDepleted` | `true` | Pause when potion spend fails |
| `attackStreakTarget` | `10` | Target streak level for quest completion |
| `burstEnabled` | `false` | Burst combo mode for high-extra-life holders |
| `burstExtraLivesThreshold` | `10` | Extra lives threshold to trigger burst |
| `usePoisonOnHighExtraLives` | `true` | Apply poison to holders with extra lives |

## CLI Tools

```bash
# Check summit status + your beasts
npx tsx src/cli/status.ts config/yourprofile.json

# List all beasts with scores against current holder
npx tsx src/cli/beasts.ts config/yourprofile.json

# Find diplomacy opportunities on the leaderboard
npx tsx src/cli/diplomacy-scout.ts config/yourprofile.json

# Verify session is valid
npx tsx src/bootstrap/login.ts config/yourprofile.json
```

(All CLI commands need `NODE_OPTIONS='--experimental-wasm-modules'` prefix.)

## Architecture

```
src/
├── index.ts              # Main loop + three-layer retry engine
├── config.ts             # Zod-validated config schema
├── api/
│   ├── client.ts         # REST client for Summit API
│   ├── ws.ts             # WebSocket client for real-time events
│   └── types.ts          # API response types
├── chain/
│   ├── abi.ts            # ABI loader with caching
│   ├── client.ts         # Starknet chain client (SessionProvider + VRF)
│   └── controller-signer.ts
├── strategy/
│   ├── engine.ts         # Decision engine (attack profiles, streak/level quests)
│   ├── scoring.ts        # Beast scoring + type-aware ranking
│   └── types.ts          # Game types (GameSnapshot, AgentAction, etc.)
├── data/
│   └── beasts.ts         # Beast metadata (75 beasts, types, tiers)
├── utils/
│   ├── logger.ts         # Structured logger + JSONL event writer
│   └── time.ts           # sleep() + retry()
├── cli/                  # Status, beast list, diplomacy tools
└── bootstrap/            # Session creation + validation
```

## Events

Attack events are logged to `events.jsonl` in structured JSONL format:

| Category | Description |
|----------|-------------|
| `attack_success` | Successful attack with tx hash, beasts sent, defender info |
| `attack_outcome` | Combat result: captured or not, profile used, potions spent |
| `attack_failed` | Failed attempt with error details and retry layer |
| `attack_exhausted` | All retry attempts failed |

## Contributing

Before pushing changes:

```bash
npm run safety:public
```

This scans for leaked secrets. The pre-commit hook (via `npm run hooks:install`) blocks common secrets automatically.

Never commit wallet addresses, usernames, local paths, or API keys.

## License

UNLICENSED
