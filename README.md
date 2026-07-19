# hiSaab — Shared Finance Platform

> "Keep the hisaab clear."

hiSaab is a modern, premium, and lightning-fast shared finance mobile application tailored for hostel students, flatmates, friends, families, couples, and travel groups. 

Unlike generic expense splitters, hiSaab is built specifically for the everyday shared living experience. It seamlessly manages both one-off group expenses (like trips or dinners) and recurring daily utilities (like tiffin subscriptions and shared grocery lists).

---

## 🚀 Key Features

*   **Group Expense Splitting:** Flexible splitting methods (equal, percentage, exact shares, adjustment amounts) with instant balance recalculations.
*   **Everyday Trackers:** 
    *   **Tiffin Tracker:** Track meal subscriptions, skip days, and divide costs transparently.
    *   **Shared Groceries:** Real-time checklist that syncs purchases and automatically updates balances.
*   **Monthly Budgets:** Visual budget bars with custom notification thresholds (e.g., alert at 80% spending limit).
*   **Visual Analytics:** Spend tracking breakdown, category breakdowns, and historical trends powered by Victory Native XL.
*   **Offline-First Architecture:** Log expenses anywhere, anytime. Transactions are queued locally and automatically synced once a network connection is detected.
*   **Premium Aesthetics:** A high-contrast dark mode palette, smooth micro-animations, and tactile haptic feedback inspired by CRED, Spotify, Notion, and Linear.

---

## 🛠️ Technology Stack

### Frontend
*   **Framework:** React Native (via **Expo SDK** managed workflow)
*   **Navigation:** **Expo Router** (file-system based routing)
*   **Language:** **TypeScript** (Strict Mode)
*   **Styling:** **NativeWind v4** (Tailwind CSS for React Native)
*   **State Management:** **Zustand** (with persistence for offline sync)
*   **Data Fetching & Cache:** **TanStack Query** (React Query)
*   **Data Visualization:** **Victory Native XL**

### Backend & Services
*   **Backend:** **Supabase**
*   **Database:** PostgreSQL (with Row Level Security and triggers)
*   **Realtime:** Supabase Realtime (for live grocery lists and instant balance updates)
*   **Authentication:** Supabase Auth (Email OTP, Magic Links, and Password)
*   **Storage:** Supabase Storage (for receipt images)
*   **Edge Functions:** Supabase Edge Functions (for math settlement calculations and AI insights)

---

## 📂 Folder Structure

The project follows a **Feature-First Architecture** to ensure high cohesion, low coupling, and easy maintainability as features scale.

```
src/
├── app/                    # Expo Router route definitions and layout files
│   ├── (auth)/             # Authentication screen routes
│   └── (app)/              # Main app routes (Dashboard, Groups, Trackers, Profile)
├── components/             # Reusable global UI widgets & atomic elements
│   └── ui/                 # Design System primitives (Buttons, Inputs, Cards, Sheets)
├── constants/              # Style guidelines, theme definitions, colors, and layout variables
├── hooks/                  # Global hooks (network state, haptics, auth status)
├── services/               # Core service integrations (Supabase client config)
│   └── api/                # Database API wrappers & queries
├── store/                  # Zustand stores (Auth, Sync Queue, Theme)
├── types/                  # Shared TypeScript interfaces & types
└── utils/                  # Math formulas, currency formatters, date helpers
```

---

## ⚙️ Installation & Running Locally

### Prerequisites
*   Node.js (v18 or higher)
*   npm or Bun
*   Expo Go app installed on your physical device (iOS/Android) or an emulator configured

### Setup Steps
1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/your-username/hisab-app.git
    cd hisab-app
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root directory:
    ```env
    EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
    ```

4.  **Start the Expo Server:**
    ```bash
    npx expo start
    ```

5.  **Run the App:**
    *   Scan the QR code displayed in the terminal with your phone's camera (iOS) or the Expo Go app (Android).
    *   Press `a` for Android Emulator or `i` for iOS Simulator.

---

## 🔒 Security & Performance

*   **Row Level Security (RLS):** Enabled on all Supabase PostgreSQL tables. Users can only access data belonging to groups of which they are active members.
*   **Optimistic Updates:** Frontend UI updates immediately on user input (e.g., logging an expense) while background sync guarantees database consistency.
*   **Strict Math:** Currency calculations are stored in PostgreSQL as `decimal(12,2)` to prevent floating-point calculation anomalies.

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
