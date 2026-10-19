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

Nur bei `status="matched"` enthält `sale` zusätzlich die gespeicherte Käuferadresse:

```json
{
  "status": "matched",
  "sale": {
    "saleId": "<SALE-UUID>",
    "customerEmail": "kunde@example.com",
    "customerEmailReason": null,
    "customerEmailSource": "sales.buyer_customer_id.customers.email",
    "customerEmailOwnershipVerified": false
  }
}
```

Die Adresse stammt ausschließlich aus dem über `sales.buyer_customer_id` verbundenen `customers.email`-Datensatz. `senderEmail` aus dem Suchrequest dient nur zur Kandidatensuche und wird niemals als Versandempfänger zurückgegeben. Eine syntaktisch gültige Adresse bestätigt nicht, dass der Kunde Zugriff auf dieses Postfach besitzt; deshalb ist `customerEmailOwnershipVerified` aktuell immer `false`.

Ist keine eindeutige geeignete Käuferadresse vorhanden, bleibt der Verkauf trotzdem eindeutig zugeordnet, aber `customerEmail` ist `null`. `customerEmailReason` enthält dann einen technischen Grund:

- `buyer_customer_email_missing`
- `buyer_customer_email_invalid`
- `buyer_customer_email_conflict`

Bei `ambiguous`, `unmatched` und `conflict` werden weder `customerEmail` noch die übrigen E-Mail-Metadaten in den Kandidaten ausgegeben.

## Anforderungen abfragen

`GET /api/automation/sales/{saleId}/document-requirements`

Die Antwort basiert auf den vorhandenen WAW-Regeln: Inland nur Übergabebestätigung, EU zusätzlich Gelangensbestätigung und Verbringungsnachweis, Drittland keine dieser drei Arten. `signatureStatus=present` heißt nur „sichtbare Unterschrift erkannt“. Ein automatisierter Rücklauf erfüllt eine Anforderung ausschließlich mit `signatureStatus=present` und `reviewStatus=accepted`. `pending`, `needs_review`, `rejected`, `absent` und `uncertain` werden als eingegangen beziehungsweise prüfbedürftig geführt, erfüllen die Anforderung aber nicht.

## Automatisierten Rücklauf manuell prüfen

Die Migration `20261013090000_add_automation_return_manual_review.sql` muss vor dem dazugehörigen Web-Deployment ausgeführt werden. Sie ergänzt Prüfer und Prüfzeitpunkt und stellt die atomare Datenbankfunktion bereit.

Ein Admin öffnet die Verkaufsakte und findet aktive automatisierte Rückläufe unter „Automatische Dokumente“. Bei `pending` oder `needs_review` stehen zwei Aktionen bereit:

- **Rücklauf freigeben:** Zuerst muss ausdrücklich bestätigt werden, dass das Dokument zu diesem Verkauf gehört und die erforderliche Kundenunterschrift sichtbar vorhanden ist. Die Bestätigung ist keine Aussage über Echtheit oder rechtliche Gültigkeit.
- **Rücklauf ablehnen:** Ein kurzer Prüfgrund ist Pflicht. Die bisherige automatische Signaturbewertung bleibt erhalten.

Die Entscheidung bezieht sich stets auf die konkrete aktive `document_version_id`. Wurde die Version zwischenzeitlich ersetzt, wird die Entscheidung abgewiesen. Freigabe setzt `signature_status=present`, `review_status=accepted` und den Dokumentstatus auf `available`. Ablehnung setzt `review_status=rejected` und den Dokumentstatus auf `needs_review`. Entscheidung, Prüfer, Zeitpunkt und Grund werden gemeinsam mit einem Eintrag in `document_audit_log` atomar gespeichert. Eine identische Wiederholung erzeugt keinen zweiten Audit-Eintrag.

Nach einer Freigabe zählt die aktive Version in `document-requirements` als erfüllt und wird beim Claim einer Unterschriften-Rückfrage nicht mehr angefordert. Die Prüfaktion selbst versendet keine E-Mail.

Sicherer manueller Test mit einem synthetischen Testupload:

1. Die eindeutig markierte Test-Verkaufsakte öffnen und das Testdokument über „Öffnen“ kontrollieren.
2. Prüfen, dass „Prüfstatus: Prüfung erforderlich“ und beide Prüfaktionen sichtbar sind.
3. Zunächst die Ablehnung ohne Grund testen; der Browser muss die Übermittlung verhindern.
4. Für einen Freigabetest ausschließlich einen dafür vorgesehenen weiteren Testupload verwenden, die Bestätigung aktivieren und freigeben.
5. Nach dem Neuladen muss „Freigegeben“ erscheinen; `document-requirements` muss für diesen Typ `fulfilled=true` liefern.
6. Den identischen Server-Request nicht künstlich mit Produktionsdaten wiederholen. Die automatisierten Tests prüfen die Idempotenz strukturell; ein späterer kontrollierter Integrationstest kann dieselbe Entscheidung zweimal gegen eine isolierte Testakte senden.

## Unterschriften-Rückfrage dauerhaft reservieren

Vor Verwendung müssen zusätzlich die Migration `20261012220000_add_automation_signature_requests.sql` und das anschließende Vercel-Deployment erfolgt sein. WAW Pilot versendet an diesen Endpunkten **keine E-Mail**. Es prüft Empfänger und Anforderungen und führt nur den dauerhaften, atomaren Versandnachweis. n8n darf ausschließlich bei `allowSend=true` versenden.

`POST /api/automation/signature-requests/claim`, JSON:

```json
{
  "notificationKey": "return:<RETURN-ID>:sale:<SALE-ID>",
  "saleId": "<SALE-UUID>",
  "documentTypes": ["entry_certificate", "transport_proof"]
}
```

Erlaubte Dokumenttypen sind `entry_certificate`, `transport_proof` und `handover_protocol`. Die Liste muss eindeutig sein. Die API ermittelt serverseitig die für Verkaufsart und Land geltenden Anforderungen und ignoriert nicht erforderliche Typen. Außerdem filtert sie aktive automatisierte Rückläufe heraus, die bereits `signatureStatus=present` und `reviewStatus=accepted` besitzen, sowie aktive manuelle Uploads, die in der Verkaufsakte bereits als verfügbarer unterschriebener Nachweis gelten. Erzeugte, noch nicht zurückgesendete Ausgangsdokumente erfüllen die Anforderung nicht. Die Käuferadresse stammt ausschließlich aus `sales.buyer_customer_id → customers.email`; eine Adresse aus dem Request oder einer KI wird nicht übernommen.

Erste erfolgreiche Reservierung (`201`):

```json
{
  "status": "claimed",
  "allowSend": true,
  "requestId": "<REQUEST-UUID>",
  "reservationToken": "<NUR-FUER-DIESEN-VORGANG>",
  "customerEmail": "kunde@example.com",
  "customerEmailSource": "sales.buyer_customer_id.customers.email",
  "customerEmailOwnershipVerified": false,
  "documentTypes": ["entry_certificate"]
}
```

Kopierbarer Aufruf (nur Platzhalter):

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/signature-requests/claim" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "notificationKey": "return:<RETURN-ID>:sale:<SALE-ID>",
    "saleId": "<SALE-UUID>",
    "documentTypes": ["entry_certificate", "transport_proof"]
  }'
```

Das `reservationToken` muss n8n bis zur Ergebnisbestätigung vertraulich halten. In der Datenbank wird nur sein SHA-256-Hash gespeichert. Bei allen anderen fachlichen Ergebnissen gilt `allowSend=false`:

- `already_sent`: Der Provider-Versand wurde bereits bestätigt.
- `processing`: Eine Reservierung besteht bereits. Das gilt auch nach langer Laufzeit; es gibt absichtlich keine automatische Ablauf-Freigabe.
- `suppressed`: Kein angefragter Typ ist noch erforderlich und unerfüllt.
- `needs_review`: Insbesondere keine eindeutige, syntaktisch geeignete Käuferadresse oder ein zuvor unklarer Ausgang.

Ein wiederholter identischer Aufruf gibt keine zweite Sendefreigabe. Derselbe `notificationKey` mit anderer `saleId` oder anderer ursprünglicher Dokumenttypen-Menge liefert `409 notification_key_conflict`. Reihenfolge der Dokumenttypen ist dabei unerheblich. Für einen neuen Original-Rücklauf muss n8n einen neuen stabilen `notificationKey` bilden; reine technische Wiederholungen behalten ihn bei.

## Versandresultat speichern

`POST /api/automation/signature-requests/{requestId}/result`, JSON:

```json
{
  "reservationToken": "<TOKEN-AUS-CLAIM>",
  "status": "sent",
  "providerMessageId": "<OPTIONALE-PROVIDER-ID>",
  "reason": null
}
```

`status` ist:

- `sent`: Der Provider hat den Versand bestätigt. Dieser Zustand ist endgültig und wird niemals erneut freigegeben.
- `failed`: Der Provider bestätigt sicher, dass nicht versendet wurde. Ein neuer identischer Claim darf anschließend einen neuen Versuch mit neuer Reservierung erlauben.
- `unknown`: Der Ausgang ist beispielsweise nach einem Timeout unklar. Dieser Vorgang wird nicht automatisch erneut freigegeben.

Identische Ergebniswiederholungen sind idempotent und liefern `idempotent=true`. Eine falsche Reservierungskennung liefert `403 invalid_reservation`; widersprüchliche Resultate liefern `409`. Token, Mailtext und Dokumentinhalt werden nicht protokolliert.

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/signature-requests/<REQUEST-UUID>/result" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "reservationToken": "<TOKEN-AUS-CLAIM>",
    "status": "sent",
    "providerMessageId": "<OPTIONALE-PROVIDER-ID>"
  }'
```

Erste Speicherung:

```json
{
  "status": "recorded",
  "deliveryStatus": "sent",
  "idempotent": false
}
```

Identische Wiederholung:

```json
{
  "status": "unchanged",
  "deliveryStatus": "sent",
  "idempotent": true
}
```

### n8n-Ablauf und manuelle Klärung

1. Nach dem Prüfen der aktuellen `document-requirements` einen stabilen Schlüssel aus Original-Rücklauf-ID und Verkauf bilden.
2. Claim per HTTP Request senden.
3. Nur im `claimed`-Zweig und ausschließlich an `customerEmail` senden; die tatsächlich zurückgegebenen `documentTypes` in der Rückfrage nennen.
4. Direkt nach der Providerantwort das Resultat mit `requestId` und `reservationToken` bestätigen.
5. Bei `processing`, `already_sent`, `suppressed` oder `needs_review` nicht senden.
6. Bei einem Timeout `unknown` speichern. Anschließend im Provider-Dashboard anhand der Provider-/Workflow-Daten manuell feststellen, ob die Nachricht versendet wurde. Bis zur Klärung bleibt der Vorgang gesperrt. Es darf weder ein neuer `notificationKey` für denselben Original-Rücklauf erfunden noch allein wegen des Alters erneut gesendet werden.

Für die manuelle Klärung wird der Datensatz über `requestId` in `automation_signature_requests` geprüft. Eine Änderung des Zustands erfolgt nur kontrolliert durch einen Administrator nach belegtem Provider-Ergebnis; es existiert bewusst kein öffentlicher Reset- oder Reclaim-Endpunkt.

## Unveränderten Originalanhang speichern

`POST /api/automation/document-returns/originals`, `multipart/form-data`:

- `file` (PDF, JPEG oder PNG; maximal 10 MB laut Anwendungsprüfung)
- `returnId`, `sourceEmailId`, `sourceAttachmentId` (optional)
- `receivedAt` (ISO-8601, optional)

Die tatsächlichen Dateibytes werden unverändert privat im Bucket `documents` gespeichert. Der Server erkennt PDF/JPEG/PNG anhand der Dateisignatur und speichert den ermittelten MIME-Type. JPEG/PNG werden vor der Registrierung vollständig dekodiert; Bilder mit mehr als 40 Megapixeln oder beschädigtem Pixelinhalt werden abgewiesen. SHA-256 und Request-Fingerprint umfassen die Originalbytes; Idempotency-Key, Wiederholung und Konfliktverhalten entsprechen den bisherigen PDF-Uploads. Originale erhalten keine Verkaufszuordnung. Die Antwort liefert `originalUploadId`, über die eine abgeleitete PDF später mit dem Original verbunden wird.

Beispiel für ein Bildoriginal:

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/document-returns/originals" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --header "Idempotency-Key: <MAIL-ID>:<ANHANG-ID>:original:v1" \
  --form "file=@./ruecklauf.jpg;type=image/jpeg" \
  --form "returnId=<RUECKLAUF-ID>" \
  --form "sourceEmailId=<QUELL-MAIL-ID>" \
  --form "sourceAttachmentId=<ANHANG-ID>"
```

Erfolg (`201`, bei identischer Wiederholung `200`):

```json
{
  "status": "stored",
  "uploadId": "<UPLOAD-UUID>",
  "originalUploadId": "<UPLOAD-UUID>"
}
```

### Tatsächliche Größenbegrenzung

Die Route prüft weiterhin maximal 10 MiB pro Originaldatei. Auf der produktiven Vercel Function ist der gesamte Request-Body jedoch auf etwa 4,5 MB begrenzt. Weil Multipart-Grenzen und weitere Felder dazugehören, muss die Datei praktisch kleiner als 4,5 MB sein; für zuverlässige Requests sollte n8n höchstens **4 MiB** pro Originalanhang senden. Das gilt auch für bestehende PDF-Originale und den `/sales/{saleId}/documents` Upload. Dateien oberhalb des Plattformlimits können vor Erreichen der eigenen 10-MiB-Prüfung durch Vercel abgewiesen werden.

## JPEG/PNG in eine einseitige PDF umwandeln

`POST /api/automation/document-returns/image-to-pdf`, `multipart/form-data`. Der Endpunkt benötigt denselben Bearer-Token wie die übrigen Automatisierungsrouten und schreibt weder Storage-Dateien noch Datenbankeinträge.

Es muss genau eine Quelle angegeben werden:

- `originalUploadId`: bevorzugter Weg. ID aus dem erfolgreichen `/originals`-Aufruf. Die API lädt das Original privat aus Storage, prüft Company, Status, Originaltyp, Inhalt und Größe und antwortet zusätzlich mit `X-Waw-Original-Upload-Id`.
- `file`: JPEG/PNG direkt als Multipart-Binary. Damit allein wird kein Originaldatensatz angelegt; für nachvollziehbare Provenienz das Original zuerst unter `/originals` sichern und anschließend `originalUploadId` verwenden.

Das Eingabebild und die erzeugte PDF dürfen jeweils maximal 4 MiB groß sein. Die API prüft Dateisignatur und tatsächliche Lesbarkeit. JPEG-EXIF-Ausrichtung wird angewendet. Das vollständige Bild wird unter Wahrung des Seitenverhältnisses mittig auf einer einzelnen A4-Seite platziert; es wird nicht beschnitten. Für die Einbettung wird das Bild intern normalisiert. Die unveränderten Originalbytes bleiben im privaten Originalupload erhalten. Antwort-PDFs werden nicht öffentlich zwischengespeichert.

Erfolg ist `200 application/pdf` mit `Content-Disposition: attachment` und den Headern `Cache-Control: private, no-store, max-age=0`, `X-Content-Type-Options: nosniff`. Bei `originalUploadId` enthält `X-Waw-Original-Upload-Id` dieselbe ID.

Aufruf über ein gespeichertes Bildoriginal:

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/document-returns/image-to-pdf" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --form "originalUploadId=<ORIGINAL-UPLOAD-ID>" \
  --output ./ruecklauf.pdf
```

Fehlercodes des Umwandlungsendpunkts:

- `400 invalid_multipart`: Multipart-Anfrage nicht lesbar
- `401 unauthorized`: Token fehlt oder ist ungültig
- `413 file_too_large`: Bild oder erzeugte PDF überschreitet 4 MiB
- `415 invalid_file_type`: Inhalt ist kein JPEG/PNG oder passt nicht zum erkannten Typ
- `422 image_source_required`: nicht genau eine Bildquelle angegeben
- `422 invalid_original_upload_id`: ungültige UUID
- `422 image_original_not_found`: kein abgeschlossenes JPEG/PNG-Original in der konfigurierten Company
- `422 invalid_image`: Bild beschädigt oder nicht lesbar
- `409 original_integrity_failed`: gespeicherte Bytes stimmen nicht mit der Original-Prüfsumme überein
- `500 original_lookup_failed`, `502 original_download_failed`, `500 image_conversion_failed`: Datenbank-, Storage- oder Konvertierungsfehler

Die erzeugte PDF wird nicht automatisch freigegeben. Beim anschließenden Upload unter `/api/automation/sales/{saleId}/documents` muss `originalUploadId` gesetzt werden. Wenn diese ID auf ein Bildoriginal verweist, setzt der Server `reviewStatus` unabhängig von einem übermittelten Wert auf `needs_review`. Die üblichen Felder `documentType`, `saleIdentifier`, `signatureStatus`, `returnId`, `sourceEmailId`, `sourceAttachmentId`, `receivedAt` und `Idempotency-Key` bleiben bestehen. PDF und `automation_return_uploads`-Datensatz werden wie bisher mit dem Bildoriginal verknüpft.

## Originalseiten als eigene PDF extrahieren

`POST /api/automation/document-returns/extract-pages`, `multipart/form-data`:

- `file`: unveränderte Original-PDF
- `pages`: JSON-Array mit eindeutigen, aufsteigend sortierten, 1-basierten Seitenzahlen, z. B. `[1,2]`
- `expectedPageCount`: von der Analyse ermittelte Gesamtseitenzahl als positive Ganzzahl

Der Endpunkt nutzt denselben Bearer-Token wie die übrigen Automatisierungs-APIs. Er lädt die PDF ausschließlich in den Arbeitsspeicher, vergleicht die tatsächliche Seitenzahl mit `expectedPageCount` und kopiert exakt die ausgewählten PDF-Seiten in ein neues Dokument. Dabei werden die vorhandenen PDF-Seiten und ihre sichtbaren Inhalte übernommen; es findet keine KI-Erzeugung und kein Raster-Neurendering statt. Die Originaldatei wird nicht verändert und es werden weder Storage-Dateien noch Datenbankeinträge angelegt.

Erfolg liefert `200 application/pdf` mit `Content-Disposition: attachment`. Die Antwort ist mit `Cache-Control: private, no-store, max-age=0` nicht öffentlich cachebar. Die Gültigkeit eventuell vorhandener kryptografischer PDF-Signaturen kann nach dem Kopieren einzelner Seiten nicht garantiert werden.

### Effektives Größenlimit auf Vercel

Die produktive Bereitstellung verwendet einen Node.js Route Handler als Vercel Function. Vercel begrenzt derzeit sowohl Request- als auch Response-Payloads auf 4,5 MB. Anders als die direkten Browser-zu-Supabase-Uploads läuft diese PDF vollständig durch die Function. Deshalb gilt für diesen Endpunkt bewusst ein Dateilimit von **4 MiB**; auch die erzeugte PDF darf maximal 4 MiB groß sein. Der Abstand zum Plattformlimit ist für Multipart-Header und Response-Overhead vorgesehen. Ein 10-MB-Upload wird hier nicht unterstützt.

Zusätzliche Fehlercodes:

- `400 invalid_multipart`: Anfrage ist kein lesbares Multipart-Formular
- `401 unauthorized`: Automatisierungstoken fehlt oder ist ungültig
- `413 file_too_large`: Eingabe überschreitet 4 MiB
- `413 extracted_pdf_too_large`: Ausgabe überschreitet 4 MiB
- `415 invalid_file_type`: Datei ist keine echte PDF
- `422 invalid_pages`: Seitenliste fehlt, ist ungültig, doppelt oder nicht aufsteigend
- `422 invalid_expected_page_count`: Gesamtseitenzahl ist ungültig
- `422 invalid_pdf`: PDF ist beschädigt oder nicht lesbar
- `422 encrypted_pdf`: PDF ist verschlüsselt und kann nicht verarbeitet werden
- `422 page_out_of_range`: eine Seite liegt außerhalb der PDF
- `409 page_count_mismatch`: tatsächliche Seitenzahl weicht von `expectedPageCount` ab
- `500 pdf_extraction_failed`: unerwarteter interner Verarbeitungsfehler

Beispiel:

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/document-returns/extract-pages" \
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --form "file=@./sammel-ruecklauf.pdf;type=application/pdf" \
  --form 'pages=[1,2]' \
  --form 'expectedPageCount=6' \
  --output ./extrahierte-seiten-1-2.pdf
```

## Rücklauf in Verkaufsakte speichern

`POST /api/automation/sales/{saleId}/documents`, `multipart/form-data`:

- `file`: PDF, maximal 10 MB
- `documentType`: `entry_certificate`, `transport_proof`, `handover_protocol`, `owner_id` oder `commercial_register`
- `saleIdentifier`: Pflicht-Kontrolle gegen `{saleId}`
- Für `entry_certificate`, `transport_proof` und `handover_protocol`: `signatureStatus` ist `present`, `absent` oder `uncertain`.
- Für `owner_id` und `commercial_register`: `signatureStatus` weglassen oder `not_applicable` senden. Andere Werte werden abgewiesen; der Server speichert `not_applicable` und setzt die Prüfung immer auf `needs_review`.
- `reviewStatus`: bei den drei Nachweistypen `pending`, `needs_review`, `accepted` oder `rejected` (Standard `pending`); bei `owner_id` und `commercial_register` werden `accepted`/`rejected` als Eingabe abgewiesen und der Server erzwingt `needs_review`.
- optional: `reviewReason`, `returnId`, `sourceEmailId`, `sourceAttachmentId`, `receivedAt`
- optional: `originalUploadId`, `originalPageNumbers` (z. B. `1,2`)
- optional: `replacesDocumentId` für eine korrigierte neue Dokumentversion

Neue Rückläufe erzeugen neue Dokumente. Mit `replacesDocumentId` wird über die vorhandene `document_versions`-Logik eine neue, unveränderliche Version erzeugt; die alte Storage-Datei bleibt erhalten. Storage-Pfade enthalten Company, Verkauf und eine Upload-UUID, `upsert` ist deaktiviert.

Die festen Typwerte haben diese UI-Ziele:

| API `documentType` | Feld in der Verkaufsakte | Unterschrift | Pflichtstatus |
| --- | --- | --- | --- |
| `owner_id` | Bestehendes Feld „Ausweis vom Inhaber / Käufer“ | Nicht anwendbar; keine Signaturprüfung | Bestehende Verkaufsaktenregel bleibt unverändert |
| `commercial_register` | Kanonisches Feld „Handelsregisterauszug“ | Nicht anwendbar; keine Signaturprüfung | Inland: bestehende Alternative `commercial_register` ODER `business_registration`; sonst optional |
| `handover_protocol` | Übergabeprotokoll / Übergabebestätigung | Bisherige Signaturregel | Bestehende Regel |
| `entry_certificate` | Gelangensbestätigung | Bisherige Signaturregel | Bestehende Regel |
| `transport_proof` | Verbringungsnachweis | Bisherige Signaturregel | Bestehende Regel |

`commercial_register` ist der einzige kanonische Handelsregister-Dokumenttyp. Bei Inland erfüllt ein verfügbarer Handelsregisterauszug zusammen mit `business_registration` die bestehende Alternativanforderung; ein geeigneter Gewerbeschein allein genügt weiterhin. Für Verkaufsarten ohne diese Anforderung bleibt das Feld optional. Die UI zeigt es nur einmal: bei Inland innerhalb der Alternativanforderung, sonst im optionalen Bereich. Ein Gewerbeschein löst keine zusätzliche Handelsregisterpflicht aus.

`owner_id` nutzt das schon vorhandene strukturierte Ausweisfeld; es wird kein konkurrierender zweiter Ausweistyp angelegt. Mehrere automatisierte Ausweisdateien und Handelsregisterauszüge können als getrennte Dokumentdatensätze erscheinen; sie werden nicht automatisch zusammengeführt.

Automatisierte Uploads von `owner_id` und `commercial_register` starten immer mit `signatureStatus=not_applicable` und `reviewStatus=needs_review`. Admins können sie im strukturierten Feld öffnen, prüfen, freigeben oder ablehnen. Diese Freigabe bestätigt die Zuordnung und Dokumentart, nicht die Echtheit oder rechtliche Gültigkeit. Sie verlangt keine Kundenunterschrift, ändert `signatureStatus` nicht und löst keine Unterschriften-Rückfrage aus. Nur die aktive Version kann geprüft werden.

In der Verkaufsakte wird nur die aktive Dokumentversion berücksichtigt. Für die drei Nachweistypen erscheinen automatisierte Rückläufe mit `pending` oder `needs_review` im passenden Bereich unter „Automatische Dokumente“ und unter den Pflichtdokumenten weiterhin als offen. Erst `present` plus `accepted` erfüllt eine Unterschriftsanforderung. Die beiden neuen festen Typen bleiben bis zur Prüfung nicht verfügbar; nach Freigabe wird ihr Datensatz `available`. Manuelle Uploads behalten ihre bisherige Behandlung.

### Beispiel: Ausweis oder Handelsregisterauszug per n8n ablegen

Der Verkauf wird vorher anhand anderer geeigneter Unterlagen aufgelöst. `saleId` und `saleIdentifier` müssen aus der bestätigten `matched`-Antwort stammen; Name oder E-Mail aus KI-Ausgaben bestimmen weder den Verkauf noch die Berechtigung. Originalanhang zuerst unverändert unter `/document-returns/originals` sichern. Bei JPEG/PNG anschließend `/image-to-pdf` verwenden und die Original-ID weiterreichen. Der Dokument-Upload akzeptiert eine PDF.

```bash
curl --fail-with-body --request POST "$WAW_BASE_URL/api/automation/sales/$TEST_SALE_ID/documents" \\
  --header "Authorization: Bearer $WAW_AUTOMATION_TOKEN" \
  --header "Idempotency-Key: <MAIL-ID>:<ANHANG-ID>:owner-id:v1" \
  --form "file=@./ausweis.pdf;type=application/pdf" \
  --form "documentType=owner_id" \
  --form "saleIdentifier=$TEST_SALE_IDENTIFIER" \
  --form "returnId=<RUECKLAUF-ID>" \
  --form "sourceEmailId=<QUELL-MAIL-ID>" \
  --form "sourceAttachmentId=<ANHANG-ID>" \
  --form "originalUploadId=<ORIGINAL-UPLOAD-ID>" \
  --form "receivedAt=<ISO-8601-EINGANGSZEIT>"
```

Für den Handelsregisterauszug `documentType=commercial_register` und einen eigenen stabilen Idempotency-Key verwenden. Derselbe Typ erscheint im einzigen Handelsregisterfeld und zählt bei Inland erst nach manueller Freigabe als verfügbar. Die Antwort hat die bisherige Uploadantwort (`status`, `uploadId`, `documentId`, `documentVersionId`); Wiederholung und Konflikt richten sich nach dem gleichen Fingerprint-Verfahren. Eine falsche Company, ungültige Verkaufs-ID oder nicht passende Verkaufskennung wird wie bisher abgewiesen.

Upload-Erfolg (`201`, identische Wiederholung `200`):

```json
{
  "status": "stored",
  "uploadId": "<UPLOAD-UUID>",
  "documentId": "<DOCUMENT-UUID>",
  "documentVersionId": "<DOCUMENT-VERSION-UUID>"
}
```

`document-requirements` bleibt auf die bestehenden signaturpflichtigen Rücklaufanforderungen begrenzt. Neue Einträge in `existingReturns` enthalten zusätzlich `requiresSignature=false`, `signatureAssessment="not_applicable"` und `satisfiesSignedReturn=false`; dadurch werden Ausweis/Handelsregisterauszug nicht als unterschriebene Nachweise oder Unterschriftenanforderungen behandelt.

Im n8n HTTP-Request-Knoten: Methode `POST`, URL `/api/automation/sales/{{$json.saleId}}/documents`, Authentifizierung als Header/Bearer `Authorization: Bearer <Credential>`, Header `Idempotency-Key` aus stabilen Mail-/Anhang-IDs plus Typ/Version und Body `Form-Data`. `file` als n8n Binary File aus dem extrahierten PDF-Binaryfeld setzen. Die Textparameter `documentType`, `saleIdentifier`, `returnId`, `sourceEmailId`, `sourceAttachmentId`, `originalUploadId` und `receivedAt` als Form-Data-Felder mitschicken. Keine Unterschriftsbewertung senden; die API setzt für diese Typen `not_applicable` und `needs_review`.

Eine Wiederholung derselben Datei und Metadaten mit demselben Idempotency-Key bleibt idempotent. Ein anderer Inhalt oder andere Metadaten mit demselben Key führen zu `409 idempotency_conflict`. Korrigierte Dokumente erhalten neue Idempotency-Keys und werden mit `replacesDocumentId` als neue aktive Version angelegt. Original-ID, Originalseiten, Quellmail/-anhang und Rücklauf-ID bleiben verknüpft.

### Vorhandenes freies Zusatzdokument klassifizieren

Ein Admin kann in „Weitere Dokumente“ für eine bestehende Datei ausdrücklich „Als Handelsregisterauszug zuordnen“ bestätigen. Die Aktualisierung ändert nur `documents.document_type` auf `commercial_register` und entfernt die freie Anzeigeüberschrift; die Datei wird nicht kopiert oder verschoben, und Verkauf, Storage-Pfad, aktive Version sowie Versions-/Audit-Historie bleiben erhalten. Es findet keine automatische Umklassifizierung anhand des Namens statt. Die Aktion ist aktuell nur in der Verkaufsakte verfügbar, nicht über die Automatisierungs-API.

Ein manueller Upload darf einen Datensatz mit `source=automation_return` nicht ersetzen. Dadurch bleiben Rücklauf-Metadaten, Originalverknüpfung und Versionierungsprovenienz erhalten. Ein späterer manueller Upload wird als eigener Datensatz gespeichert.

### Migration und Deployment

Die Migration `20261020100000_unify_sale_commercial_register_type.sql` ist vorwärtsgerichtet und behandelt `20261019120000_add_fixed_sale_identity_documents.sql` als möglicherweise bereits ausgeführt. Sie konvertiert vorhandene `documents.document_type`- und `automation_return_uploads.document_type`-Werte von `sale_commercial_register` auf `commercial_register`, aktualisiert den zugehörigen Typwert in der Dokumentmetadaten-Provenienz und ergänzt einen nachvollziehbaren Audit-Eintrag. IDs, Dateien, Storage-Pfade, Versionen, Status und übrige Herkunftsdaten bleiben erhalten; mehrere Dokumente werden nicht zusammengeführt.

Reihenfolge: (1) neue Migration in Supabase ausführen, (2) prüfen, dass keine aktiven Zeilen mit `sale_commercial_register` übrig sind, (3) Next.js-Code deployen. Die Migration wurde nicht automatisch ausgeführt. Der historische Migrationstext vom 19.10.2026 enthält weiterhin den alten Typ, da bereits ausgeführte Migrationen nicht geändert werden.

## Fehlercodes

- `400`: ungültiges JSON/Multipart oder fehlender Idempotency-Key
- `401`: fehlender/ungültiger Bearer-Token
- `404`: Verkauf nicht in der konfigurierten Company vorhanden
- `409`: widersprüchliche Zuordnung oder wiederverwendeter Idempotency-Key mit anderem Inhalt
- `413`: Datei größer als 10 MB
- `415`: keine echte PDF
- `422 invalid_image`: JPEG/PNG ist beschädigt oder überschreitet die maximale Pixelanzahl
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
6. **HTTP Request – Originalseiten extrahieren** am `matched`-Ausgang
   - Method: `POST`
   - URL: `https://<WAW-VERCEL-DOMAIN>/api/automation/document-returns/extract-pages`
   - Authentication: dasselbe Header-Auth-Credential
   - Send Body: aktiv
   - Body Content Type: `Form-Data`
   - Parameter `file`: Typ **n8n Binary File**, Input Data Field Name `data`
   - Textparameter `pages`: `={{ JSON.stringify($json.pages) }}`
   - Textparameter `expectedPageCount`: `={{ String($json.expectedPageCount) }}`
   - Response Format: `File`
   - Put Output in Field: `extractedDocument`
   - Bei `409 page_count_mismatch` oder `422` nicht hochladen, sondern in den Prüfzweig leiten.
7. **HTTP Request – Dokument hochladen** am erfolgreichen Extraktionsausgang
   - Method: `POST`
   - URL: `=https://<WAW-VERCEL-DOMAIN>/api/automation/sales/{{ $json.resolution.sale.saleId }}/documents`
   - Authentication: dasselbe Header-Auth-Credential
   - Send Headers: aktiv
   - Header `Idempotency-Key`: `={{ $json.idempotencyKey }}`
   - Send Body: aktiv
   - Body Content Type: `Form-Data`
   - Parameter `file`: Typ **n8n Binary File**, Input Data Field Name `extractedDocument`
   - Textparameter:
     - `documentType`: `={{ $json.documentType }}`
     - `saleIdentifier`: `={{ $json.resolution.sale.saleIdentifier }}`
     - `signatureStatus`: `={{ $json.signatureStatus }}`
     - `reviewStatus`: `={{ $json.reviewStatus }}`
     - `returnId`: `={{ $json.returnId }}`
     - `sourceEmailId`: `={{ $json.sourceEmailId }}`
     - `sourceAttachmentId`: `={{ $json.sourceAttachmentId }}`
     - `receivedAt`: ein einmal am Workflow-Anfang erzeugter und danach unverändert wiederverwendeter ISO-Zeitstempel
8. **Switch/IF – Uploadantwort**
   - `201`: neu gespeichert
   - `200`: identischer Upload war bereits gespeichert
   - `202`: identischer Upload wird gerade verarbeitet; mit Warte-/Retry-Knoten und demselben Idempotency-Key wiederholen
   - `409`: Key mit verändertem Inhalt oder Zuordnungskonflikt – manuelle Prüfung
   - andere Fehler: Fehlerausgabe sichern, nicht mit einer anderen Verkaufsakte fortfahren

Der Idempotency-Key darf bei einem technischen Retry nicht neu erzeugt werden. Eine korrigierte fachliche Version erhält dagegen bewusst einen neuen Key, beispielsweise durch Erhöhung von `:v1` auf `:v2`.

## Späterer produktiver Ablauf

### n8n-Erweiterung für JPEG/PNG

Im `matched`-Zweig werden drei HTTP Request-Knoten verwendet:

1. **Original sichern**: `POST /api/automation/document-returns/originals`, Header Auth wie oben, `Idempotency-Key` stabil pro Quellanhang. Body Content Type `Form-Data`; `file` als **n8n Binary File** aus Binary-Feld `data`, optionale Quellfelder als Text. `originalUploadId` aus der JSON-Antwort merken.
2. **Bild in PDF umwandeln**: `POST /api/automation/document-returns/image-to-pdf`, dieselbe Authentifizierung, Body Content Type `Form-Data`, Textparameter `originalUploadId` aus Schritt 1. Response Format `File`, Ausgabe-Binary etwa `extractedDocument`. So wird das gespeicherte Original aus privatem Storage geladen; das Bild wird nicht erneut gesendet.
3. **Rücklauf speichern**: `POST /api/automation/sales/{saleId}/documents`, Binary-Parameter `file` aus `extractedDocument`, dazu `originalUploadId` aus Schritt 1, `documentType`, `saleIdentifier`, `signatureStatus`, `reviewStatus=needs_review` und Quellmetadaten. Den Idempotency-Key stabil pro erkanntem Rücklauf und Dokument halten. Der Server erzwingt bei Bildoriginalen `needs_review` selbst.

Der Konvertierungsendpunkt antwortet nur mit der PDF. Erst der Rücklauf-Upload speichert diese PDF privat und legt sie in der Verkaufsakte ab.

Der spätere, noch nicht implementierte Workflow ist:

```text
Postfach überwachen
→ Originalanhang unverändert über /document-returns/originals sichern
→ Seiten inhaltlich analysieren
→ Dokumenttypen und sichtbare Unterschriften erkennen
→ jedes erkannte Dokument separat über /sales/resolve zuordnen
→ nur bei matched fortfahren
→ bei PDF-Anhängen zugehörige Originalseiten zu einer eigenen PDF zusammenfassen
→ abgeleitete PDF mit originalUploadId und originalPageNumbers hochladen
→ ambiguous/unmatched/conflict in eine manuelle Prüfliste geben
```

Postfachüberwachung, KI-Auswertung, PDF-Aufteilung, OneDrive und Druck sind bewusst nicht Bestandteil der aktuellen Implementierung.

## Sichere End-to-End-Prüfung

Vor einem Live-Test müssen eine isolierte Test-Verkaufsakte, eine Testrechnung, ein Testfahrzeug und eine Testkundin beziehungsweise ein Testkunde vorhanden sein. Der Test darf nicht auf eine reale Akte zeigen. Nach dem Test sind nur die erzeugten Test-Rückläufe und Original-Uploads kontrolliert zu bereinigen; Finanzdaten, Nummernkreise und Fahrzeugstatus werden nicht verändert.

Der vorbereitete Testlauf liegt unter `scripts/test-automation-document-return-e2e.mjs`. Er erzeugt selbst **keinen** Verkauf, keine Rechnung, keine Buchung und keinen Kunden. Vor Schreibzugriffen prüft er zwingend:

- Verkaufsnotiz enthält `[AUTOMATION-E2E]`
- Kundenadresse endet auf `@example.invalid`
- VIN enthält `TEST`
- mindestens eine bereits vorbereitete Rechnung mit `TEST` in der Rechnungsnummer ist vorhanden
- `AUTOMATION_TEST_ALLOW_WRITES=true` wurde ausdrücklich gesetzt

Erforderliche lokale Variablen, ohne Werte ins Repository zu schreiben:

```text
AUTOMATION_TEST_ALLOW_WRITES=true
AUTOMATION_TEST_BASE_URL=https://<WAW-VERCEL-DOMAIN>
AUTOMATION_TEST_SALE_ID=<ISOLIERTE-TEST-SALE-UUID>
AUTOMATION_API_TOKEN=<TOKEN-AUS-VERCEL>
NEXT_PUBLIC_SUPABASE_URL=<SUPABASE-URL>
SUPABASE_SERVICE_ROLE_KEY=<SERVER-ONLY-KEY>
```

Ausführung:

```bash
npm run test:automation:e2e
```

Der Lauf prüft API-Zuordnung, Konflikte, privaten Original-Storage, Seitenverknüpfung, unsigned-Status, sequentielle und parallele Idempotenz, Inhaltskonflikt, Korrekturversion, aktive Version und privaten Storage-Download. Die erzeugten Dateien bleiben als eindeutig mit einer Run-ID markierte Testnachweise in der isolierten Akte erhalten, damit die Anzeige und das Öffnen anschließend angemeldet im Browser geprüft werden können.

### Aktueller Prüfstatus (2026-10-07)

- Beide Migrationsdateien sind im Repository vorhanden.
- Im aktuell konfigurierten Supabase-Projekt sind `sales.sale_identifier` und `automation_return_uploads` read-only erfolgreich auflösbar.
- Die RPC `complete_automation_sale_document_upload` existiert und verweigert dem Anon-Key erwartungsgemäß den Zugriff (`42501`).
- Lokale Route-Tests ergaben `401` für ungültigen Zugang, `400` für ungültiges JSON und `415` für eine als PDF deklarierte Nicht-PDF.
- Der schreibende E2E-Test wurde noch nicht ausgeführt, weil lokal kein `SUPABASE_SERVICE_ROLE_KEY`, kein `AUTOMATION_API_TOKEN`, keine `AUTOMATION_TEST_BASE_URL` und keine eindeutig markierte `AUTOMATION_TEST_SALE_ID` konfiguriert waren.
- Eine Browserprüfung der Verkaufsakte wurde daher ebenfalls nicht ausgeführt.

## Begrenzter Upload-und-Lösch-Test mit ausgewählter Akte

Dieser Test ist vom umfassenden E2E-Test getrennt. Er benötigt keine besonderen Testkunden-, VIN- oder Rechnungsmarker, sondern verwendet ausschließlich die explizit gesetzte `AUTOMATION_TEST_SALE_ID`. Er erstellt weder Kunden-, Fahrzeug-, Verkaufs- oder Rechnungsdaten noch E-Mails oder Buchungen.

Vorbereitung:

1. Migration `20261007100000_delete_automation_return_document_version.sql` in Supabase ausführen.
2. Den aktuellen Code nach Vercel deployen.
3. In `.env.local` setzen:

```text
AUTOMATION_API_TOKEN=<IDENTISCH-MIT-VERCEL>
SUPABASE_SERVICE_ROLE_KEY=<SERVER-ONLY-KEY>
AUTOMATION_TEST_ALLOW_WRITES=true
AUTOMATION_TEST_BASE_URL=https://<AKTUELLE-WAW-VERCEL-DOMAIN>
AUTOMATION_TEST_SALE_ID=<AUSDRÜCKLICH-AUSGEWÄHLTE-VERKAUFS-UUID>
```

`NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_WAW_COMPANY_ID` müssen wie für die Anwendung vorhanden sein. Die npm-Skripte laden `.env.local` ausdrücklich über Node `--env-file=.env.local`; Next.js-automatisches Laden gilt nicht für eigenständige Node-Skripte.

### Phase 1: Upload

```bash
npm run test:automation:limited -- upload
```

Der Runner:

- erzeugt ausschließlich `AUTOMATION-UPLOAD-TEST.pdf`
- lädt sie als `handover_protocol` mit `signatureStatus=absent` und `reviewStatus=needs_review`
- ersetzt keine vorhandenen Dokumente
- speichert keine Originalanlage und keine Korrekturversion
- prüft privaten Storage und den unerfüllten Unterschriftsstatus
- schreibt alle erzeugten IDs und den vorherigen Dokumentbestand in ein Manifest unter `/tmp/waw-automation-upload-test-<saleId>.json`

Optional kann der Manifestpfad über `AUTOMATION_LIMITED_TEST_MANIFEST` gesetzt werden. Das Manifest enthält keine Secrets.

### Phase 2: UI

1. Mit einem Admin-Konto anmelden.
2. `/dashboard/sales/<AUTOMATION_TEST_SALE_ID>#documents` öffnen.
3. In „Alle Dokumente“ `AUTOMATION-UPLOAD-TEST.pdf` suchen.
4. „Öffnen“ anklicken und prüfen, dass die synthetische PDF angezeigt wird.
5. Ausschließlich bei diesem Dokument „Löschen“ anklicken.
6. Nach dem Redirect prüfen, dass das Dokument nicht mehr angezeigt wird und der Pflichtdokumentstatus neu berechnet wurde.

Der Löschpfad ist auf Admins begrenzt. Bei einer einzelnen Version werden Dokument, Version, abgeleiteter Ledger-Eintrag und ausschließlich dessen private Storage-Datei entfernt. Ein verknüpftes Original oder andere daraus abgeleitete Dokumente werden nicht gelöscht. Bei mehreren Versionen wird nur die aktive Version entfernt und die vorherige Version wieder aktiviert.

### Phase 3: Löschung verifizieren

```bash
npm run test:automation:limited -- verify-deleted
```

Der Runner prüft anhand des Manifests:

- Test-Dokumentdatensatz entfernt
- Test-Dokumentversion entfernt
- zugehöriger `automation_return_uploads`-Eintrag entfernt
- private Storage-Datei nicht mehr vorhanden
- alle vor dem Test vorhandenen Dokumente weiterhin vorhanden
- deren aktive Versionen und Storage-Pfade unverändert
- Test-Rücklauf nicht mehr in `document-requirements` enthalten
