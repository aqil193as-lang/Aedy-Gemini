# AEDY GEMINI

Premium AI assistant — Google login, editable AI personality, chat history synced to Firestore, powered by Gemini API through a secure Netlify Function.

## Setup (buat sekali je)

### 1. Firebase (untuk Google Login + chat history)

1. Pergi ke [console.firebase.google.com](https://console.firebase.google.com) → **Create project**.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**.
3. **Build → Firestore Database → Create database** (start in *production mode*).
4. Bukak **Rules** tab, replace dengan:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /chats/{chatId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

5. **Project settings → General → Your apps → Add app → Web (</>)** → copy the `firebaseConfig` object.
6. Paste values tu ke dalam `firebase-config.js` (gantikan `YOUR_FIREBASE_API_KEY` dan lain-lain).
7. Balik ke **Authentication → Settings → Authorized domains** → tambah domain Netlify korang (contoh `aedy-gemini.netlify.app`) selepas deploy.

### 2. Gemini API Key

1. Pergi ke [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**.
2. **Jangan** letak key tu dalam code. Ia akan disimpan sebagai environment variable je (step deploy kat bawah).

### 3. Deploy ke Netlify (dari phone pun boleh)

1. Upload semua fail ni ke satu GitHub repo (guna GitHub web uploader kalau tak de laptop).
2. Netlify → **Add new site → Import an existing project → GitHub** → pilih repo tu.
3. Build settings: publish directory `.`, functions directory `netlify/functions` (dah set dalam `netlify.toml`, so leave default).
4. **Site settings → Environment variables → Add variable**:
   - Key: `GEMINI_API_KEY`
   - Value: (API key dari step 2)
5. Deploy. Lepas siap, copy URL Netlify tu (contoh `https://aedy-gemini.netlify.app`) dan tambah dalam Firebase Authorized domains (step 1.7).

Done. Buka URL, "Continue with Google", start chat.

## Edit personality AI

Bukak app → **Settings (⚙) → Personality** tab. Boleh tukar nama assistant dan tulis system instruction sendiri (tone, bahasa, gaya jawapan, rules). Ada quick presets jugak. Settings ni disimpan per-user dalam Firestore, so ia ikut akaun Google korang merata device.

## File structure

```
/
├── index.html              → landing + app shell
├── style.css                → design system (dark glass, violet-teal gradient)
├── script.js                 → app logic (auth, chat, Firestore, UI)
├── firebase-config.js        → Firebase init (safe to expose client-side)
├── netlify.toml
├── package.json
└── netlify/functions/
    └── chat.js               → secure proxy to Gemini API (GEMINI_API_KEY lives here only)
```

## Notes

- Gemini API key never touches the browser — every AI request goes through `/.netlify/functions/chat`.
- Kalau nak tukar model Gemini (contoh ke versi lain), edit `model: "gemini-2.0-flash"` dalam `netlify/functions/chat.js`.
- Streaming belum real token-by-token (Netlify Functions standard tak support SSE senang) — reply datang penuh sekali. Boleh upgrade ke Netlify Edge Functions kalau nak true streaming, cakap je bila ready.
