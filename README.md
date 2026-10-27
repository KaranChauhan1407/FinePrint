# FinePrint 🛡️

A 100% local, privacy-auditing browser extension that analyzes Terms of Service agreements and grades them from **A to F** using a local LLM—with zero cloud data leakage.

## Features
* **100% Offline:** Powered locally by `gemma3:4b` via Ollama. No external APIs or data tracking.
* **Negation-Aware Auditing:** Distinguishes between protective clauses (*"We never sell data"*) and privacy traps (*"We share data with partners"*).
* **Strict JSON Output:** Delivers a deterministic letter grade, 6-word verdict, top risks, and user protections.
* **C++ Test Bench:** Includes a custom C++ HTTP socket server (`port 3490`) for serving local policy test cases.

## Tech Stack
* **Extension:** Vanilla JS, HTML/CSS (Manifest V3)
* **Backend Test Server:** C++ Socket Server
* **AI Engine:** Ollama (`gemma3:4b`)

## Quick Start

### 1. Start the Local LLM
Install [Ollama](https://ollama.com/), pull the model, and start the server with CORS enabled for browser extensions:

**macOS / Linux:**
```bash
ollama pull gemma3:4b
OLLAMA_ORIGINS="*" ollama serve
```

**Windows (PowerShell):**
```powershell
ollama pull gemma3:4b
$env:OLLAMA_ORIGINS="*"; ollama serve
```
*(Note: If the Ollama desktop app or background service is already running, quit it from your system tray or stop the service first so `ollama serve` can bind to port `11434`).*

### 2. Run the C++ Test Server (Optional)
To test against the included local Terms of Service pages on `http://localhost:3490`, compile and run the socket server:
```bash
g++ server.cpp -o server
./server
```

### 3. Load the Extension
1. Open `chrome://extensions` or `brave://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the extension folder.
3. Open `http://localhost:3490/test-terms.html` (or any live Terms of Service webpage), click **FinePrint**, and hit **Scan**.
