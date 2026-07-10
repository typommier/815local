/**
 * Scout, the 815local.com concierge chat widget
 * Usage: add before </body> on any page —
 *   <script src="/assets/js/815local-widget.js"></script>
 * (already points at the live Supabase endpoint by default — no data-api needed
 * unless you want to override it, e.g. for a staging environment)
 */
(function () {
  // document.currentScript is null when the script is loaded async/deferred or
  // re-executed, so fall back to locating our own tag by src.
  const scriptTag =
    document.currentScript ||
    document.querySelector('script[src*="815local-widget.js"]');
  const API_URL =
    (scriptTag && scriptTag.getAttribute("data-api")) ||
    "https://ubcagczbnxfpoligmsqq.supabase.co/functions/v1/chat";

  const LOGO_URL = "/uploads/scout-icon.svg";
  const CHARCOAL = "#3A3532";
  const CREAM = "#F4EDE1";
  const BURNT_ORANGE = "#C4622D";

  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_EXCHANGES = 4;

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
    .ol-msg{max-width:85%;font-size:13px;line-height:1.45;padding:8px 11px;border-radius:8px;white-space:pre-wrap;}
    .ol-msg.bot{align-self:flex-start;background:${CREAM};border:1px solid #ded6c2;}
    .ol-msg.user{align-self:flex-end;background:${CHARCOAL};color:${CREAM};}
    .ol-turn{align-self:flex-start;max-width:85%;display:flex;flex-direction:column;gap:4px;}
    .ol-turn .ol-msg{max-width:none;align-self:auto;}
    .ol-candidates{display:flex;flex-direction:column;gap:3px;}
    .ol-candidate{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;font-size:12.5px;}
    .ol-candidate a,.ol-candidate .ol-candidate-name{color:${BURNT_ORANGE};font-weight:700;text-decoration:none;}
    .ol-candidate a:hover{text-decoration:underline;}
    .ol-candidate .ol-phone{color:#8a8175;font-size:11.5px;}
    .ol-typing{align-self:flex-start;display:flex;gap:4px;padding:10px 12px;background:${CREAM};
      border:1px solid #ded6c2;border-radius:8px;}
    .ol-typing span{width:6px;height:6px;border-radius:50%;background:#b3a992;animation:ol-blink 1.2s infinite;}
    .ol-typing span:nth-child(2){animation-delay:.2s;}
    .ol-typing span:nth-child(3){animation-delay:.4s;}
    @keyframes ol-blink{0%,60%,100%{opacity:.25;}30%{opacity:1;}}
    #ol-input-row{display:flex;gap:6px;padding:10px;border-top:1px solid #ded6c2;background:#fff;}
    #ol-input{flex:1;border:1px solid #ded6c2;border-radius:18px;padding:8px 12px;font-size:13px;outline:none;}
    #ol-input:focus{border-color:${BURNT_ORANGE};}
    #ol-input:disabled{background:#f3efe6;}
    #ol-send{background:${BURNT_ORANGE};border:none;width:34px;height:34px;border-radius:50%;cursor:pointer;
      display:flex;align-items:center;justify-content:center;}
    #ol-send:disabled{opacity:.5;cursor:default;}
    #ol-send svg{width:14px;height:14px;fill:${CREAM};}
  `;

  // The rest of the widget touches document.body, so defer it until the body
  // exists (a head/async load would otherwise throw on insertAdjacentHTML).
  function init() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <button id="ol-launcher" aria-label="Chat with Scout">
        <img src="${LOGO_URL}" alt="Scout">
      </button>
      <div id="ol-panel" role="dialog" aria-label="Scout concierge chat">
        <div id="ol-head">
          <div class="mark"><img src="${LOGO_URL}" alt="Scout"></div>
          <div class="title">Scout<div class="sub">Ask about hours, food, or a service</div></div>
          <button id="ol-close" aria-label="Close chat">✕</button>
        </div>
        <div id="ol-body" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div id="ol-input-row">
          <input id="ol-input" placeholder="Ask a question…" autocomplete="off" aria-label="Message Scout">
          <button id="ol-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button>
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
    // Page-load scoped conversation memory, resets on refresh. history holds the
    // visible back-and-forth so the concierge has real continuity;
    // lastCandidates holds the exact real businesses the server used last turn,
    // echoed back so a bare follow-up ("any others?", "yes", "contact info")
    // picks up the same thread instead of losing context.
    let history = [];
    let lastCandidates = [];
    // Serializes turns: while one request is in flight, further sends are
    // ignored so responses can't arrive out of order and corrupt history /
    // lastCandidates.
    let sending = false;

    function addMsg(text, who) {
      const div = document.createElement("div");
      div.className = "ol-msg " + who;
      div.textContent = text;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    // Renders one bot turn as a single container: the reply text plus its
    // candidate rows as children of the same wrapper, so it's always clear which
    // links/phone numbers belong to which reply. Built entirely from the
    // server's structured `candidates` field via safe DOM construction (never
    // innerHTML), so it never parses anything Claude writes in its reply text.
    function addBotTurn(text, candidates) {
      const turn = document.createElement("div");
      turn.className = "ol-turn";
      const msgDiv = document.createElement("div");
      msgDiv.className = "ol-msg bot";
      msgDiv.textContent = text;
      turn.appendChild(msgDiv);

      // Dedupe only within this single turn (a business shouldn't render twice
      // in one reply); across turns we intentionally re-show a link, since
      // never re-showing a business the visitor asks about again is worse.
      const seen = new Set();
      const fresh = (candidates || []).filter((c) => {
        if (!c || !(c.url || c.phone)) return false;
        const key = c.name || `${c.url || ""}|${c.phone || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (fresh.length) {
        const info = document.createElement("div");
        info.className = "ol-candidates";
        fresh.forEach((c) => {
          const row = document.createElement("div");
          row.className = "ol-candidate";
          const safeUrl = safeHttpsUrl(c.url);
          if (safeUrl) {
            const a = document.createElement("a");
            a.textContent = c.name || safeUrl;
            a.href = safeUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            row.appendChild(a);
          } else {
            const span = document.createElement("span");
            span.className = "ol-candidate-name";
            span.textContent = c.name || "";
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

    // Only ever render https links, and only from a real absolute URL, so a bad
    // or hostile `url` value can't become a javascript:/data: click target.
    function safeHttpsUrl(raw) {
      if (!raw || typeof raw !== "string") return null;
      try {
        const u = new URL(raw);
        return u.protocol === "https:" ? u.href : null;
      } catch (e) {
        return null;
      }
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
        input.focus();
      }
    });
    closeBtn.addEventListener("click", () => panel.classList.remove("open"));

    // Auto-open once per browsing session, after a short delay. sessionStorage
    // (not localStorage) resets each new tab/session but doesn't re-pop on every
    // page as a visitor browses within the same session.
    const SESSION_AUTO_OPEN_KEY = "ol_scout_auto_opened";
    try {
      if (!sessionStorage.getItem(SESSION_AUTO_OPEN_KEY)) {
        // Claim the slot now, not inside the timeout, so navigating to another
        // page within the delay window can't schedule a second auto-open.
        sessionStorage.setItem(SESSION_AUTO_OPEN_KEY, "1");
        setTimeout(() => {
          if (!greeted) openPanelAndGreet();
        }, 2500);
      }
    } catch (e) {
      // sessionStorage unavailable (private browsing, etc.) - just skip auto-open
    }

    async function send() {
      const text = input.value.trim();
      if (!text || sending) return;

      sending = true;
      input.disabled = true;
      sendBtn.disabled = true;
      addMsg(text, "user");
      input.value = "";

      const typing = document.createElement("div");
      typing.className = "ol-typing";
      typing.setAttribute("aria-label", "Scout is typing");
      typing.innerHTML = "<span></span><span></span><span></span>";
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: history.slice(-2 * MAX_EXCHANGES),
            lastCandidates,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          addMsg("Scout hit a snag on that one. Please try again in a moment.", "bot");
          return;
        }

        const data = await res.json().catch(() => null);
        const reply = data && data.reply ? data.reply : "Sorry, something went wrong.";
        // Only replace the carried candidates when this turn actually returned
        // some, so a candidate-less turn doesn't wipe the follow-up context.
        if (data && Array.isArray(data.candidates) && data.candidates.length) {
          lastCandidates = data.candidates;
        }
        addBotTurn(reply, data && Array.isArray(data.candidates) ? data.candidates : []);
        history.push({ role: "user", content: text }, { role: "assistant", content: reply });
        if (history.length > 2 * MAX_EXCHANGES) {
          history = history.slice(-2 * MAX_EXCHANGES);
        }
      } catch (e) {
        addMsg("Couldn't reach the concierge right now, try again in a moment.", "bot");
      } finally {
        clearTimeout(timer);
        typing.remove();
        sending = false;
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }

    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
