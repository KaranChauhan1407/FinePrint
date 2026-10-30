#!/usr/bin/env python3
"""FinePrint CLI: grade a Terms of Service / Privacy Policy with a local Gemma 4 model via Ollama.

Usage:
  python3 audit.py https://example.com/terms
  python3 audit.py path/to/terms.txt
  python3 audit.py --image screenshot.png        # visual dark-pattern scan
Options: --model gemma4:e2b  --lang English
Prints JSON to stdout. Standard library only.
"""
import argparse, base64, html, json, os, re, sys, urllib.error, urllib.request

OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
if not OLLAMA.startswith("http"):
    OLLAMA = "http://" + OLLAMA


def load_text(src: str) -> str:
    if re.match(r"https?://", src):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0 FinePrint"})
        raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    else:
        raw = open(src, encoding="utf-8", errors="ignore").read()
    raw = re.sub(r"(?is)<(script|style|nav|footer|header)[^>]*>.*?</\1>", " ", raw)
    text = html.unescape(re.sub(r"<[^>]+>", "\n", raw))
    return "\n".join(l.strip() for l in text.splitlines() if len(l.strip()) > 40)


def ask(model: str, prompt: str, images=None) -> dict:
    body = {"model": model, "prompt": prompt, "format": "json", "stream": False, "think": False,
            "options": {"temperature": 0.1, "num_ctx": 8192}}
    if images:
        body["images"] = images
    req = urllib.request.Request(f"{OLLAMA}/api/generate", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        out = json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        if "think" in e.read().decode().lower():
            body.pop("think")
            req = urllib.request.Request(f"{OLLAMA}/api/generate", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"})
            out = json.load(urllib.request.urlopen(req, timeout=300))
        else:
            raise
    return json.loads(out["response"])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("source", nargs="?", help="URL or text/HTML file")
    p.add_argument("--image", help="screenshot to scan for dark patterns")
    p.add_argument("--model", default=os.environ.get("FINEPRINT_MODEL", "gemma4:e4b"))
    p.add_argument("--lang", default="English")
    a = p.parse_args()

    if a.image:
        img = base64.b64encode(open(a.image, "rb").read()).decode()
        prompt = (f"Find manipulative UI dark patterns in this screenshot (hidden reject buttons, pre-ticked boxes, "
                  f"confirmshaming, fake urgency, hidden fees, auto-renewals). Only report what is visible. Answer in {a.lang}. "
                  'Respond ONLY with JSON: {"risk":"low|medium|high","verdict":"...","dark_patterns":[{"name":"...","evidence":"...","severity":"high|medium"}]}')
        print(json.dumps(ask(a.model, prompt, [img]), indent=2, ensure_ascii=False))
        return
    if not a.source:
        p.error("give a URL/file or --image")

    text = load_text(a.source)[:9000]
    prompt = f"""You are a strict consumer-rights and privacy auditor. Watch for negations ("we never sell data" is a protection).
Flag: data selling/sharing, forced arbitration, class-action waivers, perpetual content licenses, tracking (high);
non-refundable fees, silent price changes, vague retention (medium); real user protections (safe).
Grade A-F. Answer in {a.lang}. Respond ONLY with JSON:
{{"grade":"A|B|C|D|F","summary":"<=8 words","findings":[{{"quote":"short exact quote","severity":"high|medium|safe","category":"2-3 words","plain_english":"one sentence"}}]}}

Document:
{text}"""
    print(json.dumps(ask(a.model, prompt), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as e:
        sys.exit(f"Cannot reach Ollama at {OLLAMA} ({e}). Start the Ollama app or run `ollama serve`.")
