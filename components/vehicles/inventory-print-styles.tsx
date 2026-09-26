/**
 * Gemeinsame Druck-/PDF-Styles für Bestandsliste und Inventurliste (A4 quer,
 * WAW-Kopfzeile mit Logo, druckoptimierte Tabellen). Zentral gehalten, damit
 * beide Listen exakt denselben Druck-/PDF-Look verwenden (window.print()).
 */
export function InventoryPrintStyles() {
    return (
        <style jsx global>{`
            @media print {
                @page {
                    size: A4 landscape;
                    margin: 8mm 8mm 13mm;

                    @bottom-right {
                        content: "Seite " counter(page) " von " counter(pages);
                        color: #475569;
                        font-family: Helvetica, Arial, sans-serif;
                        font-size: 7pt;
                        font-weight: 700;
                    }
                }

                body {
                    background: white !important;
                }

                aside,
                header,
                nav {
                    display: none !important;
                }

                main {
                    padding: 0 !important;
                    margin: 0 !important;
                }

                .inventory-print-header {
                    display: flex !important;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12mm;
                }

                .inventory-print-logo {
                    width: 24mm;
                    height: auto;
                    object-fit: contain;
                    flex: 0 0 auto;
                    margin-top: 1mm;
                }

                table {
                    page-break-inside: auto;
                }

                thead {
                    display: table-header-group;
                }

                tfoot {
                    display: table-footer-group;
                }

                tr {
                    page-break-inside: avoid;
                    break-inside: avoid;
                }

                .inventory-sale-start {
                    border-left: 1.6pt solid #64748b !important;
                }
            }
        `}</style>
    );
}
