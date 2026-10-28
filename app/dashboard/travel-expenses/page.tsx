import Link from "next/link";
import { FilePlus2, Route } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function TravelExpensesPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Reisekosten"
                title="Reisekosten & Kundenfahrten"
                description="Erstelle und verwalte interne Reisekostenformulare für Kundenfahrten, Händlerfahrten und Servicefahrten."
                action={
                    <Button
                        asChild
                        className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    >
                        <Link href="/dashboard/travel-expenses/new">
                            <FilePlus2 className="mr-2 size-4" />
                            Reisekostenformular erstellen
                        </Link>
                    </Button>
                }
            />

            <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                            <Route className="size-5" />
                        </div>

                        <div>
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Neues Formular erzeugen
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                                Dokumentiere eine Fahrt mit Fahrer, Datum, Kunde, Ort,
                                Fahrzeug, Zweck, Kilometerstand und Bemerkungen. Nach dem
                                Speichern wird automatisch eine PDF erzeugt und in den
                                Dokumenten abgelegt.
                            </p>

                            <Button
                                asChild
                                variant="outline"
                                className="mt-5 rounded-2xl border-slate-200 bg-white font-bold"
                            >
                                <Link href="/dashboard/travel-expenses/new">
                                    Formular ausfüllen
                                </Link>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}