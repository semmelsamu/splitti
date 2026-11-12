# Splitti

Selbst gehostete Kostenaufteilungs-App für WGs: Kassenzettel scannen, Positionen per Antippen auf Mitglieder verteilen, Salden ausgleichen. Splitti läuft als ein Docker-Container im Heimnetz; Texterkennung und Daten bleiben auf dem eigenen Server.

- Zettel fotografieren, Positionen werden lokal erkannt (Tesseract, Regelwerk für Kaufland)
- pro Position antippen, wer sie trägt; „alle“ und Mehrfachauswahl sparen Klicks
- Positionen korrigieren, ergänzen, löschen; manuelle Einträge ohne Zettel
- Salden pro Person, Vorschlag der wenigsten Überweisungen, Zahlungen eintragen
- mehrere Gruppen, Zugang ohne Konto über einen geheimen Link
- als App auf dem Handy installierbar (PWA)

Umfang und Regeln stehen in [`docs/PLAN.md`](docs/PLAN.md), getroffene Entscheidungen in [`docs/DECISIONS.md`](docs/DECISIONS.md), der Stand zum Abschluss in [`docs/ABSCHLUSS.md`](docs/ABSCHLUSS.md).

## Installation

Voraussetzung: ein Server im Heimnetz mit Docker und Docker Compose.

```sh
git clone https://github.com/semmelsamu/splitti.git
cd splitti
docker compose up -d --build
```

Der erste Bau dauert einige Minuten (das Image ist etwa 560 MB groß). Danach läuft Splitti im Hintergrund und startet nach einem Neustart des Servers von selbst.

Prüfen, ob es läuft:

```sh
curl http://localhost:3000/api/health     # {"status":"ok"}
docker compose ps                         # Status "healthy"
```

Im Browser: `http://<Adresse-des-Servers>:3000`

### Port ändern

Der Port steht in der Datei `.env`:

```sh
SPLITTI_PORT=3000
```

Wert ändern, dann `docker compose up -d`. Der Nginx Proxy Manager zeigt auf diesen Port.

## HTTPS und eigene Adresse

Kamera, Teilen-Menü und die Installation als App funktionieren im Browser nur über HTTPS. Splitti selbst spricht nur HTTP; das Zertifikat stellt der vorhandene Nginx Proxy Manager, den Namen löst Pi-hole im Heimnetz auf. Ohne HTTPS lässt sich Splitti benutzen, Fotos kommen dann über „Aus Galerie“ oder die Kamera-App des Handys.

1. **Pi-hole:** unter „Local DNS → DNS Records“ einen Namen auf die Adresse des Servers zeigen lassen, zum Beispiel `splitti.<deine-domain>`.
2. **Nginx Proxy Manager:** einen „Proxy Host“ anlegen
   - Domain Names: der Name aus Schritt 1
   - Scheme: `http`
   - Forward Hostname / IP und Forward Port: siehe unten, je nach Anbindung
   - SSL: ein Zertifikat für den Namen wählen und „Force SSL“ einschalten
   - „Websockets Support“ wird nicht gebraucht
3. Es gibt keine Portfreigabe nach außen und es wird keine gebraucht.

Zwei Wege, wie der Proxy Splitti erreicht:

| Anbindung | Forward Hostname / IP | Forward Port |
| --- | --- | --- |
| über den Port am Server (ohne weitere Einrichtung) | Adresse des Servers | Wert von `SPLITTI_PORT` (Standard 3000) |
| über das Docker-Netzwerk des Proxys (nächster Abschnitt) | `splitti` | `3000` |

### Proxy-Netzwerk eintragen

Läuft der Nginx Proxy Manager auf demselben Server in Docker, kann Splitti direkt in dessen Netzwerk hängen. Die Stelle dafür ist in `compose.yaml` vorbereitet.

1. Den Namen des Proxy-Netzwerks herausfinden:

   ```sh
   docker network ls
   # oder gezielt, mit dem Namen des Proxy-Containers:
   docker inspect <proxy-container> --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}'
   ```

2. In `compose.yaml` die zwei Zeilen unter „Proxy-Netzwerk“ und den Block ganz unten einkommentieren und den Netzwerknamen eintragen:

   ```yaml
       networks:
         - proxy

   networks:
     proxy:
       external: true
       name: <name-des-proxy-netzwerks>
   ```

3. `docker compose up -d`
4. Im Nginx Proxy Manager als Ziel `splitti` und Port `3000` eintragen.

Der Port am Server bleibt daneben erreichbar. Wer Splitti nur noch über den Proxy erreichen will, entfernt in `compose.yaml` den Block `ports`.

Hinweis: `compose.yaml` und `.env` gehören zum Repo. Eigene Änderungen daran bleiben bei `git pull` erhalten, solange sich dieselben Zeilen nicht auch im Repo ändern. Meldet `git pull` einen Konflikt: `git stash`, `git pull`, `git stash pop`.

## Update

```sh
git pull && docker compose up -d --build
```

Die Daten bleiben erhalten. Änderungen an der Datenbank (Migrationen) laufen beim Start automatisch, bevor Splitti Anfragen annimmt. Ein `docker compose down` vorher ist nicht nötig, schadet aber nicht.

## Sicherung

Alle Daten liegen im Ordner `data/` neben der `compose.yaml`; er gehört nicht zu Git und übersteht Updates und `docker compose down`.

| Inhalt | Bedeutung |
| --- | --- |
| `data/splitti.db` | Datenbank (SQLite): Gruppen, Mitglieder, Belege, Zahlungen, Verlauf |
| `data/images/` | Zettelbilder der gespeicherten Belege |
| `data/drafts/` | Bilder von Scans, die noch nicht gespeichert sind; werden nach einem Tag gelöscht |

Eine Sicherung ist eine Kopie dieses Ordners. Am sichersten bei kurz angehaltenem Container:

```sh
docker compose stop
cp -a data ../splitti-sicherung-$(date +%F)
docker compose start
```

Wiederherstellen: Container anhalten, den Ordner `data/` durch die Kopie ersetzen, Container starten.

```sh
docker compose stop
mv data data.alt && cp -a ../splitti-sicherung-2026-11-12 data
docker compose start
```

Die Dateien gehören dem Benutzer, dem auch der Ordner `data/` gehört; `sudo` ist dafür nicht nötig.

Wichtig: Der Einladungslink einer Gruppe ist ihr einziger Schlüssel und steht nur auf den Geräten der Mitglieder (und in der Datenbank). Heb ihn auf.

## Benutzung in Kürze

1. **Gruppe erstellen:** Name der Gruppe, eigener Name, weitere Mitglieder.
2. **Link teilen:** in der Gruppe oben „Link teilen“. Wer den Link öffnet, wählt seinen Namen oder legt sich neu an. Wer den Link hat, darf in der Gruppe alles.
3. **Zettel scannen:** Zettel aufrecht und vollständig fotografieren, von der ersten Position bis zur Summe. Die Erkennung dauert einige Sekunden.
4. **Aufteilen:** pro Position antippen, wer sie trägt. Speichern geht, sobald jede Position mindestens eine Person hat. Weicht die Summe der Positionen von der Zettelsumme ab, steht das über dem Speichern-Knopf.
5. **Begleichen:** zeigt die wenigsten Überweisungen, die alle Salden ausgleichen; eine erledigte Überweisung wird als Zahlung eingetragen.
6. **Verlauf:** „Alle Belege und Änderungsverlauf“ zeigt, wer was geändert hat; gelöschte Belege lassen sich dort wiederherstellen, Zahlungen löschen.

### Als App installieren

- **Android (Chrome):** Menü → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.
- **iPhone (Safari):** Teilen → „Zum Home-Bildschirm“. Die installierte App hat einen eigenen Speicher: Gruppen kommen dort über „Einladungslink einfügen“ auf dem Startscreen hinein.

Beides setzt HTTPS voraus.

## Grenzen der ersten Version

- Erkannt wird das Layout von Kaufland; bei anderen Läden öffnet sich der Beleg mit dem Bild, und die Positionen werden von Hand eingetragen.
- Der Zettel muss aufrecht fotografiert sein. Falten und Schatten hält die Erkennung aus, Textmarker und Stift über den Preisen nicht immer.
- Kein Zugriff von außerhalb des Heimnetzes, keine Konten, nur Euro, immer gleiche Anteile.
- Ohne Verbindung zum Server startet die App, zeigt aber keine Daten: Erfassen und Speichern brauchen den Server.

## Fehlersuche

| Beobachtung | Was hilft |
| --- | --- |
| Seite lädt nicht | `docker compose ps` und `docker compose logs --tail 50` ansehen; `curl http://localhost:3000/api/health` auf dem Server |
| Container startet immer wieder neu | In den Logs steht der Grund; meist ist `data/` nicht beschreibbar (Besitzer des Ordners prüfen) |
| „Kein Kamerabild“ auf dem Scan-Screen | Die Seite läuft nicht über HTTPS oder die Kamera-Erlaubnis fehlt; der Auslöser öffnet dann die Kamera-App |
| „Link teilen“ kopiert nur | Das Teilen-Menü gibt es nur auf Handys und nur über HTTPS |
| Erkennung liest schlecht | Zettel glatt streichen, aufrecht und formatfüllend fotografieren, auf dunklem oder farbigem Untergrund; Blitz vermeiden |
| Genauer nachsehen, was die Erkennung liest | Container mit der Umgebungsvariable `SPLITTI_OCR_DEBUG_DIR=/data/ocr-debug` starten (in `.env` eintragen); dort landen die Textstreifen, die Tesseract zu lesen bekommt |

## Entwicklung

Voraussetzungen: Node.js ab 22.23 und das Programm `tesseract` (Paket `tesseract-ocr` bzw. `tesseract`). Das deutsche Sprachmodell liegt unter [`tessdata/`](tessdata/README.md) im Repo.

```sh
npm install
npx playwright install chromium   # einmalig, für die Browser-Tests
npm run dev                       # http://localhost:3000, Daten in ./data
```

| Zweck | Befehl |
| --- | --- |
| Lint und Formatprüfung | `npm run lint` |
| Typprüfung | `npm run check` |
| Unit-Tests (Rechenkern, Parser, Erkennung an den Testfotos) | `npm test` |
| Browser-Tests (bauen vorher, eigener Port, eigene Daten unter `.tmp/`) | `npm run test:e2e` |
| alles zusammen | `npm run test:all` |
| Bericht zur Texterkennung neu erzeugen | `npm run ocr:report` |

Aufbau:

| Ordner | Inhalt |
| --- | --- |
| `src/core/` | Rechenkern: Aufteilung, Rundung, Salden, Begleichen, Geldbeträge. Reine Funktionen. |
| `src/ocr/` | Texterkennung: Vorverarbeitung, Textfragmente, Tesseract, Zeilen, Kaufland-Regelwerk |
| `src/server/` | Datenbank, Dienste für Gruppen, Belege, Zahlungen, Verlauf, Bildablage |
| `src/pages/api/` | API-Endpunkte; jeder hängt am Link-Code der Gruppe |
| `src/app/` | Oberfläche (React): Screens, Router, Gerätespeicher |
| `src/sw/` | Service Worker für die App-Hülle |
| `drizzle/` | Datenbank-Migrationen |
| `tests/unit/`, `tests/e2e/` | Vitest- und Playwright-Tests |
| `tests/fixtures/receipts/` | drei Kaufland-Zettel als Foto, Text und erwartetes Ergebnis |

## Lizenzen von Dritten

Das deutsche Sprachmodell für Tesseract (`tessdata/deu.traineddata`) stammt unverändert aus [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata) und steht unter der Apache-Lizenz 2.0 (`tessdata/LICENSE`).
