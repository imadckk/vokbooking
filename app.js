// ============================================================================
// Supabase client (ESM CDN — no build step)
// ============================================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = window.__SUPABASE_URL__ || "https://tkgdtcvunikiqyzjevgd.supabase.co";
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrZ2R0Y3Z1bmlraXF5empldmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NTI0OTksImV4cCI6MjExMDEyODQ5OX0.NYM4hwBiGHHX9PF0a5TgAkZXT2N3di5S_uZLugZwlU8";
const PAYMENT_URL = ""; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// MYT helpers
// ============================================================================
function todayMYT() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return parts; // "YYYY-MM-DD"
}
function nowMYT() {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
  return t; // "HH:MM"
}
function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00+08:00");
  return new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(d);
}

// ============================================================================
// Flow state
// ============================================================================
const state = {
  step: 1,
  selectedClass: null,
  displayedMonth: (() => { const d = todayMYT(); const [y,m] = d.split("-"); return { year: +y, month: +m }; })(),
  selectedDate: null,
  selectedWindow: null,
  availability: [],
  windowsForDate: [],
  classes: [],
  form: { ic: "", name: "", phone: "" },
  studentStatus: null,
  formErrors: {},
  banner: null,
  isSubmitting: false,
  showConfirmModal: false,
  bookingResult: null,
  // cancel flow
  cancelView: "search", // search | cards
  cancelSearch: { ic: "", phone: "" },
  cancelBookings: [],
  cancelBanner: null,
  showCancelModal: null, // booking object or null
};

const root = document.getElementById("app");
function render() { root.innerHTML = renderShell(); attachEvents(); }

// ============================================================================
// Shell + progress bar
// ============================================================================
function renderShell() {
  if (state.view === "cancel") return renderCancelShell();
  return `
    <div class="mx-auto max-w-md min-h-dvh flex flex-col">
      ${renderProgressBar()}
      <main class="flex-1 px-4 py-4">
        ${state.step === 1 ? renderStep1() : ""}
        ${state.step === 2 ? renderStep2() : ""}
        ${state.step === 3 ? renderStep3() : ""}
        ${state.step === 4 ? renderStep4() : ""}
      </main>
    </div>
  `;
}

function renderProgressBar() {
  const steps = ["Class", "Date & Time", "Details", "Done"];
  const nodes = steps.map((label, i) => {
    const n = i + 1;
    const st = n < state.step ? "completed" : n === state.step ? "current" : "upcoming";
    const line = i < steps.length - 1
      ? `<div class="progress-line" data-completed="${n < state.step}"></div>` : "";
    return `
      <div class="flex flex-col items-center gap-1">
        <div class="progress-node" data-state="${st}" aria-current="${n === state.step ? "step" : "false"}">
          ${st === "completed" ? "✓" : n}
        </div>
        <span class="text-[10px] ${st === "current" ? "font-semibold text-foreground" : "text-muted-foreground"}">${label}</span>
      </div>
      ${line}
    `;
  }).join("");
  const sticky = state.step === 2;
  return `
    <header class="${sticky ? "progress-sticky" : ""} px-4 py-3 border-b border-border">
      <div class="flex items-start justify-between gap-1">${nodes}</div>
    </header>
  `;
}

// ============================================================================
// STEP 1 — Class selection
// ============================================================================
function renderStep1() {
  if (!state.classes.length) {
    return `<p class="text-sm text-muted-foreground text-center py-10">Loading classes…</p>`;
  }
  return `
    <h1 class="text-2xl font-semibold mb-4">Select a vehicle class</h1>
    <div class="grid grid-cols-1 gap-4">
      ${state.classes.map(c => `
        <div class="class-card" data-class-id="${c.id}" data-class-name="${c.name}" data-class-code="${c.code}">
          <img src="${c.img}" alt="" loading="lazy" />
          <div class="fade"></div>
          <div class="label">
            <span class="text-xl font-semibold">${c.name}</span>
            ${c.code ? `<span class="text-sm text-white/70">${c.code}</span>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
    <div class="mt-6 text-center">
      <a href="#/cancel" id="to-cancel" class="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Already booked? Look up or cancel →
      </a>
    </div>
  `;
}

// ============================================================================
// STEP 2 — Date & Time
// ============================================================================
function renderStep2() {
  return `
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm text-muted-foreground">${state.selectedClass?.name ?? ""}</span>
      <button id="change-class" class="text-sm text-primary underline-offset-4">Change</button>
    </div>
    ${renderCalendar()}
    ${renderWindowsZone()}
  `;
}

function renderCalendar() {
  const { year, month } = state.displayedMonth;
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDow = (first.getUTCDay() + 6) % 7; // Mon=0
  const today = todayMYT();
  const availMap = new Map(state.availability.map(a => [a.slot_date, a]));

  const monthLabel = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));

  const currentMonthIsNow = today.startsWith(`${year}-${String(month).padStart(2, "0")}`);

  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    let cellState = "grey", disabled = false;
    const a = availMap.get(iso);
    if (iso < today) { cellState = "past"; disabled = true; }
    else if (a) {
      if (a.open_slot_count > 0) cellState = "green";
      else cellState = "red";
    }
    const selected = state.selectedDate === iso;
    const isToday = iso === today;
    cells += `
      <div class="date-cell" role="gridcell"
        data-date="${iso}" data-state="${cellState}"
        aria-selected="${selected}" aria-disabled="${disabled || cellState === "grey"}"
        ${isToday ? 'data-today="true"' : ""}
        ${!disabled && cellState !== "grey" ? 'tabindex="0"' : ""}>
        ${d}
      </div>`;
  }

  const hasAny = state.availability.some(a => a.open_slot_count > 0 || a.total_slots > 0);

  return `
    <div class="rounded-xl border border-border bg-card p-4 mb-4">
      <div class="flex items-center justify-between mb-3">
        <button id="prev-month" class="px-2 py-1 text-lg" ${currentMonthIsNow ? "disabled" : ""}>◀</button>
        <span class="font-semibold">${monthLabel}</span>
        <button id="next-month" class="px-2 py-1 text-lg">▶</button>
      </div>
      <div class="grid grid-cols-7 text-[11px] uppercase text-muted-foreground text-center mb-1">
        ${["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => `<div>${d}</div>`).join("")}
      </div>
      <div class="grid grid-cols-7 gap-y-1" role="grid">${cells}</div>
      <div class="flex justify-center gap-4 text-xs text-muted-foreground mt-3">
        <span class="flex items-center gap-1"><span class="inline-block size-2.5 rounded-full bg-available-swatch"></span>Available</span>
        <span class="flex items-center gap-1"><span class="inline-block size-2.5 rounded-full bg-full-swatch"></span>Full</span>
        <span class="flex items-center gap-1"><span class="inline-block size-2.5 rounded-full border border-muted-foreground/40"></span>No slots</span>
      </div>
      ${!hasAny ? `<p class="text-sm text-muted-foreground text-center mt-3">No slots available for this class this month.</p>` : ""}
    </div>
  `;
}

function renderWindowsZone() {
  if (!state.selectedDate) {
    return `<p class="text-sm text-muted-foreground text-center py-6">Select a date above to see available times.</p>`;
  }
  if (!state.windowsForDate.length) {
    return `<p class="text-sm text-muted-foreground text-center py-6">No available slots on this date.</p>`;
  }
  return `
    <div class="grid grid-cols-1 gap-3">
      ${state.windowsForDate.map(w => `
        <button class="w-full text-left rounded-xl border border-border bg-card p-4 flex justify-between items-center active:scale-[0.98] transition"
          data-window-id="${w.slot_window_id}" data-window-label="${w.window_label}">
          <span class="font-medium">${w.window_label}</span>
          <span class="text-sm text-muted-foreground">${w.slots_left} left</span>
        </button>
      `).join("")}
    </div>
  `;
}

// ============================================================================
// STEP 3 — Details
// ============================================================================
function renderStep3() {
  const c = state.selectedClass, d = state.selectedDate, w = state.selectedWindow;
  const capHit = (state.studentStatus?.upcoming_count ?? 0) >= 3;
  return `
    <div class="flex items-center justify-between mb-4 text-sm text-muted-foreground">
      <span>${c?.name} · ${fmtDate(d)} · ${w?.label}</span>
      <button id="edit-step2" class="text-primary underline-offset-4">Edit</button>
    </div>

    ${state.studentStatus?.is_returning && !capHit ? `
      <div class="rounded-lg bg-muted text-sm p-3 mb-4">
        You have ${state.studentStatus.upcoming_count} upcoming booking(s).
        ${state.studentStatus.active_booking ? `<br>Next: ${state.studentStatus.active_booking.class_name} · ${fmtDate(state.studentStatus.active_booking.slot_date)} · ${state.studentStatus.active_booking.window_label}` : ""}
      </div>` : ""}

    ${capHit ? `
      <div class="rounded-lg bg-destructive/10 text-destructive text-sm p-3 mb-4">
        You already have 3 upcoming bookings. You must complete or cancel one first.
        <a href="#/cancel" class="underline ml-1">Manage bookings →</a>
      </div>` : ""}

    ${state.banner ? `<div class="rounded-lg bg-destructive/10 text-destructive text-sm p-3 mb-4">${state.banner}</div>` : ""}

    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1" for="ic">IC</label>
        <input id="ic" inputmode="numeric" maxlength="12" autocomplete="off"
          class="w-full h-11 rounded-lg border border-border bg-background px-3 ${state.formErrors.ic ? "border-destructive" : ""}"
          value="${state.form.ic}" placeholder="12-digit IC" />
        ${state.formErrors.ic ? `<p class="text-sm text-destructive mt-1">${state.formErrors.ic}</p>` : ""}
        <button id="ic-help" class="text-xs text-muted-foreground underline-offset-4 mt-1">ⓘ What's my IC?</button>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" for="name">Name</label>
        <input id="name" autocomplete="name"
          class="w-full h-11 rounded-lg border border-border bg-background px-3 ${state.formErrors.name ? "border-destructive" : ""}"
          value="${state.form.name}" placeholder="Full name as per IC" />
        ${state.formErrors.name ? `<p class="text-sm text-destructive mt-1">${state.formErrors.name}</p>` : ""}
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" for="phone">Phone</label>
        <input id="phone" type="tel" inputmode="tel" autocomplete="tel"
          class="w-full h-11 rounded-lg border border-border bg-background px-3 ${state.formErrors.phone ? "border-destructive" : ""}"
          value="${state.form.phone}" placeholder="e.g. 0123456789" />
        ${state.formErrors.phone ? `<p class="text-sm text-destructive mt-1">${state.formErrors.phone}</p>` : ""}
      </div>
    </div>

    <button id="confirm-booking" ${capHit || state.isSubmitting ? "disabled" : ""}
      class="w-full h-11 mt-6 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
      ${state.isSubmitting ? "Booking…" : "Confirm Booking"}
    </button>

    ${state.showConfirmModal ? renderConfirmModal() : ""}
    ${state.showIcHelp ? renderIcHelpModal() : ""}
  `;
}

function renderConfirmModal() {
  const c = state.selectedClass, d = state.selectedDate, w = state.selectedWindow;
  const reminders = [
    "Bring your IC on the day.",
    "Arrive 10 minutes early.",
    "Bring your phone — you'll need it to look up or cancel.",
  ];
  if (PAYMENT_URL) reminders.push("Payment is made on the day / via the link below.");
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-modal="confirm">
      <div class="w-full max-w-sm rounded-xl bg-card p-5 shadow-lg">
        <h2 class="text-lg font-semibold mb-1">Confirm your booking?</h2>
        <p class="text-sm text-muted-foreground mb-3">${c.name} · ${fmtDate(d)} · ${w.label}</p>
        <div class="border-t border-border pt-3 mb-4">
          <p class="text-sm font-medium mb-2">Please note:</p>
          <ul class="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            ${reminders.map(r => `<li>${r}</li>`).join("")}
          </ul>
        </div>
        ${PAYMENT_URL ? `<a href="${PAYMENT_URL}" target="_blank" rel="noopener"
          class="block w-full h-10 leading-10 text-center rounded-lg border border-border text-sm mb-3">💳 Pay / View payment link</a>` : ""}
        <div class="flex gap-3">
          <button id="modal-back" class="flex-1 h-10 rounded-lg border border-border">Go back</button>
          <button id="modal-confirm" ${state.isSubmitting ? "disabled" : ""}
            class="flex-1 h-10 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            ${state.isSubmitting ? "Booking…" : "Yes, book"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderIcHelpModal() {
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-modal="ic-help">
      <div class="w-full max-w-sm rounded-xl bg-card p-5 shadow-lg">
        <h2 class="text-lg font-semibold mb-2">What's my IC?</h2>
        <p class="text-sm text-muted-foreground mb-4">
          Your IC (Kad Pengenalan) is the 12-digit number on your Malaysian identity card.
          Enter it without dashes or spaces. Example: 900101015533.
        </p>
        <button id="ic-help-close" class="w-full h-10 rounded-lg bg-primary text-primary-foreground">Got it</button>
      </div>
    </div>
  `;
}

// ============================================================================
// STEP 4 — Confirmation
// ============================================================================
function renderStep4() {
  const r = state.bookingResult;
  if (!r) return "";
  return `
    <div class="flex flex-col items-center py-6">
      <div class="text-5xl mb-3">✅</div>
      <h1 class="text-xl font-semibold">Booking confirmed</h1>
    </div>
    <div class="rounded-xl border border-border bg-card p-4 mb-4">
      <p class="text-lg font-semibold">${r.class_name}</p>
      <p class="text-muted-foreground">${fmtDate(r.slot_date)} · ${r.window_label}</p>
    </div>
    <dl class="text-sm space-y-2 mb-4">
      <div class="flex justify-between"><dt class="text-muted-foreground">Name</dt><dd>${state.form.name}</dd></div>
      <div class="flex justify-between"><dt class="text-muted-foreground">IC</dt><dd>${state.form.ic}</dd></div>
    </dl>
    <div class="rounded-lg bg-muted p-4 text-sm mb-4">
      📌 Keep your IC and phone — you'll need them to look up or cancel this booking.
    </div>
    ${PAYMENT_URL ? `<a href="${PAYMENT_URL}" target="_blank" rel="noopener"
      class="block w-full h-10 leading-10 text-center rounded-lg border border-border text-sm mb-3">💳 Pay / View payment link</a>` : ""}
    <button id="book-another" class="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium">Book another lesson</button>
    <div class="text-center mt-4">
      <a href="#/cancel" class="text-sm text-muted-foreground underline-offset-4 hover:underline">Already booked? Look up or cancel →</a>
    </div>
    <div class="border-t border-border mt-6 pt-4 text-sm text-muted-foreground">
      <p>Reference: <span class="text-foreground">${state.form.ic}</span></p>
      <details class="mt-2">
        <summary class="cursor-pointer">Booking ref</summary>
        <div class="flex items-center gap-2 mt-1">
          <code class="text-xs break-all">${r.token}</code>
          <button id="copy-token" class="text-primary text-xs">Copy</button>
        </div>
      </details>
    </div>
  `;
}

// ============================================================================
// CANCEL FLOW
// ============================================================================
function renderCancelShell() {
  return `
    <div class="mx-auto max-w-md min-h-dvh flex flex-col">
      <header class="px-4 py-3 border-b border-border flex items-center gap-3">
        <button id="cancel-back" class="text-lg">←</button>
        <span class="font-semibold">My Bookings</span>
      </header>
      <main class="flex-1 px-4 py-4">
        ${state.cancelView === "search" ? renderCancelSearch() : renderCancelCards()}
      </main>
    </div>
    ${state.showCancelModal ? renderCancelModal() : ""}
  `;
}

function renderCancelSearch() {
  return `
    <h1 class="text-xl font-semibold mb-1">Look up your booking</h1>
    <p class="text-sm text-muted-foreground mb-4">Enter the IC and phone you used when booking.</p>
    ${state.cancelBanner ? `<div class="rounded-lg bg-destructive/10 text-destructive text-sm p-3 mb-4">${state.cancelBanner}</div>` : ""}
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1" for="c-ic">IC</label>
        <input id="c-ic" inputmode="numeric" maxlength="12" value="${state.cancelSearch.ic}"
          class="w-full h-11 rounded-lg border border-border bg-background px-3" placeholder="12-digit IC" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" for="c-phone">Phone</label>
        <input id="c-phone" type="tel" inputmode="tel" value="${state.cancelSearch.phone}"
          class="w-full h-11 rounded-lg border border-border bg-background px-3" placeholder="e.g. 0123456789" />
      </div>
    </div>
    <button id="c-find" class="w-full h-11 mt-6 rounded-lg bg-primary text-primary-foreground font-medium">Find my bookings</button>
  `;
}

function renderCancelCards() {
  if (!state.cancelBookings.length) {
    return `<p class="text-sm text-muted-foreground text-center py-10">No upcoming bookings found for those details.</p>`;
  }
  return `
    <p class="text-sm text-muted-foreground mb-3">Upcoming bookings for ${state.cancelSearch.ic}</p>
    <div class="space-y-3">
      ${state.cancelBookings.map(b => `
        <div class="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p class="font-semibold">${b.class_name}</p>
            <p class="text-sm text-muted-foreground">${fmtDate(b.slot_date)} · ${b.window_label}</p>
          </div>
          <button class="c-cancel text-sm text-destructive" data-token="${b.token}">Cancel</button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCancelModal() {
  const b = state.showCancelModal;
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-modal="cancel">
      <div class="w-full max-w-sm rounded-xl bg-card p-5 shadow-lg">
        <h2 class="text-lg font-semibold mb-1">Cancel this booking?</h2>
        <p class="text-sm text-muted-foreground mb-3">${b.class_name} · ${fmtDate(b.slot_date)} · ${b.window_label}</p>
        <p class="text-sm mb-4">This cannot be undone.</p>
        <div class="flex gap-3">
          <button id="cancel-keep" class="flex-1 h-10 rounded-lg border border-border">Keep</button>
          <button id="cancel-yes" class="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground">Yes, cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Data loaders
// ============================================================================
async function loadAvailability() {
  const { year, month } = state.displayedMonth;
  const { data, error } = await supabase.rpc("get_class_availability", {
    p_vehicle_class_id: state.selectedClass.id, p_year: year, p_month: month,
  });
  if (error) { state.availability = []; return; }
  state.availability = data ?? [];
}

async function loadClasses() {
  const { data, error } = await supabase.rpc("get_classes");
  if (error) { state.classes = []; return; }
  state.classes = (data ?? []).map(c => ({
    id: c.id,          // real UUID from DB
    name: c.name,
    code: c.code ?? "",
    img: classImage(c.name),
  }));
}

function classImage(name) {
  const map = {
    lorry:     "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=800&q=80",
    shovel:    "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&q=80",
    excavator: "https://images.unsplash.com/photo-1621922688754-2a2c74b1c94f?w=800&q=80",
    treller:   "https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=800&q=80",
    bus:       "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80",
  };
  return map[name.toLowerCase()] ?? map.lorry;
}

async function loadWindows() {
  const { data, error } = await supabase.rpc("get_open_windows_for_class_date", {
    p_date: state.selectedDate, p_vehicle_class_id: state.selectedClass.id,
  });
  state.windowsForDate = error ? [] : (data ?? []);
}

async function checkStudent(ic) {
  if (!/^\d{12}$/.test(ic)) return;
  const { data } = await supabase.rpc("get_student_status", { p_ic: ic });
  state.studentStatus = data;
  if (data?.is_returning) {
    if (!state.form.name) state.form.name = data.name ?? "";
    if (!state.form.phone) state.form.phone = data.phone ?? "";
  }
}

// ============================================================================
// Submit
// ============================================================================
async function submitBooking() {
  state.isSubmitting = true;
  render();
  const { data, error } = await supabase.rpc("book_lesson", {
    p_ic: state.form.ic, p_name: state.form.name, p_phone: state.form.phone,
    p_vehicle_class_id: state.selectedClass.id,
    p_date: state.selectedDate, p_slot_window_id: state.selectedWindow.slot_window_id,
  });
  state.isSubmitting = false;
  if (error) {
    state.showConfirmModal = false;
    if (error.code === "P0001" && error.message.includes("max")) state.banner = "You already have 3 upcoming bookings. The maximum is 3.";
    else if (error.code === "P0001") state.banner = "This slot was just taken. Please pick another.";
    else if (error.code === "22023") state.banner = error.message;
    else state.banner = "Something went wrong. Please try again.";
    render();
    return;
  }
  state.bookingResult = data;
  state.showConfirmModal = false;
  state.step = 4;
  render();
}

// ============================================================================
// Event wiring
// ============================================================================
function attachEvents() {
  // Step 1
  document.querySelectorAll(".class-card").forEach(el => {
    el.addEventListener("click", async () => {
      state.selectedClass = {
        id: el.dataset.classId,
        name: el.dataset.className,
        code: el.dataset.classCode,
      };
      state.step = 2;
      state.selectedDate = null;
      state.selectedWindow = null;
      state.windowsForDate = [];
      await loadAvailability();
      render();
    });
  });
  document.getElementById("to-cancel")?.addEventListener("click", (e) => {
    e.preventDefault(); state.view = "cancel"; state.cancelView = "search"; render();
  });

  // Step 2
  document.getElementById("prev-month")?.addEventListener("click", async () => {
    if (state.displayedMonth.month === 1) { state.displayedMonth = { year: state.displayedMonth.year - 1, month: 12 }; }
    else state.displayedMonth.month -= 1;
    await loadAvailability(); render();
  });
  document.getElementById("next-month")?.addEventListener("click", async () => {
    if (state.displayedMonth.month === 12) { state.displayedMonth = { year: state.displayedMonth.year + 1, month: 1 }; }
    else state.displayedMonth.month += 1;
    await loadAvailability(); render();
  });
  document.getElementById("change-class")?.addEventListener("click", () => { state.step = 1; render(); });
  document.querySelectorAll(".date-cell").forEach(el => {
    el.addEventListener("click", async () => {
      const st = el.dataset.state;
      if (st === "past" || st === "grey") return;
      state.selectedDate = el.dataset.date;
      state.selectedWindow = null;
      await loadWindows(); render();
    });
  });
  document.querySelectorAll("[data-window-id]").forEach(el => {
    el.addEventListener("click", () => {
      state.selectedWindow = { slot_window_id: el.dataset.windowId, label: el.dataset.windowLabel };
      state.step = 3; state.banner = null; render();
    });
  });

  // Step 3
  document.getElementById("edit-step2")?.addEventListener("click", () => { state.step = 2; render(); });
  const icEl = document.getElementById("ic");
  icEl?.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 12); state.form.ic = e.target.value; });
  icEl?.addEventListener("blur", async () => {
    if (state.form.ic.length !== 12) { state.formErrors.ic = "IC must be exactly 12 digits."; render(); return; }
    state.formErrors.ic = undefined;
    await checkStudent(state.form.ic); render();
  });
  document.getElementById("name")?.addEventListener("input", (e) => { state.form.name = e.target.value; });
  document.getElementById("phone")?.addEventListener("input", (e) => { state.form.phone = e.target.value; });
  document.getElementById("ic-help")?.addEventListener("click", () => { state.showIcHelp = true; render(); });
  document.getElementById("ic-help-close")?.addEventListener("click", () => { state.showIcHelp = false; render(); });
  document.getElementById("confirm-booking")?.addEventListener("click", () => {
    state.formErrors = {};
    if (!/^\d{12}$/.test(state.form.ic)) state.formErrors.ic = "IC must be exactly 12 digits.";
    if (!state.form.name.trim()) state.formErrors.name = "Name and phone are required.";
    if (!state.form.phone.trim()) state.formErrors.phone = "Name and phone are required.";
    if (Object.keys(state.formErrors).length) { render(); return; }
    state.showConfirmModal = true; render();
  });
  document.getElementById("modal-back")?.addEventListener("click", () => { state.showConfirmModal = false; render(); });
  document.getElementById("modal-confirm")?.addEventListener("click", submitBooking);
  document.querySelector('[data-modal="confirm"]')?.addEventListener("click", (e) => {
    if (e.target.dataset.modal === "confirm") { state.showConfirmModal = false; render(); }
  });

  // Step 4
  document.getElementById("book-another")?.addEventListener("click", () => {
    state.step = 1; state.selectedClass = null; state.selectedDate = null; state.selectedWindow = null;
    state.form = { ic: "", name: "", phone: "" }; state.bookingResult = null; state.banner = null;
    state.studentStatus = null; render();
  });
  document.getElementById("copy-token")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.bookingResult.token);
    const btn = document.getElementById("copy-token"); btn.textContent = "Copied"; setTimeout(() => btn.textContent = "Copy", 1500);
  });

  // Cancel flow
  document.getElementById("cancel-back")?.addEventListener("click", () => {
    if (state.cancelView === "cards") { state.cancelView = "search"; render(); }
    else { state.view = "booking"; state.step = 1; render(); }
  });
  document.getElementById("c-ic")?.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 12); state.cancelSearch.ic = e.target.value; });
  document.getElementById("c-phone")?.addEventListener("input", (e) => { state.cancelSearch.phone = e.target.value; });
  document.getElementById("c-find")?.addEventListener("click", async () => {
    state.cancelBanner = null;
    if (!/^\d{12}$/.test(state.cancelSearch.ic) || !state.cancelSearch.phone.trim()) {
      state.cancelBanner = "IC must be exactly 12 digits and phone is required."; render(); return;
    }
    const { data, error } = await supabase.rpc("get_upcoming_bookings_by_ic", { p_ic: state.cancelSearch.ic, p_phone: state.cancelSearch.phone });
    if (error) { state.cancelBanner = "Something went wrong. Please try again."; render(); return; }
    state.cancelBookings = data ?? []; state.cancelView = "cards"; render();
  });
  document.querySelectorAll(".c-cancel").forEach(el => {
    el.addEventListener("click", () => {
      state.showCancelModal = state.cancelBookings.find(b => b.token === el.dataset.token); render();
    });
  });
  document.getElementById("cancel-keep")?.addEventListener("click", () => { state.showCancelModal = null; render(); });
  document.getElementById("cancel-yes")?.addEventListener("click", async () => {
    const b = state.showCancelModal;
    const { error } = await supabase.rpc("cancel_booking_by_ic", { p_ic: state.cancelSearch.ic, p_phone: state.cancelSearch.phone, p_token: b.token });
    state.showCancelModal = null;
    if (error) { state.cancelBanner = "Booking not found or details do not match."; }
    else { state.cancelBookings = state.cancelBookings.filter(x => x.token !== b.token); }
    render();
  });
}

// ============================================================================
// Boot
// ============================================================================
state.view = "booking";

(async () => {
  await loadClasses();
  render();
})();
