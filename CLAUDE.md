# Splitti

Selbst gehostete Kostenaufteilungs-App für WGs: Kassenzettel scannen, Positionen per Antippen auf Mitglieder verteilen, Salden ausgleichen. Läuft als ein Docker-Container im Heimnetz.

## Maßgebliche Unterlagen

- `docs/PLAN.md` ist die Vorgabe für Umfang, Regeln, Technik-Stack, Datenbankschema, API und Meilensteine. Bei Widerspruch zwischen Plan und Wireframe gilt der Plan.
- `docs/wireframes/*.html` legen Aufbau, Inhalte und deutsche Texte der neun Screens fest (Handy-Format 390 × 844).
- `docs/compose.vorlage.yaml` zeigt, wie die Compose-Datei samt Platzhalter für das Proxy-Netzwerk aussehen soll.
- `tests/fixtures/receipts/` enthält drei Kaufland-Zettel als Foto, als abgetippte Textzeilen und als erwartetes Ergebnis.

## Arbeitsweise

- Die sieben Meilensteine aus dem Plan der Reihe nach durcharbeiten, ohne Rückfrage, bis die App fertig ist.
- Wird eine Abnahme nicht grün: andere Lösungswege probieren. Erst anhalten, wenn wirklich kein Weg mehr bleibt, und dann genau beschreiben, woran es hängt.
- Nach jedem Meilenstein: alle Tests grün, dann auf den Hauptzweig committen. Issues sind freiwillig.
- Lücken im Plan selbst entscheiden und mit Begründung in `docs/DECISIONS.md` festhalten.
- Tests nie abschwächen oder überspringen, um grün zu werden.
- Nichts außerhalb des Plans bauen: keine Konten, kein Zugriff von außen, keine Cloud-Dienste, keine Telemetrie.

## Feste Regeln im Code

- Geldbeträge sind ganze Cent (Integer), nie Kommazahlen.
- Aufteilung, Rundung, Salden und Begleichen sind reine Funktionen ohne Datenbankzugriff und vollständig mit Vitest getestet.
- Der Kaufland-Parser arbeitet auf Textzeilen und ist von Tesseract getrennt testbar.
- Der Link-Code im Pfad ist die einzige Berechtigung; jeder Endpunkt prüft, dass angefragte Objekte zur Gruppe gehören.
- Oberfläche und Meldungen sind auf Deutsch; Code, Bezeichner und Commits auf Englisch.
- Daten liegen ausschließlich unter `/data` im Container (`./data` auf dem Host, von Git ausgenommen).

## Betrieb (Zielbild)

- Installation: `docker compose up -d --build` im Repo-Ordner.
- Update: `git pull && docker compose up -d --build`; Daten bleiben erhalten, auch nach `docker compose down`.
- Migrationen laufen beim Start automatisch.

## Abschluss

Am Ende steht im README die Anleitung für Installation, Update, Sicherung und das Eintragen des Proxy-Netzwerks. Dazu ein Bericht `docs/ABSCHLUSS.md`: Stand je Meilenstein, getroffene Entscheidungen, Ergebnis der Texterkennung an den drei Fotos, und was sich nicht automatisch prüfen ließ (Kamera am echten Handy, HTTPS über den Proxy, Erkennung an neuen Zetteln).

## Befehle

Voraussetzungen für Entwicklung und Tests: Node.js ab 22.23 (im Container läuft Node 26) und das Programm `tesseract` (Paket `tesseract-ocr` bzw. `tesseract`). Das deutsche Sprachmodell liegt im Repo unter `tessdata/`. Einmalig: `npm install` und `npx playwright install chromium`.

| Zweck | Befehl |
| --- | --- |
| Entwicklungsserver (http://localhost:3000, Daten in `./data`) | `npm run dev` |
| Lint und Formatprüfung (Biome) | `npm run lint` |
| Format und sichere Lint-Korrekturen anwenden | `npm run format` |
| Typprüfung (TypeScript strikt, inkl. Astro-Dateien) | `npm run check` |
| Unit-Tests (Vitest: Rechenkern, Parser, Serverlogik) | `npm test` |
| Browser-Tests (Playwright; baut vorher, eigener Port 4317, Daten in `.tmp/`) | `npm run test:e2e` |
| Alles vor einem Commit | `npm run test:all` |
| Produktions-Build nach `dist/` | `npm run build` |
| Build starten (Migrationen laufen zuerst) | `npm start` |
| Neue Migration aus `src/server/db/schema.ts` erzeugen | `npm run db:generate -- --name <name>` |
| Texterkennung an den drei Testfotos laufen lassen und `docs/OCR-BERICHT.md` schreiben | `npm run ocr:report` |
| Container bauen und starten | `docker compose up -d --build` |

Hinweise:

- `npm run format` nur über die Quellordner laufen lassen (so ist Biome eingestellt); `docs/` und `tests/fixtures/` sind Vorgaben und bleiben unverändert.
- Einzelner Unit-Test: `npx vitest run tests/unit/<datei>.test.ts`. Einzelner Browser-Test: `npx playwright test tests/e2e/<datei>.spec.ts` (vorher `npm run build`).
