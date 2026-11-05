# OneDrive-Fahrzeugakte für Einkäufe

## Implementierter Ablauf

Nach dem erfolgreichen Speichern des Ankaufs legt WAW Pilot einen Datensatz in `purchase_vehicle_folder_jobs` an und ruft den n8n-Webhook serverseitig auf. Das Speichern des Ankaufs bleibt erfolgreich, selbst wenn n8n oder OneDrive nicht erreichbar ist. Der Fehler bleibt an der Einkaufsakte sichtbar und kann dort mit **Erneut versuchen** wiederaufgenommen werden.

Das aktuelle Datenmodell verbindet einen `purchase_cases`-Datensatz mit genau einem `vehicles`-Datensatz über `purchase_cases.vehicle_id`. Es gibt bereits eine firmenweit eindeutige `purchase_number` im Format `AK-JJJJ-NNNNNN` (`next_purchase_number` und Unique Index in den bestehenden Migrationen). Der menschenlesbare Name wird einmal beim ersten Auftrag gespeichert, z. B. `AK-2026-000421_Mercedes-Benz-Actros-3241_Betonmischer`. Bei fehlender Einkaufsnummer wird die vollständige interne UUID des Einkaufs verwendet. Der gespeicherte Name, die ursprüngliche Fahrzeug-ID und die Ziel-IDs werden bei Wiederholungen wiederverwendet.

Der Fahrzeugschein ist beim Einkauf optional. Wenn hochgeladen, wird er wie bisher im privaten Supabase-Bucket `documents` unter `purchases/{purchaseCaseId}/{uuidFilename}` gespeichert. Der Datensatz in `public.documents` enthält `document_type = 'vehicle_registration'`, `purchase_case_id`, `vehicle_id`, `company_id` und den `file_path`. Die Einkaufsakte zeigt diese bestehende Datei an; sie wird weder in OneDrive kopiert noch von der Ordneranlage vorausgesetzt. Der bestehende geschützte Download `/api/documents/{documentId}/file` prüft die Company und erstellt serverseitig eine 60 Sekunden gültige Storage-URL, über die die Datei von der App geladen wird.

Die Jobzeile ist über `(company_id, purchase_case_id)` eindeutig. RLS verweigert Browserrollen den Zugriff; nur der serverseitige Service-Role-Client kann lesen und schreiben. Ein atomarer Claim mit Lease-Token verhindert parallele Aufrufe. Der Claim läuft nach 120 Sekunden aus, während ein einzelner HTTP-Aufruf spätestens nach 25 Sekunden abbricht. Eine verspätete Antwort kann einen inzwischen neu übernommenen Auftrag wegen des Lease-Tokens nicht überschreiben.

## Server-Konfiguration

Diese Variablen ausschließlich serverseitig in Vercel eintragen (nicht mit `NEXT_PUBLIC_`):

| Variable | Wert / Zweck |
| --- | --- |
| `N8N_VEHICLE_FOLDER_WEBHOOK_URL` | Die von n8n angezeigte produktive Webhook-URL. Keine URL wird hier vorweggenommen. Muss HTTPS sein. |
| `N8N_VEHICLE_FOLDER_CHECK_WEBHOOK_URL` | Zusätzlicher HTTPS-Webhook zum Prüfen eines gespeicherten OneDrive-Ordners per Graph-ID. |
| `N8N_VEHICLE_FOLDER_WEBHOOK_SECRET` | Zufälliges gemeinsames Geheimnis. In Vercel und als n8n Header Auth Credential eintragen. Nicht in Workflow-JSON speichern. |
| `WAW_ONEDRIVE_DRIVE_ID` | `b!oe6OAdKvDESIihsCSuN1eLMsn4MS_nVHkf65zrbkB85Af_g1IqpIQYbNjdTav2fu` |
| `WAW_ONEDRIVE_ROOT_FOLDER_ID` | `016EL72IEM7FGCEGP54VD3ES72VUX5VJPO` |
| `SUPABASE_SERVICE_ROLE_KEY` | Bereits für serverseitige Automatisierung verwendeter Supabase Service Role Key. Ausschließlich serverseitig. |

Nach Eintragen oder Ändern der Variablen Vercel neu deployen. Keine Microsoft-Zugangsdaten kommen nach WAW Pilot; Microsoft-Verbindung und Graph-Zugriff bleiben in n8n.

## n8n-Webhook-Vertrag

Das Repository enthält keinen Export des Workflows **WAW – Fahrzeugordner anlegen** und es besteht aus dieser Umgebung kein n8n-Zugriff. Der bestehende Workflow muss daher in n8n manuell angepasst und aktiviert werden. Die Software sendet nach Deployment keinen Request, solange der Workflow bzw. die Variablen nicht eingerichtet sind.

### Eingang

- Node: Webhook Trigger
- Methode: `POST`
- Authentication: `Header Auth` Credential mit Headername `X-WAW-Webhook-Secret`; Wert entspricht `N8N_VEHICLE_FOLDER_WEBHOOK_SECRET`.
- Response: über einen `Respond to Webhook`-Node zurückgeben, nicht sofort im Webhook-Node antworten.
- Body Content-Type: `application/json`

Beispielbody (nur synthetische Beispielwerte):

```json
{
  "event_id": "9c4e8167-0b0a-44f6-8ccf-0a7b88ae9354",
  "event": "purchase.folder.ensure",
  "purchase_id": "3b235914-44a4-40b8-8d44-b1a8de65c087",
  "vehicle_id": "2a1d96aa-4054-44f4-94d9-c5c8123cfa34",
  "folder_name": "AK-2026-000421_Mercedes-Benz-Actros-3241_Betonmischer",
  "drive_id": "<aus Request>",
  "root_folder_id": "<aus Request>"
}
```

`event_id` ist die stabile Job-ID und bleibt bei Wiederholungen gleich. `purchase_id` und `vehicle_id` sind echte interne UUIDs, keine Nummern wie `TEST-EK-2026-00421`. Die Eingabevalidierung darf nicht verlangen, dass die vollständige UUID Bestandteil von `folder_name` ist. Sie soll UUID-Format, `event`, nichtleere sichere Ordnernamen, `drive_id` und `root_folder_id` prüfen.

### Vorhandene Graph-Schritte erhalten

Der Zielordner wird innerhalb der übermittelten `drive_id` unter `root_folder_id` angelegt. Darunter wird künftig nur noch der Unterordner `Fahrzeugbilder` angelegt oder wiederverwendet. Für den Fahrzeughauptordner und `Fahrzeugbilder` bleibt `conflictBehavior: fail`; ein Namenskonflikt wird gezielt behandelt, anschließend wird der bestehende Ordner gelesen. Andere Graph-Fehler dürfen nicht als Erfolg weiterlaufen. Bei Teilfehlern dürfen bereits erstellte Ordner bestehen bleiben: ein Wiederholungsrequest verwendet dieselbe Event-ID, denselben Namen und dieselben Ziel-IDs und liest bestehende Ordner nach Namenskonflikt wieder ein. Bestehende OneDrive-Unterordner `Fahrzeugschein` und deren Dateien werden nicht automatisch gelöscht.

Die bisherigen Testdaten aus dem `Testdaten`-Node dürfen nicht mehr Produktionsdaten überschreiben. Im produktiven Pfad die Requestdaten aus dem Webhook verwenden. Ein Webhook-Test kann weiterhin synthetische Requestdaten verwenden.

Als Eingangsadapter kann ein **Code**-Node direkt hinter dem Webhook die Struktur prüfen und die Felder für die bestehenden Graph-Nodes vereinheitlichen. Beispiel für „Run Once for Each Item“:

```javascript
const input = $json.body ?? $json;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeName = typeof input.folder_name === 'string'
  && input.folder_name.length > 0
  && input.folder_name.length <= 220
  && !/[\\/:*?"<>|\u0000-\u001f]/.test(input.folder_name)
  && input.folder_name !== '.'
  && input.folder_name !== '..';

if (
  input.event !== 'purchase.folder.ensure' ||
  !uuid.test(input.event_id ?? '') ||
  !uuid.test(input.purchase_id ?? '') ||
  !uuid.test(input.vehicle_id ?? '') ||
  !safeName ||
  typeof input.drive_id !== 'string' || !input.drive_id ||
  typeof input.root_folder_id !== 'string' || !input.root_folder_id
) {
  throw new Error('Invalid purchase folder request');
}

return { json: {
  event_id: input.event_id,
  event: input.event,
  purchase_id: input.purchase_id,
  vehicle_id: input.vehicle_id,
  folder_name: input.folder_name,
  drive_id: input.drive_id,
  root_folder_id: input.root_folder_id,
} };
```

Im bestehenden Microsoft-Graph-Ablauf den Schritt für die Anlage/Wiederverwendung des Unterordners `Fahrzeugschein` entfernen. Nur `Fahrzeugbilder` anlegen oder wiederverwenden. Die Eingaben auf `{{$json.drive_id}}`, `{{$json.root_folder_id}}`, `{{$json.folder_name}}` und die aus den vorherigen Nodes gelesenen tatsächlichen Ordner-IDs umstellen. Keine neue ID aus dem Ordnernamen ableiten. Die finale Antwort muss die obigen Identitätswerte aus diesem validierten Item unverändert zurückgeben.

### Erfolgsantwort

Nur nach erfolgreicher Validierung des Fahrzeughauptordners und des Bilder-Unterordners mit HTTP 200 antworten. Das JSON muss direkt dieses Objekt sein:

```json
{
  "status": "ready",
  "event_id": "<unverändert aus Request>",
  "purchase_id": "<unverändert aus Request>",
  "vehicle_id": "<unverändert aus Request>",
  "folder_name": "<unverändert aus Request>",
  "drive_id": "<unverändert aus Request>",
  "folder_id": "<Graph-ID Fahrzeugordner>",
  "folder_url": "https://<Microsoft-OneDrive- oder SharePoint-Link>",
  "images_folder_id": "<Graph-ID Unterordner Fahrzeugbilder>"
}
```

`registration_folder_id` ist für neue Antworten nicht mehr erforderlich. Eine ältere Workflow-Antwort, die dieses Feld weiterhin mit einer gültigen Graph-ID enthält, wird aus Kompatibilitätsgründen akzeptiert. Ein fehlendes oder `null`-Feld ist ebenfalls gültig. Ist es vorhanden und nicht leer, wird der Wert gespeichert. Vorhandene Datenbankzuordnungen bleiben erhalten, wenn eine neue Antwort das Feld auslässt. Alle übrigen Identitätswerte, IDs und `folder_url` müssen weiterhin vollständig passen; `folder_url` muss ein HTTPS-OneDrive-/SharePoint-Link sein. Bei Fehlern einen passenden HTTP-Fehlerstatus (4xx/5xx) und ein strukturiertes, nicht personenbezogenes Objekt zurückgeben, z. B. `{"status":"error","error_code":"GRAPH_FOLDER_CREATE_FAILED"}`. WAW Pilot protokolliert keine Secret-Header und keine vollständige n8n-Antwort.

### Spätere Vorbereitung eines Inserats

Der spätere Schritt **Inserat vorbereiten** soll voraussetzen, dass ein vorhandener Fahrzeugschein-Datensatz (`vehicle_registration`) in der zugehörigen Supabase-Einkaufs-/Fahrzeugakte abrufbar ist und mindestens ein geeignetes Fahrzeugfoto im OneDrive-Unterordner `Fahrzeugbilder` vorhanden ist. Das sind keine Voraussetzungen für Einkaufsspeicherung oder OneDrive-Ordneranlage. OCR, KI-Auswertung, Dateiübertragung und mobile.de-Veröffentlichung sind hier nicht implementiert.

Für eine spätere n8n-Verarbeitung des privaten Fahrzeugscheins kann die Anwendung eine kurzlebige signed URL ausstellen oder die Datei über einen authentifizierten serverseitigen Endpunkt bereitstellen. Es wird jetzt kein Transfer ergänzt. Der Supabase Service Role Key darf weder an den Browser noch an KI-Systeme weitergegeben werden.

## Wiederholungen und Betrieb

- **OneDrive-Ordner öffnen** öffnet nicht mehr direkt den gespeicherten Link. Der Browser öffnet im Klick zunächst einen leeren Tab, während der Server den Ordner über den Prüf-Webhook und Microsoft Graph anhand der gespeicherten `drive_id` und `folder_id` prüft. Bei Erfolg speichert WAW Pilot die aktuelle Graph-`webUrl` und navigiert den Tab dorthin. Ein umbenannter Ordner bleibt über seine ID erreichbar. Der gespeicherte Link erzeugt keine öffentliche Freigabe; Microsoft-Berechtigungen bleiben erforderlich. Der n8n-Antwortkörper wird direkt als JSON-Objekt gelesen; ein interner Respond-Node-Wrapper ist kein erwartetes API-Format.
- Liefert der Prüf-Webhook eindeutig `status: "missing"` / `ITEM_NOT_FOUND`, wird der Job `error` mit `FOLDER_NOT_FOUND`. Die Einkaufsakte zeigt **Der OneDrive-Ordner wurde gelöscht oder ist nicht mehr vorhanden.** und bietet **OneDrive-Ordner neu anlegen**. Beim bloßen Öffnen wird nichts neu angelegt.
- 401/403, Timeout, nicht erreichbarer Webhook, ungültige Antwort oder andere Graph-Fehler werden als Prüfproblem behandelt; WAW Pilot erhält den bisherigen Ordnerdatensatz und zeigt **Ordner konnte gerade nicht geprüft werden** mit **Ordner erneut prüfen**. Daraus folgt keine automatische Neuerstellung.
- Der Prüfaufruf an n8n hat ein 15-Sekunden-Limit, Supabase-Prüfrequests ein 8-Sekunden-Limit und die UI beendet die Ladeanzeige spätestens nach 45 Sekunden. Check-Leases laufen ab; eine neue atomare Prüfung kann abgelaufene Leases übernehmen. Eine noch gültige Lease wird nicht zurückgesetzt. Eine verspätete Antwort wird nur akzeptiert, wenn ihr Lease-Token noch aktuell und die Lease noch nicht abgelaufen ist.
- Die bestätigte Neuanlage verwendet den unveränderten `folder_name`, dieselben Drive-/Root-Ziele und weiterhin den vorhandenen atomaren Create-Claim. Der Auftrag erhält atomar eine neue `event_id`; Netzwerk-Wiederholungen behalten diese ID. Hauptordner und `Fahrzeugbilder` werden in n8n angelegt oder wiederverwendet, ohne vorhandene Dateien oder Ordner zu löschen. Zuvor gelöschte Fahrzeugbilder werden durch die Ordnerneuanlage nicht wiederhergestellt.
- Timeout oder n8n-Fehler bei der Ordneranlage: Auftrag wird `error`, Einkaufsakte bleibt erhalten. **Erneut versuchen** sendet innerhalb desselben logischen Anlageversuchs dieselbe `event_id`, `folder_name`, `drive_id` und `root_folder_id`. Nach einer explizit bestätigten Löschung erhält eine bewusste Neuanlage eine neue dauerhafte `event_id`; Wiederholungen dieses neuen Versuchs behalten sie bei.
- Doppel-/Parallelklick: Datenbank-Unique-Constraint und atomarer Claim erlauben nur einen aktiven Aufruf.
- Es ist kein Scheduler konfiguriert. Ein fehlgeschlagener Auftrag wird aktuell durch den Button in der Einkaufsakte erneut gestartet. Automatische Wiederholungen erfordern später einen Scheduler/Cron, der denselben dauerhaften Job atomar claimt.
- Bestehende Einkäufe werden durch die Migration nicht automatisch an n8n gesendet. In ihrer Akte kann **OneDrive-Ordner erstellen** manuell gestartet werden.

## Migration und Deployment

Die ursprüngliche Tabellenmigration bleibt unverändert: `supabase/migrations/20261104110000_add_purchase_vehicle_folder_jobs.sql`. Zusätzlich muss die additive Migration `supabase/migrations/20261104130000_make_purchase_registration_folder_optional.sql` ausgeführt werden. Sie lockert die Ready-Constraint, macht `registration_folder_id` optional und erhält bestehende Feldwerte sowie Zuordnungen.

Für die Ordnerprüfung und bestätigte Neuanlage kommt `supabase/migrations/20261104140000_add_purchase_vehicle_folder_inspection.sql` hinzu. Sie ergänzt den Check-Lease und die pro Neuanlage dauerhafte `folder_event_id`, ohne bestehende Folder-IDs, URLs oder Dateizuordnungen zu entfernen.

Die Migration `supabase/migrations/20261105100000_reject_expired_purchase_vehicle_folder_checks.sql` stellt zusätzlich sicher, dass eine verspätete Antwort eine bereits abgelaufene Lease nicht mehr abschließen kann.

1. Falls die ursprüngliche Jobtabellenmigration noch nicht angewendet wurde, zuerst `20261104110000_add_purchase_vehicle_folder_jobs.sql` ausführen. Danach `20261104130000_make_purchase_registration_folder_optional.sql`, `20261104140000_add_purchase_vehicle_folder_inspection.sql` und `20261105100000_reject_expired_purchase_vehicle_folder_checks.sql` in dieser Reihenfolge ausführen. Bereits angewendete Migrationen nicht erneut ausführen.
2. Im Vercel-Projekt `N8N_VEHICLE_FOLDER_CHECK_WEBHOOK_URL` als serverseitige Variable eintragen. Das vorhandene `N8N_VEHICLE_FOLDER_WEBHOOK_SECRET` wird unverändert als Header-Auth-Zugang für beide Webhooks verwendet.
3. Den zusätzlichen Prüf-Webhook unten im n8n-Workflow anlegen. Der bestehende `purchase.folder.ensure` Create-Vertrag und seine URL bleiben unverändert.
4. Mit synthetischen IDs prüfen, dann n8n aktivieren und WAW Pilot deployen.
5. Mit einem dafür vorgesehenen Testankauf kontrollieren, dass Prüfung und Öffnen funktionieren. Ein gelöschter Ordner darf erst nach explizitem Klick auf **OneDrive-Ordner neu anlegen** ersetzt werden.

### Zusätzlicher n8n-Prüf-Webhook

Die Software sendet serverseitig `POST` mit `Content-Type: application/json` und demselben Header `X-WAW-Webhook-Secret`. Die Microsoft-Zugangsdaten bleiben ausschließlich im n8n-Credential. Der Webhook muss den Request authentifizieren, danach Microsoft Graph mit der gespeicherten Drive- und Item-ID abfragen:

```http
GET /drives/{drive_id}/items/{folder_id}?$select=id,name,folder,webUrl
```

Der Ordnername wird absichtlich nicht zur Suche benutzt. Bei Graph-Erfolg muss `id` der angefragten `folder_id` entsprechen, `folder` vorhanden sein und `webUrl` die aktuelle HTTPS-URL sein. Den tatsächlichen Graph-Namen muss n8n nicht zurückgeben. Antwort mit HTTP 200 und:

```json
{
  "status": "found",
  "event_id": "<aus Request>",
  "purchase_id": "<aus Request>",
  "vehicle_id": "<aus Request>",
  "drive_id": "<aus Request>",
  "folder_id": "<aus Request>",
  "item_type": "folder",
  "folder_url": "https://<aktuelle-OneDrive-oder-SharePoint-webUrl>"
}
```

Nur Graph HTTP 404 mit `error.code = itemNotFound` (Groß-/Kleinschreibung gemäß Graph normalisieren) wird als fehlend interpretiert. n8n soll diesen Graph-Fehler in HTTP 200 mit der folgenden strukturierten Antwort abbilden:

```json
{
  "status": "missing",
  "error_code": "ITEM_NOT_FOUND",
  "event_id": "<aus Request>",
  "purchase_id": "<aus Request>",
  "vehicle_id": "<aus Request>",
  "drive_id": "<aus Request>",
  "folder_id": "<aus Request>"
}
```

Graph 401/403, Rate-Limits, 5xx, Timeout und sonstige Fehler dürfen nicht als `missing` ausgegeben werden. n8n soll hierfür einen Fehlerstatus (4xx/5xx) oder eine nicht passende strukturierte Fehlerantwort zurückgeben. WAW Pilot bewahrt in diesen Fällen die bisherige Zuordnung und zeigt die erneute Prüfung an. Dateizugriff auf Unterordner wird für diesen Check nicht benötigt.

In der n8n-UI ist ein separater Webhook-Trigger mit Header-Auth-Credential, ein Graph-Request-Node, ein Switch für Erfolg/`itemNotFound`/sonstige Fehler und ein `Respond to Webhook`-Node einzurichten. Die von n8n angezeigte Produktions-URL kommt in `N8N_VEHICLE_FOLDER_CHECK_WEBHOOK_URL`; sie ist hier nicht bekannt und wird nicht erfunden. Workflow-Export oder n8n-Livezugriff liegt nicht vor.

Die Migration, n8n-Änderung und das Deployment wurden von diesem Implementierungsschritt nicht ausgeführt.
