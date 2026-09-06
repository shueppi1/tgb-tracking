# TGB Tracking

Webapp zum Erfassen von Ereignissen während eines Handballspiels – Spielvorbereitung,
Live-Tracking mit Spieluhr, Auswertung mit CSV-Export, Archiv und Saisonstatistik.

**Stack:** React + TypeScript (Vite) · Python Flask · MongoDB · Docker Compose · Nginx

## Funktionen

1. **Kader** – Spieler und Torhüter werden einmal angelegt (Vorname, Nachname, Anzeigename,
   Rückennummer, Position) und bleiben dauerhaft gespeichert. Statt Löschen werden Spieler
   deaktiviert, damit alte Spiele unverändert bleiben.
2. **Vorbereitung** – Gegner, Datum/Uhrzeit, Heim/Auswärts, Saison und die Auswahl der
   tatsächlich spielenden Personen (mind. ein Feldspieler und ein Torwart).
3. **Tracking** – Spieluhr (1. HZ 0→30, 2. HZ 30→60, stoppbar, korrigierbar), Ereignisse in
   zwei Schritten: erst Ereignis, dann – falls nötig – Spieler/Torwart. Live-Zusammenfassung,
   Verlauf mit Löschen einzelner Einträge, Rückgängig.
4. **Auswertung** – Spieler-, Torhüter- und Team-Tabellen, drei CSV-Dateien (Ereignisse,
   Spieler, Torhüter) oder als ZIP. Semikolon-getrennt mit UTF‑8‑BOM für Excel (deutsch).
5. **Archiv & Saisonstatistik** – alle Spiele bleiben gespeichert; Statistik über eine Saison.

### Ereignisse

| Ohne Spieler | Spieler oder Torwart | Nur Feldspieler | Nur Torwart |
|---|---|---|---|
| Angriff+ / Angriff- | Tor | Def+ | Gehalten 6m / 7m / 9m |
| Abwehr+ / Abwehr- | Assist | Def- | Ggtor 6m / 7m / 9m |
| Tempo+ / Tempo- | FW | | |
| | Fehlpass/Fangfehler | | |
| | technischer Fehler | | |

Der Katalog liegt in [`shared/events.json`](shared/events.json) und wird von Backend und
Frontend gemeinsam benutzt.

### Offline-Verhalten

Ereignisse werden sofort lokal erfasst (localStorage) und im Hintergrund an den Server
gesendet. Bricht die Verbindung ab, sammelt eine Warteschlange die Operationen und sendet
sie später erneut; der Server verarbeitet sie idempotent (keine Duplikate, keine doppelt
gezählte Spielzeit). Ein Neuladen der Seite verliert weder Ereignisse noch die laufende Uhr.
Die Spieluhr richtet sich nach der Uhr des erfassenden Geräts.

## Betrieb mit Docker Compose

```bash
cp .env.example .env
# SECRET_KEY setzen und ein Passwort hinterlegen (APP_PASSWORD_HASH oder APP_PASSWORD)
docker compose up -d --build
```

Die App läuft danach auf `http://<host>:8080` (Port über `WEB_PORT` änderbar). Nginx liefert
das Frontend aus und leitet `/api` an die Flask-API (gunicorn) weiter; MongoDB speichert in
das Volume `mongo-data`.

Passwort-Hash erzeugen:

```bash
docker compose run --rm api python -m app.hash_password
```

Für den Zugriff aus dem Internet empfiehlt sich ein Reverse-Proxy mit TLS (z. B. Caddy oder
Traefik) vor dem `web`-Container.

### Backup & Restore

```bash
# Backup
docker compose exec mongo mongodump --db tgb --archive > tgb-$(date +%F).archive
# Restore
docker compose exec -T mongo mongorestore --archive --drop < tgb-2026-09-06.archive
```

## Lokale Entwicklung

Voraussetzungen: Python 3.11+, Node 22, eine erreichbare MongoDB (z. B. `docker run -p 27017:27017 mongo:7`).

```bash
# Backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
APP_PASSWORD=geheim flask --app wsgi run --port 5000

# Frontend (zweites Terminal) – Vite proxyt /api nach localhost:5000
cd frontend
npm install
npm run dev
```

### Tests & Checks

```bash
cd backend && ruff check . && pytest
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

Backend und Frontend prüfen ihre Aggregation gegen dieselbe Datei
`shared/fixtures/sample-match.json`, damit Live-Zusammenfassung und Server-Auswertung nicht
auseinanderlaufen. Die GitHub-Actions-Pipeline (`.github/workflows/ci.yml`) führt alle Checks
und die Docker-Builds aus.

## API (Kurzüberblick)

Alle Routen unter `/api`, außer `login`, `health` und `event-types` nur mit
`Authorization: Bearer <token>`.

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/auth/login` | `{ password }` → `{ token }` |
| GET/POST | `/players` | Kader lesen / Spieler anlegen |
| PATCH | `/players/:id` | Spieler ändern, `active` setzen |
| GET/POST | `/matches` | Spiele listen / Spiel mit Kader-Snapshot anlegen |
| GET/PATCH/DELETE | `/matches/:id` | Spiel lesen / Metadaten ändern / löschen |
| POST | `/matches/:id/ops` | Batch aus `add_event`, `delete_event`, `clock` – idempotent per `opId` |
| POST | `/matches/:id/finish` · `/reopen` | Spiel beenden / wieder öffnen |
| GET | `/matches/:id/summary` | Auswertung |
| GET | `/matches/:id/export/{events,players,goalkeepers}.csv` · `/export.zip` | CSV-Export |
| GET | `/stats/seasons` · `/stats/season?season=2026/27` | Saisonstatistik |

## Projektstruktur

```
shared/events.json          Ereigniskatalog (gemeinsame Quelle)
shared/fixtures/            gemeinsame Testdaten
backend/app/                Flask-App: auth, clock, stats, csv_export, routes/
backend/tests/              pytest (mongomock)
frontend/src/domain/        events, clock, stats, ops – reine Logik, getestet mit vitest
frontend/src/store/         zustand-Stores, Outbox (localStorage)
frontend/src/pages/         Login, Übersicht, Kader, Neues Spiel, Tracking, Auswertung, Archiv, Statistik
frontend/src/components/    ClockBar, EventGrid, PlayerSheet, SummaryTables, EventLog, …
docker-compose.yml          mongo + api + web
```
