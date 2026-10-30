---
name: fineprint-audit
description: Audit a Terms of Service or Privacy Policy (URL or file) and grade it A–F, or scan a screenshot for UI dark patterns, using a local open-weight Gemma 4 model through Ollama. Use when the user asks "is this ToS safe?", "what am I agreeing to?", or wants a page checked for dark patterns.
---

# FinePrint audit skill

Runs entirely on the user's machine with an open-weight model (Gemma 4 via Ollama). No document or screenshot is sent to a cloud API.

## Requirements
- Ollama running locally (`ollama serve` or the Ollama desktop app)
- A Gemma 4 model pulled: `ollama pull gemma4:e2b` (or `gemma4:e4b` for better quality)
- Python 3 (standard library only)

## Steps
1. Get the source: a URL to the terms page, a local text/HTML file, or a screenshot.
2. Run the script from this skill's folder:
   - Terms: `python3 scripts/audit.py <url-or-file> [--lang Hindi] [--model gemma4:e4b]`
   - Screenshot: `python3 scripts/audit.py --image <file.png>`
3. The script prints JSON:
   - terms → `grade`, `summary`, `findings[]` with `quote`, `severity` (high/medium/safe), `category`, `plain_english`
   - screenshot → `risk`, `verdict`, `dark_patterns[]` with `name`, `evidence`, `severity`
4. Report to the user: the grade first, then the high-severity findings with their quotes, then protections. Say clearly that this is an automated reading, not legal advice.

## Notes
- If the script says it cannot reach Ollama, ask the user to start Ollama.
- Very long policies are truncated to the first ~9,000 characters of clause-like text; mention this when the document is long.
- Set `FINEPRINT_MODEL` or `OLLAMA_HOST` env vars to change defaults.
