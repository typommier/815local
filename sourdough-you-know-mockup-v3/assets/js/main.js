/* Sourdough You Know - shared site interactions */
(function () {
  "use strict";

  /* ---- Mobile nav toggle ---- */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") links.classList.remove("open");
    });
  }

  /* ---- Flyer lightbox ---- */
  var lb = document.querySelector(".lightbox");
  if (lb) {
    var lbImg = lb.querySelector("img");
    var openLightbox = function (src, alt) {
      lbImg.src = src;
      lbImg.alt = alt || "";
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
    };
    var closeLightbox = function () {
      lb.classList.remove("open");
      document.body.style.overflow = "";
    };
    document.querySelectorAll("[data-flyer]").forEach(function (el) {
      el.addEventListener("click", function () {
        var src = el.getAttribute("data-flyer");
        var img = el.querySelector("img");
        // only open if a real image is present (not the placeholder)
        if (img && img.complete && img.naturalWidth > 0) {
          openLightbox(src, img.alt);
        }
      });
    });
    lb.addEventListener("click", function (e) {
      if (e.target === lb || e.target.classList.contains("lightbox-close")) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLightbox();
    });
  }

  /* ---- Highlight the next upcoming market date ---- */
  /* Each .date-card carries data-date="YYYY-MM-DD". The first one that is
     today or later gets the "next" treatment; earlier ones get dimmed. */
  var cards = Array.prototype.slice.call(document.querySelectorAll(".date-card[data-date]"));
  if (cards.length) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var marked = false;
    cards.forEach(function (card) {
      var parts = card.getAttribute("data-date").split("-");
      var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      if (d < today) {
        card.classList.add("past");
      } else if (!marked) {
        card.classList.add("next");
        var flag = document.createElement("span");
        flag.className = "next-flag";
        flag.textContent = "Next market";
        card.appendChild(flag);
        marked = true;
        // surface the date anywhere with [data-next-market]
        var label = card.getAttribute("data-label");
        document.querySelectorAll("[data-next-market]").forEach(function (slot) {
          if (label) slot.textContent = label;
        });
      }
    });
  }

  /* ---- Contact form (mockup only) ---- */
  var form = document.querySelector("form[data-mock]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = form.querySelector("[data-form-msg]");
      if (msg) msg.style.display = "block";
      form.reset();
    });
  }

  /* ---- Footer year ---- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
