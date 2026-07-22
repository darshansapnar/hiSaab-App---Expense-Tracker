# Product Roadmap: hiSaab

This roadmap outlines the milestones required to build hiSaab from its initial foundation to a production-ready, feature-rich shared finance ecosystem.

---

```mermaid
gantt
    title hiSaab Product Roadmap
    dateFormat  YYYY-MM-DD
    section Core Infrastructure
    Phase 1: Foundation Setup          :active, p1, 2026-07-18, 5d
    Phase 2: Authentication & Profiles : p2, after p1, 5d
    Phase 3: Database & RLS            : p3, after p2, 4d
    section Core Features
    Phase 4: Primitives & UI Design    : p4, after p3, 6d
    Phase 5: Expense Splitting Engine  : p5, after p4, 7d
    Phase 6: Daily Utility Trackers    : p6, after p5, 8d
    section Analytics & Sync
    Phase 7: Budgets & Victory Charts  : p7, after p6, 5d
    Phase 8: Offline Queue & Push      : p8, after p7, 6d
    Phase 9: AI Insights Integration   : p9, after p8, 7d
```

---

## 📍 Milestones

### Phase 1: Environment & Project Foundation Setup

- **Goal:** Construct a compile-safe, modular workspace with standard style guides and configurations.
- **Deliverables:**
  - Expo router setup with strict TypeScript configurations.
  - NativeWind configuration with Tailwind theme extensions (for premium dark aesthetics).
  - State management skeleton using Zustand & TanStack Query.
  - Base directory structure following the feature-first pattern.

### Phase 2: Secure Authentication & Session Guards

- **Goal:** Setup secure, password-less user registration and secure session persistence.
- **Deliverables:**
  - Supabase Client configuration integration with SecureStore.
  - Auth route folder structure containing dynamic routing guards.
  - Email OTP authentication screens, login, signup, and profile details form.
  - Zustand store capturing active user profiles and secure storage tokens.

### Phase 3: PostgreSQL Database Schema & RLS Setup

- **Goal:** Establish relational models representing the shared finance domains and apply data-level security.
- **Deliverables:**
  - Database migrations for `profiles`, `groups`, `expenses`, `splits`, `trackers`, and `budgets`.
  - Row-Level Security (RLS) policies targeting tenant isolated operations.
  - Automated database triggers (e.g. creating profile row on user registration).

### Phase 4: Premium UI Design System & Component Library

- **Goal:** Deliver components aligning with CRED, Spotify, and Linear dark visual guidelines.
- **Deliverables:**
  - Custom dark-mode palette setup inside `Colors.ts`.
  - Reusable UI controls: Gradient Buttons, Floating Inputs, Frosted Glass Cards, Modal Bottom Sheets.
  - Micro-interaction layer leveraging `expo-haptics` and spring animations.

### Phase 5: Smart Expense Splitting Engine

- **Goal:** Implement the math and interface for tracking complex debts and settlements.
- **Deliverables:**
  - Add expense flows supporting split variants (equal split, custom percentage splits, share-ratio splits).
  - Group balances calculation view showing "who owes whom how much".
  - One-click settlements logging to wipe balances clean.
  - Floating-point rounding safe transactions.

### Phase 6: Daily Life Utility Trackers (The Key Differentiator)

- **Goal:** Build dedicated workflows for tracking daily micro-transactions.
- **Deliverables:**
  - **Tiffin Tracker:** Daily log dashboard supporting skip options, custom rates, and monthly tallies.
  - **Grocery Shared Checklist:** Realtime checklist syncing additions, checkoffs, and split costs instantly.

### Phase 7: Monthly Budgets & Victory Charts

- **Goal:** Add spending limits, warning indicators, and gorgeous analytics charts.
- **Deliverables:**
  - Monthly budget setting interface for groups and individuals.
  - Category-specific limits showing warning bars if spending exceeds threshold (e.g., 80%).
  - Victory Native XL configurations for trend lines and donut breakdowns.

### Phase 8: Real-Time Cloud Sync & Notifications

- **Goal:** Provide active cloud synchronization and alert users of updates.
- **Deliverables:**
  - Direct Supabase cloud data fetching and optimistic mutations.
  - NetInfo event hooks initiating connectivity status monitoring.
  - Push notification alerts for transaction logging and settlement requests.

### Phase 9: AI Insights (Future Scope)

- **Goal:** Embed conversational AI spending feedback.
- **Deliverables:**
  - Gemini API integration via secure Edge Functions.
  - Monthly budget summary analyzing spending patterns and suggesting saving adjustments.
