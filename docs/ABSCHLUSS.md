# Abschlussbericht

Stand: 12.11.2026. Splitti ist nach `docs/PLAN.md` gebaut; alle sieben Meilensteine sind abgenommen. Dieser Bericht hält fest, was erreicht ist, was entschieden wurde, wie die Texterkennung an den drei Testfotos abschneidet und was sich nicht automatisch prüfen ließ.

## Stand je Meilenstein

| Nr. | Meilenstein | Abnahme laut Plan | Ergebnis | Commit |
| --- | --- | --- | --- | --- |
| 1 | Gerüst | `docker compose up` startet, `/api/health` antwortet, Tests laufen | erfüllt: Container baut und startet, Health-Endpunkt antwortet, Status „healthy“ | `5c0a1b7` |
| 2 | Texterkennung | Parser liefert für die drei Text-Vorlagen genau die erwarteten Positionen; Ergebnis an den echten Fotos steht als Bericht im Repo | erfüllt: Parser-Tests vergleichen streng mit `*.expected.json`; Bericht in `docs/OCR-BERICHT.md` | `d159950` |
| 3 | Rechenkern | Summe der Anteile gleich Belegsumme, Abweichung höchstens ein Cent pro Person, Salden ergeben null, Begleichen bringt alle auf null, Rechenbeispiel Zettel A stimmt | erfüllt, zusätzlich über Zufallsbelege geprüft; die Zahl der Überweisungen ist gegen eine vollständige Suche als minimal geprüft | `d8d7a8e` |
| 4 | Gruppen | Browser-Test: Gruppe anlegen, Link öffnen, Mitglied wählen | erfüllt (`tests/e2e/groups.spec.ts`) | `93a4959` |
| 5 | Belege | Browser-Test: Testzettel hochladen, zuordnen, speichern, ändern, löschen, wiederherstellen | erfüllt mit dem echten Foto von Zettel A und der echten Erkennung (`tests/e2e/receipts.spec.ts`) | `f0b480c` |
| 6 | Salden | Browser-Test: Salden stimmen nach zwei Belegen und einer Zahlung | erfüllt, auf den Cent genau einschließlich Rundungscent (`tests/e2e/balances.spec.ts`) | `1f798d9` |
| 7 | PWA und Abschluss | Installierbarkeit geprüft, alle Tests grün, Anleitung für Installation und Update im README | erfüllt: Manifest, Icons und Service Worker getestet, Chromium meldet keine Installationshindernisse; README mit Installation, Update, Sicherung, Proxy-Netzwerk | Commit mit diesem Bericht |

Zahlen zum Schluss:

- 179 Unit-Tests (Vitest) in 10 Dateien: Rechenkern, Geldbeträge, Kaufland-Parser, Zerlegung in Textfragmente, Zeilenbildung, Erkennung an den drei Fotos, Migrationen
- 79 Browser- und API-Tests (Playwright) in 9 Dateien, im Handy-Format 390 × 844
- `npm run test:all` (Lint, Typprüfung, alle Tests) läuft lokal in unter einer Minute durch
- 58 Entscheidungen in `docs/DECISIONS.md`

## Was am fertigen Container geprüft wurde

Von Hand am gebauten Image (`docker compose up -d --build`), nicht nur über die Tests:

| Prüfung | Ergebnis |
| --- | --- |
| Bau und Start mit einem Befehl, ohne vorherige Schritte | ja; `.env` ist eingecheckt, `data/` wird mitgeliefert |
| `/api/health` | antwortet `{"status":"ok"}`, Container wird „healthy“ |
| Scan von Zettel A über die API des Containers | 6 von 6 Positionen, alle Beträge richtig, Summe 11,63 erkannt, knapp 2 Sekunden auf dem Entwicklungsrechner |
| Daten nach `docker compose down` und erneutem `up -d --build` | Gruppe, Beleg und Zettelbild unverändert vorhanden |
| Sicherung | Kopie von `data/` in einem zweiten Container geöffnet: Beleg vollständig lesbar |
| Dateirechte | Datenbank und Bilder gehören auf dem Host dem Benutzer des Ordners, nicht root; der Prozess im Container läuft unter dessen Benutzer-ID |
| Dauerbetrieb | Neustart-Regel `unless-stopped` gesetzt; `docker compose down` beendet den Container sofort |
| Proxy-Netzwerk | Vorbereitete Stelle einkommentiert und mit einem Test-Netzwerk gestartet: aus dem Netz als `http://splitti:3000` erreichbar, Port am Server weiterhin erreichbar |

## Ergebnis der Texterkennung an den drei Fotos

Erzeugt im Container-Image (Tesseract 5.5.0, deutsches Standardmodell aus `tessdata/`), Einzelheiten Zeile für Zeile in `docs/OCR-BERICHT.md`.

| Zettel | Zustand des Fotos | Positionen | Beträge richtig | Zettelsumme | Summenprüfung | Datum |
| --- | --- | --- | --- | --- | --- | --- |
| A | unmarkiert, stark zerknittert | 6 von 6 | 6 von 6 | 11,63 erkannt | stimmt | keines auf dem Foto, keines erkannt |
| B | sieben Preise unter Textmarker | 14 von 14 | 14 von 14 | 30,22 erkannt | stimmt | 27.10.2026 erkannt |
| C | fünf Preise von Hand eingerahmt | 12 von 12 | 11 von 12 laut Foto | 28,29 erkannt | weicht um 10,00 ab | 09.11.2026 erkannt |

Einordnung:

- **Zettel A** (der einzige ohne Markierungen, also der eigentliche Anwendungsfall): alle Beträge, Mengenzeilen, Summe und Steuertabelle stimmen. Fünf von sechs Bezeichnungen sind buchstabengenau, eine weicht ab („KVeg. N0 Milk“ statt „KVeg.No Milk“).
- **Zettel B:** alle Beträge stimmen, auch die übermalten. Zwei davon stimmen nur dank der Prüfwerte: Bei „Tradizion.Margher.“ war der Preis unlesbar und wurde aus der Zettelsumme ergänzt (die Position bleibt zur Prüfung markiert); beim zweiten Pfand las Tesseract „1,50“ statt „0,50“, und Menge × Einzelpreis zusammen mit der Steuertabelle haben das korrigiert. Beide Zeilen sind auf dem Foto nicht markiert; es sind also zwei echte Lesefehler, die nur dank der Prüfwerte nicht im Ergebnis stehen. Bei den Bezeichnungen weichen fünf ab, zwei davon nur, weil die Vorlage anders schreibt als das Foto („2,5kg“ statt „2,5Kg“, „10 st.“ statt „10 St.“).
- **Zettel C:** Die einzige Abweichung beim Betrag liegt an einer markierten Stelle: Beim eingerahmten „1,54“ wird der Rahmenstrich als Ziffer gelesen („11,54“). Die Summenprüfung zeigt die Abweichung von 10,00 € über dem Speichern-Knopf. Nach der Regel im Plan gilt das nicht als Fehler. Die Bezeichnungen sind auf diesem Foto am schwächsten (4 von 12 buchstabengenau, meist ein falscher Anfangsbuchstabe).
- **Vorlage C weicht vom Foto ab:** Die abgetippte Vorlage und das erwartete Ergebnis nennen „Teek.Türk.Apfel 1,19 / Teek.Strawb.Chees. 2,49 / K.Sandwichtoast VK 2,49“, das Foto zeigt „Teek.Strawb.Chees. 2,49 / Teek.Türk.Apfel 2,49 / K.Sandwichtoast VK 1,19“. Die Summe ist dieselbe. Die Vorlagen wurden nicht verändert; der Parser-Test erfüllt sie exakt, der Fototest prüft gegen das Foto. Der Bericht zählt in seiner Übersicht gegen die Vorlage und kommt deshalb bei C auf „9 von 12“.

Was die Zahlen nicht sagen: Drei Fotos sind eine kleine Stichprobe, und an ihnen wurde die Erkennung entwickelt. Wie gut sie an neuen Zetteln ist, zeigt erst der Betrieb (siehe unten).

## Die wichtigsten Entscheidungen

Alle 58 Entscheidungen stehen mit Begründung in `docs/DECISIONS.md`. Die mit der größten Tragweite:

1. **Eigene Zerlegung des Fotos statt Tesseracts Seitenanalyse** (Nr. 15, 16, 18). Auf zerknitterten Zetteln verband die Seitenanalyse Namen und Preise falsch. Splitti findet das Papier, gleicht Schatten aus, schneidet jedes Textstück einzeln gerade und lässt Tesseract nur noch einzelne Zeilen lesen, jede in drei Kontrastvarianten. Das ist deutlich mehr als die vier Vorverarbeitungsschritte im Plan, war aber nötig, damit Zettel A überhaupt lesbar wird.
2. **Sprachmodell im Repo** (Nr. 17). Das Modell aus dem Debian-Paket las an den Testzetteln spürbar schlechter. Das Standardmodell (15 MB) liegt deshalb unter `tessdata/`; Container, Entwicklung und Tests benutzen dasselbe.
3. **Prüfwerte beheben Lesefehler, statt sie nur anzuzeigen** (Nr. 20 bis 22). Ein einzelner unlesbarer Preis wird aus der Zettelsumme ergänzt, eine widersprüchliche Mengenzeile über Summe oder Steuertabelle entschieden. Ergänzte Positionen bleiben markiert.
4. **`.env` eingecheckt, Container läuft als Besitzer von `data/`** (Nr. 1, 2). So bleibt die Installation ein Befehl, die Compose-Datei entspricht der Vorlage, und die Sicherung ist wirklich nur eine Ordnerkopie.
5. **Zusätze zur API-Tabelle** (Nr. 36, 51): ein Endpunkt für das Bild eines noch nicht gespeicherten Scans, und die Zahlungen kommen mit dem Änderungsverlauf. Beides hängt wie alles andere am Link-Code.
6. **Zusätze zu den neun Screens** (Nr. 33, 42, 47): „Einladungslink einfügen“ auf dem Startscreen, die Leiste für „Mehrere markieren“, die Seite „Belege und Verlauf“.
7. **Kein Push** (Nr. 11). Alle Commits liegen lokal auf `main`.

## Was sich nicht automatisch prüfen ließ

Diese Punkte brauchen das echte Gerät oder den echten Server und sind offen, bis sie dort ausprobiert sind.

| Punkt | Was geprüft ist | Was offen ist |
| --- | --- | --- |
| **Kamera am echten Handy** | Der Kamera-Pfad läuft im Test mit der eingebauten Testkamera von Chromium: Live-Bild, Auslöser, Hochladen, Abschalten der Kamera beim Verlassen. Der Ausweichweg über die Kamera-App ist ebenfalls getestet. | Schärfe, Autofokus und Auflösung echter Handykameras im Live-Bild; die Erlaubnisabfrage auf iOS und Android; ob das Foto aus dem Live-Bild so gut lesbar ist wie eines aus der Kamera-App. Wenn nicht, ist „Aus Galerie“ der bessere Weg, und der Auslöser sollte gleich die Kamera-App öffnen. |
| **HTTPS über den Proxy** | Die App spricht HTTP, prüft keine Herkunft (Nr. 9) und baut Einladungslinks aus der Adresse im Browser, ist also auf den Betrieb hinter einem Proxy ausgelegt. Das Proxy-Netzwerk ist mit einem Test-Netzwerk geprüft. | Der Durchlauf über den echten Nginx Proxy Manager mit Zertifikat und Pi-hole-Namen: Upload eines Fotos über den Proxy, Teilen-Menü, Kamera-Erlaubnis, Installation als App. |
| **Erkennung an neuen Zetteln** | Drei Kaufland-Zettel; Rabattzeilen nur mit erfundenen Vorlagen. | Andere Kaufland-Zettel (Rabatte, Coupons, Leergut, lange Zettel, Barzahlung), andere Lichtverhältnisse und Untergründe (das Papier wird über seine helle, farblose Fläche gefunden; auf weißem Tisch gelingt das Zuschneiden nicht, die Erkennung läuft dann auf dem ganzen Bild). Zettel anderer Läden werden nicht erkannt und öffnen sich leer mit Bild. |
| **Installation als App** | Manifest, Icons, Service Worker, Start ohne Verbindung; Chromium meldet über seine Entwicklerschnittstelle keine Installationshindernisse. | Das Installieren selbst auf Android und iPhone, das Aussehen des Icons auf dem Startbildschirm, das Verhalten der installierten App auf dem iPhone (eigener Speicher, siehe „Einladungslink einfügen“). |
| **Geschwindigkeit auf dem Home-Server** | Knapp 2 bis 3 Sekunden pro Zettel auf dem Entwicklungsrechner (16 Kerne). | Die Dauer auf dem i5 mit 4 GB RAM. Erwartet werden einige Sekunden; es läuft immer nur eine Erkennung gleichzeitig. |
| **Neustart nach Server-Neustart** | Die Neustart-Regel ist gesetzt. | Ein echter Neustart des Servers. |
| **GitHub Actions** | Der Workflow (`.github/workflows/ci.yml`) führt dieselben Befehle aus wie lokal; die Fototests bestehen auch mit Tesseract 5.3 (Debian 12), der Version der GitHub-Runner am nächsten. | Ein echter Lauf: Er findet erst nach dem ersten `git push` statt. |

## Bekannte Grenzen

- Bezeichnungen sind nach der Erkennung nicht immer buchstabengenau; sie lassen sich im Aufteilungs-Screen überschreiben. Beträge werden über die Summenprüfung abgesichert, Bezeichnungen nicht.
- Stimmt die Summe der Positionen mit der Zettelsumme überein, ist das ein starkes, aber kein sicheres Zeichen: Zwei Lesefehler, die sich aufheben, oder ein ergänzter Preis neben einem zweiten Fehler fallen nicht auf. Ergänzte und unsichere Positionen sind deshalb mit „bitte prüfen“ markiert.
- Wer den Link hat, darf alles, auch Mitglieder entfernen und Belege löschen. Belege lassen sich wiederherstellen, entfernte Mitglieder wieder aufnehmen; eine gelöschte Zahlung muss neu eingetragen werden.
- Geht der Einladungslink auf allen Geräten verloren, steht er nur noch in der Datenbank (`data/splitti.db`, Tabelle `groups`, Spalte `token`).
- Das Image ist mit etwa 560 MB nicht klein; den größten Teil machen Node.js, Tesseract und das Sprachmodell aus.

## Nächste Schritte für den Betrieb

1. `git push`, damit der Workflow auf GitHub einmal läuft.
2. Auf dem Home-Server installieren (README, „Installation“), Proxy Host und Pi-hole-Namen einrichten.
3. Am Handy über HTTPS: Gruppe anlegen, einen frischen Kaufland-Zettel scannen, als App installieren. Die offenen Punkte aus der Tabelle oben dabei abhaken.
4. Liest die Erkennung einen Zettel schlecht: `SPLITTI_OCR_DEBUG_DIR` setzen (README, „Fehlersuche“) und das Foto samt abgetippter Vorlage als weiteren Testzettel unter `tests/fixtures/receipts/` ablegen.
