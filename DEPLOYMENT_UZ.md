# Kiosk Xisobot Adminka - Deploy va Arxitektura Qo'llanmasi (O'zbek tilida)

Ushbu loyiha **Backend (Flask API)** va **Frontend (Static UI)** qismlariga to'liq ajratilgan bo'lib, bulutli platformalar (**Render.com** hamda **Cloudflare Pages**) uchun moslashtirilgan.

---

## 1. Loyiha Tuzilishi (Folder Structure)

Loyihada faqat **2 ta asosiy papka** mavjud:

```text
kiosk-xisobot-adminka/
├── backend/                  # Python Flask API server
│   ├── app.py                # Asosiy API kodi (CORS va Healthcheck yoqilgan)
│   ├── requirements.txt      # Backend bog'liqliklari
│   ├── Procfile              # Production ishga tushirish buyrug'i
│   ├── data.xlsx             # Tranzaksiyalar bazasi
│   └── excellar/             # Oylik Excel hisobotlar
│
├── frontend/                 # Static HTML/CSS/JS veb-interfeys
│   ├── index.html            # Asosiy interfeys sahifasi
│   ├── css/                  # Dizayn va stillar (style.css)
│   └── js/                   # JavaScript fayllar
│       ├── config.js         # API manzili sozlamasi (API_BASE_URL)
│       └── main.js           # Interfeys va analitika mantiqi
│
├── render.yaml               # Render.com avtomatik deploy konfiguratsiyasi
├── DEPLOYMENT_UZ.md          # Ushbu yo'riqnoma
└── .gitignore
```

---

## 2. Backend ni Render.com ga joylashtirish (Deploy Backend)

### 1-qadam: GitHub ga yuklash
Barcha o'zgarishlarni GitHub reposiga `push` qiling:
```bash
git add .
git commit -m "Clean frontend/backend structure"
git push origin main
```

### 2-qadam: Render.com da Web Service yaratish
1. [Render.com Dashboard](https://dashboard.render.com) ga kiring.
2. **New +** -> **Web Service** tugmasini bosing.
3. GitHub omboringizni tanlang va **Connect** qiling.

### 3-qadam: Sozlamalarni kiritish
* **Name**: `kiosk-xisobot-adminka`
* **Region**: `Singapore` (yoki o'zingizga maqbul region)
* **Branch**: `main`
* **Root Directory**: `backend` *(Muhim: `backend` deb kiriting)*
* **Runtime**: `Python 3`
* **Build Command**: `pip install -r requirements.txt`
* **Start Command**: `gunicorn app:app`
* **Instance Type**: `Free`

### 4-qadam: Environment Variables
**Environment Variables** bo'limida quyidagilarni kiritasiz:
- `PYTHON_VERSION`: `3.10.12`
- `ADMIN_PASSWORD`: Sizning admin parolingiz (masalan: `admin123`)

### 5-qadam: Deploy
**Create Web Service** tugmasini bosing. 2-3 minutda server ishga tushadi va sizga domen beriladi:
> **Backend URL**: `https://kiosk-xisobot-adminka.onrender.com`

---

## 3. Frontend ni Cloudflare Pages ga joylashtirish (Deploy Frontend)

### 1-qadam: API havolasini ulash
`frontend/js/config.js` faylini oching va `API_BASE_URL` o'zgaruvchisiga Render bergan domen havolasini yozing:

```javascript
const API_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'))
    ? 'http://127.0.0.1:5050'
    : 'https://kiosk-xisobot-adminka.onrender.com'; // <-- Render havolasi
```

O'zgarishni GitHub-ga `git push` qiling.

### 2-qadam: Cloudflare Pages da loyiha yaratish
1. [Cloudflare Dashboard](https://dash.cloudflare.com) ga kiring.
2. Menyudan **Workers & Pages** -> **Create application** -> **Pages** bo'limiga o'ting.
3. **Connect to Git** tugmasini bosib, GitHub reposini tanlang.

### 3-qadam: Build sozlamalari
* **Project name**: `kiosk-hisobot`
* **Production branch**: `main`
* **Framework preset**: `None`
* **Build command**: *(Bo'sh qoldiring)*
* **Build output directory**: `frontend` *(Muhim: `frontend` deb kiriting)*

### 4-qadam: Deploy
**Save and Deploy** tugmasini bosing. 1 minut ichida veb-saytingiz bepul va juda tezkor Cloudflare domenida ishga tushadi:
> **Frontend URL**: `https://kiosk-hisobot.pages.dev`

---

## 4. UptimeRobot Orqali Backend-ni 24/7 Uxlab Qolmasligini Ta'minlash (Keep-Alive)

Render.com bepul tarifida serverga 15 minut davomida so'rov kelmasa, u "uxlab qoladi" (sleep mode). Saytga birinchi kirgan odam server uyg'onishini 30-50 sek kutilishining oldini olish uchun **UptimeRobot** moslashtirilgan.

Backend ilovasiga maxsus eng yengil va tezkor Ping API lari kiritilgan:
* `https://kiosk-xisobot-adminka.onrender.com/ping`
* `https://kiosk-xisobot-adminka.onrender.com/healthz`
* `https://kiosk-xisobot-adminka.onrender.com/api/ping`

### UptimeRobot-da sozlash:
1. [UptimeRobot.com](https://uptimerobot.com) saytiga bepul ro'yxatdan o'ting.
2. **Add New Monitor** tugmasini bosing.
3. Sozlamalarni kiritasiz:
   * **Monitor Type**: `HTTP(s)`
   * **Friendly Name**: `Kiosk Backend Ping`
   * **URL (or IP)**: `https://kiosk-xisobot-adminka.onrender.com/ping`
   * **Monitoring Interval**: `Every 5 minutes` (yoki `10 minutes`)
4. **Create Monitor** tugmasini bosing.

> **Natija**: UptimeRobot har 5 minutda `/ping` manziliga so'rov yuboradi. Server hech qachon uxlab qolmaydi va frontend foydalanuvchilariga doimo soniyalarda tezkor javob beradi.

---

## 5. Mahalliy (Local) kompyuterda ishga tushirish

Mahalliy kompyuterda sinash uchun:

1. **Backend-ni ishga tushirish**:
   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```
   *(Backend `http://127.0.0.1:5050` manzilda ishga tushadi)*

2. **Frontend-ni ochish**:
   Browser-da `frontend/index.html` faylini bevosita ochishingiz yoki VS Code Live Server orqali ko'rishingiz mumkin.
