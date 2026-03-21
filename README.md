# homebridge-sonos-soundfeatures

A [Homebridge](https://homebridge.io) plugin that exposes Sonos soundbar **Night Mode** and **Speech Enhancement** as HomeKit switches.

## Supported Devices

Night Mode and Speech Enhancement are available on Sonos soundbars:

- Sonos Playbar
- Sonos Beam (Gen 1 & 2)
- Sonos Arc / Arc Ultra
- Sonos Ray

## Installation

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
      "discoveryTimeout": 5,
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

### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `platform` | Yes | — | Must be `SonosSoundFeatures` |
| `name` | Yes | — | Display name for the platform |
| `discoveryTimeout` | No | `5` | Seconds to wait for auto-discovery (1–30) |
| `devices` | No | — | Array of `{ name, ip }` for manual device config. If provided, auto-discovery is skipped. |

If `devices` is omitted, Sonos devices will be auto-discovered on your local network.

## Development

### Prerequisites

- Node.js 18, 20, or 22
- npm

### Build

```bash
npm install
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

> **Note**: Publishing to npm requires the `NPM_TOKEN` repository secret to be configured.

## License

MIT
