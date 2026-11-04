# ZUGFeRD-Cronbetrieb

Der Vercel-Cron-Eintrag für `/api/cron/zugferd-finalize` ist derzeit deaktiviert. Es ist bewusst kein Ersatz-Scheduler eingerichtet. Damit ist die automatische Cron-Wiederaufnahme vorerst pausiert.

Der Endpunkt und seine Authentifizierung über `Authorization: Bearer <CRON_SECRET>` bleiben erhalten. Bei einem authentifizierten Aufruf prüft er weiterhin offene ZUGFeRD-Aufträge, finalisiert erkennbare Ergebnisse und weckt unbeanspruchte Jobs erneut, wenn sie länger als 90 Sekunden warten. Die Statusprüfung in der Verkaufsakte bleibt unverändert.

Ein manueller Aufruf ist weiterhin möglich:

```sh
curl -X GET 'https://<DEPLOYMENT_DOMAIN>/api/cron/zugferd-finalize' \
  -H 'Authorization: Bearer <CRON_SECRET>'
```

`CRON_SECRET` muss dafür serverseitig in Vercel gesetzt sein. Das Secret nicht in Shell-Historien, Logs oder geteilte Dokumente eintragen. Der entfernte Cron-Eintrag war unabhängig von der OneDrive-Fahrzeugakten-Integration.
