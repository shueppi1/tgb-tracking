# E2E-Smoke-Test

`smoke.js` fährt einmal durch die komplette App: Login, Kader anlegen, Spiel vorbereiten,
Uhr starten/stoppen, alle Ereignisarten erfassen (inkl. Spieler-/Torwart-Filter), Rückgängig,
Verlauf-Löschung, **Offline-Erfassung mit Reload und späterem Resync**, Zeitkorrektur,
Halbzeitwechsel, Spiel beenden, CSV/ZIP-Download, Archiv und Saisonstatistik.

```bash
# Terminal 1 – API mit In-Memory-Datenbank (Passwort "geheim"), Datenbank muss leer sein
cd e2e && pip install -r ../backend/requirements-dev.txt && python devserver.py

# Terminal 2 – Frontend
cd frontend && npm install && npm run dev

# Terminal 3 – Test
cd e2e && npm install && npx playwright install chromium && npm test
```

Umgebungsvariablen: `E2E_BASE_URL` (Standard `http://127.0.0.1:5173`), `CHROMIUM_PATH`
(vorhandenes Chromium statt Playwright-Download). Bei einem Fehlschlag liegt ein Screenshot
`e2e-failure.png` im Ordner.
