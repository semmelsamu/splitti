# Splitti

Selbst gehostete Kostenaufteilungs-App für WGs: Kassenzettel scannen, Positionen per Antippen auf Mitglieder verteilen, Salden ausgleichen. Läuft als ein Docker-Container im Heimnetz.

Die App ist im Aufbau; Umfang und Meilensteine stehen in [`docs/PLAN.md`](docs/PLAN.md). Die Betriebsanleitung folgt mit Meilenstein 7.

## Kurzfassung

```sh
docker compose up -d --build
```

Danach antwortet `http://<server>:3000/api/health`. Die Daten liegen im Ordner `data/`.
