# StudyFlow BFH

StudyFlow bündelt Aufgaben, Prüfungen und Gruppenarbeiten. Diese Version verwendet echte Supabase-Benutzerkonten und speichert die persönlichen Einträge im zugehörigen Konto. Geteilte Gruppenarbeiten werden über die E-Mail-Adressen bestätigter Konten zugeordnet.

## App auf GitHub Pages veröffentlichen

Die App wird über `index.html` ausgeliefert; das ausgewählte Buchlogo liegt in `assets/studyflow-bfh-logo.png`. Der Ordner `assets` muss mitveröffentlicht werden. Für GitHub Pages ist kein npm-Build erforderlich. `.nojekyll` sorgt dafür, dass GitHub die Datei unverändert ausliefert. Die vorhandenen Figma-Dateien und npm-Befehle bleiben für die Bearbeitung mit Figma erhalten.

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

## Logo und App-Name

Der vollständige Name lautet **StudyFlow BFH**. Das ausgewählte Buchsymbol mit geschwungenem Pfeil erscheint in allen Kopfzeilen und als Browser-Symbol. Die Bilddatei enthält nur das Symbol; der Name daneben bleibt lesbarer HTML-Text. Im Schwarz-Weiss-Modus wird auch das Logo ohne Farbe dargestellt.

## Laptop, Tablet und Smartphone

Die Darstellung passt sich automatisch an die Fensterbreite an. Auf dem Smartphone stehen Inhalte untereinander; die Hauptnavigation bleibt unten. Auf Tablets wird der verfügbare Platz breiter genutzt. Ab 900 Pixeln Fensterbreite wechselt die angemeldete App zu einer seitlichen Navigation und einer breiten Arbeitsfläche. Auf der Startseite stehen Kalender und heutige Einträge nebeneinander; Aufgaben-, Prüfungs- und Gruppenlisten haben zwei Spalten.

Anmeldung und Einrichtung behalten eine gut lesbare Formularbreite. Eintragsformulare und Details öffnen auf grösseren Bildschirmen als mittige Dialoge mit eigener Scrollmöglichkeit. Kleine Fensterhöhen werden berücksichtigt. Funktionen, Reihenfolge der Einträge, gespeicherte Daten, Farbauswahl und Sprachen bleiben erhalten.

## Sprache

Deutsch, Französisch, Italienisch und Englisch sind bereits vor der Anmeldung, während der Einrichtung und später im Profil auswählbar. Beim ersten Besuch wird eine unterstützte Browsersprache verwendet, andernfalls Englisch. Eine lokale Auswahl bleibt auf dem Gerät erhalten; nach der Anmeldung hat die im jeweiligen Konto gespeicherte Sprache Vorrang.

In der Einrichtung wird die Sprache zusammen mit den vollständigen Angaben gespeichert. Im fertigen Konto wird ein Sprachwechsel sofort gespeichert; bei einem Fehler bleibt die bisherige Sprache aktiv. Kalenderdaten, Wochentage, Formulare, Bedienelemente, Rückmeldungen und Erinnerungen werden übersetzt. Die HTML-Seite kennzeichnet die aktive Sprache für Hilfstechnologien. Eigene Namen, Studiengänge, Module, Titel und Beschreibungen werden nicht übersetzt; interne Auswahlwerte und bestehende Verknüpfungen bleiben unverändert.

Alle Übersetzungen sind in der App enthalten. Es wird kein Übersetzungsdienst aufgerufen. Die Sprachwahl betrifft die App-Oberfläche; Supabase-E-Mail-Vorlagen werden separat verwaltet.

## Funktionsprüfung

- Ein neues Konto mit einer eigenen erreichbaren E-Mail-Adresse registrieren.
- Die angezeigte Bestätigungsnachricht prüfen und den Link aus der E-Mail öffnen.
- Die Sprache vor der Anmeldung wechseln, Eingaben beibehalten und Fehlermeldungen prüfen.
- Anmelden, die Einrichtung mit mindestens einem eigenen Modul abschliessen und den Hinweis zu späteren Profiländerungen prüfen.
- Eine Aufgabe speichern, die Seite neu laden und die Aufgabe erneut öffnen. Die Einrichtung darf nicht erneut erscheinen.
- Im Profil die Sprache wechseln und neu laden; die Auswahl muss erhalten bleiben. Eigene Modulnamen und Einträge dürfen sich nicht ändern.
- Abmelden und mit einem zweiten bestätigten Konto anmelden. Persönliche Aufgaben gehören jeweils zum eigenen Konto.
- Eine Gruppenarbeit mit der bestätigten Adresse des zweiten Kontos teilen und die geteilten Einträge in beiden Konten prüfen.

Die Eingabeprüfung, typische Auth-Fehler, Rücksprungadressen, Kontowechsel die verpflichtende Einrichtung und die vier Sprachen einschliesslich Speichern, Wiederholen nach Fehlern, Datumsausgabe und Erhalt bestehender Einträge werden ohne echte E-Mail-Sendungen geprüft:

```sh
npm run check:auth
```

## Dokumentation

- [GitHub Pages: Veröffentlichungsquelle](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: eigener SMTP-Versand](https://supabase.com/docs/guides/auth/auth-smtp)


