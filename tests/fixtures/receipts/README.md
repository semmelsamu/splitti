# Testzettel

Drei Kaufland-Zettel, je in drei Formen:

- `kaufland-X.jpg`: Foto, aufrecht gedreht. B und C tragen Textmarker und Handschrift; das ist kein Anwendungsfall.
- `kaufland-X.txt`: Zeilen des Zettels von Hand abgetippt (Kopf bis Steuertabelle), als Vorlage für Parser-Tests ohne Tesseract.
- `kaufland-X.expected.json`: erwartetes Ergebnis. Beträge in Cent. `kind` ist `item` oder `deposit`. `quantity` und `unitPriceCents` stehen nur bei Mengenzeilen, `weightKg` nur bei Gewichtsware. `taxGrossCents` sind die Brutto-Beträge der Steuertabelle. `date` ist `null`, wenn das Datum auf dem Foto nicht zu sehen ist.

Die Summe der `items` ergibt bei allen dreien `detectedTotalCents`.
