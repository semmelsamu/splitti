# Ergebnis der Texterkennung an den drei Testfotos

Dieser Bericht wird von `npm run ocr:report` erzeugt (`scripts/ocr-report.ts`). Er vergleicht, was die Erkennung aus den drei Fotos liest, mit den erwarteten Ergebnissen in `tests/fixtures/receipts/*.expected.json`.

- Erkennung: tesseract 5.5.0, Sprachpaket `deu`
- Weg: Vorverarbeitung (sharp) → Textfragmente finden → Tesseract liest jedes Fragment → Zeilen bilden → Kaufland-Regelwerk
- Die Spalte „Hinweis“ ist von Hand gepflegt: Sie nennt Stellen, die auf dem Foto markiert sind, und Stellen, an denen die abgetippte Vorlage vom Foto abweicht.

## Zusammenfassung

| Zettel | Positionen erkannt | Beträge richtig | Bezeichnungen exakt | Zettelsumme | Positionen ergeben die Zettelsumme | Datum |
| --- | --- | --- | --- | --- | --- | --- |
| Zettel A | 6 von 6 | 6 von 6 | 5 von 6 | 11,63 (erwartet 11,63) | ja | kein Datum (erwartet kein Datum) |
| Zettel B | 14 von 14 | 14 von 14 | 9 von 14 | 30,22 (erwartet 30,22) | ja | 2026-10-27 (erwartet 2026-10-27) |
| Zettel C | 12 von 12 | 9 von 12 | 4 von 12 | 28,29 (erwartet 28,29) | nein | 2026-11-09 (erwartet 2026-11-09) |

Lesehilfe: „Beträge richtig“ und „Bezeichnungen exakt“ zählen gegen die Vorlage. Bei Zettel C weicht die Vorlage in zwei Zeilen vom Foto ab (siehe unten), dort kann die Erkennung die Vorlage nicht treffen.

## Zettel A

Foto: `tests/fixtures/receipts/kaufland-a.png` – unmarkiert, stark zerknittert, Schlagschatten an den Falten.

| Erwartet | Betrag | Erkannt | Betrag | Ergebnis | Hinweis |
| --- | ---: | --- | ---: | --- | --- |
| KLC.Nougat Pockets | 2,79 | KLC.Nougat Pockets | 2,79 | stimmt |  |
| KVeg.No Milk | 0,95 | KVeg. N0 Milk | 0,95 | Betrag stimmt, Bezeichnung weicht ab |  |
| Barilla Girandole | 3,00 | Barilla Girandole | 3,00 | stimmt |  |
| Hauchgenuss vegan | 2,00 | Hauchgenuss vegan | 2,00 | stimmt |  |
| Salami vegan | 1,00 | Salami vegan | 1,00 | stimmt |  |
| KLC.Käseaufschnitt | 1,89 | KLC.Käseaufschnitt | 1,89 | stimmt |  |

- Summe der erkannten Positionen: 11,63; erkannte Zettelsumme: 11,63.
- Steuertabelle (Brutto): A 0,95 (erwartet 0,95), B 10,68 (erwartet 10,68); Abgleich mit den Positionen: ja.

<details><summary>Gelesene Textzeilen</summary>

```text
Preis FÜR
KLC.Nougat Pockets 2,79 B
>KVeg. N0 Milk 0,95 A
Barilla Girandole
3 * 1,00 3,00 B
Hauchgenuss vegan
2 * 1,00 2,00 B
Salami vegan 1,00 B
KLC.Käseaufschnitt 1,89 B
[ Sume ” 11,63
Karterzahlung 11,63
Steuer X Arutta Netto Steuer
A 19,00% 0,95 0,80 0,15
B 7,00C% 10,68 3,96 0,70
Kartenzahlung
-K-U-N-D-E-N-B-E-L-E-G-
Kauf land DE 6310
lermiral ID
TA-Nr 466688
Kartenzahlung
kontakt los
DEBIT MASTERCARD
FÜR 11,63
```

</details>

## Zettel B

Foto: `tests/fixtures/receipts/kaufland-b.png` – sieben Preise mit orangem Textmarker übermalt, zerknittert, leicht schräg.

| Erwartet | Betrag | Erkannt | Betrag | Ergebnis | Hinweis |
| --- | ---: | --- | ---: | --- | --- |
| KLC.Nougat Pockets | 2,79 | KLC.Nougat Pockets | 2,79 | stimmt |  |
| Ofenfr.Rucolapesto | 1,79 | Ofenf ı.Rucolapesto | 1,79 | Betrag stimmt, Bezeichnung weicht ab |  |
| Tradizion.Margher. | 1,79 | Tradizion.Margher. | 1,79 | stimmt (zur Prüfung markiert) |  |
| Paul. Spezi Zero | 0,95 | Paul. Spezi Zero | 0,95 | stimmt | Preis auf dem Foto mit Textmarker übermalt |
| Pfandartikel | 0,25 | Pfandartikel | 0,25 | stimmt | Preis auf dem Foto mit Textmarker übermalt |
| Iglo Brokkoli | 2,79 | 1910 Brokkoli | 2,79 | Betrag stimmt, Bezeichnung weicht ab | Preis auf dem Foto mit Textmarker übermalt |
| Red Bull Energy | 1,76 | Red 3u11 Energy | 1,76 | Betrag stimmt, Bezeichnung weicht ab |  |
| Pfandartikel | 0,50 | Pfandartikel | 0,50 | stimmt |  |
| KVeg.No Milk | 0,95 | KVeg.No Milk | 0,95 | stimmt |  |
| Rotbusch Sahne-Ka. | 2,49 | Rotbusch Sahne-Ka. | 2,49 | stimmt | Preis auf dem Foto mit Textmarker übermalt |
| Maultaschen vegan | 2,29 | Maultaschen vegan | 2,29 | stimmt | Preis auf dem Foto mit Textmarker übermalt |
| Kartoffeln 2,5kg | 3,79 | Kartoffeln 2,5Kg | 3,79 | Betrag stimmt, Bezeichnung weicht ab | Preis auf dem Foto mit Textmarker übermalt. Vorlage weicht vom Foto ab: Das Foto zeigt „2,5Kg“ |
| Kveg. Tofu Natur | 2,29 | Kveg. Tofu Natur | 2,29 | stimmt | Preis auf dem Foto mit Textmarker übermalt |
| Gelbstecker 10 st. | 5,79 | Gelbstecker 10 St. | 5,79 | Betrag stimmt, Bezeichnung weicht ab | Vorlage weicht vom Foto ab: Das Foto zeigt „10 St.“ |

- Summe der erkannten Positionen: 30,22; erkannte Zettelsumme: 30,22.
- Steuertabelle (Brutto): A 10,20 (erwartet 10,20), B 20,02 (erwartet 20,02); Abgleich mit den Positionen: nicht prüfbar.

<details><summary>Gelesene Textzeilen</summary>

```text
' n
Preis EUR
KLC.Nougat Pockets 2,79 B
Ofenf ı ‚Rucolapesto 1,79 B
Tradizion.Margher. 179 8
Paul. Spezi Zero 0,95 A
Pfandartikel 0,25 A
1910 Brokkoli 2,79ß
Red 3u11 Energy
2 * 0,88 1,76 A
Pfandartikel 2 * 0,25 1,50 A
KVeg.No Milk 0,95 A
Rotbusch Sahne-Ka, 2,49 B'
Maultaschen vegan 2,29 B
Kartoffeln 2,5Kg 3,79 B
Kveg. Tofu Natur 2,29 B
Gelbstecker 10 St. 5,79 A
Sume 30,22 {}
Kar tenzahlung "30,22
Steuer % Brutto Netto Steuer
A 19,00% 10,20 1, D7 1,63
B 7,00% 20,02 18,71 1,31
Kartenzahlung
K-U-N-D-E-N-B-E-L-E-G
Kaufland DE 6310
Yerminal ID :
TA-NT
Kartenzahlung
Kontakt 1086
Visa
EUR 30,22
PAN l
Karte 0
FMV-ATD
VU-Nr
Genehmigungs-Nr
Datum 27.10,26
```

</details>

## Zettel C

Foto: `tests/fixtures/receipts/kaufland-c.png` – fünf Preise mit grünem Stift eingerahmt, Handschrift am Kopf, zerknittert.

| Erwartet | Betrag | Erkannt | Betrag | Ergebnis | Hinweis |
| --- | ---: | --- | ---: | --- | --- |
| KLC.Käseaufschnitt | 1,89 | XLC.Käse:\iSeaufschnitt | 1,89 | Betrag stimmt, Bezeichnung weicht ab |  |
| KLC TaTü 4lg 15x10 | 1,75 | XLC TaTü 41g 15x10 | 1,75 | Betrag stimmt, Bezeichnung weicht ab |  |
| KLC.Backpapier | 0,79 | C.Backpapier | 0,79 | Betrag stimmt, Bezeichnung weicht ab |  |
| Teek.Türk.Apfel | 1,19 | Teek.Türk.Apfel | 2,49 | Betrag weicht ab | Vorlage weicht vom Foto ab: Das Foto zeigt 2,49. Preis auf dem Foto von Hand eingerahmt |
| Teek.Strawb.Chees. | 2,49 | Taek.Strawb.Chees | 2,49 | Betrag stimmt, Bezeichnung weicht ab | Preis auf dem Foto von Hand eingerahmt |
| K.Sandwichtoast VK | 2,49 | Sancwichtoast VK | 1,19 | Betrag und Bezeichnung weichen ab | Vorlage weicht vom Foto ab: Das Foto zeigt 1,19 |
| Ostm.Knoblauch | 2,29 | Istm.Knoblauch | 2,29 | Betrag stimmt, Bezeichnung weicht ab |  |
| KLC Vollwaschm. | 4,25 | KLC Vollwaschm. | 4,25 | stimmt |  |
| Meggle Die Vegane | 2,09 | Meggle Die Vegane | 2,09 | stimmt |  |
| Barilla Pesto Ros. | 5,64 | Barilla Pesto Ros. | 5,64 | stimmt | Preis auf dem Foto von Hand eingerahmt |
| Ba.Pesto getr.Tom. | 1,88 | 3a.Pesto getr.Tom. | 1,88 | Betrag stimmt, Bezeichnung weicht ab | Preis auf dem Foto von Hand eingerahmt |
| Äpfel Pink Lady kg | 1,54 | Apfel Pink Lady kg | 11,54 | Betrag und Bezeichnung weichen ab | Preis auf dem Foto von Hand eingerahmt |

- Summe der erkannten Positionen: 38,29; erkannte Zettelsumme: 28,29.
- Steuertabelle (Brutto): A 6,79 (erwartet 6,79), B nicht erkannt (erwartet 21,50); Abgleich mit den Positionen: nicht prüfbar.

<details><summary>Gelesene Textzeilen</summary>

```text
MMa
Preis EUR
XLC.Käse:\iSeaufschnitt 1,89 B
XLC TaTü 41g 15x10 1,75 A
\C.Backpapier 0,79 A
Taek ‚Strawb .Chees/ 2,49 °
Teek ‚Türk .Apfel 2,49 B
<.Sancwichtoast VK 1,19 B'
Istm.Knoblauch 2,29 B
KLC Vollwaschm. 4,25 A
Meggle Die Vegane 2,09 B
Barilla Pesto Ros.
3 * 1,88 5,64 B'
3a.Pesto getr.Tom. 1,88 B'
Apfel Pink Lady kg
0,440 kg 11,54 B
Sume 28,29
Karterizahlung “28,29
Steuer % Brutto |Netto Steuer
A 19,00% 6,79 5,71 1,08
3 7,00% 21,50 20,09 1,41
Kartenzahlung
-K-U-N-D-| L-N-B-E-L E-G-
Kauf land DE 6310
Terminal-ID :
TA-Nr
Kartenzahlung
kontakt 1os
DEBIT MASTERGARD
EUR 28,29
PAN
Karte 0
EMV-AID
VU-Nr
Genehmigungs-Nr
Datum 09,11,26
```

</details>
