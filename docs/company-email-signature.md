# Zentrale Firmen-E-Mail-Signatur

Die HTML-Signatur wird in **Einstellungen → Firmendaten → E-Mail-Signatur** gespeichert und an die normalen Kunden-E-Mails angehängt. Dazu zählen Rechnungen, ZUGFeRD-Rechnungen sowie Verkaufsdokumente. Der DATEV-Belegversand ist ausdrücklich ausgenommen.

## Einrichten

1. Zuerst die Migration `supabase/migrations/20261123120000_add_company_email_signatures.sql` in Supabase ausführen.
2. Den WAW-Stand mit dieser Migration deployen.
3. Outlook-Signatur als HTML einfügen und speichern.
4. Falls die Signatur bereits eine Grußformel enthält, die Checkbox dazu aktivieren. WAW entfernt dann bekannte Grußformeln aus der versendeten Vorlage, damit sie nicht doppelt stehen.
5. Bilder aus Outlook separat als PNG, JPG oder WEBP hochladen. Nach dem Upload den angebotenen HTML-Schnipsel kopieren und im Signatur-HTML als `img src` einsetzen, zum Beispiel:

   ```html
   <img src="cid:waw-..." alt="WAW Nutzfahrzeuge" style="max-width: 280px; height: auto;">
   ```

Outlook-HTML enthält häufig lokale oder temporäre Bildpfade. Diese funktionieren außerhalb von Outlook nicht. Der CID-Schnipsel verbindet das Bild mit der hochgeladenen Datei.

## Speicherung und Versand

- HTML liegt in `companies.email_signature_html` und wird beim Speichern serverseitig bereinigt.
- Die Option zur Grußformel liegt in `companies.email_signature_includes_closing`.
- Asset-Metadaten liegen in `companies.email_signature_assets`; die optimierten PNG-Dateien selbst liegen im bestehenden privaten `documents`-Bucket unter `company-assets/{companyId}/email-signature/`.
- Der Versand lädt ausschließlich die in der gespeicherten Signatur referenzierten Bilder über den serverseitigen Storage-Zugriff. Bilder werden als Resend-Inline-Anhänge mit `content_id` versendet und im HTML über `cid:{contentId}` referenziert. Sie werden nicht öffentlich freigegeben.
- Vorschauen nutzen kurzlebige signierte URLs; diese URLs werden nicht in die E-Mail übernommen.
- Die Signatur ändert den Textkörper und hängt keine separate PDF an.

Resend dokumentiert die CID-Einbettung unter [Embed Images using CID](https://resend.com/changelog/embed-images-using-cid). Die Darstellung eingebetteter Bilder hängt weiterhin vom E-Mail-Programm des Empfängers ab.

## Dateigrenzen

- Eingabebild: maximal 4 MB je Datei; bis zu 8 Bilder.
- WAW optimiert Bilder und speichert sie als PNG. Der gesamte Signaturbildbestand ist auf 3 MB begrenzt.
- Das eingefügte HTML wird unverändert gespeichert; die sichere E-Mail-Ausgabe bewahrt Outlook-Strukturen, Klassen und einfache Word-CSS, entfernt aber aktive Inhalte und externe CSS-Ressourcen. Das Eingabefeld ist auf 100.000 Zeichen begrenzt.
