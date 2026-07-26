# WAW Pilot

Interne WAW-Pilot-Anwendung für Fahrzeugbestand, Ankauf, Verkauf, Rechnungen,
Dokumente, Zahlungen, Kassenbuch und Buchhaltungsvorbereitung.

## Entwicklung

Benötigte Umgebungsvariablen stehen in `.env.example`.

```bash
npm install
npm run dev
```

## Qualitätsprüfung

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Aktueller Phase-J-Prüfbericht:

- `docs/phase-j-production-readiness.md`

## Architekturhinweise

- Next.js App Router
- Supabase für Datenbank, RLS und private Storage-Buckets
- zentrale Verkaufssteuerlogik in `utils/sale-tax-rules.ts`
- zentrale Dokumentenmodule unter `src/modules/documents`
- zentrale Rechnungskorrekturmodule unter `src/modules/invoice-corrections`
- zentrale E-Mail-Module unter `src/modules/email`

## Optionale Dienste

- Resend für E-Mail-Versand: `RESEND_API_KEY`; die Rechnungs-Absender-E-Mail wird in den Firmeneinstellungen gepflegt
- ZUGFeRD-Service: `ZUGFERD_SERVICE_URL`, `ZUGFERD_SERVICE_API_KEY`

Siehe zusätzlich:

- `services/zugferd-service/README.md`
