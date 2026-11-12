# Startauftrag für Claude Code

Den Inhalt dieses ZIP in das leere Repo entpacken (CLAUDE.md, docs/ und tests/ liegen dann im Repo-Wurzelverzeichnis), Claude Code im Repo starten und den folgenden Auftrag einfügen.

---

Baue die App Splitti vollständig nach `docs/PLAN.md`.

Lies zuerst `CLAUDE.md`, `docs/PLAN.md`, alle Dateien in `docs/wireframes/`, `docs/compose.vorlage.yaml` und die Testzettel in `tests/fixtures/receipts/`.

Arbeite dann die sieben Meilensteine aus dem Plan der Reihe nach durch, ohne Rückfragen, bis die App fertig ist. Jeder Meilenstein ist erst abgeschlossen, wenn seine Abnahme aus dem Plan erfüllt ist und alle Tests grün sind; committe danach auf den Hauptzweig und mach mit dem nächsten weiter. Wenn etwas nicht klappt, probiere andere Lösungswege und halte erst an, wenn du wirklich nicht weiterkommst. Lücken im Plan entscheidest du selbst und hältst sie in `docs/DECISIONS.md` fest.

Fertig bist du, wenn alle sieben Meilensteine abgenommen sind, `docker compose up -d --build` die App startet, das README Installation, Update, Sicherung und das Proxy-Netzwerk erklärt und `docs/ABSCHLUSS.md` den Abschlussbericht enthält.
