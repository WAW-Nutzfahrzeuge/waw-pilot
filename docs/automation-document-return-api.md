# Automatisierter Dokumentenrücklauf

Die Endpunkte laufen als Next.js Route Handler im bestehenden WAW-Pilot-Webservice (Vercel/`next start`). Der separate Render-Service bleibt ausschließlich für ZUGFeRD zuständig.

## Konfiguration

- `AUTOMATION_API_TOKEN`: langer, zufälliger Bearer-Token ausschließlich in Vercel und n8n. Widerruf/Rotation erfolgt durch Ersetzen der Variable und erneutes Deployment.
- `SUPABASE_SERVICE_ROLE_KEY`: ausschließlich serverseitig in Vercel. Niemals als `NEXT_PUBLIC_*` setzen.
- Die vorhandenen Variablen `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_WAW_COMPANY_ID` bleiben erforderlich.
- Migration `20261006150000_add_automation_document_returns.sql` ausführen.
- Der private Storage-Bucket `documents` muss vorhanden sein.

Alle Requests senden `Authorization: Bearer <token>`. Uploads benötigen zusätzlich einen stabilen `Idempotency-Key`. Tokens und personenbezogene Suchdaten werden nicht protokolliert.

## Verkauf auflösen

`POST /api/automation/sales/resolve`, JSON:

```json
{
  "saleIdentifier": "VK-7A4B9C2DEA",
  "invoiceNumber": "026-150",
  "vin": "WDB...",
  "senderEmail": "optional@example.com",
  "customerName": "Optional"
}
```

Antwortstatus im JSON: `matched`, `ambiguous`, `unmatched` oder `conflict`. Eine gültige Verkaufskennung ist führend; Rechnungsnummer/VIN dürfen ihr nicht widersprechen. E-Mail und Name können Kandidaten nur eingrenzen und reichen nie allein für `matched`.

## Anforderungen abfragen

`GET /api/automation/sales/{saleId}/document-requirements`

Die Antwort basiert auf den vorhandenen WAW-Regeln: Inland nur Übergabebestätigung, EU zusätzlich Gelangensbestätigung und Verbringungsnachweis, Drittland keine dieser drei Arten. `signatureStatus=present` heißt nur „sichtbare Unterschrift erkannt“. `absent`, `uncertain` und abgelehnte Rückläufe erfüllen die Anforderung nicht.

## Unveränderten Originalanhang speichern

`POST /api/automation/document-returns/originals`, `multipart/form-data`:

- `file` (PDF, maximal 10 MB)
- `returnId`, `sourceEmailId`, `sourceAttachmentId` (optional)
- `receivedAt` (ISO-8601, optional)

Originale werden privat und ohne Verkaufszuordnung gespeichert. Die Antwort liefert `originalUploadId`; erst ein abgeleitetes Dokument verknüpft dieses Original mit einer Verkaufsakte.

## Rücklauf in Verkaufsakte speichern

`POST /api/automation/sales/{saleId}/documents`, `multipart/form-data`:

- `file`: PDF, maximal 10 MB
- `documentType`: `entry_certificate`, `transport_proof` oder `handover_protocol`
- `saleIdentifier`: Pflicht-Kontrolle gegen `{saleId}`
- `signatureStatus`: `present`, `absent` oder `uncertain`
- `reviewStatus`: `pending`, `needs_review`, `accepted` oder `rejected` (Standard `pending`)
- optional: `reviewReason`, `returnId`, `sourceEmailId`, `sourceAttachmentId`, `receivedAt`
- optional: `originalUploadId`, `originalPageNumbers` (z. B. `1,2`)
- optional: `replacesDocumentId` für eine korrigierte neue Dokumentversion

Neue Rückläufe erzeugen neue Dokumente. Mit `replacesDocumentId` wird über die vorhandene `document_versions`-Logik eine neue, unveränderliche Version erzeugt; die alte Storage-Datei bleibt erhalten. Storage-Pfade enthalten Company, Verkauf und eine Upload-UUID, `upsert` ist deaktiviert.

## Fehlercodes

- `400`: ungültiges JSON/Multipart oder fehlender Idempotency-Key
- `401`: fehlender/ungültiger Bearer-Token
- `404`: Verkauf nicht in der konfigurierten Company vorhanden
- `409`: widersprüchliche Zuordnung oder wiederverwendeter Idempotency-Key mit anderem Inhalt
- `413`: Datei größer als 10 MB
- `415`: keine echte PDF
- `422`: ungültige Metadaten
- `500/502`: Datenbank- oder Storage-Fehler
- `202`: identischer Upload wird bereits verarbeitet; später mit demselben Key wiederholen

Bei einem Fehler nach dem Storage-Upload wird die Datei bestmöglich entfernt und der Upload als `failed` markiert. Ein identischer Retry darf diesen Eintrag wiederaufnehmen. Nach einem Prozessabbruch kann ein seit mehr als 15 Minuten unveränderter `processing`-Eintrag atomar wiederaufgenommen werden. Gleichzeitige identische Requests können wegen des eindeutigen Constraints nur einmal Dateien/Dokumentdatensätze erzeugen.

## Kopierbare Testanfragen

In allen Beispielen sind ausschließlich Platzhalter enthalten:

```bash
export WAW_BASE_URL="https://<WAW-VERCEL-DOMAIN>"
export WAW_AUTOMATION_TOKEN="<AUTOMATION_API_TOKEN>"
export TEST_SALE_ID="<ISOLIERTE-TEST-SALE-UUID>"
export TEST_SALE_IDENTIFIER="VK-<10-HEXADEZIMALZEICHEN>"
```

Verkauf über Kennung auflösen:

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/sales/resolve" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"saleIdentifier":"VK-<10-HEXADEZIMALZEICHEN>"}'
```

Ohne Kennung über Rechnungsnummer und VIN suchen:

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/sales/resolve" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"invoiceNumber":"<TEST-RECHNUNGSNUMMER>","vin":"<TEST-VIN>"}'
```

Anforderungen und vorhandene Rückläufe laden:

```bash
curl --fail-with-body \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  "$WAW_BASE_URL/api/automation/sales/$TEST_SALE_ID/document-requirements"
```

Originalanhang unverändert sichern:

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/document-returns/originals" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --header "Idempotency-Key: test-mail-001:attachment-001:original:v1" \
  --form "file=@./test-ruecklauf.pdf;type=application/pdf" \
  --form "returnId=test-return-001" \
  --form "sourceEmailId=test-mail-001" \
  --form "sourceAttachmentId=attachment-001" \
  --form "receivedAt=2026-10-06T10:00:00.000Z"
```

Einzelnes Rücklaufdokument hochladen:

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/sales/$TEST_SALE_ID/documents" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --header "Idempotency-Key: test-mail-001:attachment-001:handover:pages-1-2:v1" \
  --form "file=@./test-uebergabebestaetigung.pdf;type=application/pdf" \
  --form "documentType=handover_protocol" \
  --form "saleIdentifier=$TEST_SALE_IDENTIFIER" \
  --form "signatureStatus=uncertain" \
  --form "reviewStatus=needs_review" \
  --form "reviewReason=Automatischer Test – manuelle Prüfung erforderlich" \
  --form "returnId=test-return-001" \
  --form "sourceEmailId=test-mail-001" \
  --form "sourceAttachmentId=attachment-001" \
  --form "originalUploadId=<ORIGINAL-UPLOAD-ID>" \
  --form "originalPageNumbers=1,2" \
  --form "receivedAt=2026-10-06T10:00:00.000Z"
```

Für eine Korrektur wird ein neuer Idempotency-Key verwendet und zusätzlich
`replacesDocumentId=<VORHERIGE-DOCUMENT-ID>` gesendet. Die bestehende Datei wird
nicht überschrieben; die zentrale Dokumentverwaltung erzeugt eine neue Version.

## Erster n8n-Testworkflow

Verwende ausschließlich eine ausdrücklich als Test markierte Verkaufsakte und eine Test-PDF. Keine Kunden-E-Mail senden.

### 1. Credentials

In n8n ein Credential vom Typ **Header Auth** anlegen:

- Name: `Authorization`
- Value: `Bearer <AUTOMATION_API_TOKEN>`

Den Token nicht in einem Set-/Code-Knoten und nicht in Workflow-Logs speichern.

### 2. Knoten

1. **Manual Trigger**
2. **Read/Write Files from Disk** – Operation `Read File(s) From Disk`
   - File Selector: Pfad zu einer Test-PDF, beispielsweise `/files/test-ruecklauf.pdf`
   - Put Output File in Field: `data`
   - Bei n8n Cloud stattdessen eine bereits in n8n verfügbare Test-Binary verwenden; keine echte Kundenanlage anbinden.
3. **Edit Fields (Set)** – Testmerkmale hinzufügen und Binary-Daten beibehalten:
   - `saleIdentifier`
   - `invoiceNumber`
   - `vin`
   - `senderEmail`
   - `customerName`
   - `documentType`, z. B. `handover_protocol`
   - `signatureStatus`, z. B. `uncertain`
   - `reviewStatus`, z. B. `needs_review`
   - `returnId`, `sourceEmailId`, `sourceAttachmentId`
   - `idempotencyKey`: stabile fachliche Kombination, beispielsweise
     `test-mail-001:attachment-001:handover:pages-1-2:v1`
4. **HTTP Request – Verkauf auflösen**
   - Method: `POST`
   - URL: `https://<WAW-VERCEL-DOMAIN>/api/automation/sales/resolve`
   - Authentication: `Generic Credential Type`
   - Generic Auth Type: `Header Auth`
   - Credential: das oben angelegte Credential
   - Send Body: aktiv
   - Body Content Type: `JSON`
   - JSON Body:

```json
{
  "saleIdentifier": "={{ $json.saleIdentifier }}",
  "invoiceNumber": "={{ $json.invoiceNumber }}",
  "vin": "={{ $json.vin }}",
  "senderEmail": "={{ $json.senderEmail }}",
  "customerName": "={{ $json.customerName }}"
}
```

   - Response unter `resolution` ablegen beziehungsweise die ursprünglichen Felder und die Binary-Daten vor dem nächsten Schritt wieder zusammenführen.
5. **Switch – Zuordnungsergebnis**
   - Wert: `={{ $json.resolution.status }}` (oder `={{ $json.status }}`, falls die Antwort nicht in ein Feld gelegt wurde)
   - `matched`: nur dieser Ausgang darf zum Upload führen
   - `ambiguous`, `unmatched`, `conflict`: in einen Prüfzweig leiten, Ergebnis anzeigen beziehungsweise als Testfehler beenden
6. **HTTP Request – Dokument hochladen** am `matched`-Ausgang
   - Method: `POST`
   - URL: `=https://<WAW-VERCEL-DOMAIN>/api/automation/sales/{{ $json.resolution.sale.saleId }}/documents`
   - Authentication: dasselbe Header-Auth-Credential
   - Send Headers: aktiv
   - Header `Idempotency-Key`: `={{ $json.idempotencyKey }}`
   - Send Body: aktiv
   - Body Content Type: `Form-Data`
   - Parameter `file`: Typ **n8n Binary File**, Input Data Field Name `data`
   - Textparameter:
     - `documentType`: `={{ $json.documentType }}`
     - `saleIdentifier`: `={{ $json.resolution.sale.saleIdentifier }}`
     - `signatureStatus`: `={{ $json.signatureStatus }}`
     - `reviewStatus`: `={{ $json.reviewStatus }}`
     - `returnId`: `={{ $json.returnId }}`
     - `sourceEmailId`: `={{ $json.sourceEmailId }}`
     - `sourceAttachmentId`: `={{ $json.sourceAttachmentId }}`
     - `receivedAt`: ein einmal am Workflow-Anfang erzeugter und danach unverändert wiederverwendeter ISO-Zeitstempel
7. **Switch/IF – Uploadantwort**
   - `201`: neu gespeichert
   - `200`: identischer Upload war bereits gespeichert
   - `202`: identischer Upload wird gerade verarbeitet; mit Warte-/Retry-Knoten und demselben Idempotency-Key wiederholen
   - `409`: Key mit verändertem Inhalt oder Zuordnungskonflikt – manuelle Prüfung
   - andere Fehler: Fehlerausgabe sichern, nicht mit einer anderen Verkaufsakte fortfahren

Der Idempotency-Key darf bei einem technischen Retry nicht neu erzeugt werden. Eine korrigierte fachliche Version erhält dagegen bewusst einen neuen Key, beispielsweise durch Erhöhung von `:v1` auf `:v2`.

## Späterer produktiver Ablauf

Der spätere, noch nicht implementierte Workflow ist:

```text
Postfach überwachen
→ Originalanhang unverändert über /document-returns/originals sichern
→ Seiten inhaltlich analysieren
→ Dokumenttypen und sichtbare Unterschriften erkennen
→ jedes erkannte Dokument separat über /sales/resolve zuordnen
→ nur bei matched fortfahren
→ zugehörige Originalseiten zu einer eigenen PDF zusammenfassen
→ abgeleitete PDF mit originalUploadId und originalPageNumbers hochladen
→ ambiguous/unmatched/conflict in eine manuelle Prüfliste geben
```

Postfachüberwachung, KI-Auswertung, PDF-Aufteilung, OneDrive und Druck sind bewusst nicht Bestandteil der aktuellen Implementierung.

## Sichere End-to-End-Prüfung

Vor einem Live-Test müssen eine isolierte Test-Verkaufsakte, eine Testrechnung, ein Testfahrzeug und eine Testkundin beziehungsweise ein Testkunde vorhanden sein. Der Test darf nicht auf eine reale Akte zeigen. Nach dem Test sind nur die erzeugten Test-Rückläufe und Original-Uploads kontrolliert zu bereinigen; Finanzdaten, Nummernkreise und Fahrzeugstatus werden nicht verändert.
