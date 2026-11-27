# Flash Dostava — Web Dispečerski Centar (`dispatch-web`)

Ovaj folder sadrži **zero-build** web panel za dispečera (`React`-free ES modul aplikacija sa **Leaflet** mapom i **Supabase Realtime** pretplatom), spreman za trenutno pokretanje bez Node.js build koraka.

## 1. Podešavanje baze (jednokratno)
1. Otvorite Supabase Dashboard → **SQL Editor**.
2. Nalepite i pokrenite ceo sadržaj fajla [`../supabase_dispatch_system.sql`](../supabase_dispatch_system.sql).
3. Za naloge operatora koji nisu `dzambic@gmail.com`, u tabeli `profiles` postavite `role = 'dispatcher'` (ili `'admin'`) i `is_approved = true`.

## 2. Lokalno pokretanje na računaru
Iz root-a repozitorijuma pokrenite:
```powershell
python -m http.server 8080 --directory dispatch-web
```
Otvorite `http://localhost:8080` u browseru.
> U Supabase Auth → **URL Configuration → Redirect URLs** dodajte `http://localhost:8080` i vaš produkcioni HTTPS domen.

## 3. Besplatno hostovanje (GitHub Pages / Vercel / Netlify)
- **Vercel / Netlify**: povežite repo i postavite `dispatch-web` kao publish/root direktorijum (build command nije potreban).
- **GitHub Pages**: objavite sadržaj foldera `dispatch-web` na `gh-pages` ili `/docs`.
