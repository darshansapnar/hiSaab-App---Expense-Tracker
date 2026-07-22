# hiSaab — Shared & Personal Finance Platform

> _"Keep the hisaab clear."_

[![React Native](https://img.shields.io/badge/React_Native-Expo_SDK_51-000000?style=for-the-badge&logo=react&logoColor=61DAFB)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict_Mode-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NativeWind](https://img.shields.io/badge/NativeWind-v4_Tailwind-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://www.nativewind.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%26_RLS-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

**hiSaab** is a modern, high-performance, and offline-first mobile shared and personal finance management application. Built specifically for hostel students, flatmates, travel groups, couples, and individuals, hiSaab removes the friction of daily money management, shared expense splitting, meal subscriptions, and monthly budgeting.

Unlike generic expense splitters, hiSaab combines **group expense splitting**, **daily utility tracking (tiffin subscriptions)**, **personal finance & monthly budgets**, and **visual analytics** into a single sleek application with a CRED and Spotify-inspired dark aesthetic.

---

## ✨ Key Features

### 👥 1. Smart Group Expense Splitting

- **Flexible Split Algorithms:** Support for Equal splits, Custom Percentage splits, Exact Shares, and Adjustment amounts.
- **Debt Simplification:** Optimized debt resolution algorithms ("Who owes whom how much") to minimize settlement transactions.
- **Settlement Workflows:** One-tap settlements with dual confirmation requests.
- **Receipt & Category Tracking:** Attach notes, select expense categories, and store receipt metadata.

### 🍱 2. Everyday Utility Trackers (Tiffin Tracker)

- **Meal Subscription Logging:** Track daily meals (Breakfast, Lunch, Dinner) with one-tap actions.
- **Skip Day Management:** Effortlessly log skipped meals to ensure food providers do not overcharge.
- **Custom Meal Rates:** Set granular rates for different meal types.
- **Auto-Settlement Integration:** Calculate monthly meal tallies and convert balances directly into group expenses.

### 💰 3. Personal Finance & Monthly Budgeting

- **Personal Cashflow Dashboard:** Track personal income, daily expenses, and category distributions separately from group balances.
- **Smart Budget Thresholds:** Set monthly spending limits per category with real-time visual progress bars.
- **Budget Health Alerts:** Visual alerts at 80% spending limits and critical warnings when budgets are exceeded.

### 📊 4. Visual Analytics & Insights

- **Victory XL Powered Charts:** Interactive spend breakdown charts, donut category views, and historical spending trends.
- **Financial Health Overview:** Real-time visibility into overall net balance, group liabilities, and monthly savings.

### 📶 5. Offline-First Sync & Resilience

- **Local Mutation Queue:** Log expenses, update tiffin records, and settle payments even without an active internet connection.
- **Background Sync:** Seamless background synchronization when network connection is restored powered by Zustand persistence.
- **Network Status Banner:** Real-time connectivity banner alerting users of sync states.

### 🔔 6. Notifications & Micro-Interactions

- **Push Notifications & Reminders:** Instant alerts for new expenses, settlement requests, and witty financial nudges.
- **Tactile Haptic Feedback:** Haptic responses powered by `expo-haptics` for button presses, logs, and settlements.
- **CRED-Inspired UI System:** Dark-first design palette, glassmorphism, animated counter numbers, skeleton loaders, and smooth screen transitions.

---

## 🛠️ Technology Stack

| Layer             | Technology                                                                                  | Description                                                           |
| :---------------- | :------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------- |
| **Framework**     | [React Native](https://reactnative.dev/) / [Expo SDK 51](https://expo.dev/)                 | Cross-platform mobile runtime with managed Expo workflow              |
| **Routing**       | [Expo Router](https://docs.expo.dev/router/introduction/)                                   | File-system based router with type-safe screen navigation             |
| **Language**      | [TypeScript](https://www.typescriptlang.org/)                                               | Strict static typing across components, models, and stores            |
| **Styling**       | [NativeWind v4](https://www.nativewind.dev/)                                                | Tailwind CSS compiler for React Native UI primitives                  |
| **State & Cache** | [Zustand](https://github.com/pmndrs/zustand) + [TanStack Query](https://tanstack.com/query) | Client state, persisted offline action queue & remote server caching  |
| **Backend & DB**  | [Supabase](https://supabase.com/) (PostgreSQL)                                              | Auth, database engine with strict Row Level Security (RLS) policies   |
| **Charts**        | [Victory Native XL](https://commerce.nearform.com/open-source/victory-native)               | High-performance canvas-rendered charts and graphs                    |
| **Testing**       | [Jest](https://jestjs.io/)                                                                  | Comprehensive unit testing for financial formulas and math operations |

---

## 📂 Project Architecture

hiSaab follows a **Feature-First Architecture** ensuring high module cohesion, clear boundaries, and scale resilience:

```
hiSaab-App/
├── __tests__/              # Unit test suites (financial logic & math formulas)
├── assets/                 # App icons, splash screens, and image assets
├── src/
│   ├── app/                # Expo Router screen routes & layouts
│   │   ├── (auth)/         # Auth stack (Login, SignUp, OTP verification)
│   │   └── (app)/          # Main app stack & tab navigators
│   │       ├── (tabs)/     # Bottom tabs (Dashboard, Groups, Analytics, Profile)
│   │       ├── groups/     # Group detail views, expense creation, settlements
│   │       ├── personal.tsx# Personal finance & budget dashboard
│   │       └── tiffin.tsx  # Tiffin meal tracker dashboard
│   ├── components/         # Reusable design system UI primitives
│   │   └── ui/             # Buttons, Cards, Skeletons, Toasts, Avatars, Banners
│   ├── constants/          # Design tokens, theme colors, typography definitions
│   ├── hooks/              # Custom React hooks (Network, Haptics, Auth)
│   ├── services/           # Supabase client API wrappers & push notifications
│   ├── store/              # Zustand stores (Auth, Sync Queue, Theme, Toast, Network)
│   ├── types/              # Database models, API responses, and TypeScript interfaces
│   └── utils/              # Financial math, currency formatting, date utilities
├── supabase/
│   └── migrations/         # PostgreSQL schema definitions, functions & RLS policies
├── app.json                # Expo application configuration
├── tailwind.config.js      # NativeWind theme token extensions
└── tsconfig.json           # TypeScript configuration
```

---

## ⚙️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0 or higher)
- [npm](https://www.npmjs.com/) or [Bun](https://bun.sh/)
- [Expo Go](https://expo.dev/go) app installed on iOS / Android device or an Emulator configured (Android Studio / Xcode)

### Installation Steps

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/darshansapnar/hiSaab-App---Expense-Tracker.git
   cd hiSaab-App---Expense-Tracker
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. **Apply Supabase Database Migrations:**
   Apply all SQL scripts located in `supabase/migrations/` to your Supabase PostgreSQL database to set up tables (`groups`, `expenses`, `splits`, `budgets`, `tiffin_tracker`, `profiles`) and Row Level Security (RLS) policies.

5. **Start the Development Server:**
   ```bash
   npx expo start
   ```
   - Press `a` to open in Android Emulator
   - Press `i` to open in iOS Simulator
   - Scan the displayed QR code with the Expo Go app on a physical device

---

## 🧪 Running Unit Tests

hiSaab includes automated unit tests covering financial split calculations, rounding edge cases, and debt simplification algorithms.

To run the test suite:

```bash
npm test
```

---

## 🔒 Security & Data Privacy

- **Row Level Security (RLS):** Enforced on PostgreSQL database level. Users can strictly only view or mutate data within groups where they hold verified membership.
- **Secure Token Persistence:** Authentication tokens are stored using native encrypted storage via `expo-secure-store`.
- **Financial Accuracy:** All money values are stored and calculated using exact fixed-point decimal arithmetic (`decimal(12,2)`) to eliminate floating-point precision errors.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Crafted with ❤️ for students, flatmates, and travelers.
</p>
