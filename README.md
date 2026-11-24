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

## Automatische Aktualisierung

Der manuelle Button **Refresh account** wurde aus dem Profil entfernt. Die App lädt Kontodaten weiterhin beim Zurückkehren zum Browserfenster sowie alle 30 Sekunden automatisch nach. Während der Einrichtung, beim Speichern und bei geöffneten Formularen oder Details wird die Aktualisierung ausgesetzt, damit laufende Eingaben erhalten bleiben. Hinweise bei Speicherfehlern oder Konflikten erklären in der ausgewählten Sprache, dass die Seite neu geladen werden soll.

## Studiengang auswählen

Einrichtung und Profil verwenden dieselbe nach Bachelor und Master gegliederte Auswahl. Sie umfasst die 88 regulären Bachelor- und Masterangebote einschliesslich der einzeln aufgeführten Master-Profile aus der vollständigen [BFH-Studiengangsliste](https://www.bfh.ch/de/studium/alle-studiengaenge/), geprüft am 24. November 2026. Das ebenfalls dort aufgeführte HF-Diplom wird nicht als akademischer Bachelor- oder Masterstudiengang angeboten. International Business Administration ist enthalten.

Innerhalb der beiden Gruppen werden die Angebote in der gewählten App-Sprache alphabetisch sortiert. Abschlusskürzel unterscheiden gleichnamige Bachelor- und Masterangebote. Die Bezeichnungen sind in Deutsch, Französisch, Italienisch und Englisch hinterlegt; internationale Studiengangsnamen bleiben teilweise unverändert. Die Quelle führt insbesondere Engineering-, Life-Sciences- und Musik-Masterprofile einzeln auf, deshalb ist die Zahl der Auswahloptionen grösser als eine Zählung übergeordneter Abschlüsse.

Gespeicherte Studiengangswerte bleiben erhalten. Bestehende IDs werden nicht durch eine neue Auswahl ersetzt, und ein früher gespeicherter abweichender Eintrag bleibt auswählbar. Das gilt auch für den bisherigen Bachelor Wirtschaftsinformatik, während neue Konten das aktuelle Angebot Digital Business & AI auswählen können. Die Architektur-Beschriftung verwendet den in der Quelle genannten BA; der frühere interne Wert bleibt für vorhandene Daten kompatibel. Neue Konten beginnen ohne vorausgewählten Studiengang. Es gibt kein zusätzliches Freitextfeld.

## Logo und App-Name

Der vollständige Name lautet **StudyFlow BFH**. Das ausgewählte Buchsymbol mit geschwungenem Pfeil erscheint in allen Kopfzeilen und als Browser-Symbol. Die Bilddatei enthält nur das Symbol; der Name daneben bleibt lesbarer HTML-Text. Im Schwarz-Weiss-Modus wird auch das Logo ohne Farbe dargestellt.

## Laptop, Tablet und Smartphone

Die Darstellung passt sich automatisch an die Fensterbreite an. Auf dem Smartphone stehen Inhalte untereinander; die Hauptnavigation bleibt unten. Auf Tablets wird der verfügbare Platz breiter genutzt. Ab 900 Pixeln Fensterbreite nutzt der App-Rahmen die volle Fensterbreite und -höhe ohne äussere Ränder oder eine maximale Breite. Die angemeldete App verwendet eine seitliche Navigation und eine breite Arbeitsfläche; auch die Profilansicht füllt die verfügbare Arbeitsfläche aus. Auf der Startseite stehen Kalender und heutige Einträge nebeneinander; Aufgaben-, Prüfungs- und Gruppenlisten haben zwei Spalten.

Anmeldung und Einrichtung behalten eine gut lesbare Formularbreite. Eintragsformulare und Details öffnen auf grösseren Bildschirmen als mittige Dialoge mit eigener Scrollmöglichkeit. Kleine Fensterhöhen werden berücksichtigt. Funktionen, Reihenfolge der Einträge, gespeicherte Daten, Farbauswahl und Sprachen bleiben erhalten.

## Gruppen mit oder ohne Modulzuordnung

Beim Anlegen oder Bearbeiten einer Gruppe kann ein eigenes Modul oder die zusätzliche Option **Keinem Modul zugeordnet** gewählt werden. Bei einer Gruppe ohne feste Zuordnung wählt man das Modul für jede Aufgabe separat. Eine Gruppe mit einem festen Modul gibt dieses an ihre Gruppenaufgaben weiter, auch wenn ein Mitglied andere eigene Module angelegt hat. Geteilte Aufgaben enthalten eine Modulbeschreibung, damit andere Mitglieder den richtigen Modulnamen und die Farbe sehen.

Gruppen werden mit einem eigenen Gruppensymbol und einer Gesamtanzahl dargestellt. Sie haben kein Abhakfeld und keinen Erledigungsstatus. Alte Gruppen-Erledigungswerte werden beim Laden ignoriert und beim Speichern weggelassen. Aufgaben innerhalb der Gruppe behalten ihren eigenen Erledigungsstatus und können weiterhin abgeschlossen und wieder geöffnet werden. Gruppen zählen nicht zu Tagesaufgaben oder Kalenderterminen.

Gruppen besitzen keine Datums- oder Erinnerungsfelder und lösen keine Erinnerungen aus. Bestehende Gruppen werden beim Laden ohne Termin und Erinnerung dargestellt; beim nächsten Speichern durch die Gruppenleitung werden `due: null` und `reminder: "none"` geschrieben. Aufgaben und Prüfungen behalten ihre Termine, Erinnerungen und Gruppenverknüpfungen. Beim Entfernen einer festen Gruppenzuordnung werden die Module vorhandener Aufgaben nicht geleert.

Die bestehende JSON-Speicherung unterstützt diese Angaben; eine Schemaänderung ist nicht erforderlich. Die Zugriffsregeln bleiben bestehen: Mitglieder können ihre eigenen Aufgaben speichern, ohne die Gruppe einer anderen Person zu überschreiben.

## Motivation und Tagesfortschritt

Das Tagesziel auf der Startseite bezieht sich auf Aufgaben mit heutigem Fälligkeitsdatum. Gruppen, Prüfungen und Aufgaben anderer Tage zählen nicht zum Erledigungsanteil. Die Anzeige verwendet ganze, abgerundete Prozentwerte; 100 % erscheint erst, wenn alle heutigen Aufgaben erledigt sind. Ohne heutige Aufgaben erscheinen Planungshinweise ohne Prozentanzeige.

Die Motivationssprüche unterscheiden zwischen noch nicht begonnen, ersten Fortschritten, mindestens einem Viertel, mindestens der Hälfte, mindestens drei Vierteln und vollständig erledigt. Für jede Stufe sowie für Tage ohne Aufgaben gibt es drei Texte in Deutsch, Französisch, Italienisch und Englisch. Bei geändertem Erledigungsstand und beim Aufrufen der Startseite wird innerhalb der passenden Stufe gewechselt. Automatische Aktualisierungen, Kalendernavigation, Änderungen der Darstellung und Sprachwechsel behalten denselben Spruch bei. Die Auswahl wird nur im Browser-Arbeitsspeicher gehalten; es werden dafür keine Kontodaten gespeichert oder zusätzliche Dienste aufgerufen.

## Eigenes Konto löschen

Im Profil öffnet **Konto löschen** eine ausdrückliche Bestätigung. Die E-Mail-Adresse muss eingegeben und das aktuelle Passwort erneut bestätigt werden. Das Passwort wird ausschliesslich an Supabase Auth zum erneuten Anmelden gesendet; die Löschfunktion erhält nur die Bestätigungsadresse und den gespeicherten Revisionsstand. Die Datenbank akzeptiert ausschliesslich die aktuell angemeldete Identität mit einer bestehenden, höchstens fünf Minuten alten Sitzung. Es gibt keinen Parameter zur Auswahl einer anderen Benutzer-ID und keinen geheimen Admin-Schlüssel im Browser.

Die Löschung entfernt das Auth-Konto, seine Sitzungen, das Profil mit Modulen und Einstellungen, die eigenen Aufgaben und Prüfungen sowie selbst erstellte Gruppen. Aufgaben anderer Mitglieder in diesen Gruppen bleiben mit Inhalt, Erledigungsstand, Terminen, Erinnerungen und Modulbeschreibung als persönliche Aufgaben erhalten. Mitgliedschaften in Gruppen anderer Konten werden entfernt. Betroffene Konten erhalten eine neue Datenrevision, damit ein älterer Speicherstand keine entfernten Verknüpfungen wiederherstellt. Alle Datenbankänderungen laufen in einer Transaktion; ein Fehler lässt die Daten unverändert.

Nach erfolgreicher Löschung wird die lokale Anmeldung beendet und die Anmeldeseite zeigt die Bestätigung. Bei falschem Passwort, veraltetem Speicherstand oder Netzwerkfehler bleibt ein erneuter Versuch möglich. Kontowechsel während einer Anfrage dürfen das neu angemeldete Konto weder löschen noch dessen Anzeige leeren. Während der Bestätigung kann abgebrochen werden; während der laufenden Löschanfrage sind doppelte Anfragen gesperrt. Alle Texte sind in den vier App-Sprachen vorhanden.

Die Migration `supabase/migrations/20261122185011_studyflow_self_service_account_deletion.sql` enthält den eng begrenzten privaten Datenbankaufruf und den öffentlichen Aufruf mit den nötigen Zugriffsrechten. `scripts/check-account-deletion.sql` prüft die Löschung, abgewiesene Anfragen, den Datenerhalt für andere Mitglieder und den Schutz vor veralteten Speicherständen mit ausschliesslich synthetischen Identitäten innerhalb einer zurückgerollten Transaktion. Dafür sind administrative Datenbankrechte nötig; echte Konten werden nicht verwendet und keine E-Mails versendet.

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

Die automatischen Prüfungen decken Anmeldung, Kontowechsel, Einrichtung, die vier Sprachen, Gruppen mit oder ohne Modulzuordnung sowie Bestätigung und Fehler bei der Kontolöschung ab. Sie prüfen auch Speicherfehler, Datumsausgabe und den Erhalt bestehender Einträge, ohne echte E-Mails zu versenden:

```sh
npm run check:auth
```

## Dokumentation

- [GitHub Pages: Veröffentlichungsquelle](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: eigener SMTP-Versand](https://supabase.com/docs/guides/auth/auth-smtp)


