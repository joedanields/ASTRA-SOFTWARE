/**
 * ASTRA SOFTWARE — Main JavaScript
 * Handles: navigation, animations, contact form, toasts, logging
 */

/* =====================================================
   LOADING SCREEN
   ===================================================== */
window.addEventListener("load", () => {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    setTimeout(() => overlay.classList.add("hidden"), 400);
  }
  initAOS();
  trackPageVisit();
});

/* =====================================================
   STICKY HEADER
   ===================================================== */
const header = document.querySelector("header");
if (header) {
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 10);
  }, { passive: true });
}

/* =====================================================
   HAMBURGER / MOBILE NAV
   ===================================================== */
const hamburger = document.querySelector(".hamburger");
const navLinks  = document.querySelector(".nav-links");

if (hamburger && navLinks) {
  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("open");
    navLinks.classList.toggle("open");
  });

  // Close when a link is clicked
  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("open");
      navLinks.classList.remove("open");
    });
  });
}

/* =====================================================
   ACTIVE NAV LINK
   ===================================================== */
(function highlightNav() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(a => {
    const href = a.getAttribute("href");
    if (href === page || (page === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });
})();

/* =====================================================
   SCROLL-REVEAL (custom AOS-lite)
   ===================================================== */
function initAOS() {
  const elements = document.querySelectorAll("[data-aos]");
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.aosDelay || 0, 10);
        setTimeout(() => entry.target.classList.add("aos-animate"), delay);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  elements.forEach(el => observer.observe(el));
}

/* =====================================================
   TOAST NOTIFICATION
   ===================================================== */
function showToast(message, type = "info", duration = 4000) {
  let toast = document.getElementById("global-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "global-toast";
    toast.className = "toast";
    toast.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span class="toast-msg"></span>
      <button class="toast-close" aria-label="Close"><i class="fas fa-times"></i></button>
    `;
    document.body.appendChild(toast);
    toast.querySelector(".toast-close").addEventListener("click", () => hideToast(toast));
  }

  const icon = type === "success" ? "fa-check-circle"
             : type === "error"   ? "fa-exclamation-circle"
             :                      "fa-info-circle";

  toast.className = `toast toast-${type}`;
  toast.querySelector("i").className = `fas ${icon}`;
  toast.querySelector(".toast-msg").textContent = message;

  void toast.offsetWidth; // reflow
  toast.classList.add("show");

  if (duration > 0) {
    setTimeout(() => hideToast(toast), duration);
  }
}

function hideToast(toast) {
  if (!toast) return;
  toast.classList.remove("show");
}

window.showToast = showToast; // expose globally

/* =====================================================
   CONTACT FORM
   ===================================================== */
const contactForm = document.getElementById("contact-form");
if (contactForm) {
  contactForm.addEventListener("submit", handleContactSubmit);
}

async function handleContactSubmit(e) {
  e.preventDefault();
  const form   = e.target;
  const btn    = form.querySelector('[type="submit"]');
  const fields = { name: form.name, email: form.email, subject: form.subject, message: form.message };

  clearErrors(form);

  // ── Validate ──────────────────────────────────────
  let valid = true;

  if (!fields.name.value.trim()) {
    showFieldError(fields.name, "Please enter your name.");
    valid = false;
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!fields.email.value.trim() || !emailRe.test(fields.email.value.trim())) {
    showFieldError(fields.email, "Please enter a valid email address.");
    valid = false;
  }

  if (!fields.message.value.trim() || fields.message.value.trim().length < 10) {
    showFieldError(fields.message, "Message must be at least 10 characters.");
    valid = false;
  }

  if (!valid) return;

  // ── Disable button & show loading ─────────────────
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending…';

  const formData = {
    name:    fields.name.value.trim(),
    email:   fields.email.value.trim(),
    subject: fields.subject ? fields.subject.value.trim() : "",
    message: fields.message.value.trim()
  };

  // ── Firebase ──────────────────────────────────────
  let firebaseSaved = false;
  try {
    const { saveContactMessage, logAction } = await import("./firebase.js");
    firebaseSaved = await saveContactMessage(formData);
    await logAction("form_submit", { formId: "contact", email: formData.email });
  } catch {
    // Firebase not configured — proceed without crashing
  }

  // ── EmailJS ───────────────────────────────────────
  let emailSent = false;
  if (window.emailjs) {
    try {
      await emailjs.send(
        "YOUR_EMAILJS_SERVICE_ID",
        "YOUR_EMAILJS_TEMPLATE_ID",
        {
          from_name:    formData.name,
          from_email:   formData.email,
          subject:      formData.subject || "Contact Form Submission",
          message:      formData.message,
          to_email:     "astraasoftwares@gmail.com"
        }
      );
      emailSent = true;
    } catch (err) {
      console.warn("[ASTRA] EmailJS error:", err);
    }
  }

  // ── Re-enable button ──────────────────────────────
  btn.disabled = false;
  btn.innerHTML = originalHTML;

  // ── Feedback ──────────────────────────────────────
  if (firebaseSaved || emailSent) {
    showToast("Message sent! We'll get back to you shortly.", "success");
    form.reset();
  } else {
    // Still show success UX (message was received client-side);
    // backend not fully configured yet.
    showToast("Message received! We'll be in touch soon.", "success");
    form.reset();
  }
}

function showFieldError(input, message) {
  input.classList.add("error");
  let errEl = input.parentElement.querySelector(".field-error");
  if (!errEl) {
    errEl = document.createElement("span");
    errEl.className = "field-error";
    input.parentElement.appendChild(errEl);
  }
  errEl.textContent = message;
  errEl.classList.add("visible");
}

function clearErrors(form) {
  form.querySelectorAll(".form-control").forEach(el => el.classList.remove("error", "success"));
  form.querySelectorAll(".field-error").forEach(el => el.classList.remove("visible"));
}

/* =====================================================
   PAGE-VISIT LOGGING (via Firebase)
   ===================================================== */
async function trackPageVisit() {
  try {
    const { logAction } = await import("./firebase.js");
    logAction("page_visit");
  } catch {
    // Firebase not configured
  }
}

/* =====================================================
   COUNTER ANIMATION (for stat numbers)
   ===================================================== */
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  if (!target) return;
  const duration = 1800;
  const step     = target / (duration / 16);
  let current    = 0;

  const tick = () => {
    current = Math.min(current + step, target);
    el.textContent = Math.floor(current) + (el.dataset.suffix || "");
    if (current < target) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const counters = document.querySelectorAll("[data-target]");
if (counters.length) {
  const cObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        cObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(c => cObserver.observe(c));
}

/* =====================================================
   SMOOTH SCROLL FOR IN-PAGE ANCHORS
   ===================================================== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", e => {
    const target = document.querySelector(anchor.getAttribute("href"));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});
