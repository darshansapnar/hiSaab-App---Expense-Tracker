# Architecture Decision Records (ADR)

This document records the design and architectural choices made during the development of hiSaab, explaining the context, alternatives considered, and rationale behind each decision.

---

## 📂 ADR 1: React Native + Expo (Managed Workflow)

- **Status:** Approved
- **Context:** We need to deliver a premium, production-grade cross-platform app (iOS and Android) with high performance, haptics, and modern UI transitions.
- **Alternatives Considered:** Bare React Native, Flutter, Kotlin Multiplatform.
- **Decision:** Expo Managed Workflow.
- **Rationale:**
  - **Developer Velocity:** Expo Config Plugins eliminate the need to write custom Swift/Java code for native features (e.g., SecureStore, Haptics, Notifications).
  - **Expo Router:** File-system based routing brings a web-like structured routing paradigm to React Native, ensuring clean separation of routes and nested navigator layers.
  - **EAS Build & Update:** Seamless distribution of builds and over-the-air updates (OTA) without manual App Store/Play Store validation cycles for simple UI modifications.

---

## 📂 ADR 2: Zustand for Local & Global App State

- **Status:** Approved
- **Context:** hiSaab requires reactive client state management for authentication, user UI preferences, toast messages, and network connectivity state.
- **Alternatives Considered:** Redux Toolkit, MobX, Context API.
- **Decision:** Zustand + Persist Middleware.
- **Rationale:**
  - **Low Boilerplate:** Zustand is lightweight, requires minimal setup, and can be initialized in seconds.
  - **Simple Serialization:** Persisting user session tokens and UI themes to storage is trivial using built-in middleware.
  - **React Integration:** Can be accessed seamlessly inside and outside of React components.

---

## 📂 ADR 3: NativeWind (v4) for CSS Styling

- **Status:** Approved
- **Context:** Visual aesthetics (Notion/Spotify/CRED style) require highly customizable styles, gradients, glassmorphism, and responsive layouts.
- **Alternatives Considered:** Styled Components, Vanilla StyleSheet, Restyle.
- **Decision:** NativeWind (v4).
- **Rationale:**
  - **Unified Styling:** Developers write standard Tailwind utility classes which are compiled into native React Native StyleSheets.
  - **Theme Continuity:** Shared design tokens (colors, font sizes, transitions) are easily managed in `tailwind.config.js`.
  - **Dark Mode Sync:** Built-in dark mode support fits our high-contrast design goals out of the box.

---

## 📂 ADR 4: Supabase (Backend-as-a-Service)

- **Status:** Approved
- **Context:** We require secure user authentication, a relational ledger database (PostgreSQL), and real-time syncing for grocery checkouts.
- **Alternatives Considered:** Firebase, Custom Node.js Express server + MongoDB.
- **Decision:** Supabase.
- **Rationale:**
  - **Relational Integrity:** Finance ledger systems depend on database constraints (foreign keys, transaction bounds, decimal accuracy) which PostgreSQL handles perfectly. Firebase (NoSQL) makes transactions and splits computations overly complex and prone to discrepancies.
  - **Row Level Security (RLS):** Supabase allows writing security policies directly at the database level. An API request to select transactions is automatically filtered to groups the user belongs to, guaranteeing data isolation.
  - **Realtime Subscriptions:** Essential for live checklist updates (grocery tracker) without setting up custom WebSockets.

---

## 📂 ADR 5: Feature-First Folder Directory Structure

- **Status:** Approved
- **Context:** As applications scale, splitting components by generic folders (`/components`, `/screens`, `/hooks`) leads to massive scroll times and high cognitive overhead (context switching).
- **Alternatives Considered:** Folder-by-type (Atomic Design), Monorepo.
- **Decision:** Feature-First structure inside `/src/app` with a flat shareable directory for core widgets.
- **Rationale:**
  - **Cohesion:** Screens, layouts, and feature subcomponents (like the Water Jar widget) live close to each other.
  - **Refactorability:** Deleting or upgrading a feature (e.g. replacing a tracker) can be done by deleting or altering its specific folder without searching the entire project directory.
