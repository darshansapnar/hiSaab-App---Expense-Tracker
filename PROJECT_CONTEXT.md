# Project Context: hiSaab

## 📌 Background & Vision

hiSaab is a shared finance platform designed to remove the social and mechanical friction of managing money in group dynamics.

The name "hiSaab" translates to "calculation" or "ledger" in several South Asian languages, capturing the core essence of the application. Our target tagline — **"Keep the hisaab clear."** — represents the primary frustration we aim to solve: the awkwardness and complexity of figure-settling among friends, roommates, and travel companions.

hiSaab is positioned not as a clone of Splitwise, but as a next-generation everyday utility that embeds itself in the daily routines of flatmates, hostelers, and couples.

---

## ⚠️ The Problem Statement

While general expense splitters exist, they suffer from three key design flaws:

1.  **Over-Genericity:** They treat a $50 utilities bill, a $5,000 group trip, a daily tiffin meal, and a single bottle of water exactly the same.
2.  **Friction-Heavy Logging:** Adding everyday items requires typing, selecting groups, choosing splitters, and manually saving every single time.
3.  **Ad-Cluttered & Bloated Interfaces:** Recent monetizations of popular tools have introduced intrusive ads, page lag, and paywalls for basic features.

In everyday shared living (especially in student hostels or shared apartments), expenses are high-frequency but low-value. A user doesn't want to fill out a form to log a $0.50 water bottle or a skipped tiffin meal; they want a one-tap action.

---

## 🎯 Target User Personas

### 1. The Hostel Student ("Rahul")

- **Context:** Lives in a shared hostel room with 3 others. Uses a tiffin subscription service.
- **Behavior:** Often skips meals on weekends, orders late-night snacks, splits streaming subscriptions.
- **Pain Point:** Keeping track of how many tiffin meals he skipped (so the provider doesn't overcharge him) and dividing micro-debts with roommates without manual notebook entry.

### 2. The Flatmates ("Sneha & Aisha")

- **Context:** Share a 2BHK apartment in an urban center.
- **Behavior:** Share rent, electricity, Wi-Fi, cleaning supplies, and recurring groceries.
- **Pain Point:** Avoiding the monthly hassle of manual spreadsheet calculations.

### 3. The Travel Group ("The Wanderers")

- **Context:** 6 friends going on a weekend trip to Goa.
- **Behavior:** Different people pay for hotels, car rentals, dinners, and fuel.
- **Pain Point:** Multiple currencies, uneven splits (e.g., some friends don't drink alcohol), and settling multiple debt loops efficiently.

---

## 🎨 Product Philosophy & Design Pillars

### 1. CRED + Notion + Spotify + Linear Aesthetic

We believe financial interfaces should feel premium and tactile.

- **Dark-First Mode:** Low-light friendly, high contrast, clean typography.
- **Glassmorphic Sheets:** High-end layer stack overlays.
- **Zero Placeholders:** Rich graphics and custom Victory Native XL charts.

### 2. Micro-Animations & Haptic Feedback

Every action should have weight.

- A tactile tap registers a daily tiffin log.
- A subtle spring animation slides down the settlement panel when balances clear.
- A physical vibration patterns on completion of a log.

### 3. Real-Time Cloud Sync Engine

hiSaab connects directly to Supabase cloud PostgreSQL database for immediate real-time synchronization across group members, with live status banners keeping users informed of network state.

---

## 🧩 Architectural Focus

To support this context, the engineering architecture prioritizes:

1.  **Type Safety:** Strict TypeScript models representing users, transactions, and split splits.
2.  **Relational Database Integrity:** PostgreSQL constraints to avoid ledger inconsistencies (e.g., total split amounts must sum exactly to the expense amount).
3.  **Realtime Engine:** Live sync of grocery items and chat logs so roommate groups don't experience concurrency conflicts.
