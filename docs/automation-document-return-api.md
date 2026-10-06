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
  "saleIdentifier": "VK-7K4M9P2XAA",
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
