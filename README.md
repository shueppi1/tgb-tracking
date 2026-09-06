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
   Verlauf mit Löschen einzelner Einträge, Rückgängig. Zusammenfassung und Verlauf zeigen die
   **laufende Halbzeit**: in der 2. HZ also nur deren Tore, Paraden usw.; ein Umschalter
   blendet wahlweise das gesamte Spiel ein. Der Spielstand oben in der Uhrleiste bleibt
   immer der Gesamtstand.
4. **Auswertung** – Spieler-, Torhüter- und Team-Tabellen, drei CSV-Dateien (Ereignisse,
   Spieler, Torhüter) oder als ZIP. Die Ereignis-Datei enthält nur die Zeitstempel der
   Team-Ereignisse (ohne Spieler), nach Titel sortiert.
   Semikolon-getrennt mit UTF‑8‑BOM für Excel (deutsch).
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

Nginx liefert das Frontend aus und leitet `/api` an die Flask-API (gunicorn) weiter;
MongoDB speichert in das Volume `mongo-data`.

Die App lauscht standardmäßig nur lokal auf `http://127.0.0.1:8090` — passend dazu, dass
davor ein Reverse-Proxy die TLS-Terminierung übernimmt (siehe unten). Ohne Proxy, für den
direkten Zugriff aus dem LAN, in `.env` `WEB_BIND=0.0.0.0` setzen; die App ist dann unter
`http://<host>:8090` **unverschlüsselt** erreichbar. Der Port ist über `WEB_PORT` änderbar.

MongoDB ist bewusst auf `mongo:4.4.18` festgelegt: Alle neueren Builds (≥ 5.0 sowie ≥ 4.4.19)
setzen ARMv8.2-A voraus, das die ARM-Hardware des Servers (z. B. Raspberry Pi 4) nicht bietet –
sie starten dort nur mit Warnung und laufen unzuverlässig. Beim Wechsel von einer älteren
Installation mit MongoDB 7 muss das Volume verworfen werden, weil 4.4 die Datendateien von 7.0
nicht lesen kann (vorher ggf. ein Backup ziehen, siehe unten):

```bash
docker compose down -v   # verwirft das Volume mongo-data
docker compose up -d --build
```

Passwort-Hash erzeugen:

```bash
docker compose run --rm api python -m app.hash_password
```

### Betrieb hinter einem bestehenden Caddy

Für den Zugriff aus dem Internet gehört ein Reverse-Proxy mit TLS vor den `web`-Container.
Läuft auf dem Host bereits ein Caddy (systemd), sind es drei Schritte —
`deploy/Caddyfile.example` enthält den fertigen Block.

**1. DNS.** Einen Namen wie `tgb.example.de` anlegen. Bei dynamischer IP als **CNAME** auf
den Namen zeigen lassen, dessen A-Record der DDNS-Updater pflegt; der neue Name erbt die
Adresse dann automatisch. Der Name muss auflösen, *bevor* Caddy neu geladen wird, sonst
schlägt die erste Zertifikatsausstellung fehl (Let's Encrypt folgt CNAMEs).

**2. Site-Block** an `/etc/caddy/Caddyfile` anhängen:

```caddyfile
https://tgb.example.de:443 {
        encode zstd gzip
        reverse_proxy 127.0.0.1:8090
}
```

Zwei Stolperfallen: **`127.0.0.1` statt `localhost`** verwenden (auf Dual-Stack-Hosts löst
`localhost` oft zuerst nach `::1` auf, während das Docker-Binding reines IPv4 ist →
„connection refused"), und **der Port muss auf dem Host frei sein**. Der Default ist
bewusst 8090 und nicht 8080 — 8080 ist auf Servern häufig schon belegt (u. a. vom
Admin-Interface von Nextcloud AIO). Prüfen und ggf. `WEB_PORT` in `.env` ändern:

```bash
ss -ltnp | grep :8090        # nichts = frei
```

Ein `basic_auth` davor ist nicht nötig — die App hat einen eigenen Login.

Caddy öffnet neben 443 auch **Port 80**, für den automatischen HTTP→HTTPS-Redirect und die
ACME-HTTP-Challenge. Ist 80 von außen nicht erreichbar, wird das Zertifikat weiterhin über
TLS-ALPN auf 443 ausgestellt, der Redirect von `http://` läuft dann aber ins Leere.

**3. Übernehmen und prüfen:**

```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

curl -s  http://127.0.0.1:8090/api/health     # {"ok":true}  — Container erreichbar
curl -sI https://tgb.example.de/ | head -1    # HTTP/2 200   — Proxy + TLS stehen
```

Läuft Caddy stattdessen selbst in einem Container, erreicht er `127.0.0.1` des Hosts nicht;
dann `web` ins selbe Docker-Netz hängen und auf `web:80` proxien.

#### Kein eigener API-Host nötig

Die App ist Single-Origin: das Frontend ruft `/api` **relativ** auf, und nginx routet
`/api/` intern an den Flask-Container. Ein zusätzlicher `api.`-Name würde CORS erzwingen,
jedem Request einen `OPTIONS`-Preflight voranstellen (spürbar beim Erfassen über Mobilfunk)
und eine buildzeit-fixierte API-URL ins Frontend einbacken — ohne Gegenwert.

Aus demselben Grund muss beim **Wechsel der Domain nichts neu gebaut werden**: die Domain
steht ausschließlich im DNS und im Caddyfile.

### Backup & Restore

```bash
# Backup
docker compose exec mongo mongodump --db tgb --archive > tgb-$(date +%F).archive
# Restore
docker compose exec -T mongo mongorestore --archive --drop < tgb-2026-09-06.archive
```

## Lokale Entwicklung

Voraussetzungen: Python 3.11+, Node 22, eine erreichbare MongoDB (z. B. `docker run -p 27017:27017 mongo:4.4.18`).

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

## Vereinslogo

`frontend/public/logo.svg` (Kopfzeile und Anmeldung) und `frontend/public/favicon.svg`
(Browser-Tab) sind **Platzhalter** – ein von Hand nachgebautes Hasen-Wappen in Vereinsrot
`#d8232a`. Zum Austausch genügt es, die offiziellen Dateien unter denselben Pfaden
abzulegen; der Code muss nicht angepasst werden. Anforderungen: SVG mit transparentem
Hintergrund, hochkant im Seitenverhältnis von etwa 1046 : 1920, für das Favicon quadratisch.

Die Farben der App leiten sich aus dem Logo ab. `--brand` und die davon abgeleiteten Werte
in [`frontend/src/styles.css`](frontend/src/styles.css) färben nur den Rahmen der App
(Kopfzeile, Navigation, Anmeldung, Buttons, Tabellen). Die Trackingansicht behält bewusst
ihre eigenen Farben: `--accent` bleibt blau für Fokus und Auswahl, damit Rot dort weiterhin
nur „Stopp" oder „Löschen" bedeutet.

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
frontend/public/            Vereinslogo und Favicon (werden unverändert nach dist/ kopiert)
docker-compose.yml          mongo + api + web
deploy/Caddyfile.example    Site-Block für einen Caddy auf dem Host
e2e/                        Playwright-Smoketest + mongomock-Devserver
```
