package de.waw.zugferd.service;

import de.waw.zugferd.model.CanonicalInvoice;
import de.waw.zugferd.model.GenerateRequest;
import de.waw.zugferd.model.GenerateResponse;
import de.waw.zugferd.model.HealthResponse;
import de.waw.zugferd.model.InvoiceProfile;
import de.waw.zugferd.model.ValidationIssue;
import de.waw.zugferd.model.ValidationResponse;
import de.waw.zugferd.model.ValidationSummary;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.xpath.XPathConstants;
import javax.xml.xpath.XPathFactory;
import org.mustangproject.BankDetails;
import org.mustangproject.Invoice;
import org.mustangproject.Item;
import org.mustangproject.LegalOrganisation;
import org.mustangproject.Product;
import org.mustangproject.TradeParty;
import org.mustangproject.ZUGFeRD.IZUGFeRDExporter;
import org.mustangproject.ZUGFeRD.PDFAConformanceLevel;
import org.mustangproject.ZUGFeRD.Profiles;
import org.mustangproject.ZUGFeRD.ZUGFeRD2PullProvider;
import org.mustangproject.ZUGFeRD.ZUGFeRDExporterFromA3;
import org.mustangproject.validator.ZUGFeRDValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;

@Service
public class ZugferdPipelineService {
    private static final Logger LOGGER = LoggerFactory.getLogger(ZugferdPipelineService.class);
    private static final String MUSTANG_VERSION = "2.24.0";
    private static final String VERAPDF_VERSION = "1.30.2";
    private static final String STANDARD_VERSION = "ZUGFeRD 2.5 / Factur-X 1.09";
    private static final String PROFILE = "EN16931";

    private final ProcessRunner processRunner;
    private final String ghostscriptCommand;
    private final String veraPdfCommand;
    private final String iccProfilePath;
    private final int maxUploadMb;

    public ZugferdPipelineService(
            ProcessRunner processRunner,
            @Value("${zugferd.ghostscript-command}") String ghostscriptCommand,
            @Value("${zugferd.verapdf-command}") String veraPdfCommand,
            @Value("${zugferd.icc-profile-path}") String iccProfilePath,
            @Value("${zugferd.max-upload-mb}") int maxUploadMb
    ) {
        this.processRunner = processRunner;
        this.ghostscriptCommand = ghostscriptCommand;
        this.veraPdfCommand = veraPdfCommand;
        this.iccProfilePath = iccProfilePath;
        this.maxUploadMb = maxUploadMb;
    }

    public HealthResponse health() {
        return new HealthResponse("ok");
    }

    public GenerateResponse generate(GenerateRequest request) throws Exception {
        Path workDir = Files.createTempDirectory("waw-zugferd-");

        try {
            validateRequest(request);
            InvoiceProfile invoiceProfile = getInvoiceProfile(request);

            byte[] visiblePdf = decodePdf(request.visiblePdfBase64());
            Path inputPdf = workDir.resolve("visible.pdf");
            Path pdfaPdf = workDir.resolve("visible-pdfa3b.pdf");
            Path xml = workDir.resolve("factur-x.xml");
            Path outputPdf = workDir.resolve("zugferd.pdf");

            Files.write(inputPdf, visiblePdf);
            convertToPdfA3b(inputPdf, pdfaPdf, workDir);

            byte[] xmlBytes = generateXml(request.invoice());
            Files.write(xml, xmlBytes);

            List<ValidationIssue> issues = new ArrayList<>();
            // The final embedded ZUGFeRD PDF is validated below. Validating
            // this intermediate PDF/A file as well doubles the expensive
            // veraPDF work without increasing the validity guarantee of the
            // stored result.

            boolean xmlValid = validateWithMustang(xml, issues, "xml", invoiceProfile);

            if (!xmlValid) {
                throw new ValidationFailedException(issues);
            }

            embedXmlWithMustang(pdfaPdf, xmlBytes, outputPdf);

            boolean mustangValid = validateWithMustang(outputPdf, issues, "mustang", invoiceProfile);
            boolean pdfAValid = validateWithVeraPdf(outputPdf, issues, "VERAPDF_FINAL_PDFA3B");
            boolean consistencyValid = validateConsistency(xml, request.invoice(), issues);

            if (!mustangValid || !pdfAValid || !consistencyValid) {
                throw new ValidationFailedException(issues);
            }

            byte[] resultPdf = Files.readAllBytes(outputPdf);
            String sha256 = sha256(resultPdf);

            return new GenerateResponse(
                    Base64.getEncoder().encodeToString(resultPdf),
                    "rechnung-" + safeFilePart(request.invoice().invoiceNumber()) + "-zugferd.pdf",
                    sha256,
                    STANDARD_VERSION,
                    PROFILE,
                    ValidationSummary.of(
                            "valid",
                            MUSTANG_VERSION,
                            VERAPDF_VERSION,
                            true,
                            true,
                            true,
                            issues
                    )
            );
        } finally {
            FileCleanup.deleteRecursively(workDir);
        }
    }

    public ValidationResponse validateGeneratedResult(GenerateRequest request) throws Exception {
        try {
            GenerateResponse response = generate(request);
            return new ValidationResponse(response.validation().status(), response.validation().issues());
        } catch (ValidationFailedException exception) {
            return new ValidationResponse("invalid", exception.issues());
        }
    }

    private void validateRequest(GenerateRequest request) {
        List<ValidationIssue> issues = new ArrayList<>();

        if (!STANDARD_VERSION.equals(request.standardVersion())) {
            issues.add(error("STANDARD_VERSION", "Es wird nur ZUGFeRD 2.5 / Factur-X 1.09 unterstützt."));
        }

        if (!PROFILE.equals(request.profile())) {
            issues.add(error("PROFILE", "Es wird nur das Profil EN16931 unterstützt."));
        }

        try {
            getInvoiceProfile(request);
        } catch (IllegalArgumentException error) {
            issues.add(error("INVOICE_PROFILE", "Das angeforderte E-Rechnungsprofil wird nicht unterstützt."));
        }

        CanonicalInvoice invoice = request.invoice();

        if (!"EUR".equals(invoice.currency())) {
            issues.add(error("CURRENCY", "Es wird aktuell nur EUR unterstützt."));
        }

        if (invoice.lines().size() != 1) {
            issues.add(error("LINES", "Für Fahrzeugrechnungen wird genau eine Rechnungsposition erwartet."));
        }

        if (isBlank(invoice.seller().vatId()) &&
                isBlank(invoice.seller().registrationId()) &&
                isBlank(invoice.seller().identifier())) {
            issues.add(new ValidationIssue(
                    "EN16931",
                    "error",
                    "BR-CO-26",
                    "Für die E-Rechnung fehlt eine eindeutige Verkäuferkennung. Bitte hinterlege die USt-IdNr. oder Handelsregisternummer von W.A.W Nutzfahrzeuge.",
                    null,
                    true
            ));
        }

        if (!isBlank(invoice.seller().vatId()) &&
                !isValidVatIdForCountry(invoice.seller().vatId(), invoice.seller().countryCode())) {
            issues.add(new ValidationIssue(
                    "EN16931",
                    "error",
                    "BR-CO-09",
                    "Die USt-IdNr. des Verkäufers ist ungültig. Erwartetes Format: DE123456789.",
                    null,
                    true
            ));
        }

        if (!isBlank(invoice.buyer().vatId()) &&
                !isValidVatIdForCountry(invoice.buyer().vatId(), invoice.buyer().countryCode())) {
            issues.add(new ValidationIssue(
                    "EN16931",
                    "error",
                    "BR-CO-09",
                    "Die USt-IdNr. des Käufers ist ungültig. Bitte hinterlege sie mit ISO-Ländercode, z. B. DE123456789.",
                    null,
                    true
            ));
        }

        BigDecimal expectedGross = invoice.totals().taxBasisTotal()
                .add(invoice.totals().taxTotal())
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal actualGross = invoice.totals().grandTotal().setScale(2, RoundingMode.HALF_UP);

        if (expectedGross.compareTo(actualGross) != 0) {
            issues.add(error("TOTALS", "Netto-, Steuer- und Bruttobetrag sind nicht konsistent."));
        }

        if (!issues.isEmpty()) {
            throw new ValidationFailedException(issues);
        }
    }

    private static InvoiceProfile getInvoiceProfile(GenerateRequest request) {
        if (request.invoiceProfile() == null || request.invoiceProfile().isBlank()) {
            return InvoiceProfile.ZUGFERD_EN16931;
        }

        return InvoiceProfile.valueOf(request.invoiceProfile().trim().toUpperCase());
    }

    private byte[] decodePdf(String visiblePdfBase64) {
        byte[] bytes;

        try {
            bytes = Base64.getDecoder().decode(visiblePdfBase64);
        } catch (IllegalArgumentException error) {
            throw new ValidationFailedException(List.of(error("PDF_BASE64", "Die sichtbare PDF konnte nicht gelesen werden.")));
        }

        int maxBytes = maxUploadMb * 1024 * 1024;

        if (bytes.length > maxBytes) {
            throw new ValidationFailedException(List.of(error("PDF_SIZE", "Die sichtbare PDF ist zu groß.")));
        }

        return bytes;
    }

    private byte[] generateXml(CanonicalInvoice canonicalInvoice) {
        Invoice invoice = new Invoice()
                .setIssueDate(toDate(canonicalInvoice.invoiceDate()))
                .setDueDate(toDate(canonicalInvoice.invoiceDate()))
                .setDeliveryDate(toDate(canonicalInvoice.deliveryDate()))
                .setSender(toTradeParty(canonicalInvoice.seller(), true, canonicalInvoice.payment()))
                .setRecipient(toTradeParty(canonicalInvoice.buyer(), false, canonicalInvoice.payment()))
                .setNumber(canonicalInvoice.invoiceNumber())
                .setCurrency(canonicalInvoice.currency());

        for (CanonicalInvoice.InvoiceLine line : canonicalInvoice.lines()) {
            Product product = new Product(
                    line.name(),
                    line.vin() == null ? "" : "VIN " + line.vin(),
                    line.unitCode(),
                    line.vatRate()
            );
            invoice.addItem(new Item(product, line.netUnitPrice(), line.quantity()));
        }

        ZUGFeRD2PullProvider provider = new ZUGFeRD2PullProvider();
        provider.setProfile(Profiles.getByName("EN16931"));
        provider.generateXML(invoice);

        return provider.getXML();
    }

    private TradeParty toTradeParty(
            CanonicalInvoice.Party party,
            boolean seller,
            CanonicalInvoice.Payment payment
    ) {
        TradeParty tradeParty = new TradeParty(
                party.name(),
                party.street(),
                party.postalCode(),
                party.city(),
                party.countryCode()
        );

        if (party.vatId() != null && !party.vatId().isBlank()) {
            tradeParty.addVATID(party.vatId());
        }

        if (party.registrationId() != null && !party.registrationId().isBlank()) {
            tradeParty.setLegalOrganisation(new LegalOrganisation(party.registrationId()));
        }

        if (party.identifier() != null && !party.identifier().isBlank()) {
            tradeParty.setID(party.identifier());
        }

        if (party.taxNumber() != null && !party.taxNumber().isBlank()) {
            tradeParty.addTaxID(party.taxNumber());
        }

        if (party.email() != null && !party.email().isBlank()) {
            tradeParty.setEmail(party.email());
        }

        if (seller) {
            tradeParty.addBankDetails(new BankDetails(payment.iban(), payment.bic()));
        }

        return tradeParty;
    }

    private void convertToPdfA3b(Path inputPdf, Path outputPdf, Path workDir) throws IOException, InterruptedException {
        Path iccProfile = Path.of(iccProfilePath).toAbsolutePath().normalize();

        if (!Files.exists(iccProfile)) {
            throw new ValidationFailedException(List.of(error(
                    "PDFA_ICC_PROFILE",
                    "Das Farbprofil für die PDF/A-3b-Konvertierung wurde im ZUGFeRD-Service nicht gefunden."
            )));
        }

        Path pdfaDefinition = workDir.resolve("PDFA_def.ps");
        writePdfADefinition(pdfaDefinition);

        List<String> command = List.of(
                ghostscriptCommand,
                "-dBATCH",
                "-dNOPAUSE",
                "-dNOOUTERSAVE",
                "-dSAFER",
                "-dNOINTERPOLATE",
                "--permit-file-read=" + iccProfile,
                "--permit-file-read=" + inputPdf.toAbsolutePath().normalize(),
                "--permit-file-read=" + pdfaDefinition.toAbsolutePath().normalize(),
                "-sDEVICE=pdfwrite",
                "-dCompatibilityLevel=1.7",
                "-dPDFA=3",
                "-dPDFACompatibilityPolicy=1",
                "-dEmbedAllFonts=true",
                "-dSubsetFonts=false",
                "-dCompressFonts=true",
                "-dNoOutputFonts",
                "-sColorConversionStrategy=RGB",
                "-sProcessColorModel=DeviceRGB",
                "-sOutputICCProfile=" + iccProfile,
                "-sOutputFile=" + outputPdf,
                pdfaDefinition.toString(),
                inputPdf.toString()
        );

        ProcessRunner.ProcessResult result;

        try {
            result = processRunner.run(command, Duration.ofSeconds(60));
        } catch (IOException error) {
            LOGGER.warn("PDF/A-3b conversion failed before validation: {}", error.getMessage(), error);
            throw new ValidationFailedException(List.of(error(
                    isProcessTimeout(error) ? "PDFA_CONVERSION_TIMEOUT" : "PDFA_CONVERSION",
                    isProcessTimeout(error)
                            ? "Die PDF/A-3b-Konvertierung hat zu lange gedauert. Bitte prüfe, ob die Rechnungs-PDF oder angehängte AGB-Datei zu groß ist."
                            : "Die sichtbare PDF konnte nicht zuverlässig in PDF/A-3b konvertiert werden."
            )));
        }

        if (result.exitCode() != 0 || !Files.exists(outputPdf)) {
            LOGGER.warn(
                    "PDF/A-3b conversion failed with exit code {}: {}",
                    result.exitCode(),
                    sanitizeValidatorReport(result.output())
            );
            throw new ValidationFailedException(List.of(error("PDFA_CONVERSION", "Die sichtbare PDF konnte nicht zuverlässig in PDF/A-3b konvertiert werden.")));
        }
    }

    private void writePdfADefinition(Path outputPath) throws IOException {
        String escapedIccPath = Path.of(iccProfilePath).toAbsolutePath().normalize().toString()
                .replace("\\", "/")
                .replace("(", "\\(")
                .replace(")", "\\)");
        String content = """
                %%!
                %% PDF/A-3b output intent for Ghostscript.
                [ /Title (WAW Pilot ZUGFeRD Invoice)
                  /Creator (WAW Pilot)
                  /Producer (WAW Pilot ZUGFeRD Service)
                  /DOCINFO pdfmark
                /ICCProfile (%s) def
                [/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
                [{icc_PDFA} << /N 3 >> /PUT pdfmark
                [
                {icc_PDFA}
                {ICCProfile (r) file} stopped
                {
                  (Failed to open ICC profile for PDF/A conversion.) =
                  cleartomark
                }
                {
                  /PUT pdfmark
                  [/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
                  [{OutputIntent_PDFA} <<
                    /Type /OutputIntent
                    /S /GTS_PDFA1
                    /DestOutputProfile {icc_PDFA}
                    /OutputConditionIdentifier (sRGB IEC61966-2.1)
                    /Info (sRGB IEC61966-2.1)
                    /RegistryName (http://www.color.org)
                  >> /PUT pdfmark
                  [{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark
                } ifelse
                """.formatted(escapedIccPath);

        Files.writeString(outputPath, content, StandardCharsets.UTF_8);
    }

    private void embedXmlWithMustang(Path pdfaPdf, byte[] xml, Path outputPdf) throws Exception {
        try (IZUGFeRDExporter exporter = new ZUGFeRDExporterFromA3().ignorePDFAErrors()) {
            exporter.load(pdfaPdf.toString());
            exporter
                    .setProducer("WAW Pilot ZUGFeRD Service")
                    .setCreator("WAW Pilot")
                    .setConformanceLevel(PDFAConformanceLevel.BASIC)
                    .setZUGFeRDVersion(2)
                    .setProfile(Profiles.getByName("EN16931"));
            exporter.setXML(xml);
            exporter.export(outputPdf.toString());
        } catch (Exception error) {
            LOGGER.warn("ZUGFeRD XML embedding failed: {}", error.getMessage(), error);
            throw new ValidationFailedException(List.of(new ValidationIssue(
                    "FACTUR_X",
                    "error",
                    "ZUGFERD_EMBED",
                    "Die XML-Rechnungsdaten konnten nicht in die PDF eingebettet werden.",
                    null,
                    true
            )));
        }
    }

    private boolean validateWithMustang(Path file, List<ValidationIssue> issues, String phase, InvoiceProfile invoiceProfile) {
        ZUGFeRDValidator validator = new ZUGFeRDValidator();
        String result = validator.validate(file.toString());

        if (validator.wasCompletelyValid()) {
            return true;
        }

        List<ValidationIssue> reportIssues = classifyMustangReport(result, phase, invoiceProfile);
        issues.addAll(reportIssues);

        return reportIssues.stream().noneMatch(ValidationIssue::blocking);
    }

    private boolean validateWithVeraPdf(Path file, List<ValidationIssue> issues, String ruleId) throws IOException, InterruptedException {
        ProcessRunner.ProcessResult result;

        try {
            result = processRunner.run(
                    List.of(veraPdfCommand, "--format", "xml", "--flavour", "3b", file.toString()),
                    Duration.ofSeconds(60)
            );
        } catch (IOException error) {
            LOGGER.warn("veraPDF PDF/A-3b validation could not finish in {}: {}", ruleId, error.getMessage(), error);
            issues.add(new ValidationIssue(
                    "PDF_A",
                    "error",
                    isProcessTimeout(error) ? "VERAPDF_TIMEOUT" : ruleId,
                    isProcessTimeout(error)
                            ? "veraPDF konnte die PDF/A-3b-Prüfung nicht rechtzeitig abschließen. Bitte prüfe, ob die Rechnungs-PDF oder angehängte AGB-Datei zu groß ist."
                            : "veraPDF konnte die PDF/A-3b-Prüfung nicht ausführen.",
                    null,
                    true
            ));
            return false;
        }

        String output = result.output();
        String sanitizedOutput = sanitizeValidatorReport(output);
        boolean compliant = result.exitCode() == 0 &&
                (output.contains("isCompliant=\"true\"") ||
                        output.contains("<isCompliant>true</isCompliant>") ||
                        output.contains("isCompliant='true'"));

        if (compliant) {
            return true;
        }

        LOGGER.warn("veraPDF PDF/A-3b validation failed in {}: {}", ruleId, sanitizedOutput);
        issues.add(new ValidationIssue(
                "PDF_A",
                "error",
                ruleId,
                getFriendlyVeraPdfMessage(output),
                null,
                true
        ));
        issues.add(new ValidationIssue(
                "PDF_A",
                "notice",
                "VERAPDF_REPORT",
                sanitizedOutput,
                null,
                false
        ));

        return false;
    }

    private static boolean isProcessTimeout(IOException error) {
        return error.getMessage() != null && error.getMessage().contains("Process timed out");
    }

    private static String getFriendlyVeraPdfMessage(String report) {
        if (report == null || report.isBlank()) {
            return "veraPDF hat die Datei nicht als PDF/A-3b-konform bestätigt.";
        }

        if (report.contains("OutputIntent") ||
                report.contains("ICC") ||
                report.contains("color profile") ||
                report.contains("DeviceGray") ||
                report.contains("DeviceRGB") ||
                report.contains("colour space")) {
            return "veraPDF hat die Datei nicht als PDF/A-3b-konform bestätigt. Vermutlich fehlt ein gültiges Farbprofil oder OutputIntent.";
        }

        if (report.contains("Interpolate key") || report.contains("Interpolate == false")) {
            return "veraPDF hat die Datei nicht als PDF/A-3b-konform bestätigt. Mindestens ein Bild verwendet eine für PDF/A nicht erlaubte Interpolation.";
        }

        if (report.contains("CIDSet") ||
                report.contains("font") ||
                report.contains("Font")) {
            return "veraPDF hat die Datei nicht als PDF/A-3b-konform bestätigt. Vermutlich sind Schriftarten nicht vollständig eingebettet.";
        }

        if (report.contains("streamKeywordCRLFCompliant") ||
                report.contains("spacingCompliesPDFA") ||
                report.contains("stream") ||
                report.contains("endstream")) {
            return "veraPDF hat die Datei nicht als PDF/A-3b-konform bestätigt. Die PDF-Struktur konnte nicht vollständig PDF/A-konform normalisiert werden.";
        }

        if (report.contains("XMP") || report.contains("metadata")) {
            return "veraPDF hat die Datei nicht als PDF/A-3b-konform bestätigt. Vermutlich sind die PDF/A- oder Factur-X-Metadaten unvollständig.";
        }

        if (report.contains("embedded file") || report.contains("Associated") || report.contains("AFRelationship")) {
            return "veraPDF hat die Datei nicht als PDF/A-3b-konform bestätigt. Vermutlich ist die XML-Datei nicht PDF/A-konform als Anlage eingebettet.";
        }

        return "veraPDF hat die Datei nicht als PDF/A-3b-konform bestätigt. Details stehen im technischen Validierungsbericht.";
    }

    private boolean validateConsistency(Path xml, CanonicalInvoice invoice, List<ValidationIssue> issues) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            Document document = factory.newDocumentBuilder().parse(xml.toFile());
            var xpath = XPathFactory.newInstance().newXPath();

            String invoiceNumber = text(xpath.evaluate(
                    "//*[local-name()='ExchangedDocument']/*[local-name()='ID'][1]",
                    document,
                    XPathConstants.STRING
            ));
            String currency = text(xpath.evaluate(
                    "//*[local-name()='InvoiceCurrencyCode'][1]",
                    document,
                    XPathConstants.STRING
            ));
            String grandTotal = text(xpath.evaluate(
                    "//*[local-name()='GrandTotalAmount'][1]",
                    document,
                    XPathConstants.STRING
            ));

            boolean valid = true;

            if (!invoice.invoiceNumber().equals(invoiceNumber)) {
                issues.add(error("CONSISTENCY_INVOICE_NUMBER", "Rechnungsnummer in XML und Ausgangsdaten stimmt nicht überein."));
                valid = false;
            }

            if (!invoice.currency().equals(currency)) {
                issues.add(error("CONSISTENCY_CURRENCY", "Währung in XML und Ausgangsdaten stimmt nicht überein."));
                valid = false;
            }

            if (!sameMoney(invoice.totals().grandTotal(), grandTotal)) {
                issues.add(error("CONSISTENCY_TOTAL", "Bruttobetrag in XML und Ausgangsdaten stimmt nicht überein."));
                valid = false;
            }

            return valid;
        } catch (Exception error) {
            issues.add(new ValidationIssue(
                    "EN16931",
                    "error",
                    "CONSISTENCY_PARSE",
                    "XML-/Rechnungsdaten-Konsistenz konnte nicht geprüft werden.",
                    null,
                    true
            ));
            return false;
        }
    }

    private static Date toDate(String isoDate) {
        return Date.from(LocalDate.parse(isoDate).atStartOfDay(ZoneId.of("UTC")).toInstant());
    }

    private static ValidationIssue error(String ruleId, String message) {
        return new ValidationIssue("EN16931", "error", ruleId, message, null, true);
    }

    static List<ValidationIssue> classifyMustangReport(String report, String phase, InvoiceProfile invoiceProfile) {
        if (report == null || report.isBlank()) {
            return List.of(new ValidationIssue(
                    "FACTUR_X",
                    "error",
                    "MUSTANG_" + phase.toUpperCase(),
                    "Mustangproject-Validierung ist fehlgeschlagen.",
                    null,
                    true
            ));
        }

        List<ValidationIssue> issues = new ArrayList<>();
        String sanitizedReport = sanitizeValidatorReport(report);
        List<String> xrechnungNoticeRules = List.of(
                "PEPPOL-EN16931-R001",
                "PEPPOL-EN16931-R010",
                "BR-DE-15",
                "BR-DE-21",
                "BR-DE-2"
        );
        List<String> blockingFacturXRules = List.of("BR-CO-09", "BR-CO-26");
        List<String> detectedRuleIds = extractRuleIds(report);
        boolean isXmlOnlyValidation = "xml".equals(phase);
        boolean parsedPdfAbsent = report.contains("Parsed PDF:absent");
        boolean xrechnungSourceDetected =
                report.contains("/xslt/XR_30/XRechnung-CII-validation.xslt") ||
                        report.contains("XR_30") ||
                        report.contains("XRechnung-CII-validation.xslt");

        for (String rule : blockingFacturXRules) {
            if (!report.contains(rule)) {
                continue;
            }

            issues.add(new ValidationIssue(
                    "EN16931",
                    "error",
                    rule,
                    getFriendlyFacturXRuleMessage(rule),
                    null,
                    true
            ));
        }

        for (String rule : xrechnungNoticeRules) {
            if (!report.contains(rule)) {
                continue;
            }

            boolean blocking = invoiceProfile == InvoiceProfile.XRECHNUNG;
            issues.add(new ValidationIssue(
                    "XRECHNUNG",
                    blocking ? "error" : "notice",
                    rule,
                    blocking
                            ? "XRechnung-Regel verletzt: " + rule
                            : "XRechnung-spezifischer Hinweis aus der Mustang-Validierung; für Factur-X EN16931 nicht blockierend.",
                    null,
                    blocking
            ));
        }

        boolean hasBlocking = issues.stream().anyMatch(ValidationIssue::blocking);
        boolean onlyKnownXrechnungNotices =
                !detectedRuleIds.isEmpty() &&
                        detectedRuleIds.stream().allMatch(xrechnungNoticeRules::contains);
        boolean unknownXrechnungRulesDetected =
                xrechnungSourceDetected &&
                        detectedRuleIds.stream().anyMatch((rule) -> !xrechnungNoticeRules.contains(rule));

        if (isXmlOnlyValidation && parsedPdfAbsent) {
            issues.add(new ValidationIssue(
                    "FACTUR_X",
                    "notice",
                    "MUSTANG_XML_ONLY",
                    "Mustang hat in dieser Phase nur das XML geprüft; die finale PDF wird nach dem Einbetten separat validiert.",
                    null,
                    false
            ));
        }

        if (hasBlocking) {
            issues.add(new ValidationIssue(
                    "FACTUR_X",
                    "notice",
                    "MUSTANG_REPORT",
                    sanitizedReport,
                    null,
                    false
            ));
        } else if (invoiceProfile == InvoiceProfile.ZUGFERD_EN16931 && unknownXrechnungRulesDetected) {
            issues.add(new ValidationIssue(
                    "XRECHNUNG",
                    "error",
                    "XRECHNUNG_UNKNOWN_RULE",
                    "Mustang hat unbekannte XRechnung-Hinweise gemeldet. Diese werden nicht automatisch für Factur-X freigegeben.",
                    null,
                    true
            ));
            issues.add(new ValidationIssue(
                    "XRECHNUNG",
                    "notice",
                    "MUSTANG_REPORT",
                    sanitizedReport,
                    null,
                    false
            ));
        } else if (onlyKnownXrechnungNotices) {
            issues.add(new ValidationIssue(
                    "XRECHNUNG",
                    "notice",
                    "MUSTANG_REPORT",
                    sanitizedReport,
                    null,
                    false
            ));
        } else {
            issues.add(new ValidationIssue(
                    "FACTUR_X",
                    "error",
                    "MUSTANG_REPORT",
                    sanitizedReport,
                    null,
                    true
            ));
        }

        return issues;
    }

    private static String getFriendlyFacturXRuleMessage(String ruleId) {
        if ("BR-CO-09".equals(ruleId)) {
            return "Die USt-IdNr. des Verkäufers ist ungültig. Erwartetes Format: DE123456789.";
        }

        if ("BR-CO-26".equals(ruleId)) {
            return "Für die E-Rechnung fehlt eine eindeutige Verkäuferkennung. Bitte hinterlege die USt-IdNr. oder Handelsregisternummer von W.A.W Nutzfahrzeuge.";
        }

        return "Factur-X/EN16931-Regel verletzt: " + ruleId;
    }

    private static boolean isValidVatIdForCountry(String vatId, String countryCode) {
        if (isBlank(vatId)) {
            return true;
        }

        String normalizedVatId = vatId.trim().toUpperCase();
        String normalizedCountryCode = countryCode == null ? "" : countryCode.trim().toUpperCase();

        if ("DE".equals(normalizedCountryCode)) {
            return Pattern.matches("^DE[0-9]{9}$", normalizedVatId);
        }

        return Pattern.matches("^[A-Z]{2}.+", normalizedVatId);
    }

    private static List<String> extractRuleIds(String report) {
        if (report == null || report.isBlank()) {
            return List.of();
        }

        Pattern pattern = Pattern.compile("(PEPPOL-EN16931-R\\d+|BR-[A-Z]{2}-\\d+|BR-CO-\\d+)");
        Matcher matcher = pattern.matcher(report);
        List<String> ruleIds = new ArrayList<>();

        while (matcher.find()) {
            String ruleId = matcher.group(1);
            if (!ruleIds.contains(ruleId)) {
                ruleIds.add(ruleId);
            }
        }

        return ruleIds;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String sanitizeValidatorReport(String report) {
        if (report == null) {
            return "";
        }

        String compact = report.replaceAll("\\s+", " ").trim();
        return compact.length() > 3000 ? compact.substring(0, 3000) + "..." : compact;
    }

    private static String safeFilePart(String value) {
        return value.replaceAll("[^A-Za-z0-9._-]", "-");
    }

    private static String sha256(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(digest.digest(bytes));
    }

    private static String text(Object value) {
        return String.valueOf(value == null ? "" : value).trim();
    }

    private static boolean sameMoney(BigDecimal expected, String actual) {
        try {
            return expected.setScale(2, RoundingMode.HALF_UP)
                    .compareTo(new BigDecimal(actual).setScale(2, RoundingMode.HALF_UP)) == 0;
        } catch (Exception error) {
            return false;
        }
    }

    public static class ValidationFailedException extends RuntimeException {
        private final List<ValidationIssue> issues;

        public ValidationFailedException(List<ValidationIssue> issues) {
            super("ZUGFeRD validation failed");
            this.issues = issues;
        }

        public List<ValidationIssue> issues() {
            return issues;
        }
    }
}
