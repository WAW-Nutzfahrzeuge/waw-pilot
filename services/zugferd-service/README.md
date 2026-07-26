# WAW ZUGFeRD Service

Zustandsloser HTTP-Service fuer die technische Erzeugung und Validierung von
ZUGFeRD-/Factur-X-Rechnungen im Profil EN16931.

Der Service ist bewusst von der Next.js-App getrennt. WAW Pilot bleibt die
Quelle fuer Kunden-, Fahrzeug-, Verkaufs-, VAT-, Nummernkreis-, Mandanten- und
Dokumentmetadaten. Dieser Dienst verarbeitet nur den bereits vorbereiteten
kanonischen Rechnungsdatensatz und die sichtbare Rechnungs-PDF.

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

## Pipeline

1. Request validieren.
2. Sichtbare PDF aus Base64 dekodieren.
3. PDF temporaer unter einem request-eigenen Verzeichnis speichern.
4. Ghostscript konvertiert die PDF nach PDF/A-3b.
5. Mustangproject erzeugt `factur-x.xml` aus den kanonischen Rechnungsdaten.
6. Mustangproject validiert XML/EN16931.
7. Mustangproject bettet XML in die PDF/A-Datei ein.
8. Mustangproject validiert die fertige hybride Datei.
9. VeraPDF prueft PDF/A-3b.
10. Der Service prueft Konsistenz zwischen XML und Ausgangsdaten.
11. Nur bei vollstaendigem Erfolg wird die fertige PDF base64-kodiert
    zurueckgegeben.

Temporaere Dateien werden in einem `finally`-Block geloescht. Der Container
benoetigt keinen persistenten Datentraeger.

## Environment Variables

Pflicht:

```env
ZUGFERD_SERVICE_API_KEY=
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

Supabase-Variablen werden nicht benoetigt. Der Service speichert keine Dateien
selbst. WAW Pilot speichert die Rueckgabe in Supabase Storage.

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
- `plan`: `free` fuer Entwicklung und Tests
- kein Persistent Disk
- keine Datenbank
- keine Supabase-Variablen

`ZUGFERD_SERVICE_API_KEY` wird in Render als Secret-Variable gesetzt und steht
nicht im Repository. Anschliessend wird in WAW Pilot nur
`ZUGFERD_SERVICE_URL` und derselbe serverseitige `ZUGFERD_SERVICE_API_KEY`
konfiguriert. Keine `NEXT_PUBLIC_`-Variable fuer das Secret verwenden.

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
