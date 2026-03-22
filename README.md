# Claude Code Live Monitor

**Real-time file monitoring, diffs, live stats, heatmaps, and session replay for Claude Code CLI.**

Claude Code Live Monitor is a VS Code extension that watches every file change in your workspace as Claude Code works on your project. It captures before/after snapshots, computes diffs, tracks statistics, and presents everything in a beautiful, interactive dashboard.

---

## How to Access the Monitor

There are **5 ways** to access the monitor. The recommended approach depends on your workflow:

### 1. External Browser Window (RECOMMENDED)

> **Best for multi-monitor setups.** Opens the full dashboard in your default browser as a standalone window. This is the most convenient option because it does NOT interfere with VS Code or with your Claude Code / AI agent communication.

| Method | How |
|--------|-----|
| **Keyboard shortcut** | `Ctrl+Alt+B` (`Cmd+Alt+B` on Mac) |
| **Command Palette** | `Ctrl+Shift+P` → type "Browser" → select **Claude Code Live Monitor: Open in Browser (External Window)** |
| **Editor title bar** | Click the external link icon ($(link-external)) in the top-right corner of any editor tab |
| **Activity Bar sidebar** | Click the eye icon in the left Activity Bar → click **"Open in Browser (2nd Monitor)"** button |

The browser window connects via WebSocket and receives all file events and statistics in real-time. You can drag it to a second monitor while keeping VS Code focused on your work.

### 2. VS Code Panel (Internal)

Opens the full dashboard as a tab inside VS Code.

| Method | How |
|--------|-----|
| **Keyboard shortcut** | `Ctrl+Alt+M` (`Cmd+Alt+M` on Mac) |
| **Command Palette** | `Ctrl+Shift+P` → type "Open Panel" → select **Claude Code Live Monitor: Open Panel** |
| **Editor title bar** | Click the eye icon ($(eye)) in the top-right corner of any editor tab |
| **Activity Bar sidebar** | Click the eye icon in the left Activity Bar → click **"Open Full Dashboard"** button |

### 3. Activity Bar Sidebar (Quick Glance)

A mini dashboard always available in the VS Code sidebar. Shows:
- Live stats (changes, lines added/removed, lines/min)
- Recent file changes feed
- Quick action buttons (Open Dashboard, Pause/Resume, Open in Browser)

**How to access:** Click the Claude Code Live Monitor eye icon in the left Activity Bar (vertical icon strip).

### 4. Status Bar (Ambient Info)

Always visible at the bottom of VS Code:
- Live change count and total lines
- Current coding speed (lines/min)
- Color changes based on recent activity
- Click to open the internal panel

### 5. Command Palette

All commands are available via `Ctrl+Shift+P`:

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `Claude Code Live Monitor: Open in Browser (External Window)` | `Ctrl+Alt+B` | **Open in browser (recommended)** |
| `Claude Code Live Monitor: Open Panel` | `Ctrl+Alt+M` | Open dashboard inside VS Code |
| `Claude Code Live Monitor: Pause/Resume` | — | Toggle file monitoring |
| `Claude Code Live Monitor: Clear Session` | — | Clear all history and reset stats |
| `Claude Code Live Monitor: Start Replay` | — | Open panel and start replay |
| `Claude Code Live Monitor: Export Session Log` | — | Export session as JSON/Markdown/clipboard |
| `Claude Code Live Monitor: Toggle Sounds` | — | Enable/disable ambient sounds |

---

## Features

### Live Feed
Real-time list of all file changes with:
- Event type indicators (created / modified / deleted)
- Language badges with per-language colors
- Line counts (+added / -removed)
- Timestamps and recency indicators
- Filters by type, language, and filename

### Diff Viewer
Side-by-side before/after comparison:
- Syntax-highlighted code
- Line numbers on both sides
- Green/red highlighting for additions and removals
- Navigation between changes
- Copy diff or new code to clipboard

### Stats Dashboard
Animated real-time statistics:
- Lines written and removed (animated counters)
- Files created, modified, and deleted
- Session duration and coding speed (lines/min)
- Activity bar chart (last 30 minutes)
- Language breakdown donut chart
- Token estimation with cost calculator (Opus / Sonnet / Haiku pricing)

### File Heatmap
Visual heat map of file activity:
- Color-coded intensity bars (blue -> yellow -> orange -> red)
- Change count, net lines, and timestamps per file
- Mini activity charts per file
- Sortable by changes, recency, or name

### Session Replay
Replay all changes like a movie:
- Play / Pause / Stop controls
- Speed control: 0.5x, 1x, 2x, 5x
- Scrubable progress bar
- Shows diff for each change chronologically

### Animated File Tree
Workspace tree that comes alive:
- Files fade in green when created
- Modified files pulse with golden border
- Deleted files flash red and fade out
- Size indicators proportional to change count

### Ambient Sounds (Optional)
Subtle audio feedback via Web Audio API:
- Rising chime on file creation
- Soft click on modification
- Descending tone on deletion
- Volume control, disabled by default

### Export & Share
Export your session data:
- **JSON**: Full structured log with diffs and metadata
- **Markdown**: Human-readable session report
- **Clipboard**: Quick summary one-liner

---

## Installation

### From VSIX (local)

```bash
# 1. Clone and build
cd claude-code-live-monitor
npm install
npm run build

# 2. Package
npx vsce package --allow-missing-repository

# 3. Install in VS Code
code --install-extension claude-code-live-monitor-0.1.0.vsix --force
```

### Development Mode

```bash
cd claude-code-live-monitor
npm install
npm run compile
# Press F5 in VS Code -> opens Extension Development Host
```

For live reloading during development:

```bash
npm run watch
```

---

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `claude-monitor.enabled` | boolean | `true` | Enable or disable file monitoring |
| `claude-monitor.soundEnabled` | boolean | `false` | Enable ambient sound feedback |
| `claude-monitor.soundVolume` | number | `30` | Sound volume (0-100) |
| `claude-monitor.ignoredPaths` | string[] | `[]` | Additional paths to ignore (glob patterns) |
| `claude-monitor.showNotifications` | boolean | `false` | Show VS Code toast notifications |
| `claude-monitor.maxHistoryItems` | number | `1000` | Max change events in history |
| `claude-monitor.tokenCostModel` | string | `"sonnet"` | Model for cost estimation: `sonnet`, `opus`, `haiku` |

Settings can also be configured from the **Settings** tab inside the monitor panel.

---

## How It Works

1. **Snapshot Cache**: On activation, the extension caches the content of all open files and lazily caches workspace files in the background.

2. **File Watching**: Uses `vscode.workspace.createFileSystemWatcher` to detect all file changes in the workspace.

3. **Diff Computation**: When a file changes, the cached content (before) is compared with the current disk content (after) using the Myers diff algorithm.

4. **Real-time Updates**: Diffs, stats, and events are pushed to the webview panel via `postMessage` and to the external browser via WebSocket.

### External Browser Architecture

When you open the monitor in an external browser window:
- A lightweight HTTP server starts on a random localhost port
- The full monitor UI is served as a standalone HTML page
- A WebSocket connection streams all events and stats in real-time
- Auto-reconnect if the connection drops
- No dependencies required (raw RFC 6455 WebSocket implementation)

### Ignored by default
- `.git/` directory
- `node_modules/`
- `dist/` and `.next/`
- `__pycache__/`
- Binary files (images, fonts, executables, archives, etc.)
- Files larger than 5MB

---

## Token Cost Estimation

The extension estimates Claude API costs based on the volume of code changes:

| Model | Input (per M tokens) | Output (per M tokens) |
|-------|---------------------|----------------------|
| Claude Opus 4.6 | $5.00 | $25.00 |
| Claude Sonnet 4.6 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $0.25 | $1.25 |

**Note**: This is a rough estimate based on ~3.5 characters per token. Actual costs depend on the full conversation context, not just code output.

---

## Keyboard Shortcuts Summary

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+B` | Open in external browser (recommended) |
| `Ctrl+Alt+M` | Open panel inside VS Code |
| `Ctrl+Shift+P` | Command Palette (search any command) |

---

## Requirements

- VS Code 1.85.0 or newer
- Works on Windows, macOS, and Linux

---

## License

MIT
