# Entscheidungen

Lücken im Plan, die beim Bauen entschieden wurden, jeweils mit Begründung. Der Plan (`docs/PLAN.md`) bleibt maßgeblich; hier steht nur, was er offen lässt.

## Gerüst und Betrieb (Meilenstein 1)

| Nr. | Frage | Entscheidung | Begründung |
| --- | --- | --- | --- |
| 1 | Die Vorlage nennt `env_file: .env`. Fehlt die Datei, bricht `docker compose up` ab. | `.env` ist eingecheckt und enthält nur `SPLITTI_PORT=3000`. | Installation bleibt ein einziger Befehl, die Compose-Datei entspricht der Vorlage wörtlich, und der Port steht wie im Plan in `.env`. Die Datei enthält keine Geheimnisse. Eine lokale Änderung des Ports übersteht `git pull`. |
| 2 | Wem gehören die Dateien in `./data`? | Der Container startet als root, wechselt aber sofort zum Besitzer des eingehängten Ordners `/data` (`docker/entrypoint.sh`). `data/.gitkeep` ist eingecheckt, damit der Ordner nach dem Klonen dem eigenen Benutzer gehört. | Datenbank und Zettelbilder gehören so auf dem Host dem Benutzer, nicht root. Eine Sicherung ist damit wirklich nur eine Kopie des Ordners, ohne `sudo`. |
| 3 | Wann laufen die Migrationen? | `scripts/start.mjs` wendet sie an, bevor der Server Anfragen annimmt; schlägt eine Migration fehl, startet der Container nicht. Zusätzlich migriert die App beim ersten Datenbankzugriff (für `npm run dev` und Tests). | „Beim Start automatisch“ aus dem Plan, mit klarem Fehlerbild statt halb migrierter Daten. |
| 4 | Journal-Modus von SQLite | Standard (Rollback-Journal), kein WAL. | Im Ruhezustand besteht die Datenbank aus genau einer Datei. Die Last einer WG braucht kein WAL, und die Sicherung per Ordnerkopie bleibt einfach. |
| 5 | Basis-Image | `node:26-trixie-slim` (Node 26 LTS, Debian 13), Tesseract 5.5 mit `tesseract-ocr-deu` aus den Debian-Paketen. | Gleiche Node-Hauptversion wie in der Entwicklung; Debian liefert Tesseract samt deutschem Sprachpaket ohne Fremdquellen. |
| 6 | `npm ci` im Image | Mit `--ignore-scripts`. | `better-sqlite3` und `sharp` bringen fertige Binärdateien mit. Ohne den Schalter versucht npm im Image, `better-sqlite3` zu kompilieren, wofür Python und ein Compiler fehlen. |
| 7 | TypeScript-Version | TypeScript 6 statt 7. | `astro check` unterstützt laut Paketangabe nur TypeScript 5 und 6. |
| 8 | Lint und Format | Biome, beschränkt auf `src/`, `scripts/`, `tests/unit/`, `tests/e2e/` und die Konfigurationsdateien. | Ein Werkzeug für beides. `docs/` und `tests/fixtures/` sind Vorgaben und werden nie automatisch umformatiert. |
| 9 | Astro prüft bei Formular-Uploads die Herkunft (`security.checkOrigin`). | Abgeschaltet. | Die App spricht hinter dem Proxy nur HTTP und sieht eine andere Herkunft als der Browser (HTTPS); die Prüfung würde Uploads abweisen. Sie schützt Cookie-Sitzungen, die es hier nicht gibt: Der Link-Code im Pfad ist die einzige Berechtigung. |
| 10 | Unbekannte Pfade unter `/api/` | Antworten mit 404 als JSON statt mit der App-Hülle. | Fehler in der Oberfläche oder in Tests fallen sofort auf. |
| 11 | Wird nach GitHub gepusht? | Nein. Jeder Meilenstein wird lokal auf `main` committet; `git push` bleibt dem Besitzer überlassen. | Der Auftrag verlangt Commits auf den Hauptzweig, kein Veröffentlichen. Der Workflow in `.github/workflows/ci.yml` läuft daher erst nach dem ersten Push. |
