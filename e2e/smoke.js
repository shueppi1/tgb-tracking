/* End-to-end smoke test through the real UI and API.
 *
 * Prerequisites (see e2e/README.md):
 *   - API on :5000 with password "geheim" and an EMPTY database (python devserver.py)
 *   - Vite dev server on :5173 (cd frontend && npm run dev)
 *   - npm install (in e2e/); set CHROMIUM_PATH to reuse an existing Chromium binary.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const OUT = __dirname;
let step = 0;

function log(msg) {
  step += 1;
  console.log(`[${String(step).padStart(2, '0')}] ${msg}`);
}

function expect(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  const consoleErrors = [];
  page.on('console', (m) => {
    // The browser logs every non-2xx response as an error; only real app errors count.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  try {
    // --- login -------------------------------------------------------------
    await page.goto(BASE + '/');
    await page.waitForURL('**/login');
    log('redirected to /login when unauthenticated');
    await page.fill('#password', 'falsch');
    await page.click('button:has-text("Anmelden")');
    await page.waitForSelector('.error');
    log('wrong password shows error');
    await page.fill('#password', 'geheim');
    await page.click('button:has-text("Anmelden")');
    await page.waitForSelector('h1:has-text("Übersicht")');
    log('login ok → Übersicht');

    // --- roster ------------------------------------------------------------
    await page.click('nav a:has-text("Kader")');
    await page.waitForSelector('h1:has-text("Kader")');
    const people = [
      ['Max', 'Muster', 'Max', '7', 'field'],
      ['Leo', 'Lang', 'Leo', '10', 'field'],
      ['Ben', 'Berg', 'Ben', '3', 'field'],
      ['Timo', 'Tor', 'Timo', '1', 'goalkeeper'],
      ['Jonas', 'Jung', 'Jonas', '12', 'goalkeeper'],
    ];
    for (const [fn, ln, dn, nr, pos] of people) {
      await page.fill('#f-firstName', fn);
      await page.fill('#f-lastName', ln);
      await page.fill('#f-displayName', dn);
      await page.fill('#f-number', nr);
      await page.selectOption('#f-position', pos);
      await page.click('button:has-text("Anlegen")');
      await page.waitForSelector(`table td strong:text-is("${dn}")`);
    }
    log('created 3 field players + 2 goalkeepers');
    // duplicate number rejected
    await page.fill('#f-firstName', 'Dup');
    await page.fill('#f-lastName', 'Dup');
    await page.fill('#f-displayName', 'Dup');
    await page.fill('#f-number', '7');
    await page.click('button:has-text("Anlegen")');
    await page.waitForSelector('.error:has-text("vergeben")');
    log('duplicate number rejected');
    // deactivate Ben → should not be selectable for a match
    const benRow = page.locator('tr', { has: page.locator('td strong:text-is("Ben")') });
    await benRow.locator('button:has-text("Deaktivieren")').click();
    await page.waitForSelector('h2:has-text("Inaktiv")');
    log('deactivated Ben');

    // --- new match ---------------------------------------------------------
    await page.click('nav a:has-text("Neues Spiel")');
    await page.waitForSelector('h1:has-text("Neues Spiel")');
    await page.fill('#opponent', 'HSG Test');
    expect((await page.inputValue('#season')).includes('/'), 'season auto-derived');
    const tileNames = await page.locator('.tile .name').allTextContents();
    expect(!tileNames.includes('Ben'), 'inactive player not offered');
    expect(tileNames.includes('Max') && tileNames.includes('Timo'), 'active players offered');
    // validation: keeper missing
    await page.click('button.tile:has-text("Max")');
    await page.click('button.tile:has-text("Leo")');
    await page.click('button:has-text("Spiel starten")');
    await page.waitForSelector('.error:has-text("Torwart")');
    log('match creation requires a goalkeeper');
    await page.click('button.tile:has-text("Timo")');
    await page.click('button:has-text("Spiel starten")');
    await page.waitForURL(/\/spiel\/[0-9a-f]{24}$/);
    const matchUrl = page.url();
    const matchId = matchUrl.split('/').pop();
    log(`match created ${matchId}`);

    // --- tracking: clock ---------------------------------------------------
    await page.waitForSelector('.clockbar .time');
    expect((await page.textContent('.clockbar .time')) === '00:00', 'clock starts at 00:00');
    await page.click('.clockbar .startstop:has-text("Start")');
    await page.waitForTimeout(1300);
    const t1 = await page.textContent('.clockbar .time');
    expect(t1 !== '00:00', `clock runs (${t1})`);
    await page.click('.clockbar .startstop:has-text("Stopp")');
    const t2 = await page.textContent('.clockbar .time');
    await page.waitForTimeout(700);
    expect((await page.textContent('.clockbar .time')) === t2, 'clock frozen after stop');
    log(`clock start/stop ok (${t2})`);

    // --- tracking: events --------------------------------------------------
    const ev = (name) => page.getByRole('button', { name, exact: true }).first();
    await ev('Angriff+').click();
    await page.waitForSelector('.stat:has(.label:text-is("Angriff+")) .value:text-is("1")');
    expect((await page.locator('.sheet').count()) === 0, 'team event needs no player sheet');
    log('team event recorded with one tap');

    await ev('Tor').click();
    await page.waitForSelector('.sheet');
    let sheetNames = await page.locator('.sheet .tile .name').allTextContents();
    expect(sheetNames.includes('Max') && sheetNames.includes('Timo'), '"Tor" offers players and keepers');
    await page.click('.sheet button.tile:has-text("Max")');
    await page.waitForSelector('.sheet', { state: 'detached' });
    await page.waitForSelector('.clockbar .score:has-text("1 : 0")');
    log('Tor → Max, score 1 : 0');

    await ev('Gehalten 6m').click();
    await page.waitForSelector('.sheet');
    sheetNames = await page.locator('.sheet .tile .name').allTextContents();
    expect(sheetNames.join() === 'Timo', `keeper event offers only keepers (${sheetNames})`);
    await page.click('.sheet button.tile:has-text("Timo")');
    await page.waitForSelector('.sheet', { state: 'detached' });
    await ev('Ggtor 9m').click();
    await page.click('.sheet button.tile:has-text("Timo")');
    await page.waitForSelector('.clockbar .score:has-text("1 : 1")');
    log('keeper events → Timo, score 1 : 1');

    await ev('Def+').click();
    await page.waitForSelector('.sheet');
    sheetNames = await page.locator('.sheet .tile .name').allTextContents();
    expect(!sheetNames.includes('Timo') && sheetNames.includes('Leo'), `Def+ offers only field players (${sheetNames})`);
    await page.click('.sheet button.tile:has-text("Leo")');
    await page.waitForSelector('.sheet', { state: 'detached' });
    log('Def+ → Leo');

    // cancel a sheet
    await ev('Assist').click();
    await page.waitForSelector('.sheet');
    await page.click('.sheet button:has-text("Abbrechen")');
    await page.waitForSelector('.sheet', { state: 'detached' });
    log('sheet cancel works');

    await page.waitForSelector('.sync[data-status="synced"]');
    await page.waitForSelector('button:has-text("Verlauf (5)")');
    log('5 events, synced');

    // undo
    await page.click('.clockbar button:has-text("Rückgängig")');
    await page.waitForSelector('button:has-text("Verlauf (4)")');
    log('undo removed last event');

    // per-entry delete from log
    await page.click('button:has-text("Verlauf (4)")');
    const angriffRow = page.locator('.log-row', { hasText: 'Angriff+' });
    await angriffRow.locator('button').click();
    await page.waitForSelector('button:has-text("Verlauf (3)")');
    await page.click('button:has-text("Zusammenfassung")');
    await page.waitForSelector('.stat:has(.label:text-is("Angriff+")) .value:text-is("0")');
    log('deleted Angriff+ from Verlauf');

    // summary table
    const maxRow = page.locator('.panel-body table tr', { has: page.locator('td:text-is("Max")') }).first();
    const maxCells = await maxRow.locator('td').allTextContents();
    expect(maxCells[2] === '1', `Max has 1 Tor in live summary (${maxCells})`);
    log('live summary shows Max: 1 Tor');

    // --- offline: API blocked, events queued, reload keeps them ------------
    const apiOnly = (url) => url.pathname.startsWith('/api/');
    await page.route(apiOnly, (route) => route.abort());
    await page.click('.clockbar .startstop:has-text("Start")');
    await ev('Tor').click();
    await page.click('.sheet button.tile:has-text("Leo")');
    await ev('Fehlpass/Fangfehler').click();
    await page.click('.sheet button.tile:has-text("Max")');
    await page.waitForSelector('.sync[data-status="offline"]');
    await page.waitForSelector('.clockbar .score:has-text("2 : 1")');
    log('offline: events recorded locally, badge Offline');
    await page.reload();
    await page.waitForSelector('.clockbar .score:has-text("2 : 1")');
    await page.waitForSelector('button:has-text("Verlauf (5)")');
    expect((await page.textContent('.clockbar .half')).includes('läuft'), 'clock still running after reload');
    log('reload while offline: snapshot restored, clock still running');
    await page.unroute(apiOnly);
    await page.waitForSelector('.sync[data-status="synced"]', { timeout: 15000 });
    log('back online: outbox flushed');
    // verify on the server
    const token = await page.evaluate(() => localStorage.getItem('tgb.token'));
    const serverMatch = await page.evaluate(async ([id, tok]) => {
      const r = await fetch(`/api/matches/${id}`, { headers: { Authorization: `Bearer ${tok}` } });
      return (await r.json()).match;
    }, [matchId, token]);
    expect(serverMatch.events.length === 5, `server has 5 events (${serverMatch.events.length})`);
    expect(serverMatch.clock.running === true, 'server clock running');
    const ids = new Set(serverMatch.events.map((e) => e.eventId));
    expect(ids.size === 5, 'no duplicate events on server');
    log('server state matches: 5 unique events, clock running');

    // --- correct time, end half ---------------------------------------------
    await page.click('.clockbar .menu > button');
    await page.click('.menu-list button:has-text("Zeit korrigieren")');
    await page.fill('#clock-text', '25:00');
    await page.click('.dialog button:has-text("Übernehmen")');
    await page.waitForFunction(() => document.querySelector('.clockbar .time').textContent.startsWith('25:0'));
    log('time corrected to 25:00 while running');

    await page.click('.clockbar .menu > button');
    await page.click('.menu-list button:has-text("1. Halbzeit beenden")');
    await page.waitForSelector('.clockbar .time:text-is("30:00")');
    expect((await page.textContent('.clockbar .half')).startsWith('2.'), 'now 2nd half');
    log('half ended → 30:00, 2. Halbzeit');

    await page.click('.clockbar .startstop:has-text("Start")');
    await ev('Tor').click();
    await page.click('.sheet button.tile:has-text("Timo")');
    await page.waitForSelector('.clockbar .score:has-text("3 : 1")');
    await page.waitForSelector('.sync[data-status="synced"]');
    log('keeper scored in 2nd half, 3 : 1');

    // --- finish → result -----------------------------------------------------
    await page.click('.clockbar .menu > button');
    await page.click('.menu-list button:has-text("Spiel beenden")');
    await page.waitForURL(/\/auswertung$/);
    await page.waitForSelector('h1:has-text("Auswertung")');
    const headline = await page.textContent('.card div[style*="1.6rem"]');
    expect(headline.includes('TGB 3 : 1 HSG Test'), `result headline (${headline})`);
    log('finished → Auswertung shows TGB 3 : 1 HSG Test');

    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Ereignisse (CSV)")'),
    ]);
    const csvPath = await dl.path();
    const csv = fs.readFileSync(csvPath, 'utf8');
    expect(csv.charCodeAt(0) === 0xfeff, 'CSV starts with BOM');
    const lines = csv.slice(1).split(/\r?\n/).filter(Boolean);
    expect(lines[0].startsWith('Nr;Halbzeit;Spielzeit;Ereignis'), 'CSV header');
    expect(lines.length === 7, `6 event rows (${lines.length - 1})`);
    expect(lines.some((l) => l.includes(';Tor;7;Max;')), 'CSV contains Max goal');
    log(`events CSV ok (${dl.suggestedFilename()})`);

    const [zip] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Alle drei (ZIP)")')]);
    expect(zip.suggestedFilename().endsWith('.zip'), 'zip download');
    log('zip download ok');

    // --- archive & season stats ------------------------------------------------
    await page.click('nav a:has-text("Archiv")');
    await page.waitForSelector('td:has-text("beendet")');
    await page.waitForSelector('td:text-is("3 : 1")');
    log('archive lists finished match 3 : 1');

    await page.click('nav a:has-text("Statistik")');
    await page.waitForSelector('.stat:has(.label:text-is("Spiele")) .value:text-is("1")');
    await page.waitForSelector('.stat:has(.label:text-is("S-U-N")) .value:text-is("1-0-0")');
    log('season stats: 1 game, 1-0-0');

    // finished match redirects from tracking to result
    await page.goto(`${BASE}/spiel/${matchId}`);
    await page.waitForURL(/\/auswertung$/);
    log('finished match redirects to Auswertung');

    expect(consoleErrors.length === 0, `no console errors: ${JSON.stringify(consoleErrors)}`);
    console.log('\nE2E PASSED');
  } catch (err) {
    console.error('\nE2E FAILED:', err.message);
    const shot = `${OUT}/e2e-failure.png`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.error('screenshot:', shot, 'url:', page.url());
    if (consoleErrors.length) console.error('console errors:', consoleErrors);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
