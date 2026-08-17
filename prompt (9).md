# Project Prompt: Personal Expense Tracker + Location-Triggered WhatsApp Notifier

## 1. Overview

Build a mobile/web app that combines two core capabilities:

1. **Expense Tracking System** — log and manage personal expenses (rent, food, grocery, etc.) with date-wise entries and exportable reports.
2. **Geofenced WhatsApp Auto-Notifier** — automatically detect when the user arrives at a saved location (e.g., college, room/hostel) and trigger a WhatsApp message to a parent or a chosen list of contacts, sent from the user's own WhatsApp account via an unofficial WhatsApp automation library.

The app should work as a personal-use tool first (single user, local-first data), with the option to extend later to multiple users/accounts.

---

## 2. Feature Breakdown

### 2.1 Expense Tracking
- Add an expense entry with:
  - Date
  - Category (Rent, Lunch, Food, Grocery, Other — user can add custom categories)
  - Amount
  - Optional note
- Edit/delete existing entries
- View expenses grouped by date / category / month
- Export reports:
  - **PDF export** (formatted summary/report)
  - **Excel export** (.xlsx, raw tabular data for further analysis)
- Filter/search by date range or category

### 2.2 Location Detection & Geofencing
- User can **pin specific locations** (e.g., "College", "Room/Hostel") by saving GPS coordinates.
- App runs a background location check (geofencing) and detects when the user **enters/reaches** a pinned location.
- On detecting arrival, the app **automatically triggers** a WhatsApp message send — no manual action needed.

### 2.3 WhatsApp Auto-Messaging
- User can maintain a **contact list** (e.g., parent(s), guardians) to whom auto-messages should be sent.
- User can add/remove numbers from this notify list at any time.
- WhatsApp messages are sent using the **user's own WhatsApp account** (not a business API), via one of:
  - **Baileys** (Node.js library, WebSocket-based, no browser needed) — preferred for a lightweight backend service.
  - **open-wa** (Open source, Puppeteer/browser-based automation) — alternative if Baileys has connectivity issues.
- App should support scanning a QR code (or pairing code) once to **link the user's WhatsApp** to the backend service, similar to WhatsApp Web.
- Message content should be templated, e.g.: *"Reached [Location Name] at [time]."* — with location name and timestamp filled dynamically.

### 2.4 Local Data & Logging (from secondary notes — best-effort interpretation, confirm with stakeholder if needed)
- Keep expense and location data **stored locally on the device** where possible, rather than solely in the cloud, for privacy.
- Maintain a **log/history** of every auto-message sent (timestamp, location, recipient, message content, delivery status) that the user can review inside the app.
- Consider **Firebase Cloud Messaging (FCM)** integration for push notifications / background wake-up triggers, so the app can reliably detect geofence events even when not actively open.
- Support a "per-location" auto-message rule, so different pinned locations can trigger different messages/recipients (e.g., "reached college" → parent group; "reached room" → a different contact).

---

## 3. Suggested Tech Stack

| Layer | Suggested Tech |
|---|---|
| Mobile app | React Native (or Flutter) for cross-platform Android/iOS |
| Backend | Node.js + Express (to host the WhatsApp automation service) |
| WhatsApp integration | Baileys (primary) or open-wa (fallback) |
| Location/Geofencing | `react-native-geolocation`, `react-native-background-geolocation`, or platform-native Geofencing APIs |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Local storage | SQLite / WatermelonDB / AsyncStorage (for offline-first expense + config data) |
| Report generation | `pdfkit` / `jspdf` for PDF, `xlsx` (SheetJS) for Excel export |
| Auth (if multi-user later) | Firebase Auth or simple local PIN/passcode |

---

## 4. Step-by-Step Build Plan

### Phase 1 — Project Setup
1. Initialize the mobile app project (React Native/Flutter) and a separate Node.js backend service for WhatsApp automation.
2. Set up local database schema for: `expenses`, `pinned_locations`, `contacts`, `message_logs`.

### Phase 2 — Expense Tracker
3. Build UI for adding/editing/deleting expense entries (date, category, amount, note).
4. Build list/summary views (by date, category, month).
5. Implement PDF export of expense reports.
6. Implement Excel (.xlsx) export of expense reports.

### Phase 3 — Location & Geofencing
7. Implement "pin a location" flow — capture current GPS coords and let the user name it (e.g., "College").
8. Implement background geofencing that watches for arrival at any pinned location.
9. Handle permissions (foreground + background location access) properly for Android/iOS.

### Phase 4 — WhatsApp Integration
10. Stand up the Node.js backend with Baileys; implement QR-code pairing flow so the user links their personal WhatsApp.
11. Build an API endpoint the mobile app calls when a geofence event fires, which triggers Baileys to send a WhatsApp message.
12. Build the contacts/recipients management screen (add/remove numbers, assign recipients per location).
13. Add a fallback path to open-wa in case Baileys connection drops or gets blocked.

### Phase 5 — Notifications & Logging
14. Integrate FCM so geofence checks / triggers work reliably even when the app is backgrounded or closed.
15. Log every auto-sent message (time, location, recipient, status) and show this history in-app.

### Phase 6 — Polish & Testing
16. Test geofence accuracy and battery impact; tune update intervals.
17. Test WhatsApp send reliability and handle failure/retry cases.
18. Test PDF/Excel export formatting on real data.
19. Add basic settings screen (manage pinned locations, manage contacts, toggle auto-send on/off).

---

## 5. Open Questions / Assumptions to Confirm

- Some of the original handwritten notes (second set) were hard to read fully — assumptions were made about FCM's role and the "local data + per-location rules" behavior. Please confirm these match intent.
- Is this a single-user personal app, or should it support multiple user accounts from the start?
- Should WhatsApp messages go to a WhatsApp **group** (e.g., "parent group") or individual numbers, or both?
- Any preference between Baileys vs open-wa as the primary method, given Baileys is lighter but open-wa can be more stable for some WhatsApp Web versions?
