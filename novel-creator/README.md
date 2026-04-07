# Novel Creator

Automated novel creation system with multi-agent workflow, supporting both illustrated novels and interactive fiction.

## Directory Structure

```
novel-creator/
├── src/                    # Core source code
│   ├── modules/            # Modular source (24 JS files)
│   │   ├── config.js       - CONFIG global constants
│   │   ├── errors.js       - Errors object
│   │   ├── state.js       - WORKFLOW_STATE global state
│   │   ├── utils.js       - Utils object
│   │   ├── config-parser.js - ConfigParser
│   │   ├── indexeddb.js   - IndexedDBWrapper
│   │   ├── storage.js     - Storage wrapper
│   │   ├── mapping-manager.js - MappingManager
│   │   ├── worldbook.js   - WorldBook object
│   │   ├── branch.js      - BranchManager
│   │   ├── agent-state.js - AgentState
│   │   ├── api.js         - API wrapper
│   │   ├── preflight.js   - PreflightChecker
│   │   ├── notify.js      - Notify object
│   │   ├── modal.js       - Modal object
│   │   ├── snapshot.js    - SnapshotManager
│   │   ├── media-store.js - MediaStore
│   │   ├── styles.js      - Styles object
│   │   ├── ui.js          - UI object
│   │   ├── config-editor.js - ConfigEditor
│   │   ├── galgame.js     - Galgame (interactive fiction)
│   │   ├── history-ui.js  - HistoryUI
│   │   └── workflow.js    - WorkflowEngine
│   ├── auto.js             # Bundled single file (legacy mode)
│   ├── build.js            # Build script
│   └── manifest.js         # Module manifest
│
├── agents/                 # Agent role cards (15 total)
│   ├── general/            # General agents (10)
│   ├── illustrated-novel/  # Illustrated novel agents (2)
│   └── interactive/       # Interactive fiction agents (3)
│
├── configs/                # Preset workflow configurations
│
├── themes/                 # UI themes (10 color schemes)
│
├── docs/                   # Documentation & guides
│
├── proxy/                  # Local backend proxy server
│   ├── server.js           # Express proxy server
│   └── server-me.js        # Media export server
│
└── interactive/            # Interactive fiction components
    └── control.js          # UI control library
```

## Core Technologies

- **Tampermonkey/Violentmonkey** - UserScript running in SillyTavern
- **JS-Slash-Runner Plugin** - Provides TavernHelper API
- **Electron 29.x** - Desktop application wrapper
- **Express** - Local proxy for API requests

## Module Loading

### Development Mode (Electron)
```javascript
// packageFramework/scripts/manifest.js
const manifest = require('./manifest');
manifest.useSrcModules = true;  // Load from src/ directory
```

### Production Mode (Tampermonkey)
```javascript
// @require ./src/modules/config.js
// @require ./src/modules/state.js
// ... (load in order defined in manifest.js)
```

### Bundled Mode
```javascript
// @require ./src/auto.js
```

## Related Projects

- `../packageFramework/` - Electron desktop packaging framework
