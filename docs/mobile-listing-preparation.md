# Inseratsvorbereitung für Fahrzeugankäufe

## Umfang und aktueller Stand

Die Einkaufsakte kann einen privaten, revisionsgebundenen Auftrag zur Inseratsvorbereitung an n8n senden. n8n soll den Fahrzeugschein über einen geschützten WAW-Endpunkt lesen, den OneDrive-Ordner **Fahrzeugbilder** paginiert untersuchen, mindestens ein passendes Foto in einen privaten Supabase-Pfad übertragen und einen bearbeitbaren Vorschlag per Callback zurückgeben.

Die Funktion veröffentlicht nichts bei mobile.de und verändert keine Fahrzeugstammdaten. Es gibt keinen OneDrive-Fahrzeugschein-Ordner. Der Fahrzeugschein bleibt in der vorhandenen Einkaufs-/Fahrzeugakte im privaten Bucket `documents`. Microsoft Graph Zugangsdaten verbleiben in n8n.

„EK 2“ konnte aus dieser Laufzeit nicht gegen Supabase aufgelöst werden: Die ausschließlich lesende Datenbankverbindung endete mit `fetch failed`. Es wurde keine Produktivakte angelegt oder verändert. Der Benutzer kann die Akte nach dem Deployment direkt in der Oberfläche öffnen.

## Vorbedingungen in WAW

- Der angemeldete Benutzer muss zu derselben Company wie die Einkaufsakte gehören.
- Die Einkaufsakte muss mit einem Fahrzeug verbunden sein.
- Im `documents`-Bucket muss ein aktueller Datensatz `document_type = 'vehicle_registration'`, `status = 'available'` und ein `file_path` vorhanden sein. Der aktuelle Dateizugriff wird vor dem Start über eine kurzlebige Signed URL mit `HEAD` geprüft.
- `purchase_vehicle_folder_jobs` muss für dieselbe Akte `status = 'ready'` sowie `drive_id`, `folder_id`, `folder_url` und `images_folder_id` enthalten.
- n8n muss anschließend den tatsächlichen Graph-Zugriff kontrollieren. Ein Graph-403 oder Timeout ist ein technischer Fehler und darf nicht als leerer Fotoordner gemeldet werden.

## Datenmodell

Migration: `supabase/migrations/20261106100000_add_purchase_listing_preparation.sql`.

`purchase_listing_jobs` hält pro Vorbereitung eine eigene `job_id`, Company, Einkaufs-/Fahrzeug-ID, unveränderliche SHA-256-Quellrevision, Status, bestätigten Daten-Snapshot, OCR-Vorschläge, Abweichungen, offene Angaben, Titel, Beschreibung, Bildreihenfolge, manuelle Revisionsnummer, Callback-Fingerprint und Lease. Mehrere Entwürfe bleiben getrennte Zeilen. Aktive Aufträge derselben Einkaufsakte und Quellrevision sind durch einen Unique-Index geschützt.

`purchase_listing_job_images` speichert je Graph-Dateiversion eine private unveränderliche Kopie unter `companies/{companyId}/purchase-listings/{jobId}/{imageId}.{jpg|png|webp}`. Die Eindeutigkeit wird mit `(job_id, source_drive_item_id, source_e_tag)` gesichert. Die OneDrive-Datei selbst wird nicht verändert. Die WAW-Oberfläche lädt Vorschaubilder nur über eine Session- und Company-geprüfte Route.

Beide Tabellen sind nicht für `anon` oder `authenticated` zugänglich. Nur der serverseitige Service-Role-Client verwendet sie. Die Migration erzeugt keine Aufträge und löst keine OneDrive-Aufrufe aus. Beim administrativen Löschen einer Einkaufsakte werden gespeicherte Entwurfsbilder mit dem vorhandenen Staging-/Storage-Löschpfad entfernt.

Zustände: `queued`, `processing`, `needs_input`, `draft_ready`, `failed`. Ein Datenbank-Claim setzt eine 30-Minuten-Lease. Eine Wiederholung nach Lease-Ablauf verwendet dieselbe `job_id` und denselben `dispatchToken`; der n8n-Webhook muss diese stabile ID idempotent behandeln. Eine Wiederholung darf die bereits laufende Verarbeitung fortsetzen oder das gleiche Ergebnis erneut liefern. Es gibt keinen Cronjob und keinen Hintergrundprozess in Vercel.

## Endpunkte

Alle neuen n8n/WAW-Automatisierungsendpunkte verwenden `Authorization: Bearer <N8N_VEHICLE_LISTING_TOKEN>`. Die Werte müssen konstantzeitlich übereinstimmen. Die Company wird ausschließlich aus der serverseitigen WAW-Konfiguration bestimmt, nicht aus der n8n-Anfrage.

### Software → n8n: Auftrag und schnelle Annahme

WAW sendet `POST` an `N8N_VEHICLE_LISTING_WEBHOOK_URL`. n8n muss in höchstens 8 Sekunden mit HTTP `202` antworten und danach weiterarbeiten.

```json
{
  "schemaVersion": 1,
  "event": "purchase.listing.prepare",
  "jobId": "<UUID>",
  "purchaseId": "<interne Einkaufs-UUID>",
  "vehicleId": "<interne Fahrzeug-UUID>",
  "sourceRevision": "<64-stellige SHA-256 Revision>",
  "dispatchToken": "<UUID-Lease-Token>",
  "templateVersion": "waw-mobile-listing-v1",
  "textTemplate": {
    "title": "<Hersteller Modell Aufbau>",
    "description": "<serverseitige Vorlagenabschnitte mit vorhandenen Daten>",
    "openPoints": ["Kilometerstand prüfen", "Zustand und bekannte Mängel prüfen"]
  },
  "generationRules": ["<serverseitige Regeln gegen erfundene Angaben>"],
  "confirmedVehicleData": {
    "id": "<Fahrzeug-UUID>",
    "manufacturer": "<bestätigter Datenbankwert>",
    "model": "<bestätigter Datenbankwert>",
    "vehicleType": "<bestätigter Datenbankwert>",
    "vehicleCategory": null,
    "vin": "<bestätigter Datenbankwert>",
    "firstRegistration": null,
    "constructionYear": null,
    "mileage": null,
    "color": null,
    "purchaseNotes": null,
    "damageNotes": null
  },
  "registrationDocument": {
    "documentId": "<documents.id>",
    "fileName": "<Originalname>",
    "mimeType": "application/pdf",
    "fileSize": 123456,
    "downloadUrl": "<Callback-Basis>/api/automation/purchase-listings/<jobId>/registration"
  },
  "oneDriveImages": {
    "driveId": "<gespeicherte Drive-ID>",
    "folderId": "<images_folder_id, nicht der Hauptordner>"
  },
  "imageUploadUrl": "<Callback-Basis>/api/automation/purchase-listings/<jobId>/images",
  "callbackUrl": "<Callback-Basis>/api/automation/purchase-listings/<jobId>/callback"
}
```

`confirmedVehicleData` enthält bestätigte Stammdaten plus Fahrzeugschein-Notizen zu Zustand/Mängeln. Einkaufspreis, Kundendaten, Steuerdaten und Verkaufsdaten werden nicht übertragen. Die genaue Quelle (Dokument-ID, Datei, Graph-Drive-/Ordner-ID), die Quellrevision und die Vorlagenversion werden am Auftrag gespeichert.

Erwartete Annahmeantwort:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
```

```json
{
  "status": "accepted",
  "jobId": "<unverändert>",
  "purchaseId": "<unverändert>",
  "vehicleId": "<unverändert>",
  "sourceRevision": "<unverändert>",
  "dispatchToken": "<unverändert>"
}
```

Eine fehlende oder nicht passende Annahmeantwort ist kein Erfolg. Bei HTTP 401/403 wird der Auftrag als fehlgeschlagen angezeigt. Bei Timeout kann n8n den Auftrag bereits angenommen haben; WAW behält deshalb die `job_id` und zeigt den laufenden Status bis zur Lease-Grenze an.

### WAW → n8n: Fahrzeugschein laden

`GET /api/automation/purchase-listings/{jobId}/registration`

- Authentifizierung: gleicher Bearer-Token.
- Nur solange der Auftrag `queued` oder `processing` ist.
- Prüft Company, Auftrag, gespeicherte Dokument-ID, `vehicle_registration`, `available`, Einkaufs-/Fahrzeugbezug und unveränderten `file_path`.
- Liest Bytes aus dem privaten Bucket `documents`; kein signed URL und kein Supabase-Schlüssel wird an n8n übermittelt.
- Antwort `200` mit originalen Bytes, tatsächlichem MIME-Type und `Cache-Control: private, no-store`; bei nicht verfügbarem Dokument 404/409.
- Maximal 10 MB; PDF, JPEG und PNG sind die vorhandenen unterstützten Fahrzeugschein-Typen.

### n8n → WAW: privates Fahrzeugfoto speichern

`POST /api/automation/purchase-listings/{jobId}/images`

JSON:

```json
{
  "fileName": "<Originaldateiname>",
  "mimeType": "image/jpeg",
  "fileSize": 3145728,
  "sha256": "<64-stellige SHA-256 Prüfsumme der Bytes>",
  "sourceDriveItemId": "<Graph item id>",
  "sourceETag": "<Graph eTag der Dateiversion>"
}
```

Erlaubt sind `image/jpeg`, `image/png`, `image/webp`, maximal 10 MB pro Datei. WAW reserviert die Kombination aus Auftrag, Graph-ID und eTag idempotent und gibt HTTP `201` zurück:

```json
{
  "status": "upload_required",
  "imageId": "<UUID>",
  "upload": {
    "method": "PUT",
    "url": "<kurzzeitig signierte private Supabase-Storage-URL>",
    "token": "<kurzlebiges pfadgebundenes Upload-Token>",
    "expiresInSeconds": 7200,
    "headers": { "content-type": "image/jpeg", "x-upsert": "false" }
  },
  "completeUrl": "/api/automation/purchase-listings/<jobId>/images/complete"
}
```

Supabase Signed Upload URLs sind laut der im Repository installierten Storage-Client-Dokumentation zwei Stunden gültig. Das Token erlaubt den Upload in den einen reservierten privaten Storage-Pfad. Es ist kein Service-Role-Key. n8n muss die Signed URL und das Token aus Ausführungslogs entfernen bzw. den erfolgreichen Ausführungsdatensatz entsprechend nicht speichern. Upload-Wiederholungen benutzen denselben Graph-`itemId` und eTag; abweichender Hash, MIME-Type oder Größe unter derselben Version ergibt HTTP 409.

Die Bytes werden direkt vom n8n-HTTP-Request zu Supabase Storage übertragen. Damit laufen große Fotos nicht durch den Vercel-Request-Body. Danach ruft n8n `POST` auf `completeUrl` mit `{ "imageId": "<UUID>" }` auf. WAW lädt die private Datei, prüft Größe, SHA-256 und echte Bildlesbarkeit, Format, Mindestabmessungen (64×64) und Pixelgrenze (80 MP). Erst dann gilt das Bild als `available`. Ungültige oder abweichende Datei wird aus diesem reservierten Pfad entfernt. Eine wiederholte Bestätigung ist idempotent.

Erfolg:

```json
{ "status": "stored", "imageId": "<UUID>", "idempotent": false }
```

Fehlercodes umfassen `invalid_image_metadata`, `image_version_conflict`, `image_upload_incomplete`, `image_checksum_mismatch`, `invalid_image_content` und `image_registration_failed`.

### n8n → WAW: Ergebnis-Callback

`POST /api/automation/purchase-listings/{jobId}/callback`

Header: `Authorization: Bearer <N8N_VEHICLE_LISTING_TOKEN>`.

Erfolg oder offene Eingaben:

```json
{
  "schemaVersion": 1,
  "jobId": "<UUID>",
  "purchaseId": "<Einkaufs-UUID>",
  "vehicleId": "<Fahrzeug-UUID>",
  "sourceRevision": "<unveränderte Revision>",
  "dispatchToken": "<unverändertes Lease-Token>",
  "status": "draft_ready",
  "extractedSuggestions": {
    "vin": "<nur klar lesbar erkannter Vorschlag>",
    "firstRegistration": "<YYYY-MM-DD oder Textvorschlag>",
    "constructionYear": 2022,
    "manufacturer": "<Wert>",
    "model": "<Wert>",
    "vehicleType": "<Wert>"
  },
  "missingFields": ["mileage", "condition", "equipment", "inspection", "photos"],
  "title": "<Inseratstitel>",
  "description": "<Textentwurf>",
  "selectedImageIds": ["<zuvor gespeicherte imageId in gewünschter Reihenfolge>"]
}
```

`missingFields` akzeptiert nur `mileage`, `condition`, `equipment`, `inspection`, `photos`; Texte für offene Punkte erzeugt die Oberfläche selbst. `extractedSuggestions` akzeptiert nur `manufacturer`, `model`, `vehicleType`, `vin`, `firstRegistration`, `constructionYear`, `mileage`, `color`. Andere Felder – insbesondere persönliche Dokumentdaten – werden verworfen. Abweichungen zu vorhandenen FIN-, Erstzulassungs- und technischen Werten berechnet WAW selbst. `selectedImageIds` muss auf hochgeladene und serverseitig geprüfte Bildversionen desselben Auftrags zeigen.

`draft_ready` ohne Text oder mindestens ein Foto wird serverseitig zu `needs_input`. Ein leeres Fotoergebnis darf nicht als Graph-Zugriffsfehler kaschiert werden. n8n soll bei leerem, vollständig erreichbarem Bilderordner `needs_input` mit `missingFields: ["photos"]` melden. Bei Graph 401/403, Timeout oder anderen Verbindungsfehlern Callback mit `status: "failed"` und einem der erlaubten Codes `ONEDRIVE_ACCESS_DENIED`, `ONEDRIVE_TIMEOUT`, `ONEDRIVE_FOLDER_MISSING`, `REGISTRATION_UNREADABLE`, `OCR_FAILED`, `PROCESSING_TIMEOUT` liefern. Unbekannte Fehlercodes werden als allgemeiner Verarbeitungsfehler gespeichert.

Beispiel für ein technisches Ergebnis:

```json
{
  "schemaVersion": 1,
  "jobId": "<UUID>",
  "purchaseId": "<Einkaufs-UUID>",
  "vehicleId": "<Fahrzeug-UUID>",
  "sourceRevision": "<Revision>",
  "dispatchToken": "<Lease-Token>",
  "status": "failed",
  "errorCode": "ONEDRIVE_TIMEOUT"
}
```

Der Callback liefert HTTP `201` bei erstem Speichern und HTTP `200` bei identischer wiederholter Antwort. Fremde IDs, veraltete Lease-Tokens, falsche Revisionen und nicht zugehörige Bilder werden mit 409/422 abgewiesen. Ist der Entwurf bereits manuell geändert, kann ein Callback ihn nicht überschreiben. Ein verspätetes Ergebnis einer älteren `job_id` kann keinen neueren Entwurf ändern.

## Erster n8n-Workflow (noch einzurichten)

1. Webhook `POST` mit Header-Authentifizierung auf `Authorization: Bearer ...` anlegen. Das Credential muss denselben Wert wie `N8N_VEHICLE_LISTING_TOKEN` verwenden.
2. Requestdaten validieren: `schemaVersion`, Event, UUIDs, SHA-256 Revision und Lease-Token.
3. Den Webhook sofort mit HTTP 202 und dem vollständigen oben gezeigten `accepted`-Objekt beantworten. Danach kann der Workflow weiterlaufen; bei der Ausführung keine signed URL oder Upload-Tokens protokollieren.
4. Fahrzeugschein mit Bearer-Credential vom enthaltenen `registrationDocument.downloadUrl` abrufen. OCR-/PDF-Fehler getrennt als `REGISTRATION_UNREADABLE`/`OCR_FAILED` behandeln.
5. In Microsoft Graph `GET /drives/{driveId}/items/{folderId}/children` ausführen und alle Seiten über `@odata.nextLink` ablaufen. Unterordner überspringen; nur herunterladbare JPEG/PNG/WebP-Dateien zählen. Wenn kein solches Bild abrufbar ist, Callback mit `needs_input` und `photos` senden. Graph-403/Timeout ist ein Fehler, kein Leerordner.
6. Unterstützte Fotos in Originalqualität herunterladen. Je Datei SHA-256 berechnen; Upload-Intent bei `imageUploadUrl` anfragen; per HTTP Request die Bytes direkt an die zurückgegebene Signed Upload URL senden; danach `completeUrl` bestätigen. Quelle `sourceDriveItemId` und `sourceETag` sowie die Antwort-`imageId` dem Bild zuordnen.
7. OCR-Ergebnisse nur in den erlaubten Vorschlagsfeldern senden. FIN/Erstzulassung/technische Widersprüche gesondert in der Vorschau erkennbar machen; bestätigte WAW-Daten niemals überschreiben. Keine unbelegten Verkaufsangaben erzeugen.
8. Nach allen Bilduploads Callback mit stabilen Identitäten, `dispatchToken`, Titel, Beschreibung, offenen Feldern und ausgewählten `imageId`s senden.
9. `409 stale_callback`/`callback_superseded` nicht wiederholen. Bei n8n-/Netzwerkunterbrechung dieselbe `jobId` idempotent fortsetzen; niemals eine neue job ID für einen unklar angenommenen technischen Retry erzeugen.

Empfohlene n8n-Speicherung: Erfolgreiche Node-Ausführungsdaten nicht dauerhaft mit Signed Upload URLs oder Tokens sichern; Ausführungsdaten-Pruning aktivieren. Keine Microsoft- oder Supabase-Service-Role-Zugangsdaten in den Workflow-Export oder n8n-Auftragsbody schreiben.

## Vercel-Konfiguration

Serverseitige Variablen, ohne `NEXT_PUBLIC_`:

| Variable | Zweck |
| --- | --- |
| `N8N_VEHICLE_LISTING_WEBHOOK_URL` | HTTPS-Webhook nur für Inseratsvorbereitung; nicht die Ordneranlage-URL verwenden. |
| `N8N_VEHICLE_LISTING_TOKEN` | Zufälliger Bearer-Token, identisch in Vercel und n8n Credential; nicht im Browser. |
| `N8N_VEHICLE_LISTING_CALLBACK_BASE_URL` | Kanonischer HTTPS-Origin der WAW-Vercel-Anwendung, ohne Pfad oder abschließende Route. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bereits verwendeter serverseitiger Schlüssel; bleibt ausschließlich in Vercel. |

Der Startaufruf wartet höchstens 8 Sekunden auf n8n-Annahme; OCR und Generierung laufen danach in n8n. Server Actions auf der Einkaufsseite und die registrierungs-/bildprüfenden Routen setzen `maxDuration = 30`, im Rahmen der derzeit dokumentierten Vercel Hobby-Funktionsobergrenze. Das ist nur die Laufzeit des kurzen Start-/Dateiprüfaufrufs und keine synchrone OCR-Verarbeitung.

## Deployment-Reihenfolge

1. SQL-Migration `20261106100000_add_purchase_listing_preparation.sql` einmal im Supabase SQL Editor oder über den vorgesehenen Migrationsweg anwenden. Sie legt nur leere Tabellen/Funktionen an und startet keine Verarbeitung.
2. Vercel-Variablen oben setzen und deployen.
3. n8n-Workflow mit den beschriebenen Webhook-, Signed-Upload- und Callback-Schritten einrichten und zunächst mit einem Testankauf verwenden. Das Repository enthält keinen n8n-Workflow-Export; eine n8n-Einrichtung oder Aktivierung wurde nicht ausgeführt.
4. In der Einkaufsakte eine vorhandene Testakte (z. B. „EK 2“) auswählen, Status prüfen, Vorschau bearbeiten und speichern. Vor einer späteren Veröffentlichung müssen Inhalte und Fotos von einem Mitarbeiter geprüft werden.

## Lokale Verifikation und offene Live-Prüfung

Lokale Unit-/Contract-Tests prüfen stabile Quellrevision, Vorlagenregeln, Widerspruchserkennung, Annahmeantwort, Callback-Identitäten/Token/Bildreferenzen, Status bei fehlenden Fotos, Bild-MIME/Lesbarkeit und Lease-Ablauf.

Nicht gegen Live-Vercel, Supabase Storage, OneDrive/Graph oder n8n ausgeführt: ein vollständiger End-to-End-Durchlauf und der tatsächlich aktive n8n-Vertrag. Vor Live-Test müssen Migration, Variablen und n8n-Workflow eingerichtet sein.
