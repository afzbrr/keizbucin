# Cara Deploy KEIZ BUCIN ke Vercel + Supabase

Ikuti langkah gampang ini supaya Faiz & Kenat bisa buka web privat berdua langsung dari HP masing-masing (misal `https://keiz-bucin.vercel.app`) dengan data 100% real-time di Supabase:

1. **Download Project dari AI Studio**
   - Di AI Studio, klik **Download / Export Code** -> download file **ZIP**.

2. **Extract & Upload ke GitHub**
   - Extract file ZIP tadi dan buka foldernya di VS Code (atau upload langsung lewat web GitHub).
   - Bikin repository GitHub baru bernama **`keiz-bucin`**, lalu push/upload semua file project ke sana.

3. **Import ke Vercel**
   - Buka [vercel.com](https://vercel.com) -> **Add New** -> **Project**.
   - Pilih **Import Git Repository** -> pilih **`keiz-bucin`**.
   - Pastiin settingnya:
     - **Framework Preset:** `Vite`
     - **Build Command:** `npm run build`
     - **Output Directory:** `dist`
   - Klik **Deploy** dulu (atau lanjut isi Environment Variables).

4. **Isi Environment Variables di Vercel**
   - Masuk ke **Supabase Dashboard** -> **Settings** -> **API**, copy **Project URL** dan **anon public key**.
   - Masuk ke **Vercel** -> **Settings** -> **Environment Variables**, tambahin 2 variable ini:
     - `VITE_SUPABASE_URL` = URL project Supabase kamu (`https://xxxx.supabase.co`)
     - `VITE_SUPABASE_ANON_KEY` = public `anon` key Supabase kamu
   - Setelah simpan, klik **Deployments** -> **Redeploy** supaya env-nya aktif di build terbaru.

5. **Setup Tabel Supabase (Cukup 1x)**
   - Buka **Supabase** -> **SQL Editor** -> **New Query**.
   - Copy semua isi file **`supabase-setup.sql`** yang ada di project ini, paste ke SQL Editor, lalu klik **Run**.

6. **Buka Link Web Vercel & Tes Berdua!**
   - Buka link Vercel kalian (contoh: `https://keiz-bucin.vercel.app`) di HP Faiz & HP Kenat.
   - Login pakai sandi masing-masing:
     - **Faiz:** `faizkece18070528`
     - **Kenat:** `kenatgemaz07180528`
   - Cek **Chat**, **Nobar**, **Musik**, **Call Berdua**, **Postingan**, **Profil**, dan **Unek Unek** — semua langsung nyambung real-time!
   - Bisa cek status koneksi kapan aja di **Profil -> Settings -> Cek Koneksi Supabase**.
