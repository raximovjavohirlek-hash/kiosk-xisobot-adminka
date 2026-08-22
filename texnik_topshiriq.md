# TEXNIK TOPSHIRIQ (TZ)
## "Kiosk Hisobot Adminka" – Avtomatlashtirilgan Kiosk Sotuvlari Analitikasi va Boshqaruv Tizimi

---

## 1. UMUMIY MA'LUMOTLAR

- **Loyiha nomi:** "Kiosk Hisobot Adminka" (Kiosk Sales Analytics & Administration System).
- **Loyiha maqsadi:** O'zbekiston temir yo'llari yo'lovchi tashish kassa kiosklarining chipta sotuv ma'lumotlarini qabul qilish, aqlli filtratsiya va deduplikatsiya qilish, oylik/kunlik statistikani avtomatik jamlash hamda rahbariyat va administratorlar uchun vizual interfeys (Dashboard) taqdim etish.
- **Tizim foydalanuvchilari:**
  1. **Rahbariyat va Tahlilchilar (Oddiy foydalanuvchi / Viewer):** Sotuv ko'rsatkichlari, dinamika, taqqoslash va reytinglarni ko'rish huquqiga ega.
  2. **Bosh Administrator (Admin):** Excel hisobotlarni yuklash, kiosklar sotuvini qo'lda tahrirlash (Sales Override), foydalanuvchilar va stansiyalar birikmasini boshqarish huquqiga ega.

---

## 2. TIZIMNING MAQSADI VA VAZIFALARI

1. **Ma'lumotlarni Avtomatik Qabul Qilish va Deduplikatsiya:**
   - Har kuni 1 yoki bir necha marotaba yuklanadigan katta hajmli Excel (`.xlsx`, `.xls`) fayllaridan ma'lumotlarni avtomatik o'qish.
   - Bir kunda bir necha bor yuklanganda takroriy chipta yozuvlarini unikal kalitlar (`ticket_number` + `date_str` + `user_email` + `summa`) bo'yicha idempotent tarzda deduplikatsiya qilish (dublikatlarni o'tkazib yuborish).
2. **Kiosk Stansiyalarini Filtratsiyalash (Whitelist):**
   - Excel faylidagi barcha ma'lumotlar orasidan faqat tasdiqlangan **15 ta Kiosk stansiyasiga** tegishli pochta ko'rsatkichlarini ajratib olish va qayta ishlash.
3. **Rahbariyat Dashboard Interfeysi:**
   - Oylik, kunlik va yillik (YTD) sotuv ko'rsatkichlarini real vaqt rejimida vizual grafik va jadvallarda aks ettirish.
   - Kassalar reytingi, stansiyalarning sotuvdagi ulushi (%) va to'lov turlari (Terminal va Online) kesimida analitika berish.
4. **Kassalar Sotuvini Qo'lda Tahrirlash (Kiosk Sales Override):**
   - Muayyan kiosk stansiyalarining sotuvi obyektiv sabablarga ko'ra kam bo'lganda yoki tuzatish talab etilganda, Administratorga chiptalar soni va summasini qo'lda o'zgartirish imkonini berish.
   - Kiritilgan o'zgarishlarni to'g'ridan-to'g'ri bazaga saqlash va dashboard grafik hamda matritsalarida darhol qayta aks ettirish.
5. **Xavfsizlik va Kirish Huquqlarini Cheklash (RBAC):**
   - Tahrirlash va ma'lumot yuklash imkoniyatlarini faqat tasdiqlangan Admin foydalanuvchisi uchun cheklash.

---

## 3. FUNKTSIONAL TALABLAR

### 3.1. Ruxsat Etilgan Kiosk Stansiyalari Ro'yxati (15 ta Stansiya)
Tizim quyidagi 15 ta kassa e-mail manzillari bo'yicha ma'lumotlarni taniydi va hisobga oladi:
1. `toshkent.shimoliykiosk@railway.uz` – Тошкент Марказий
2. `kiosk@axonlogic.uz` – Тошкент Жанубий
3. `samarqandkiosk@railway.uz` – Самарқанд
4. `urganchkiosk@railway.uz` – Урганч
5. `khivakiosk@railway.uz` – Хива
6. `navoiykiosk@railway.uz` – Навои
7. `buxorokiosk@railway.uz` – Бухоро
8. `qongirotkiosk@railway.uz` – Қўнғирод
9. `nukuskiosk@railway.uz` – Нукус
10. `andijonkiosk@railway.uz` – Андижон
11. `qoqonkiosk@railway.uz` – Қўқон
12. `margilonkiosk@railway.uz` – Марғилон
13. `namangankiosk@railway.uz` – Наманган
14. `termizkiosk@railway.uz` – Термиз
15. `qarshikiosk@railway.uz` – Қарши

### 3.2. Excel Fayllarni Yuklash va Idempotent Integratsiya
- Admin foydalanuvchisi Drag-and-Drop yoki fayl tanlash orqali Excel faylini yuklaydi.
- Tizim fayl sarlavhalarini avtomatik normallashtiradi (`Sana`, `Chipta raqami`, `Kassa email`, `Soni`, `Summa`, `To'lov turi`).
- Qayta ishlanganda:
  - Yangi yozuvlar SQLite `tickets` jadvaliga `INSERT` qilinadi.
  - Avval yuklangan takroriy yozuvlar e'tiborsiz qoldiriladi (`skipped`).
  - Yuklash tugagach, barcha oylik va kunlik aggregatsiya jadvallari (`monthly_summaries`, `station_monthly_stats`, `daily_stats`, `station_daily_breakdown`) avtomatik qayta shakllantiriladi.

### 3.3. Rahbariyat Dashboard Interfeysi (Executive Dashboard)
- **KPI Kartochkalari:** Jami sotilgan chiptalar soni, Jami tushum summasi (so'm), Faol stansiyalar soni va O'rtacha chipta narxi.
- **Sotuv Dinamikasi Grafigi (Line Chart):** Kunlik va oylik sotuv tendensiyalari.
- **Stansiyalar Reytingi va Ulushi (Bar/Pie Chart & Matrix):** Stansiyalarning sotuv hajmi bo'yicha 1, 2, 3-o'rin va umumiy ulush foizi (Share %).
- **Period Filter:** Muayyan oy bo'yicha (masalan: `Avgust 2026`, `Iyul 2026`) yoki Butun Yillik (YTD) ko'rsatkichlarni bir bosishda ko'rish.

### 3.4. Admin Kiosk Sales Override (Kassalar Sotuvini Qo'lda Tahrirlash)
- Faqat Admin rolidagi foydalanuvchiga taqdim etiladi.
- Admin hisobot oyi va stansiyani tanlab, unga tegishli sotilgan chiptalar soni hamda tushum summasini kiritadi.
- Ma'lumotlar SQLite `station_overrides` jadvaliga yoziladi.
- Bazadagi barcha jamlanma va ulush foizlari qayta hisoblanadi va dashboardda darhol aks etadi.
- Admin xohlagan vaqtda kiritgan tahririni bekor qilib (`Reset / Delete`), asl Excel ko'rsatkichlariga qaytarishi mumkin.

---

## 4. MA'LUMOTLAR BAZASI STRUKTURASI (SQLite Schema)

Tizim SQLite ma'lumotlar bazasida 6 ta asosiy jadvaldan foydalanadi:

1. `tickets` – Barcha deduplikatsiya qilingan xom chiptalar tranzaksiyalari.
2. `monthly_summaries` – Oylar bo'yicha jami sotuv va chiptalar soni.
3. `station_monthly_stats` – Stansiyalarning oylik sotuvi, chipta soni va ulush foizi (`share_percent`).
4. `station_daily_breakdown` – Stansiyalarning kunlik sotuv tafsilotlari.
5. `daily_stats` – Kunlik sotuv va to'lov turlari (Online / Terminal) ko mezonlari.
6. `station_overrides` – Admin tomonidan kiritilgan qo'lda sotuv tahrirlari.

---

## 5. TEXNIK ARXITEKTURA VA TEXNOLOGIYALAR STEKI

| Qatlam | Texnologiya / Framework | Vazifasi |
| :--- | :--- | :--- |
| **Backend** | Python 3.10+, Flask REST API | API backend, fayllarni qayta ishlash, biznes logika |
| **Database** | SQLite3 | Yengil, tezkor va ishonchli relyatsion ma'lumotlar bazasi |
| **Excel Engine** | Pandas, OpenPyXL | Excel fayllarini aqlli o'qish va ma'lumotlarni normallashtirish |
| **WSGI Server** | Gunicorn (`--timeout 300`, `--workers 2`) | Production rejimida Flask dasturini barqaror yurgizish |
| **Frontend** | Vanilla HTML5, CSS3, ES6+ JavaScript | Modern Glassmorphism interfeys, SPA dinamika |
| **Visualization** | Apache ECharts / Chart.js | Veb-grafiklar va dinamik diagrammalar |
| **Cloud Backend** | Render.com Web Service | Python Flask API server hostinqi |
| **Cloud Frontend** | Cloudflare Pages CDN | Static HTML/CSS/JS frontend hostinqi |
| **Uptime Monitor**| UptimeRobot Keep-Alive | Backend serverni 24/7 faol holatda ushlab turish (`/ping`) |

---

## 6. XAVFSIZLIK VA UNUMDORLIK TALABLARI

1. **Autentifikatsiya va Avtorizatsiya (JWT):**
   - Admin amal bajarayotganda (`POST /api/upload`, `POST /api/admin/override-station`, `DELETE /api/admin/overrides`) `Authorization: Bearer <token>` tekshiriladi.
   - Noto'g'ri so'rovlar uchun `401 Unauthorized` va `403 Forbidden` javobi qaytariladi.
2. **Katta Hajmli Fayllar Bilan Ishlash (Unumdorlik):**
   - 35 000+ qatordan iborat Excel fayllar yuklanganda server to'xtab qolmasligi uchun Gunicorn timeout chegarasi **300 soniyaga** oshirilgan.
3. **CORS Policy:**
   - Backend API faqat ruxsat berilgan domen (Cloudflare Pages va Localhost) so'rovlariga javob beradi.

---

## 7. XULOSA VA KAFOLAT

Ushbu Texnik Topshiriq (TZ) bo'yicha ishlab chiqilgan "Kiosk Hisobot Adminka" tizimi temir yo'l yo'lovchi tashish kassa kiosklarining sotuv analitikasini avtomatlashtirish, inson omilidan kelib chiqadigan xatoliklarning oldini olish hamda rahbariyatga aniq va tezkor sotuv ko'rsatkichlarini taqdim etishga to'liq xizmat qiladi.
