# Prime Kicks — Backend API

Node.js / Express / MongoDB REST API for the Prime Kicks Kenya shoe store.

---

## Project Structure

```
primekicks-backend/
├── config/
│   └── db.js                 # MongoDB connection
├── logs/                     # Auto-created at runtime
├── middleware/
│   ├── auth.js               # JWT guards (admin + customer)
│   ├── security.js           # Helmet, rate limiters, sanitisers
│   └── upload.js             # Multer + Sharp image processing
├── models/
│   └── index.js              # Mongoose schemas (Product, Settings, User)
├── routes/
│   ├── adminAuth.js          # POST /api/admin/login  etc.
│   ├── customerAuth.js       # POST /api/auth/register  etc.
│   ├── products.js           # CRUD for shoes + reviews
│   └── settings.js           # Store settings (logo, social, location…)
├── utils/
│   └── logger.js             # Winston logger
├── .env.example              # Template — copy to .env
├── .gitignore
├── package.json
├── README.md
└── server.js                 # Entry point
```

---

## Quick Start (Local Development)

### 1 — Prerequisites
- Node.js ≥ 18
- A free [MongoDB Atlas](https://cloud.mongodb.com) cluster

### 2 — Install
```bash
git clone https://github.com/yourname/primekicks-backend.git
cd primekicks-backend
npm install
```

### 3 — Configure .env
```bash
cp .env.example .env
# Open .env and fill in MONGO_URI, JWT_SECRET, admin passwords, etc.
```

### 4 — Run
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server starts on http://localhost:5000  
Health check: http://localhost:5000/api/health

---

## Serving the Frontend

Place your `index.html` and `admin.html` in a `public/` folder at the root:
```
primekicks-backend/
└── public/
    ├── index.html
    └── admin.html
```

The server will:
- Serve `index.html` at `/` with `window.API_BASE` injected
- Serve `admin.html` at `/admin` with admin usernames injected (passwords are **never** sent to the client)

---

## Security Features

| Feature | Detail |
|---|---|
| **Helmet** | Sets 14 security HTTP headers |
| **bcrypt (cost 12)** | All passwords hashed — admin and customer |
| **JWT** | Stateless auth, short-lived tokens (8h admin / 7d customer) |
| **Rate limiting** | 150 req/15 min general · 10 login attempts/15 min auth |
| **Timing-safe login** | Dummy bcrypt compare prevents username enumeration |
| **MongoDB sanitiser** | Strips `$` and `.` from inputs — blocks NoSQL injection |
| **HPP guard** | Prevents HTTP Parameter Pollution attacks |
| **CORS whitelist** | Only your exact frontend origins allowed |
| **Input validation** | express-validator on every route |
| **No plaintext passwords** | Admin passwords hashed at startup, never stored or sent to client |
| **Gzip compression** | Responses compressed above 1 KB |

---

## API Reference

### Health
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | None | Server status |

### Admin Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/login` | None | Login → returns JWT |
| GET | `/api/admin/me` | Admin JWT | Get current admin |
| POST | `/api/admin/logout` | Admin JWT | UX logout (client discards token) |

### Customer Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Create account |
| POST | `/api/auth/login` | None | Login → returns JWT |
| GET | `/api/auth/me` | Customer JWT | Get profile + orders |
| PATCH | `/api/auth/me` | Customer JWT | Update name / phone |
| POST | `/api/auth/change-password` | Customer JWT | Change password |
| POST | `/api/auth/order` | Customer JWT | Record a WhatsApp order |

### Products (Public)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/products` | None | List visible products (`?category=running&search=air&sort=price&order=asc`) |
| GET | `/api/products/:id` | None | Single product |
| POST | `/api/products/:id/reviews` | Optional | Submit review |

### Products (Admin)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/products/admin/all` | Admin JWT | All products including hidden |
| POST | `/api/products` | Admin JWT | Create product |
| PUT | `/api/products/:id` | Admin JWT | Update product |
| PATCH | `/api/products/:id/visibility` | Admin JWT | Toggle hidden/visible |
| DELETE | `/api/products/:id` | Admin JWT | Delete product |
| DELETE | `/api/products/:id/reviews/:rid` | Admin JWT | Delete a review |

### Settings
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/settings` | None | Public settings (group link hidden) |
| GET | `/api/settings/admin` | Admin JWT | Full settings including group link |
| PATCH | `/api/settings/drop-alert` | Admin JWT | Update drop alert banner |
| PATCH | `/api/settings/logo` | Admin JWT | Update logo (base64) |
| PATCH | `/api/settings/about` | Admin JWT | Update vision / mission / goal |
| PATCH | `/api/settings/social` | Admin JWT | Update social links |
| PATCH | `/api/settings/whatsapp` | Admin JWT | Update WA number / group / QR |
| PATCH | `/api/settings/location` | Admin JWT | Update address / hours / map |

---

## Deployment on Render (Free Tier)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Add all environment variables from `.env` under **Environment**
6. Deploy — Render gives you a free `https://xxx.onrender.com` URL
7. Set `ALLOWED_ORIGINS` to your frontend domain
8. Set `API_BASE_URL` to your Render URL

---

## Example Requests

**Admin Login**
```bash
curl -X POST https://api.primekicks.co.ke/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"owner","password":"YourPassword1!"}'
```

**Create Product (with admin JWT)**
```bash
curl -X POST https://api.primekicks.co.ke/api/products \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AeroStride Pro",
    "brand": "Prime Kicks",
    "category": "running",
    "badge": "new",
    "price": 9500,
    "sizes": ["40","41","42","43","44","45"],
    "desc": "Lightweight carbon-plate running shoe"
  }'
```

**Customer Register**
```bash
curl -X POST https://api.primekicks.co.ke/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Amara",
    "lastName": "Kiprop",
    "email": "amara@example.com",
    "phone": "+254712345678",
    "password": "SecurePass123!"
  }'
```

---

## Connecting the Frontend

In `index.html` and `admin.html`, replace `localStorage` calls with API calls. The server injects `window.API_BASE` automatically when serving from the `public/` folder.

```javascript
// Example: load products
const res  = await fetch(`${window.API_BASE}/products`);
const data = await res.json();
// data.products → array of shoe objects

// Example: admin login
const res = await fetch(`${window.API_BASE}/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});
const { token } = await res.json();
// Store token in sessionStorage, send as Authorization: Bearer <token>
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | Yes | Port to listen on (default 5000) |
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | 64-char random hex string |
| `JWT_EXPIRES_IN` | No | Token lifetime (default `7d`) |
| `ADMIN_1_USER` | Yes | Admin 1 username |
| `ADMIN_1_PASS` | Yes | Admin 1 password (bcrypt-hashed at startup) |
| `ADMIN_2_USER` | No | Admin 2 username |
| `ADMIN_2_PASS` | No | Admin 2 password |
| `ADMIN_3_USER` | No | Admin 3 username |
| `ADMIN_3_PASS` | No | Admin 3 password |
| `ADMIN_4_USER` | No | Admin 4 username |
| `ADMIN_4_PASS` | No | Admin 4 password |
| `ALLOWED_ORIGINS` | Yes | Comma-separated frontend URLs |
| `RATE_LIMIT_MAX` | No | Max requests/15 min (default 150) |
| `AUTH_RATE_LIMIT_MAX` | No | Max login attempts/15 min (default 10) |
| `MAX_FILE_SIZE_MB` | No | Max image upload size (default 5) |
| `MAX_IMAGES_PER_PRODUCT` | No | Max images per shoe (default 6) |
| `API_BASE_URL` | No | Injected into frontend as `window.API_BASE` |
| `LOG_LEVEL` | No | Winston log level (default `info`) |
