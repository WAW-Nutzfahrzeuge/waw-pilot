# WAW ZUGFeRD Service

HTTP-Service und dauerhafter Worker fuer die technische Erzeugung und Validierung
von ZUGFeRD-/Factur-X-Rechnungen im Profil EN16931.

Der Service ist bewusst von der Next.js-App getrennt. WAW Pilot bleibt die
Quelle fuer Kunden-, Fahrzeug-, Verkaufs-, VAT-, Nummernkreis-, Mandanten- und
Dokumentmetadaten. Dieser Dienst verarbeitet den vorbereiteten kanonischen
Rechnungsdatensatz und eine sichtbare Rechnungs-PDF aus dem privaten Supabase-Storage.

## Unterstuetzte Formate

- Implementiert: ZUGFeRD 2.5 / Factur-X 1.09, Profil EN16931
- Implementiert: PDF/A-3b-Konvertierung und VeraPDF-Pruefung
- Implementiert: EN16931-/Factur-X-Pruefung ueber Mustangproject
- Nicht implementiert: separater XRechnung-Export
- Nicht enthalten: KoSIT-Validator

## Komponenten

- Java 21
- Spring Boot 3.3.7
- Mustangproject 2.24.0
- VeraPDF 1.30.2
- Ghostscript aus dem Linux-Paket
- sRGB ICC-Profil aus `icc-profiles-free`

## API

### `GET /health`

Ohne Authentifizierung. Antwortet bewusst knapp:

```json
{
  "status": "ok"
}
```

Der Health Check erzeugt keine Rechnung und gibt keine Secrets, Pfade oder
Systemdetails aus.

### `POST /generate`

Erzeugt eine validierte ZUGFeRD-/Factur-X-PDF.

```text
Authorization: Bearer <ZUGFERD_SERVICE_API_KEY>
Content-Type: application/json
```

Antwort bei Erfolg:

```json
{
  "pdfBase64": "...",
  "fileName": "rechnung-026-001-zugferd.pdf",
  "sha256": "...",
  "standardVersion": "ZUGFeRD 2.5 / Factur-X 1.09",
  "profile": "EN16931",
  "validation": {
    "status": "valid",
    "xmlValid": true,
    "pdfAValid": true,
    "consistencyValid": true
  }
}
```

### `POST /validate`

Fuehrt dieselbe Pipeline aus und liefert ein Validierungsergebnis zurueck.

### `POST /wake`

Authentifizierter, inhaltsfreier Aufruf. Er bestaetigt den Wake-up-Request. Der
Scheduler prueft die dauerhafte Supabase-Warteschlange regelmaessig und kann
Auftraege nach einem Service-Neustart weiterverarbeiten.

## Pipeline

1. Dauerhaften Auftrag atomar aus Supabase beanspruchen.
2. Rechnungsdaten und sichtbare PDF aus der privaten Warteschlange laden.
3. PDF temporaer unter einem request-eigenen Verzeichnis speichern.
4. Ghostscript konvertiert die PDF nach PDF/A-3b.
5. Ghostscript wandelt die sichtbare PDF in PDF/A-3b um.
6. Mustangproject erzeugt `factur-x.xml` aus den kanonischen Rechnungsdaten.
7. Mustangproject bettet XML ein und validiert die fertige hybride PDF.
8. VeraPDF prueft PDF/A-3b.
9. Der Service prueft Konsistenz zwischen XML und Ausgangsdaten.
10. Die fertige PDF wird privat gespeichert und der Job dauerhaft als
    abgeschlossen markiert. WAW Pilot uebernimmt sie anschliessend in den
    Rechnungsdokumentenbereich.

Auftraege liegen in `public.zugferd_generation_jobs`. Der atomare Claim nutzt
`FOR UPDATE SKIP LOCKED`; ein Lease ermoeglicht die Wiederaufnahme nach einem
Neustart. Eingangs- und Ergebnis-PDF liegen waehrend der Verarbeitung privat im
`documents`-Bucket. Nach der Finalisierung durch WAW Pilot werden temporaere
Dateien geloescht. Job-Metadaten bleiben zur Nachvollziehbarkeit gespeichert.

Mustang hat ein Drei-Minuten-Limit; Ghostscript und veraPDF haben jeweils ein
60-Sekunden-Limit. Logs enthalten Job-ID, Verarbeitungsschritt und Dauer, aber
keine Rechnungs- oder Kundendaten.

## Environment Variables

Pflicht:

```env
ZUGFERD_SERVICE_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Der Service startet nicht mit leerem oder offensichtlich unsicherem API-Key.
Verwende lokal und in Render nur eigene ausreichend lange Werte. Keine echten
Secrets in Git speichern.

Optional:

```env
PORT=8080
MAX_UPLOAD_MB=20
GHOSTSCRIPT_COMMAND=gs
VERAPDF_COMMAND=verapdf
ICC_PROFILE_PATH=/usr/share/color/icc/ghostscript/srgb.icc
```

`MAX_UPLOAD_MB` begrenzt die dekodierte Eingangs-PDF. Der Default ist 20 MB.
Sehr grosse JSON-Requests werden zusaetzlich ueber den `Content-Length`-Header
fruehzeitig mit HTTP 413 abgelehnt.

`SUPABASE_SERVICE_ROLE_KEY` gehoert ausschliesslich als Secret nach Render. Sie
wird fuer Queue-RPCs und private Storage-Dateien benoetigt und darf nie an den
Browser oder ins Repository gelangen.

## Lokaler Docker-Build

Im Repository-Root:

```bash
docker build -t waw-zugferd-service ./services/zugferd-service
```

## Lokaler Start

```bash
docker run --rm \
  -p 8087:8080 \
  -e ZUGFERD_SERVICE_API_KEY=replace-with-a-local-development-secret \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=replace-with-a-local-development-secret \
  -e MAX_UPLOAD_MB=20 \
  waw-zugferd-service
```

Alternativ mit Docker Compose:

```bash
ZUGFERD_SERVICE_API_KEY=replace-with-a-local-development-secret \
docker compose up --build zugferd-service
```

Danach in der Next.js-App lokal:

```env
ZUGFERD_SERVICE_URL=http://localhost:8087
ZUGFERD_SERVICE_API_KEY=replace-with-the-same-local-development-secret
```

## Lokaler Health Check

```bash
curl -fsS http://localhost:8087/health
```

## Authentifizierung testen

Ohne Token:

```bash
curl -i -X POST http://localhost:8087/generate \
  -H "Content-Type: application/json" \
  -d '{}'
```

Mit falschem Token:

```bash
curl -i -X POST http://localhost:8087/generate \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Mit gueltigem Token muss ein fachlich vollstaendiger Request aus WAW Pilot
gesendet werden. Verwende keine realen Kundendaten in Test-Fixtures.

## Fehlerantworten

Fehlerantworten sind JSON und enthalten keine Stacktraces, Secrets,
vollstaendigen Rechnungsdaten oder internen Dateipfade.

Beispiel:

```json
{
  "error": {
    "code": "EN16931_VALIDATION_FAILED",
    "message": "Die EN-16931-Validierung ist fehlgeschlagen."
  },
  "message": "Die EN-16931-Validierung ist fehlgeschlagen.",
  "issues": []
}
```

Relevante Codes:

- `UNAUTHORIZED`
- `INVALID_REQUEST`
- `PAYLOAD_TOO_LARGE`
- `PDF_CONVERSION_FAILED`
- `XML_GENERATION_FAILED`
- `ZUGFERD_EMBEDDING_FAILED`
- `EN16931_VALIDATION_FAILED`
- `PDFA_VALIDATION_FAILED`
- `INTERNAL_ERROR`

## Render Deployment

Dieses Repository enthaelt eine `render.yaml` fuer einen einzelnen Docker Web
Service.

Blueprint-Konfiguration:

- `type`: `web`
- `runtime`: `docker`
- `rootDir`: `services/zugferd-service`
- `dockerfilePath`: `./Dockerfile`
- `dockerContext`: `.`
- `healthCheckPath`: `/health`
- `plan`: derzeit `free` im Blueprint
- Supabase wird als dauerhafter Job- und Dateispeicher verwendet

`ZUGFERD_SERVICE_API_KEY` wird in Render als Secret-Variable gesetzt und steht
nicht im Repository. Anschliessend wird in WAW Pilot nur
`ZUGFERD_SERVICE_URL` und derselbe serverseitige `ZUGFERD_SERVICE_API_KEY`
konfiguriert. Keine `NEXT_PUBLIC_`-Variable fuer das Secret verwenden.

Fuer kurze Reaktionszeiten muss der Web-Service dauerhaft aktiv sein. Render
Free kann nach Inaktivitaet schlafen; ein Kaltstart kann deutlich laenger als
die eigentliche Verarbeitung dauern. Eine bezahlte Compute-Stufe muss im
Render-Dashboard gewaehlt werden; ein Repository-Deployment aendert den Tarif
nicht. Das Blueprint setzt den Tarif absichtlich nicht automatisch um.

## Voraberzeugung und Status

Sobald WAW Pilot eine Standardrechnung als PDF speichert, reiht die App im
Hintergrund einen dauerhaften ZUGFeRD-Auftrag ein. Pro inhaltlich identischer
Rechnung verhindert ein SHA-256-Schluessel doppelte Jobs. Aendern sich sichtbare
PDF oder kanonische Rechnungsdaten, entsteht ein neuer Auftrag; ein noch nicht
gestarteter alter Auftrag wird als `superseded` markiert.

Der Scheduler beansprucht Auftraege atomar. Nach einem Prozessneustart kann er
abgelaufene Verarbeitungsleases wieder aufnehmen. Die App pollt den Status und
uebernimmt ein erfolgreiches Ergebnis in die Verkaufsakte. Ein Mustang-Timeout
nach drei Minuten loest einen Interrupt aus; Java-Bibliothekscode kann einen
Interrupt ignorieren, daher ist dies kein harter Prozessabbruch. Ghostscript
und veraPDF haben jeweils ein 60-Sekunden-Limit.

Vor dem Deployment muss die neue Supabase-Migration
`20261027120000_add_durable_zugferd_generation_jobs.sql` ausgefuehrt sein.
Vercel und Render benoetigen Zugriff auf dieselbe Supabase-Instanz. Der
Service-Role-Key ist nur als Secret in beiden Serverumgebungen einzutragen;
niemals in den Browser oder ins Repository.

## Sicherheit

- `/health` ist oeffentlich.
- `/generate` und `/validate` verlangen `Authorization: Bearer ...`.
- Der API-Key wird nicht geloggt.
- Rechnungsinhalte werden nicht vollstaendig geloggt.
- Client-Dateipfade werden nicht akzeptiert.
- Kommandozeilenoptionen kommen nicht aus dem Request.
- Temp-Dateien werden nach jedem Request bestmoeglich geloescht.
- Der Runtime-Container laeuft als Nicht-Root-Benutzer.

## Fehlerdiagnose

- Startfehler: `ZUGFERD_SERVICE_API_KEY` fehlt oder ist zu schwach.
- HTTP 401: Authorization-Header fehlt oder passt nicht.
- HTTP 413: Request zu gross.
- HTTP 422: Fachliche oder technische Validierung fehlgeschlagen.
- HTTP 500: Unerwarteter interner Fehler ohne Details im Response-Body.

Wenn VeraPDF oder Ghostscript keine konforme PDF/A-3b erzeugen koennen, wird
keine ZUGFeRD-Datei freigegeben. Das ist beabsichtigt.
