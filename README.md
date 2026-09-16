# homebridge-sonos-soundfeatures

A [Homebridge](https://homebridge.io) plugin that exposes Sonos soundbar **Night Mode** and **Speech Enhancement** as HomeKit switches.

## Supported Devices

Night Mode and Speech Enhancement are available on Sonos soundbars:

- Sonos Playbar
- Sonos Beam (Gen 1 & 2)
- Sonos Arc / Arc Ultra
- Sonos Ray

## Installation

### Requirements

- Node.js **22.12+ within the 22.x line**, or **24.x** (recommended).
- Homebridge **1.11.4+ within the 1.x line**, or **2.4.0+ within the 2.x line**.

Node 18/20 and older Homebridge versions are no longer supported. Upgrade Node and Homebridge before upgrading this plugin.

The development dependency uses stable Homebridge 2.4.0. The published versions checked on 2026-09-16 were
[2.4.0 stable](https://github.com/homebridge/homebridge/releases/tag/v2.4.0) and
[2.4.1-beta.11 prerelease](https://www.npmjs.com/package/homebridge?activeTab=versions).
CI tests Homebridge 1.11.4, 2.4.0 and that beta on Node 22 and 24; the beta is a compatibility check, not the recommended installation.

### Via Homebridge UI (recommended)

Search for `homebridge-sonos-soundfeatures` in the Homebridge plugin search and install.

### Via npm

```bash
npm install -g homebridge-sonos-soundfeatures
```

## Configuration

Add the platform to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "SonosSoundFeatures",
      "name": "Sonos Sound Features",
      "discoveryTimeout": 5
    }
  ]
}
```

By default, the plugin discovers Sonos devices via SSDP multicast. If that doesn't work (e.g. Docker), you can use subnet scanning or specify devices manually:

<details>
<summary>Subnet scanning (Docker / isolated networks)</summary>

```json
{
  "platforms": [
    {
      "platform": "SonosSoundFeatures",
      "name": "Sonos Sound Features",
      "autoDiscovery": {
        "subnet": "192.168.1",
        "timeout": 5
      }
    }
  ]
}
```

</details>

<details>
<summary>Manual device configuration</summary>

```json
{
  "platforms": [
    {
      "platform": "SonosSoundFeatures",
      "name": "Sonos Sound Features",
      "devices": [
        {
          "name": "Living Room Soundbar",
          "ip": "192.168.1.100"
        }
      ]
    }
  ]
}
```

</details>

### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | — | Must be `SonosSoundFeatures` |
| `name` | Yes | — | Display name for the platform |
| `discoveryTimeout` | No | `5` | Seconds to wait for SSDP auto-discovery (1–30) |
| `pollInterval` | No | `30` | Seconds between completed background refresh cycles (10–3600). Set `0` to disable polling; invalid values fall back to 30. HomeKit reads/writes still work when polling is disabled. |
| `rediscoveryCooldown` | No | `60` | Minimum seconds between re-discovery attempts for a device after communication failure (10–600). Manual IP configurations are not auto-rediscovered. |
| `autoDiscovery.subnet` | No | — | First three octets of your network (e.g. `192.168.1`). Performs a TCP scan on port 1400 across the /24 range. Use when SSDP is unavailable (e.g. Docker). |
| `autoDiscovery.timeout` | No | `5` | Seconds to wait for each host during subnet scanning (1–30) |
| `devices` | No | — | Array of `{ name, ip }` for manual device config. If provided, all discovery is skipped. |

### Discovery priority

1. **Manual** — if `devices` is provided, those IPs are used directly
2. **Subnet scan** — if `autoDiscovery.subnet` is set, a TCP port scan finds Sonos devices
3. **SSDP** (default) — multicast discovery on the local network

### State synchronization

The plugin polls supported sound features and publishes changes made in the Sonos app to Apple Home.
It checks one device at a time, with at most two EQ requests in flight per cycle, and waits for the cycle to complete
before starting the next interval. Each EQ request uses the existing five-second network timeout.
Polling never writes settings to Sonos, and unchanged values are not republished.
Failed reads mark the affected switch unavailable rather than incorrectly reporting it as off; a successful refresh clears the error.

Sonos can emit EQ events, but event subscriptions require an inbound callback connection and reliable renewal.
Polling avoids those extra requirements, particularly in Docker or isolated networks.
The plugin cancels its refresh timer on Homebridge shutdown and ignores outstanding refresh/rediscovery results.
Existing accessory UUIDs and switch subtypes are retained across upgrades so HomeKit automations remain attached.

### Optional child bridge

In Homebridge UI, you can configure this plugin to run in its own child bridge to isolate plugin restarts and failures.
Follow the UI's pairing instructions after enabling it. This does **not** fix multicast or network routing:
the child bridge must still reach the Sonos devices on TCP port 1400, and SSDP discovery requires working multicast.
Keep using subnet discovery or manual IP addresses when multicast is unavailable.

Configuration continues to use Homebridge UI's schema form. A custom discovery/selection UI is not included;
the standalone web UI below remains a development tool, not a production Homebridge service.

## Development

### Prerequisites

- Node.js 22.12+ (22.x) or 24.x
- npm

### Build

```bash
npm ci
npm run build
```

### Lint

```bash
npm run lint
```

### Test

```bash
npm test
```

Tests build the plugin first. Alongside the unit tests, the integration suite uses real Homebridge accessory/HAP
classes and loads the compiled package through Homebridge's native plugin loader in an isolated Node process.
Only Sonos network operations are stubbed in the loader smoke test; no bridge is published or paired.
Jest's ESM support is enabled for Homebridge 2.x modules, so Node may print an experimental VM modules warning.

To check another supported Homebridge version locally:

```bash
npm install --no-save --package-lock=false homebridge@1.11.4
npm test
npm ci # Restore the locked development dependencies
```

### Debug Web UI

A standalone web UI is included for testing the core Sonos functionality without Homebridge.

1. **Run with VS Code**: Use the "Debug Web Server" launch configuration (F5) — this starts with debugger attached.
2. **Run from terminal**: `npm run web`
3. Open `http://localhost:3000`
4. Discover devices or enter an IP manually, then toggle Night Mode and Speech Enhancement.

### Link for local Homebridge testing

```bash
npm run build
npm link
# Then add the platform config to your Homebridge config.json
```

## Release

Releases are managed via GitHub Actions. To publish a new version:

1. Go to **Actions → Release** in GitHub
2. Click **Run workflow**
3. Select the version bump type (patch / minor / major)
4. Enter changelog entries
5. The workflow will build, test, bump the version, create a GitHub Release, and publish to npm

> **Note**: Publishing uses npm trusted publishing (OIDC), not an `NPM_TOKEN` secret.
> Configure a trusted publisher for this package on npm, selecting this GitHub repository and the `release.yml` workflow.
> The workflow grants `id-token: write` and runs on Node 24 with npm 11; the npm version must support trusted publishing (11.5.1+).
> See [npm's trusted publishing setup](https://docs.npmjs.com/trusted-publishers/).

## License

MIT
