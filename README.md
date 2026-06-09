# Neón y Sabor Mi Rancho — POS System

Stack: Vanilla JS (ES Modules) + Supabase (PostgreSQL, Auth, Realtime)

---

## Setup in 5 Steps

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) → New Project → choose a name and password.

### 2. Run the schema
In your Supabase dashboard → **SQL Editor** → New Query → paste the contents of `supabase/schema.sql` → Run.

Then run `supabase/seed.sql` the same way to populate categories, menu items and tables.

### 3. Enable Realtime (for kitchen display)
Go to **Database → Replication** and enable the `orders` and `order_items` tables.

### 4. Add your credentials
Open `shared/supabase-client.js` and replace the two placeholder values:

```js
const SUPABASE_URL  = 'https://xxxx.supabase.co'
const SUPABASE_ANON = 'your-anon-public-key'
```

Both values are found in: Supabase → **Project Settings → API**.

### 5. Create staff accounts
In Supabase → **Authentication → Users** → Invite user (or use the sign-up form).  
Then open **Table Editor → profiles** and set the `role` column:

| Role      | Access                              |
|-----------|-------------------------------------|
| `admin`   | Everything                          |
| `waiter`  | Orders, Payments, Kitchen, Reports  |
| `kitchen` | Kitchen display only                |
| `customer`| Customer-facing site                |

---

## Project Structure

```
neon-y-sabor/
├── supabase/
│   ├── schema.sql          ← Full DB schema + RLS policies
│   └── seed.sql            ← Sample categories, menu items, tables
├── shared/
│   ├── supabase-client.js  ← Supabase client + helpers (set credentials here)
│   └── css/
│       └── design-system.css ← Neon dark theme, all reusable components
├── customerSide/           ← Public-facing website
│   ├── index.html          ← Menu browsing
│   ├── auth.html           ← Login / Register
│   ├── order.html          ← Delivery / takeout order flow
│   ├── table-order.html    ← Dine-in order from table (QR)
│   ├── mis-pedidos.html    ← Order history + live status
│   ├── track.html          ← Real-time order tracking
│   ├── reservations.html   ← Make / view reservations
│   ├── profile.html        ← Loyalty points, history
│   ├── css/customer.css
│   └── js/
│       ├── auth.js
│       ├── menu.js
│       ├── order.js
│       ├── table-order.js
│       ├── mis-pedidos.js
│       ├── track.js
│       ├── reservations.js
│       ├── profile.js
│       └── utils.js
└── adminSide/              ← Staff panel
    ├── login.html
    ├── dashboard.html      ← KPIs + charts
    ├── orders.html         ← POS terminal (split-panel)
    ├── kitchen.html        ← Real-time kitchen display
    ├── delivery.html       ← Delivery orders management
    ├── tables.html         ← Table / zone management
    ├── payments.html       ← Payment history + export
    ├── menu-management.html← CRUD menu items & categories
    ├── reservations.html   ← Reservation management
    ├── reports.html        ← Charts + CSV download
    ├── customers.html      ← Customer list + loyalty management
    ├── css/admin.css
    └── js/
        ├── admin-auth.js   ← Auth guard + shared shell
        ├── dashboard.js
        ├── orders.js       ← Full POS logic
        ├── kitchen.js      ← Supabase Realtime orders
        ├── delivery.js
        ├── tables.js
        ├── payments.js
        ├── menu-management.js
        ├── reservations.js
        ├── reports.js
        └── customers.js
```

---

## Running Locally

Because the project uses ES Modules (`import/export`) you need a local HTTP server — opening HTML files directly with `file://` will not work.

**Option A — VS Code Live Server extension**
Install "Live Server" → right-click `customerSide/index.html` → Open with Live Server.

**Option B — Node http-server**
```bash
npx http-server . -p 8080
```
Then open `http://localhost:8080/customerSide/index.html`.

**Option C — Python**
```bash
python -m http.server 8080
```

---

## Feature Map

| Feature | File |
|---|---|
| Customer menu browsing | `customerSide/index.html` + `js/menu.js` |
| Customer auth (login/register/reset) | `customerSide/auth.html` + `js/auth.js` |
| Delivery / takeout order flow | `customerSide/order.html` + `js/order.js` |
| Dine-in order from table (QR) | `customerSide/table-order.html` + `js/table-order.js` |
| Order history + live status | `customerSide/mis-pedidos.html` + `js/mis-pedidos.js` |
| Real-time order tracking | `customerSide/track.html` + `js/track.js` |
| Reservations (customer) | `customerSide/reservations.html` + `js/reservations.js` |
| Loyalty points profile | `customerSide/profile.html` + `js/profile.js` |
| Staff login (role-based redirect) | `adminSide/login.html` + `js/admin-auth.js` |
| POS terminal (take orders, send to kitchen) | `adminSide/orders.html` + `js/orders.js` |
| Real-time kitchen display | `adminSide/kitchen.html` + `js/kitchen.js` |
| Delivery orders management | `adminSide/delivery.html` + `js/delivery.js` |
| Table / zone management | `adminSide/tables.html` + `js/tables.js` |
| Process payment + print receipt | Inside `js/orders.js` (pay modal + receipt modal) |
| Payment history + export CSV | `adminSide/payments.html` + `js/payments.js` |
| Menu CRUD (items + categories) | `adminSide/menu-management.html` + `js/menu-management.js` |
| Reservation management (staff) | `adminSide/reservations.html` + `js/reservations.js` |
| Sales reports + charts + CSV | `adminSide/reports.html` + `js/reports.js` |
| Customer management + loyalty adjust | `adminSide/customers.html` + `js/customers.js` |
| Dashboard (KPIs + live charts) | `adminSide/dashboard.html` + `js/dashboard.js` |

---

## Color Palette

| Token | Value | Use |
|---|---|---|
| `--green` | `#39FF14` | Primary neon accent, success, prices |
| `--amber` | `#FFB300` | Secondary accent, warnings, featured |
| `--bg-0`  | `#080808` | Page background |
| `--bg-3`  | `#1e1e1e` | Cards |
| `--text-primary` | `#F2ECD8` | Body text (off-white beige) |

---

## Tax

IVA is set to **13%** (El Salvador) in `shared/supabase-client.js`:
```js
export const TAX_RATE = 0.13
```
Change this value for other regions.

---

## Loyalty Points

- 1 point earned per $1.00 spent
- Redeemable via staff panel (customers.html)
- Value: $0.01 per point (shown on profile page)
