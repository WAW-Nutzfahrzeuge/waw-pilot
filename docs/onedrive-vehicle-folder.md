# OneDrive-Fahrzeugakte für Einkäufe

## Implementierter Ablauf

Nach dem erfolgreichen Speichern des Ankaufs legt WAW Pilot einen Datensatz in `purchase_vehicle_folder_jobs` an und ruft den n8n-Webhook serverseitig auf. Das Speichern des Ankaufs bleibt erfolgreich, selbst wenn n8n oder OneDrive nicht erreichbar ist. Der Fehler bleibt an der Einkaufsakte sichtbar und kann dort mit **Erneut versuchen** wiederaufgenommen werden.

Das aktuelle Datenmodell verbindet einen `purchase_cases`-Datensatz mit genau einem `vehicles`-Datensatz über `purchase_cases.vehicle_id`. Es gibt bereits eine firmenweit eindeutige `purchase_number` im Format `AK-JJJJ-NNNNNN` (`next_purchase_number` und Unique Index in den bestehenden Migrationen). Der menschenlesbare Name wird einmal beim ersten Auftrag gespeichert, z. B. `AK-2026-000421_Mercedes-Benz-Actros-3241_Betonmischer`. Bei fehlender Einkaufsnummer wird die vollständige interne UUID des Einkaufs verwendet. Der gespeicherte Name, die ursprüngliche Fahrzeug-ID und die Ziel-IDs werden bei Wiederholungen wiederverwendet.

Die Jobzeile ist über `(company_id, purchase_case_id)` eindeutig. RLS verweigert Browserrollen den Zugriff; nur der serverseitige Service-Role-Client kann lesen und schreiben. Ein atomarer Claim mit Lease-Token verhindert parallele Aufrufe. Der Claim läuft nach 120 Sekunden aus, während ein einzelner HTTP-Aufruf spätestens nach 25 Sekunden abbricht. Eine verspätete Antwort kann einen inzwischen neu übernommenen Auftrag wegen des Lease-Tokens nicht überschreiben.

## Server-Konfiguration

Diese Variablen ausschließlich serverseitig in Vercel eintragen (nicht mit `NEXT_PUBLIC_`):

| Variable | Wert / Zweck |
| --- | --- |
| `N8N_VEHICLE_FOLDER_WEBHOOK_URL` | Die von n8n angezeigte produktive Webhook-URL. Keine URL wird hier vorweggenommen. Muss HTTPS sein. |
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

Die bestehenden Schritte zur Fahrzeugordneranlage sowie zu `Fahrzeugschein` und `Fahrzeugbilder` bleiben bestehen. Der Zielordner wird innerhalb der übermittelten `drive_id` unter `root_folder_id` angelegt. Für den Ordner und beide Unterordner bleibt `conflictBehavior: fail`; ein Namenskonflikt wird gezielt behandelt, anschließend wird der bestehende Ordner gelesen. Andere Graph-Fehler dürfen nicht als Erfolg weiterlaufen. Bei Teilfehlern dürfen bereits erstellte Ordner bestehen bleiben: ein Wiederholungsrequest verwendet dieselbe Event-ID, denselben Namen und dieselben Ziel-IDs und liest bestehende Ordner nach Namenskonflikt wieder ein.

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

In den bestehenden Microsoft-Graph-Nodes die Eingaben auf `{{$json.drive_id}}`, `{{$json.root_folder_id}}`, `{{$json.folder_name}}` und die aus den vorherigen Nodes gelesenen tatsächlichen Ordner-IDs umstellen. Keine neue ID aus dem Ordnernamen ableiten. Die finale Antwort muss die obigen Werte aus diesem validierten Item unverändert zurückgeben.

### Erfolgsantwort

Nur nach erfolgreicher Validierung aller drei Ordner mit HTTP 200 antworten. Das JSON muss direkt dieses Objekt sein:

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
  "registration_folder_id": "<Graph-ID Unterordner Fahrzeugschein>",
  "images_folder_id": "<Graph-ID Unterordner Fahrzeugbilder>"
}
```

IDs und Identitätsfelder müssen genau aus dem Auftrag stammen. `folder_url` muss ein HTTPS-OneDrive-/SharePoint-Link sein. Ein HTTP 200 mit fehlenden Feldern oder abweichender ID wird von WAW Pilot als Fehler behandelt. Bei Fehlern einen passenden HTTP-Fehlerstatus (4xx/5xx) und ein strukturiertes, nicht personenbezogenes Objekt zurückgeben, z. B. `{"status":"error","error_code":"GRAPH_FOLDER_CREATE_FAILED"}`. WAW Pilot protokolliert keine Secret-Header und keine vollständige n8n-Antwort.

## Wiederholungen und Betrieb

- Erfolgreicher Auftrag: UI zeigt **OneDrive-Ordner öffnen**. Der gespeicherte Link erzeugt keine öffentliche Freigabe; Microsoft-Berechtigungen bleiben erforderlich.
- Timeout oder n8n-Fehler: Auftrag wird `error`, Einkaufsakte bleibt erhalten. **Erneut versuchen** sendet dieselbe `event_id`, `folder_name`, `drive_id` und `root_folder_id`.
- Doppel-/Parallelklick: Datenbank-Unique-Constraint und atomarer Claim erlauben nur einen aktiven Aufruf.
- Es ist kein Scheduler konfiguriert. Ein fehlgeschlagener Auftrag wird aktuell durch den Button in der Einkaufsakte erneut gestartet. Automatische Wiederholungen erfordern später einen Scheduler/Cron, der denselben dauerhaften Job atomar claimt.
- Bestehende Einkäufe werden durch die Migration nicht automatisch an n8n gesendet. In ihrer Akte kann **OneDrive-Ordner erstellen** manuell gestartet werden.

## Migration und Deployment

Neue Migration: `supabase/migrations/20261104110000_add_purchase_vehicle_folder_jobs.sql`.

1. Migration in Supabase ausführen.
2. In n8n das Header-Auth Credential, den Webhook und den Respond-Node gemäß Vertrag einrichten. Die bestehende Graph-Ordnerlogik beibehalten und auf den Request umstellen.
3. Den Workflow zunächst über die n8n-Test-URL mit synthetischen UUIDs testen. Keine produktiven Ordner-IDs verändern.
4. Den Workflow für den Produktiv-Webhook aktivieren und die von n8n angezeigte Produktions-URL in Vercel eintragen. Die serverseitigen Ordner-IDs und dasselbe Secret in Vercel setzen.
5. WAW Pilot deployen.
6. Mit einem ausdrücklich dafür vorgesehenen neuen Testankauf den ersten echten OneDrive-Aufruf kontrolliert prüfen.

Die Migration und das Deployment wurden von diesem Implementierungsschritt nicht ausgeführt.
