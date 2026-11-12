# Sprachmodell für die Texterkennung

`deu.traineddata` ist das deutsche Standardmodell von Tesseract, unverändert übernommen:

- Quelle: <https://github.com/tesseract-ocr/tessdata>, Version 4.1.0, Datei `deu.traineddata`
- SHA-256: `896b3b4956503ab9daa10285db330881b2d74b70d889b79262cc534b9ec699a4`
- Lizenz: Apache 2.0 (siehe `LICENSE` in diesem Ordner)

Warum liegt es im Repo? Die Linux-Distributionen liefern unterschiedliche Modelle aus: Debian und Ubuntu das kleine „fast“-Modell (1,5 MB), andere das Standardmodell (15 MB). An den Testzetteln liest das kleine Modell deutlich schlechter (zum Beispiel „2,19“ statt „2,79“). Mit der Datei im Repo benutzen Container, Entwicklung und Tests dasselbe Modell, und der Container lässt sich ohne weiteren Download bauen. Begründung und Alternativen stehen in `docs/DECISIONS.md`.

Ein anderes Modell lässt sich über die Umgebungsvariable `TESSDATA_DIR` (Ordner mit `deu.traineddata`) einstellen.
