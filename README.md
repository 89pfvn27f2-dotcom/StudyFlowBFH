# StudyFlow BFH

StudyFlow bündelt Aufgaben, Prüfungen und Gruppenarbeiten. Diese Version verwendet echte Supabase-Benutzerkonten und speichert die persönlichen Einträge im zugehörigen Konto. Geteilte Gruppenarbeiten werden über die E-Mail-Adressen bestätigter Konten zugeordnet.

## App auf GitHub Pages veröffentlichen

Die App ist in `index.html` vollständig enthalten. Für GitHub Pages ist kein npm-Build erforderlich. `.nojekyll` sorgt dafür, dass GitHub die Datei unverändert ausliefert. Die vorhandenen Figma-Dateien und npm-Befehle bleiben für die Bearbeitung mit Figma erhalten.

1. Unter **Settings → Pages** als Quelle **Deploy from a branch** wählen.
2. **main** und **/(root)** auswählen und speichern.
3. Warten, bis GitHub die Veröffentlichung als erfolgreich anzeigt, und die dort angezeigte Webadresse öffnen.

GitHub Free unterstützt Pages für öffentliche Repositories. Für Pages mit einem privaten persönlichen Repository ist GitHub Pro erforderlich. Ob das Repository öffentlich werden soll, entscheidet die Eigentümerin. Die Pages-Website ist unabhängig von der Sichtbarkeit des Repositorys öffentlich erreichbar.

## Bestätigungslinks und Passwort-Links einrichten

Im zugehörigen Supabase-Projekt unter **Authentication → URL Configuration** die tatsächliche, von GitHub angezeigte App-Adresse als **Site URL** und als erlaubte **Redirect URL** hinterlegen. Die Adresse soll auf den Ordner der App zeigen und mit `/` enden.

Die App berechnet diesen Rücksprungpfad aus ihrer Browseradresse. Es ist keine weitere Anpassung der HTML-Datei an den GitHub-Namen erforderlich.

## Registrierungs-E-Mails einrichten

Unter **Authentication → Email** einen eigenen SMTP-Anbieter oder einen **Send Email Hook** konfigurieren. Der eingebaute Supabase-Testversand ist auf Adressen von Mitgliedern der Supabase-Organisation begrenzt und reicht für Registrierungen von Freundinnen und Freunden nicht aus.

**Confirm email** aktiviert lassen: Die Zuordnung von Gruppenarbeiten beruht auf bestätigten E-Mail-Adressen.

## Einrichtung beim ersten Start

Alle Konten durchlaufen vor der Nutzung einmal eine Einrichtung. Gespeicherte Angaben und Module werden vorausgefüllt. Name, Studiengang, Studienform, Semester und Jahr sind Pflicht; vor dem Abschluss muss mindestens ein benanntes eigenes Modul vorhanden sein. Studiengang und Studienform werden für neue Konten nicht vorausgewählt.

Die Eingaben werden erst gemeinsam am Ende gespeichert. Bestehende Modul-IDs und verknüpfte Aufgaben bleiben erhalten; verwendete Module können während der Einrichtung nicht entfernt werden. Nach dem Speichern erklärt eine Meldung, dass spätere Änderungen im Profil möglich sind. Der Abschluss wird im Profil des Kontos gespeichert und gilt damit auch auf anderen Geräten.

## Funktionsprüfung

- Ein neues Konto mit einer eigenen erreichbaren E-Mail-Adresse registrieren.
- Die angezeigte Bestätigungsnachricht prüfen und den Link aus der E-Mail öffnen.
- Anmelden, die Einrichtung mit mindestens einem eigenen Modul abschliessen und den Hinweis zu späteren Profiländerungen prüfen.
- Eine Aufgabe speichern, die Seite neu laden und die Aufgabe erneut öffnen. Die Einrichtung darf nicht erneut erscheinen.
- Abmelden und mit einem zweiten bestätigten Konto anmelden. Persönliche Aufgaben gehören jeweils zum eigenen Konto.
- Eine Gruppenarbeit mit der bestätigten Adresse des zweiten Kontos teilen und die geteilten Einträge in beiden Konten prüfen.

Die Eingabeprüfung, typische Auth-Fehler, Rücksprungadressen, Kontowechsel und die verpflichtende Einrichtung einschliesslich Speichern, Wiederholen nach Fehlern und Erhalt bestehender Einträge werden ohne echte E-Mail-Sendungen geprüft:

```sh
npm run check:auth
```

## Dokumentation

- [GitHub Pages: Veröffentlichungsquelle](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: eigener SMTP-Versand](https://supabase.com/docs/guides/auth/auth-smtp)


