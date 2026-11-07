# Inseratsvorbereitung für Fahrzeugankäufe

## Aktueller Stand: Formular und Vertrag v3

Diese Aktualisierung ergänzt die ältere V1/V2-Dokumentation unten. Neue Inseratsangaben werden im bestehenden optionalen JSONB-Feld `vehicles.listing_details` gespeichert. Der aktuelle Kilometerstand bleibt in `vehicles.mileage`; der bestehende Angebotspreis steht in `vehicles.sale_price_net` und wird ausdrücklich als **Netto** behandelt. Eine künftige Verkaufs-Steuerbehandlung ist beim Einkauf nicht gespeichert: `purchase_cases.vat_rate` beschreibt die Steuer des Einkaufs und wird nicht als Verkaufs-Steuerbehandlung verwendet. Daher wird `taxTreatment: null` an n8n übergeben. Die konkrete Steuerart entsteht erst beim tatsächlichen Verkauf.

Die Einkaufsakte zeigt oberhalb von **Inserat vorbereiten** das Formular **Angaben zum Inserat**. „Angaben speichern“ speichert nur. „Inserat vorbereiten“ speichert zuerst und startet nur bei erfolgreichem Speichern den vorhandenen asynchronen Ablauf. Das Fahrzeug-Update erfolgt über `save_purchase_listing_information`: Company-/Einkaufszuordnung wird in der Funktion geprüft, die Werte werden unter Zeilensperre gemeinsam aktualisiert und parallele Änderungen mit SQLSTATE `40001` abgewiesen. Bei Fehlern bleiben bereits gespeicherte Angaben erhalten; es wird kein Auftrag gestartet.

Neue Aufträge verwenden `contractVersion: 3` und `templateVersion: "waw-mobile-listing-v3"`. Dafür ist serverseitig `N8N_VEHICLE_LISTING_CONTRACT_VERSION=3` erforderlich. Solange dieser Schalter fehlt oder einen anderen Wert hat, kann das Formular gespeichert werden, aber die Software startet keinen Auftrag. Das verhindert, dass der aktuelle Workflow v2 einen unbekannten Auftrag erhält. Vorhandene v1/v2-Aufträge und Callbacks bleiben unterstützt.

V3 überträgt nur eine explizite Allowlist aus bestätigten Fahrzeug-/Inseratsdaten. `vehicles.notes`, `damage_notes`, Einkaufspreise, Margen, Verkäufer-/Kundendaten und Halterdaten werden nicht übertragen. `sale_price_net` wird getrennt unter `listingInformation.sellingPrice` als `{ amount, basis: "net", currency: "EUR" }` gesendet. Aus dem Fahrzeugschein werden keine neuen OCR-Felder angefordert. Nicht zum Fahrzeugtyp passende Betonmischerangaben werden im V3-Auftrag auf `null` gesetzt; vorhandene Werte bleiben in der Datenbank erhalten. Das bisher mehrdeutige Feld `grossVehicleWeightKg` wird in V3 nicht gesendet. F.1 und F.2 bleiben getrennt.

V3-Kern des Auftrags (Werte sind synthetische Platzhalter):

```json
{
  "schemaVersion": 1,
  "contractVersion": 3,
  "event": "purchase.listing.prepare",
  "jobId": "<UUID>",
  "purchaseId": "<Einkaufs-UUID>",
  "vehicleId": "<Fahrzeug-UUID>",
  "sourceRevision": "<SHA-256>",
  "dispatchToken": "<UUID>",
  "templateVersion": "waw-mobile-listing-v3",
  "textTemplate": { "title": "<WAW-Vorschlag>", "description": "<Klartext>", "openPoints": ["salePrice", "availability"] },
  "confirmedVehicleData": {
    "manufacturer": "<bestätigt>", "model": "<bestätigt>", "vehicleType": "<bestätigt>",
    "vehicleCategory": null, "vin": "<FIN>", "firstRegistration": null,
    "constructionYear": null, "mileage": null, "color": null,
    "listingDetails": { "fuelType": null, "engineDisplacementCc": null, "axleCount": null, "drivenAxleCount": null, "lengthMm": null, "widthMm": null, "heightMm": null, "permittedMassF1Kg": null, "permittedMassF2Kg": null, "vehicleReadiness": "unknown", "currentDamageStatus": "unknown", "repairedDamageStatus": "unknown", "availabilityStatus": "unknown" }
  },
  "listingInformation": {
    "sellingPrice": { "amount": 12500, "basis": "net", "currency": "EUR" },
    "taxTreatment": null,
    "confirmedDetails": { "availabilityStatus": "unknown", "vehicleReadiness": "unknown", "currentDamageStatus": "unknown" },
    "instructions": ["Nur bestätigte Fakten verwenden; unbekannt bleibt offen."]
  },
  "registrationDocument": { "documentId": "<Dokument-UUID>", "fileName": "<Dateiname>", "mimeType": "application/pdf", "fileSize": 123456, "downloadUrl": "<geschützte WAW-URL>" },
  "oneDriveImages": { "driveId": "<Drive-ID>", "folderId": "<Fahrzeugbilder-Ordner-ID>" },
  "imageUploadUrl": "<geschützte WAW-URL>",
  "callbackUrl": "<geschützte WAW-URL>"
}
```

Die Kurzfassung oben zeigt nur ausgewählte Felder; `confirmedVehicleData.listingDetails` und `listingInformation.confirmedDetails` verwenden dieselbe V3-Whitelist. Vollständige Property-Namen: bestehende Werte `enginePowerKw`, `transmission`, `emissionClass`, `cab`, `retarder`, `hydraulics`, `axleFormula`, `frontSuspension`, `rearSuspension`, `curbWeightKg`, `payloadKg`, `wheelbaseMm`, `huUntil`, `spUntil`, `bodyManufacturer`, `bodyType`, `bodyYear`, `mixerNominalVolumeM3`, `mixerDrive`, `waterTankLiters`, `bodyControls`, `includedAccessories`, `equipment`, `vehicleCondition`, `bodyCondition`, `knownDamages`, `maintenanceHistory`, `repairHistory`, `vehicleLocation`, `availabilityConfirmed`; neue Werte `availabilityStatus`, `availableFrom`, `publicHighlights`, `vehicleReadiness`, `engineFunction`, `transmissionFunction`, `otherFunction`, `cabinCondition`, `tireCondition`, `currentDamageStatus`, `repairedDamageStatus`, `repairedDamageDescription`, `maintenanceProofStatus`, `featureAirConditioning`, `featureCruiseControl`, `featureCamera`, `featurePto`, `bodyFunctionStatus`, `bodyKnownIssues`, `excludedItems`, `mixerDrumCondition`, `waterSystemFunction`, `mixerRemoteControl`, `chuteExtensions`, `fuelType`, `engineDisplacementCc`, `axleCount`, `drivenAxleCount`, `lengthMm`, `widthMm`, `heightMm`, `permittedMassF1Kg`, `permittedMassF2Kg`.

V3-Annahme bleibt kurz (HTTP 202) und muss zusätzlich `contractVersion: 3`, `jobId`, `purchaseId`, `vehicleId`, `sourceRevision` und `dispatchToken` unverändert bestätigen. Der Ergebnis-Callback bleibt `POST /api/automation/purchase-listings/{jobId}/callback`; er muss `schemaVersion: 1`, `contractVersion: 3` und dieselben Identitäten zurückgeben. V3 behält das bestehende Antwortformat `title`, `description`, `missingFields`, `extractedSuggestions`, `selectedImageIds`, `status`; V3 erlaubt zusätzlich die offenen Punkte `salePrice`, `availability`, `vehicleReadiness`, `currentDamageStatus`, `repairedDamageStatus`, `maintenanceProof`, `bodyFunction` und `waterSystem`. Unbekannte Werte werden weiterhin verworfen. OCR-Vorschläge bleiben auf die bisherige technische Whitelist beschränkt.

**Spätere OCR-Erweiterung, nicht Bestandteil dieses Codes:** Vorhandene zusätzliche Scheinfelder wie Kraftstoff, Hubraum, Achszahl, F.1/F.2 und Abmessungen dürfen n8n erst nach einer gesonderten gemeinsamen Schema-/OCR-Änderung zurückgeben. Bis dahin werden diese Werte nur manuell im Formular gepflegt.

**n8n-Anpassung erforderlich:** Der Repository-Export enthält keinen n8n-Workflow. Vor Freischaltung müssen „Auftrag pruefen“ Vertrag 3 und Template v3 erlauben; „Textanfrage bauen“ muss `listingInformation` und die neuen Whitelist-Felder als bestätigte Fakten einlesen; „Textentwurf pruefen“ muss die oben genannten V3-`missingFields` zulassen; der Callback-Node muss Vertrag 3 und alle Identitäten unverändert zurückgeben. Bestehende V1/V2-Branches und OCR-Vorschlagsvalidierung müssen erhalten bleiben. Freitext-Stichpunkte sind Dateninhalt, keine Anweisungen an OpenAI. V3 darf keine Steuerart, Unfallfreiheit oder sonstige fehlende Tatsachen ableiten.

## Umfang und aktueller Stand

Die Einkaufsakte kann einen privaten, revisionsgebundenen Auftrag zur Inseratsvorbereitung an n8n senden. Neue Aufträge verwenden nach ausdrücklicher Freischaltung **Vertrag v3** und `waw-mobile-listing-v3`; laufende und historische V1/V2-Aufträge behalten ihre alte Quellrevision, Vorlage und Callback-Allowlist. n8n liest den Fahrzeugschein über einen geschützten WAW-Endpunkt, untersucht den OneDrive-Ordner **Fahrzeugbilder** paginiert, überträgt passende Fotos in private Supabase-Snapshots und liefert einen bearbeitbaren Vorschlag per Callback zurück.

Die Funktion veröffentlicht nichts bei mobile.de und verändert keine Fahrzeugstammdaten. Es gibt keinen OneDrive-Fahrzeugschein-Ordner. Der Fahrzeugschein bleibt in der vorhandenen Einkaufs-/Fahrzeugakte im privaten Bucket `documents`. Microsoft Graph Zugangsdaten verbleiben in n8n.

„EK 2“ konnte aus dieser Laufzeit nicht gegen Supabase aufgelöst werden: Die ausschließlich lesende Datenbankverbindung endete mit `fetch failed`. Es wurde keine Produktivakte angelegt oder verändert. Der Benutzer kann die Akte nach dem Deployment direkt in der Oberfläche öffnen.

## Vorbedingungen in WAW

- Der angemeldete Benutzer muss zu derselben Company wie die Einkaufsakte gehören.
- Die Einkaufsakte muss mit einem Fahrzeug verbunden sein.
- Im `documents`-Bucket muss ein aktueller Datensatz `document_type = 'vehicle_registration'`, `status = 'available'` und ein `file_path` vorhanden sein. Der aktuelle Dateizugriff wird vor dem Start über eine kurzlebige Signed URL mit `HEAD` geprüft.
- `purchase_vehicle_folder_jobs` muss für dieselbe Akte `status = 'ready'` sowie `drive_id`, `folder_id`, `folder_url` und `images_folder_id` enthalten.
- n8n muss anschließend den tatsächlichen Graph-Zugriff kontrollieren. Ein Graph-403 oder Timeout ist ein technischer Fehler und darf nicht als leerer Fotoordner gemeldet werden.

## Datenmodell

Migrationen: `supabase/migrations/20261106100000_add_purchase_listing_preparation.sql` (bereits bestehende Jobbasis) und neu `supabase/migrations/20261106110000_add_vehicle_listing_details_and_confirmations.sql`.

`purchase_listing_jobs` hält pro Vorbereitung eine eigene `job_id`, Company, Einkaufs-/Fahrzeug-ID, unveränderliche SHA-256-Quellrevision, Vertrag/Template-Version, Status, bestätigten Daten-Snapshot, OCR-Vorschläge, bestätigte Übernahmen, Abweichungen, offene Angaben, Titel, Beschreibung, Bildreihenfolge, manuelle Revisionsnummer, Callback-Fingerprint und Lease. Mehrere Entwürfe bleiben getrennte Zeilen. Aktive Aufträge derselben Einkaufsakte und Quellrevision sind durch einen Unique-Index geschützt.

`vehicles.listing_details` ist ein optionales JSONB-Feld mit einer serverseitigen Feld-Whitelist. Bestehende Fahrzeuge erhalten `{}` und funktionieren unverändert. Es enthält ausschließlich explizit gepflegte, inseratsgeeignete technische Angaben, Zustand/Historie und bestätigte Verfügbarkeit. Interne `vehicles.notes`/`damage_notes` bleiben getrennt und werden in v2 nicht an n8n übertragen. Jede OCR-Übernahme benötigt eine ausdrückliche Benutzeraktion; Datenbankfunktion und Aktion prüfen Job, Company, Quellrevision, manuelle Revision und unveränderte Fahrzeugquelle atomar.

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
  "contractVersion": 2,
  "event": "purchase.listing.prepare",
  "jobId": "<UUID>",
  "purchaseId": "<interne Einkaufs-UUID>",
  "vehicleId": "<interne Fahrzeug-UUID>",
  "sourceRevision": "<64-stellige SHA-256 Revision>",
  "dispatchToken": "<UUID-Lease-Token>",
  "templateVersion": "waw-mobile-listing-v2",
  "textTemplate": {
    "title": "<zentraler WAW-Titelvorschlag>",
    "description": "<Klartext aus bestätigten Inseratsdaten>",
    "openPoints": ["mileage", "condition", "equipment", "inspection", "location"]
  },
  "generationRules": ["<serverseitige Regeln gegen erfundene Angaben>"],
  "confirmedVehicleData": {
    "id": "<Fahrzeug-UUID>",
    "manufacturer": "<bestätigter Datenbankwert>",
    "model": "<bestätigter Datenbankwert>",
    "vehicleType": "<bestätigter Datenbankwert>",
    "vehicleCategory": "<bestätigter Datenbankwert oder null>",
    "vin": "<bestätigter Datenbankwert>",
    "firstRegistration": null,
    "constructionYear": null,
    "mileage": null,
    "color": "<Wert oder null>",
    "listingDetails": {
      "enginePowerKw": null, "transmission": null,
      "emissionClass": null, "cab": null,
      "retarder": null, "hydraulics": null,
      "axleFormula": null, "frontSuspension": null,
      "rearSuspension": null, "grossVehicleWeightKg": null,
      "curbWeightKg": null, "payloadKg": null,
      "wheelbaseMm": null, "huUntil": null,
      "spUntil": null, "bodyManufacturer": null,
      "bodyType": null, "bodyYear": null,
      "mixerNominalVolumeM3": null, "mixerDrive": null,
      "waterTankLiters": null, "bodyControls": null,
      "includedAccessories": null, "equipment": null,
      "vehicleCondition": null, "bodyCondition": null,
      "knownDamages": null, "maintenanceHistory": null,
      "repairHistory": null, "vehicleLocation": null,
      "availabilityConfirmed": false
    }
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

`schemaVersion` beschreibt die äußere Nachrichtenform; `contractVersion` beschreibt den Datenvertrag. V2 sendet nur die ausdrücklich für ein Inserat geeigneten bestätigten Fahrzeugfelder. `vehicles.notes`, `vehicles.damage_notes`, Verkäufer-/Kundendaten, Einkaufspreise, Margen, Steuer-/Finanzdaten und private Dokumentmetadaten werden nicht in `confirmedVehicleData`, Freitext oder den n8n-Auftragsbody übertragen. Der Fahrzeugschein bleibt über die nachfolgende geschützte URL abrufbar. Die interne Quellrevision berücksichtigt alle inseratsrelevanten bestätigten Felder, die Fahrzeugschein-Version, den Bilderordner und die Template-Version; private Notizen sind kein v2-Eingabefeld.

**Legacy:** Jobs mit `contract_version = 1` behalten `waw-mobile-listing-v1`, die alte Quellrevision und die bisherige Callback-Allowlist. Deren alte `purchaseNotes`/`damageNotes`-Felder werden nur für diese bereits laufenden V1-Jobs weiter ausgewertet. Sie werden nicht in neue v2-Aufträge kopiert.

Erwartete Annahmeantwort:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
```

```json
{
  "status": "accepted",
  "contractVersion": 2,
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
  "contractVersion": 2,
  "jobId": "<UUID>",
  "purchaseId": "<Einkaufs-UUID>",
  "vehicleId": "<Fahrzeug-UUID>",
  "sourceRevision": "<unveränderte Revision>",
  "dispatchToken": "<unverändertes Lease-Token>",
  "status": "draft_ready",
  "extractedSuggestions": {
    "vin": "<nur klar lesbar erkannter Vorschlag>",
    "firstRegistration": "<gültiges YYYY-MM-DD>",
    "constructionYear": 2022,
    "manufacturer": "<Wert>",
    "model": "<Wert>",
    "enginePowerKw": 330,
    "transmission": "Automatik",
    "emissionClass": "Euro VI",
    "axleFormula": "8x4",
    "frontSuspension": "Blattfederung",
    "rearSuspension": "Luftfederung",
    "grossVehicleWeightKg": 32000,
    "curbWeightKg": 14000,
    "payloadKg": 18000,
    "wheelbaseMm": 4200,
    "huUntil": "2027-05",
    "spUntil": "2027-05",
    "color": "Weiß"
  },
  "missingFields": ["mileage", "condition", "equipment", "inspection", "photos", "location", "bodyDetails", "maintenanceHistory"],
  "title": "<Inseratstitel>",
  "description": "<Textentwurf>",
  "selectedImageIds": ["<zuvor gespeicherte imageId in gewünschter Reihenfolge>"]
}
```

Für **V2** ist `contractVersion: 2` erforderlich. `extractedSuggestions` ist auf Hersteller, Modell, FIN, Erstzulassung, Baujahr, Motorleistung, Getriebe, Schadstoffklasse, Achsformel, Federung vorne/hinten, Gesamt-/Leergewicht, Nutzlast, Radstand, HU/SP und Farbe begrenzt. Werte müssen aus dem Fahrzeugschein klar lesbar sein. Kilometerstand, Halter-/Adress-/Personendaten, Ausweis-/Dokumentnummern, MRZ, Ausstattung, Aufbauvolumen, Schäden und Zustand werden nicht aus dem Schein vorgeschlagen. `Erstzulassung` ist ein Datum und wird nie als `constructionYear` übernommen. Typschlüssel/Variante darf nicht als verkaufsfähiger Modellname ausgegeben werden. Unbekannte Felder werden verworfen.

V2 `missingFields` behält die bestehenden Werte `mileage`, `condition`, `equipment`, `inspection`, `photos` bei und kann zusätzlich `location`, `vehicleIdentity`, `technicalData`, `bodyDetails`, `maintenanceHistory` enthalten. Die Software erzeugt daraus interne offene Prüfpunkte, keine Text-Platzhalter im öffentlichen Inserat. V2 vergleicht Vorschläge mit bestätigten Daten und markiert Abweichungen. Ein Vorschlag ändert Stammdaten erst über die gesonderte, bewusste Aktion „Diesen Wert ausdrücklich übernehmen“; die Serveraktion liest den gespeicherten Callback-Wert, nicht einen vom Browser frei gelieferten Wert, und die Datenbank prüft die Quell- und Entwurfsrevision atomar.

Für **V1** bleiben `contractVersion` optional/1, die bisherige Suggestions-Whitelist und die bisherigen `missingFields` gültig, damit Aufträge fortgesetzt werden können, die vor dem Update gestartet wurden. `selectedImageIds` muss in beiden Versionen auf hochgeladene und serverseitig geprüfte Bildversionen desselben Auftrags zeigen.

`draft_ready` ohne Text oder mindestens ein Foto wird serverseitig zu `needs_input`. Ein leeres Fotoergebnis darf nicht als Graph-Zugriffsfehler kaschiert werden. n8n soll bei leerem, vollständig erreichbarem Bilderordner `needs_input` mit `missingFields: ["photos"]` melden. Bei Graph 401/403, Timeout oder anderen Verbindungsfehlern Callback mit `status: "failed"` und einem der erlaubten Codes `ONEDRIVE_ACCESS_DENIED`, `ONEDRIVE_TIMEOUT`, `ONEDRIVE_FOLDER_MISSING`, `REGISTRATION_UNREADABLE`, `OCR_FAILED`, `PROCESSING_TIMEOUT` liefern. Unbekannte Fehlercodes werden als allgemeiner Verarbeitungsfehler gespeichert.

Beispiel für ein technisches Ergebnis:

```json
{
  "schemaVersion": 1,
  "contractVersion": 2,
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

## Historischer WAW-Inseratsstil v2 und n8n-Node-Änderungen

Im Repository liegt kein n8n-Workflow-Export. Die Live-Workflow-Nodes wurden nicht geändert. Dieser Abschnitt bewahrt den früheren V2-Vertrag. Für neue Daten ist der V3-Abschnitt am Dokumentanfang maßgeblich. `schemaVersion` bleibt 1.

### Optionale Felder in der Einkaufs-/Fahrzeugakte

Das neue optionale Feld `vehicles.listing_details` wird in Fahrzeug-Neuanlage, Fahrzeugbearbeitung und beim Ankauf eines neu erfassten Fahrzeugs verwendet. Zahlen haben feste Einheiten und werden nicht umgerechnet:

| JSON-Feld | Einheit / Bedeutung |
| --- | --- |
| `enginePowerKw` | kW |
| `transmission`, `emissionClass`, `cab`, `retarder`, `hydraulics` | bestätigte technische Angaben |
| `axleFormula`, `frontSuspension`, `rearSuspension` | bestätigte Fahrwerks-/Achsdaten |
| `grossVehicleWeightKg`, `curbWeightKg`, `payloadKg` | kg; Nutzlast wird nicht berechnet |
| `wheelbaseMm` | mm |
| `huUntil`, `spUntil` | Gültigkeitsmonat `YYYY-MM` |
| `bodyManufacturer`, `bodyType`, `bodyYear` | Aufbauhersteller/-typ/-jahr |
| `mixerNominalVolumeM3`, `mixerDrive`, `waterTankLiters`, `bodyControls` | explizite Mischerangaben |
| `includedAccessories`, `equipment` | ausdrücklich bestätigter Text |
| `vehicleCondition`, `bodyCondition`, `knownDamages` | Zustand und bekannte Schäden |
| `maintenanceHistory`, `repairHistory` | dokumentierte Wartungen/Reparaturen |
| `vehicleLocation`, `availabilityConfirmed` | Standort wird nur übertragen, wenn Verfügbarkeit ausdrücklich bestätigt ist |

Alle Eingaben sind optional. Kilometrierung bleibt im vorhandenen Feld `vehicles.mileage`. Erstzulassung bleibt `vehicles.first_registration`, Baujahr bleibt `vehicles.construction_year`; sie werden nie miteinander gleichgesetzt. Bekannte Schäden werden im eigenen Inseratsfeld `knownDamages` gepflegt. Interne `notes` und `damage_notes` werden in v2 nicht übertragen.

Im Payload sind `enginePowerKw`, Gewichte, Radstand, Nennvolumen, Wassertank, `bodyYear` und `constructionYear` JSON-Zahlen oder `null`. Alle übrigen Detailfelder sind Strings oder `null`; `availabilityConfirmed` ist boolean. `vehicleLocation` wird bei `availabilityConfirmed: false` serverseitig als `null` ausgegeben. Erstzulassung ist ein ISO-Datum oder `null`.

### V2 OCR-Vorschlagsvertrag

V2 erlaubt nur diese Schlüssel in `extractedSuggestions`: `manufacturer`, `model`, `vin`, `firstRegistration` (`YYYY-MM-DD`), `constructionYear` (Ganzzahl), `enginePowerKw`, `transmission`, `emissionClass`, `axleFormula`, `frontSuspension`, `rearSuspension`, `grossVehicleWeightKg`, `curbWeightKg`, `payloadKg`, `wheelbaseMm`, `huUntil`/`spUntil` (`YYYY-MM`) und `color`.

Nicht aus OCR vorschlagen: Kilometerstand, Halter/Adresse/Personendaten, Geburtsdatum, Ausweisnummer/MRZ, Ausstattung, Schäden/Zustand, Aufbauhersteller, Aufbaujahr, Nennvolumen, Wasserinhalt, Verfügbarkeit. Diese Angaben dürfen nur als bestätigte Softwaredaten aus `confirmedVehicleData` kommen. Der Typ/Variante aus dem Schein darf nicht ungeprüft als `model` ausgegeben werden. Die Software verwirft unbekannte Felder, validiert Formate und berechnet Konflikte selbst. Eine Übernahme schreibt nur explizit ausgewählte und serverseitig gespeicherte Vorschläge in Fahrzeugfelder; sie überschreibt nicht still und erhöht die Entwurfsrevision.

### Redaktionelle Vorlage

Die Vorlage wird zentral in `lib/purchases/purchase-listing-contract.ts` erzeugt. Der Titel beginnt mit Hersteller und Modell. Je nach Fahrzeugart werden bestätigte Merkmale angefügt; maximal zwei Trennzeichen ` | `. Für Betonmischer sind das Achsformel sowie Aufbauhersteller/-typ und Nennvolumen. Bei Sattelzugmaschinen kommen Fahrerhaus, Retarder oder Hydraulik hinzu. Keine FIN, Einkaufs-/Verkaufsnummer, Preis, Telefonnummer oder Werbefloskel im Titel.

Beschreibung ist Klartext ohne HTML, Markdown-Tabelle, dekorative Linie oder Emoji. Abschnitte werden nur ausgegeben, wenn sie Daten enthalten: `FAHRZEUGDATEN`, `BETONMISCHERAUFBAU` bzw. `AUFBAU`, `AUSSTATTUNG`, `ZUSTAND UND HISTORIE`, `BESICHTIGUNG UND KONTAKT`. Stichpunkte haben das Format `• Bezeichnung: Wert`. Es gibt keine automatisch generierten Kontaktangaben oder Rechtsklauseln. WAW prüft zusätzlich den Callback auf grundlegende Titel-/Textformatregeln; unbelegte Inhalte kann die Software fachlich nicht selbst verifizieren und sie bleiben redaktionell zu kontrollieren.

### Betroffene n8n-Nodes

**1. „Auftrag pruefen“** — direkt im Webhook-Body arbeiten; keine Preis-, Käufer- oder Notizdaten ergänzen. Beispiel-Code-Node (Input ist das Webhook-Objekt):

```js
const body = $json.body ?? $json;
const version = body.contractVersion ?? 1;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (body.schemaVersion !== 1 || ![1, 2, 3].includes(version) || body.event !== 'purchase.listing.prepare' ||
    !uuid.test(body.jobId) || !uuid.test(body.purchaseId) || !uuid.test(body.vehicleId) ||
    !/^[a-f0-9]{64}$/i.test(body.sourceRevision) || !uuid.test(body.dispatchToken)) {
  throw new Error('INVALID_LISTING_REQUEST');
}
if (version === 2 && body.templateVersion !== 'waw-mobile-listing-v2') throw new Error('INVALID_TEMPLATE_VERSION');
if (version === 3 && body.templateVersion !== 'waw-mobile-listing-v3') throw new Error('INVALID_TEMPLATE_VERSION');
return [{ json: { ...body, contractVersion: version } }];
```

Der Webhook antwortet zeitnah mit HTTP 202, `status: accepted`, allen Identitäten und `contractVersion`. Für v1, v2 und v3 muss die jeweilige Versionsnummer mit dem Auftrag übereinstimmen; WAW prüft sie.

**2. „OCR Anfrage bauen“** — OCR auf Fahrzeugtechnik beschränken. Der OCR-Auftrag soll ausdrücklich nur die oben freigegebenen technischen Felder anfordern. Keine Halter-, Anschrift-, Personen-, Geburts-, Dokumentnummer- oder MRZ-Felder zurückgeben lassen. `Kilometerstand`, Fahrzeugzustand, Ausstattung und Aufbauangaben nicht aus dem Fahrzeugschein ableiten. Erstzulassung nur nach Datum und Baujahr nur dann, wenn das Dokument ein getrenntes Baujahr ausdrücklich ausweist.

**3. „OCR Vorschlaege pruefen“** — Vorschläge whitelisten und strukturieren, bevor sie gespeichert oder für den Callback verwendet werden. Vollständiger Code-Kern für den Code-Node; `ocr` ist durch den tatsächlichen OCR-Node-Ausgang zu ersetzen:

```js
const input = $json;
const ocr = input.ocrResult ?? input;
const allowed = new Set(['manufacturer','model','vin','firstRegistration','constructionYear','enginePowerKw','transmission','emissionClass','axleFormula','frontSuspension','rearSuspension','grossVehicleWeightKg','curbWeightKg','payloadKg','wheelbaseMm','huUntil','spUntil','color']);
const numeric = new Set(['constructionYear','enginePowerKw','grossVehicleWeightKg','curbWeightKg','payloadKg','wheelbaseMm']);
const out = {};
for (const [key, value] of Object.entries(ocr.extractedSuggestions ?? ocr)) {
  if (!allowed.has(key)) continue;
  if (numeric.has(key) && Number.isFinite(value) && value >= 0) out[key] = value;
  else if (!numeric.has(key) && typeof value === 'string' && value.trim() && value.length <= 500) out[key] = value.trim();
}
if (out.firstRegistration && !/^\d{4}-\d{2}-\d{2}$/.test(out.firstRegistration)) delete out.firstRegistration;
if (out.huUntil && !/^\d{4}-(0[1-9]|1[0-2])$/.test(out.huUntil)) delete out.huUntil;
if (out.spUntil && !/^\d{4}-(0[1-9]|1[0-2])$/.test(out.spUntil)) delete out.spUntil;
if (out.constructionYear && (!Number.isInteger(out.constructionYear) || out.constructionYear < 1900 || out.constructionYear > 2100)) delete out.constructionYear;
return [{ json: { ...input, extractedSuggestions: out } }];
```

Die Software validiert dieselben Werte noch einmal. Der Code-Node darf Roh-OCR nicht als ungeprüften Freitext in `description` einfügen.

**4. „Textanfrage bauen“** — den vorhandenen redaktionell aktualisierten Prompt behalten und diese Regeln ergänzen: `textTemplate` und `confirmedVehicleData` sind die einzigen Quellen für den öffentlichen Titel/Beschreibungstext; `extractedSuggestions` bleiben separat und unbestätigt. Nichts aus OCR-Vorschlägen als Tatsache in den Inseratstext übernehmen. Nur bestätigte `listingDetails` aufnehmen. Template-Abschnitte, Klartext, einzelne Stichpunkte und leere Abschnitte ohne Platzhalter beibehalten. Keine erfundenen Angaben, Rechtsklauseln, Kontaktdaten oder Werbefloskeln. Ausgabeformat bleibt `{ title, description, missingFields }`.

**5. „Textentwurf pruefen“** — bestehende Antwortfelder beibehalten. Prüfen: `title` und `description` sind Strings innerhalb der Größenlimits; Titel beginnt mit bestätigtem Hersteller/Modell; höchstens zwei ` | `; kein Preis, FIN, Fahrzeug-/Verkaufs-ID oder Telefon im Titel; Beschreibung enthält keine HTML-Tags, Tabellen, dekorativen Trennlinien, Emojis oder offene Prüfanweisungen. Unbekannte `missingFields` verwerfen. V2 kennt zusätzlich `location`, `vehicleIdentity`, `technicalData`, `bodyDetails`, `maintenanceHistory`; V3 kennt zusätzlich die im V3-Abschnitt genannten Punkte. V1 behält bisherige Werte.

**6. Ergebnis/Callback (historischer V2-Vertrag)** — OCR-Vorschläge separat als `extractedSuggestions` übermitteln; keine Zusatzfelder in das öffentliche Textobjekt schreiben. Callback führt `contractVersion: 2` neben `schemaVersion: 1`, unveränderte job-/purchase-/vehicle-IDs, `sourceRevision`, `dispatchToken`, `status`, Text und Bild-IDs. WAW ignoriert unbekannte Vorschlagsfelder und lehnt falsche Version/Identität ab. Altjobs mit Version 1 behalten die alte Form. Für neue Vertragsanpassungen ist V3 im Abschnitt oben maßgeblich.

### Sichere Umstellung der historischen V2-Erweiterung

Die folgenden Schritte dokumentieren den früheren V2-Rollout. Für das jetzt implementierte V3 gilt die verbindliche Reihenfolge am Ende dieses Dokuments.

1. Neue Supabase-Migration `20261106110000_add_vehicle_listing_details_and_confirmations.sql` anwenden.
2. Zuerst n8n-Nodes so aktualisieren, dass sie `contractVersion` 1 (fehlend) und 2 verarbeiten und v2-Callbacks korrekt senden. Bei diesem Schritt darf der Node keine alten V1-Felder aus bereits laufenden Executions entfernen; Identitäten müssen aus dem eingehenden Auftrag unverändert weitergereicht werden.
3. Einen kontrollierten n8n-Test mit synthetischen Eingabedaten durchführen, ohne WAW-Produktivauftrag/Callback, wenn dafür eine getrennte n8n-Teststrecke verfügbar ist.
4. WAW-Anwendung deployen. Ab dann startet WAW nur neue Jobs als Vertrag v2. Vorhandene V1-Jobs/Callbacks bleiben unterstützt.
5. Danach einen ausdrücklich ausgewählten Testankauf über die UI prüfen. Keine automatische Inseratsveröffentlichung ist Teil dieses Ablaufs.

## Vercel-Konfiguration

Serverseitige Variablen, ohne `NEXT_PUBLIC_`:

| Variable | Zweck |
| --- | --- |
| `N8N_VEHICLE_LISTING_WEBHOOK_URL` | HTTPS-Webhook nur für Inseratsvorbereitung; nicht die Ordneranlage-URL verwenden. |
| `N8N_VEHICLE_LISTING_TOKEN` | Zufälliger Bearer-Token, identisch in Vercel und n8n Credential; nicht im Browser. |
| `N8N_VEHICLE_LISTING_CALLBACK_BASE_URL` | Kanonischer HTTPS-Origin der WAW-Vercel-Anwendung, ohne Pfad oder abschließende Route. |
| `N8N_VEHICLE_LISTING_CONTRACT_VERSION` | Rollout-Schalter. Erst nach Migration und kompatibler n8n-Umstellung exakt auf `3` setzen. Fehlt er oder ist er nicht `3`, startet WAW keine neuen Inseratsaufträge. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bereits verwendeter serverseitiger Schlüssel; bleibt ausschließlich in Vercel. |

Der Konfigurationscheck prüft genau diese drei neuen n8n-Werte: sie dürfen nicht leer sein, Webhook-URL und Callback-Origin müssen HTTPS verwenden und der Callback-Origin darf keinen Pfad außer `/` enthalten. Bei einer unvollständigen Konfiguration nennt die Oberfläche die betroffenen Variablennamen, aber keine Werte.

Fehler unterscheidet WAW wie folgt:

- Konfigurationsfehler werden vor dem n8n-Aufruf gemeldet.
- HTTP-Fehler werden mit Statuscode angezeigt. `404` weist meist auf eine falsche oder nicht aktive Webhook-URL hin; `401`/`403` auf eine Authentifizierungsablehnung.
- HTTP `202` muss ein JSON-Objekt mit `status: "accepted"` und exakt passenden `jobId`, `purchaseId`, `vehicleId`, `sourceRevision` und `dispatchToken` liefern.
- `INVALID_N8N_ACK` bei HTTP `202`: n8n hat geantwortet, aber die Annahmeantwort entspricht nicht dem Vertrag.
- Bei Timeout oder Verbindungsabbruch kann n8n den Auftrag bereits angenommen haben; die stabile Job-ID und Lease bleiben erhalten.

Die Verkaufsakte kennzeichnet eine gespeicherte Fehlermeldung zusätzlich als „Letzter gespeicherter Auftragsfehler“. Sie kann von einem früheren Versuch stammen und ist von der Meldung des aktuellen Klicks zu unterscheiden.

Der Startaufruf wartet höchstens 8 Sekunden auf n8n-Annahme; OCR und Generierung laufen danach in n8n. Server Actions auf der Einkaufsseite und die registrierungs-/bildprüfenden Routen setzen `maxDuration = 30`, im Rahmen der derzeit dokumentierten Vercel Hobby-Funktionsobergrenze. Das ist nur die Laufzeit des kurzen Start-/Dateiprüfaufrufs und keine synchrone OCR-Verarbeitung.

## Deployment-Reihenfolge

1. In Supabase zuerst anhand des Migrationsstands prüfen, welche bestehenden Grundlagen (`20261106100000` und `20261106110000`) bereits angewendet wurden. Nur noch nicht angewendete Migrationen in ihrer Reihenfolge ausführen. Die neue Migration `20261106120000_add_purchase_listing_information_v3.sql` einmal danach anwenden. Sie erweitert den Job-Constraint auf Version 3, erlaubt die vorhandene sichere OCR-Bestätigungsfunktion für V3 und legt das row-locked Speichern des Formulars an. Keine Daten- oder OneDrive-Massenverarbeitung wird gestartet.
2. n8n-Workflow rückwärtskompatibel auf v1/v2/v3 erweitern. V3-Annahme und Callback mit synthetischen Daten in einer getrennten Teststrecke prüfen. Das Repository enthält keinen Workflow-Export; n8n wurde hier nicht geändert.
3. WAW-Code deployen, während `N8N_VEHICLE_LISTING_CONTRACT_VERSION` fehlt. In diesem Zustand lassen sich Angaben speichern, aber neue Aufträge bleiben gesperrt.
4. Nach Bestätigung des aktiven n8n-V3-Workflows die serverseitige Vercel-Variable `N8N_VEHICLE_LISTING_CONTRACT_VERSION=3` setzen und neu deployen. Erst danach einen ausdrücklich ausgewählten Testankauf verwenden. Es gibt weiterhin keine Veröffentlichung bei mobile.de.

## Lokale Verifikation und offene Live-Prüfung

Lokale Unit-/Contract-Tests prüfen stabile Quellrevision, Vorlagenregeln, unbekannte gegenüber ausdrücklichem Nein, fehlende und widersprüchliche Angaben, F.1/F.2 und Einheiten, V3-Allowlist, nicht passende Mischerangaben, Annahmeantwort, Callback-Identitäten/Token/Bildreferenzen, Status bei fehlenden Fotos, Bild-MIME/Lesbarkeit und Lease-Ablauf.

Nicht gegen Live-Vercel, Supabase Storage, OneDrive/Graph oder n8n ausgeführt: ein vollständiger End-to-End-Durchlauf und der tatsächlich aktive n8n-Vertrag. Vor Live-Test müssen nur ausstehende Migrationen, die rückwärtskompatible n8n-V3-Änderung und danach die Rollout-Variable eingerichtet sein.
