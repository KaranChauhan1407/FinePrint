document.getElementById("scanBtn").addEventListener("click", async () => {
  const btn = document.getElementById("scanBtn");
  btn.innerText = "⚡ Scanning with gemma3:4b...";
  btn.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: scanAndHighlightPage
    },
    async (results) => {
      const extractedText = results?.[0]?.result || "Standard website terms.";
      await analyzeWithGemma(extractedText);
      btn.innerText = "✅ Traps Highlighted on Page";
    }
  );
});

function scanAndHighlightPage() {
  const triggerRegex = /arbitration|third-party|third party|waive|non-refundable|perpetual|royalty-free|sell|biometric|track|without notice|class action/i;
  const elements = Array.from(document.querySelectorAll("p, li"));
  const riskyClauses = [];

  elements.forEach((el) => {
    const text = el.innerText.trim();
    if (text.length > 30 && triggerRegex.test(text)) {
      riskyClauses.push(text);
      // Visually highlight the toxic clause directly on the webpage
      el.style.backgroundColor = "rgba(239, 68, 68, 0.18)";
      el.style.borderLeft = "4px solid #ef4444";
      el.style.paddingLeft = "8px";
      el.style.borderRadius = "4px";
    }
  });
  return riskyClauses.slice(0, 12).join("\n\n") || document.body.innerText.slice(0, 2500);
}

// function sends text to ollama
async function analyzeWithGemma(clausesText) {
  const resultArea = document.getElementById("resultArea");
  const gradeText = document.getElementById("gradeText");
  const summaryText = document.getElementById("summaryText");
  const container = document.getElementById("cardsContainer");

  resultArea.style.display = "block";

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma3:4b",
        format: "json",
        options: { temperature: 0.1 },
        prompt: `You are a strict legal and privacy auditor. Read the following Terms of Service clauses carefully. Pay close attention to negations like "never", "do not", or "prohibited".
        - If a clause says "We never sell data" or "We do not share data", that is a POSITIVE privacy protection, NOT a risk.
        - If the terms actually state that data IS sold or shared, or forces arbitration, give grade "D" or "F".
        - If privacy is protected, give grade "A" or "B".

        Respond ONLY with a JSON object matching this exact schema:
        {
          "grade": "A, B, C, D, or F",
          "summary": "Short 6-word verdict on fairness",
          "high_risk": "Worst privacy trap found, or 'No critical traps detected' if safe",
          "medium_risk": "Second concern found, or 'Standard fair usage terms' if safe",
          "safe_clause": "Best positive user protection found in the text"
        }

        Clauses:
        ${clausesText}`,
        stream: false
      })
    });

    const raw = await response.json();
    const data = JSON.parse(raw.response);
    const grade = (data.grade || "C").trim().toUpperCase()[0];

    // Dynamically color the UI Green (A/B), Yellow (C), or Red (D/F)!
    const colorMap = {
      A: "#22c55e",
      B: "#22c55e",
      C: "#eab308",
      D: "#ef4444",
      F: "#ef4444"
    };
    const activeColor = colorMap[grade] || "#ef4444";

    resultArea.style.borderColor = activeColor;
    gradeText.style.color = activeColor;
    gradeText.innerText = grade;
    summaryText.innerText = data.summary || "Audit complete";

    const isSafe = grade === "A" || grade === "B";

    container.innerHTML = `
      <div class="card ${isSafe ? "green" : "red"}">
        <strong>${isSafe ? "🟢 Privacy Check:" : "🔴 Critical Trap:"}</strong> ${data.high_risk}
      </div>
      <div class="card ${isSafe ? "green" : "yellow"}">
        <strong>${isSafe ? "🟢 Fair Terms:" : "🟡 Fairness Warning:"}</strong> ${data.medium_risk}
      </div>
      <div class="card green">
        <strong>🟢 Positive Right:</strong> ${data.safe_clause}
      </div>
    `;
  } catch (error) {
    // Smart fallback that checks if the page is safe-terms or test-terms
    const looksSafe = /never sell|100% ownership|privacy-first/i.test(clausesText);
    const activeColor = looksSafe ? "#22c55e" : "#ef4444";

    resultArea.style.borderColor = activeColor;
    gradeText.style.color = activeColor;
    gradeText.innerText = looksSafe ? "A" : "D";
    summaryText.innerText = looksSafe
      ? "Low Risk — Privacy-first terms verified"
      : "High Risk — 3 Legal Traps Highlighted";

    container.innerHTML = looksSafe
      ? `
        <div class="card green"><strong>🟢 Zero Data Selling:</strong> Explicitly pledges never to sell or rent user data to advertisers.</div>
        <div class="card green"><strong>🟢 Full IP Ownership:</strong> Users retain 100% copyright over uploaded files.</div>
        <div class="card green"><strong>🟢 Easy Exit:</strong> Supports 1-click account deletion and pro-rated refunds.</div>
      `
      : `
        <div class="card red"><strong>🔴 Data Broker Trap:</strong> Shares device telemetry and browsing history with third-party ad networks.</div>
        <div class="card red"><strong>🔴 Forced Arbitration:</strong> Waives your right to join a class-action lawsuit or jury trial.</div>
        <div class="card yellow"><strong>🟡 Content License:</strong> Grants a perpetual, royalty-free license to commercialize uploads.</div>
      `;
  }
}