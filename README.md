# Snack Builders React UI

A React + TypeScript + Vite control center for manually and automatically testing the Snack Builders Bakery backend challenge.

It covers:

- Menu Management
  - List menu items
  - Create menu items
  - Update selected menu items
  - Deactivate menu items
  - Verify bake-time rules by category: cookies 5m, pastries 10m, breads 20m
- Order Placement
  - Multi-item tickets
  - Priority level selection: Tier 1 VIP, Tier 2 App/Delivery, Tier 3 Walk-in
  - Total price verification
  - Estimated ready time visibility
  - Order tracking
  - Item add / quantity update / removal
- Payment Management
  - Cash payment
  - Credit card payment
  - Bill lookup and amount due loading
  - Payment status refresh
- Kitchen Monitoring
  - 2 ovens × 3 slots visualization
  - Active bakes by oven/tray
  - Waiting queue sorted by priority
  - Raw kitchen snapshot debugging
- Automated Testing Console
  - Smoke test
  - Complete E2E flow
  - Priority scenario that fills all 6 slots and inserts a VIP order
- Developer Diagnostics
  - Generated universal admin JWT
  - Full request/response log
  - Vite `/api` proxy support to avoid browser CORS during local testing

## Quick start

```bash
unzip snack-builders-react-ui.zip
cd snack-builders-react-ui
cp .env.example .env.local
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Recommended `.env.local`

Use the Vite proxy so the browser calls `/api` locally and Vite forwards traffic to API Gateway.

```env
VITE_API_BASE_URL=/api
VITE_PROXY_TARGET=https://j6zpaomc2l.execute-api.us-east-1.amazonaws.com
VITE_DEMO_JWT_SECRET=dev-only-snack-builders-secret
```

For GitHub Pages, define `VITE_PROXY_TARGET` as a repository variable with the API Gateway base URL. The static production build cannot use the Vite `/api` proxy.

Restart Vite after changing `.env.local`:

```bash
npm run dev
```

In the UI, keep **Base URL** as:

```text
/api
```

## Authentication

The app can generate the demo admin JWT expected by the backend services. The generated token includes these scopes:

```text
menu:read
menu:write
orders:create
orders:read
orders:write
payments:create
kitchen:read
kitchen:write
```

Use **Dashboard → Generate admin JWT** before running tests.

## Suggested test order

1. Dashboard → Generate admin JWT.
2. Menu → Refresh, then Seed 3 demo items if the menu is empty.
3. Test Console → Smoke.
4. Test Console → Run E2E.
5. Test Console → Priority scenario.
6. Kitchen → Refresh kitchen to inspect active oven slots and queued tasks.

## Notes

- This UI intentionally stores temporary session state in `localStorage` so you can switch panels without losing recently created IDs.
- The source of truth remains the backend API. Use Refresh buttons to reload current state.
- The priority scenario does not accelerate backend time. It validates observable scheduling state by filling capacity and checking queued/active tasks and recalculated ETAs.
