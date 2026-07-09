/**
 * Scout, the 815local.com concierge chat widget
 * Usage: add before </body> on any page —
 *   <script src="/815local-widget.js"></script>
 * (already points at the live Supabase endpoint by default — no data-api needed
 * unless you want to override it, e.g. for a staging environment)
 */
(function () {
  const scriptTag = document.currentScript;
  const API_URL =
    scriptTag.getAttribute("data-api") ||
    "https://ubcagczbnxfpoligmsqq.supabase.co/functions/v1/chat";

  const LOGO_URL = "/uploads/scout-icon.svg";
  const CHARCOAL = "#3A3532";
  const CREAM = "#F4EDE1";
  const BURNT_ORANGE = "#C4622D";
  const BURNT_ORANGE_LIGHT = "#e07a45";

  const css = `
    #ol-launcher{position:fixed;bottom:22px;right:22px;width:60px;height:60px;border-radius:50%;
      border:none;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25);padding:0;
      z-index:9999;display:flex;align-items:center;justify-content:center;overflow:hidden;}
    #ol-launcher img{width:100%;height:100%;display:block;}
    #ol-panel{position:fixed;bottom:22px;right:22px;width:340px;height:480px;max-height:75vh;
      background:${CREAM};border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,.3);
      display:flex;flex-direction:column;overflow:hidden;z-index:9999;font-family:system-ui,sans-serif;
      opacity:0;pointer-events:none;transform:translateY(14px);transition:opacity .18s,transform .18s;}
    #ol-panel.open{opacity:1;pointer-events:auto;transform:translateY(0);}
    #ol-head{background:${CHARCOAL};color:${CREAM};padding:12px 14px;display:flex;align-items:center;gap:8px;
      border-bottom:3px solid ${BURNT_ORANGE};}
    #ol-head .mark{width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;}
    #ol-head .mark img{width:100%;height:100%;display:block;}
    #ol-head .title{flex:1;font-size:13.5px;font-weight:600;}
    #ol-head .sub{font-size:10.5px;color:#c9c2b3;}
    #ol-close{background:none;border:none;color:#d9d3c4;cursor:pointer;font-size:16px;}
    #ol-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#fff;}
    .ol-msg{max-width:85%;font-size:13px;line-height:1.45;padding:8px 11px;border-radius:8px;}
    .ol-msg.bot{align-self:flex-start;background:${CREAM};border:1px solid #ded6c2;}
    .ol-msg.user{align-self:flex-end;background:${CHARCOAL};color:${CREAM};}
    .ol-turn{align-self:flex-start;max-width:85%;display:flex;flex-direction:column;gap:4px;}
    .ol-turn .ol-msg{max-width:none;align-self:auto;}
    .ol-candidates{display:flex;flex-direction:column;gap:3px;}
    .ol-candidate{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;font-size:12.5px;}
    .ol-candidate a,.ol-candidate .ol-candidate-name{color:${BURNT_ORANGE};font-weight:700;text-decoration:none;}
    .ol-candidate a:hover{text-decoration:underline;}
    .ol-candidate .ol-phone{color:#8a8175;font-size:11.5px;}
    #ol-input-row{display:flex;gap:6px;padding:10px;border-top:1px solid #ded6c2;background:#fff;}
    #ol-input{flex:1;border:1px solid #ded6c2;border-radius:18px;padding:8px 12px;font-size:13px;outline:none;}
    #ol-input:focus{border-color:${BURNT_ORANGE};}
    #ol-send{background:${BURNT_ORANGE};border:none;width:34px;height:34px;border-radius:50%;cursor:pointer;
      display:flex;align-items:center;justify-content:center;}
    #ol-send svg{width:14px;height:14px;fill:${CREAM};}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <button id="ol-launcher" aria-label="Chat with Scout">
      <img src="${LOGO_URL}" alt="Scout">
    </button>
    <div id="ol-panel">
      <div id="ol-head">
        <div class="mark"><img src="${LOGO_URL}" alt="Scout"></div>
        <div class="title">Scout<div class="sub">Ask about hours, food, or a service</div></div>
        <button id="ol-close">✕</button>
      </div>
      <div id="ol-body"></div>
      <div id="ol-input-row">
        <input id="ol-input" placeholder="Ask a question…" autocomplete="off">
        <button id="ol-send"><svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button>
      </div>
    </div>
  `
  );

  const launcher = document.getElementById("ol-launcher");
  const panel = document.getElementById("ol-panel");
  const closeBtn = document.getElementById("ol-close");
  const body = document.getElementById("ol-body");
  const input = document.getElementById("ol-input");
  const sendBtn = document.getElementById("ol-send");
  let greeted = false;
  // Page-load scoped conversation memory, resets on refresh just like
  // `greeted` above. history holds the visible back-and-forth so the
  // concierge has real continuity; lastCandidates holds the exact real
  // businesses the server used last turn, echoed back so a bare follow-up
  // ("any others?", "yes", "contact info") can pick up the same thread
  // instead of losing all context.
  let history = [];
  let lastCandidates = [];
  // Names of businesses already shown a candidate card, page-load scoped
  // like history/lastCandidates, so a long multi-topic conversation doesn't
  // re-print the same links/phone every time a business is mentioned again.
  let shownCandidateNames = new Set();
  const MAX_EXCHANGES = 4;

  function addMsg(text, who) {
    const div = document.createElement("div");
    div.className = "ol-msg " + who;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  // Renders one bot turn as a single container: the reply text plus any
  // fresh (not-yet-shown) candidate rows as children of that same wrapper,
  // so it's always visually unambiguous which links/phone numbers belong to
  // which reply, even deep into a long, multi-topic conversation. Built
  // entirely from the server's structured `candidates` field via safe DOM
  // construction (never innerHTML), so this never depends on (or parses)
  // anything Claude writes in its own reply text.
  function addBotTurn(text, candidates) {
    const turn = document.createElement("div");
    turn.className = "ol-turn";
    const msgDiv = document.createElement("div");
    msgDiv.className = "ol-msg bot";
    msgDiv.textContent = text;
    turn.appendChild(msgDiv);

    const fresh = (candidates || []).filter(
      (c) => c && (c.url || c.phone) && !shownCandidateNames.has(c.name)
    );
    if (fresh.length) {
      const info = document.createElement("div");
      info.className = "ol-candidates";
      fresh.forEach((c) => {
        shownCandidateNames.add(c.name);
        const row = document.createElement("div");
        row.className = "ol-candidate";
        if (c.url) {
          const a = document.createElement("a");
          a.textContent = c.name;
          a.href = c.url;
          row.appendChild(a);
        } else {
          const span = document.createElement("span");
          span.className = "ol-candidate-name";
          span.textContent = c.name;
          row.appendChild(span);
        }
        if (c.phone) {
          const phoneSpan = document.createElement("span");
          phoneSpan.className = "ol-phone";
          phoneSpan.textContent = c.phone;
          row.appendChild(phoneSpan);
        }
        info.appendChild(row);
      });
      turn.appendChild(info);
    }

    body.appendChild(turn);
    body.scrollTop = body.scrollHeight;
  }

  function openPanelAndGreet() {
    panel.classList.add("open");
    if (!greeted) {
      greeted = true;
      addMsg("Hey, I'm Scout! Ask me about hours, a type of food, or a local service, I'll pull from real 815local listings.", "bot");
    }
  }

  launcher.addEventListener("click", () => {
    if (panel.classList.contains("open")) {
      panel.classList.remove("open");
    } else {
      openPanelAndGreet();
    }
  });
  closeBtn.addEventListener("click", () => panel.classList.remove("open"));

  // Auto-open once per browsing session, after a short delay so it doesn't
  // feel jarring the instant a page loads. sessionStorage (not localStorage)
  // so it resets each new tab/session but doesn't re-pop on every page as a
  // visitor browses around the site within the same session.
  const SESSION_AUTO_OPEN_KEY = "ol_scout_auto_opened";
  try {
    if (!sessionStorage.getItem(SESSION_AUTO_OPEN_KEY)) {
      setTimeout(() => {
        if (!greeted) openPanelAndGreet();
        try {
          sessionStorage.setItem(SESSION_AUTO_OPEN_KEY, "1");
        } catch (e) {}
      }, 2500);
    }
  } catch (e) {
    // sessionStorage unavailable (private browsing, etc.) - just skip auto-open
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    addMsg(text, "user");
    input.value = "";
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: history.slice(-2 * MAX_EXCHANGES),
          lastCandidates,
        }),
      });
      const data = await res.json();
      const reply = data.reply || "Sorry, something went wrong.";
      lastCandidates = Array.isArray(data.candidates) ? data.candidates : [];
      addBotTurn(reply, lastCandidates);
      history.push({ role: "user", content: text }, { role: "assistant", content: reply });
    } catch (e) {
      addMsg("Couldn't reach the concierge right now, try again in a moment.", "bot");
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
})();
