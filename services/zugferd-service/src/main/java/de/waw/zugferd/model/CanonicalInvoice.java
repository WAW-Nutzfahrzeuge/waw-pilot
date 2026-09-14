package de.waw.zugferd.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;

public record CanonicalInvoice(
        @NotBlank String invoiceNumber,
        @NotBlank String invoiceDate,
        @NotBlank String deliveryDate,
        @NotBlank String dueDate,
        @NotNull Integer paymentTermsDays,
        @NotBlank String currency,
        @NotBlank String invoiceType,
        @NotBlank String standardVersion,
        @NotBlank String profile,
        @Valid @NotNull Party seller,
        @Valid @NotNull Party buyer,
        @Valid @NotEmpty List<InvoiceLine> lines,
        @Valid @NotNull TaxSummary tax,
        @Valid @NotNull InvoiceTotals totals,
        @Valid @NotNull Payment payment
) {
    public record Party(
            @NotBlank String name,
            @NotBlank String street,
            @NotBlank String postalCode,
            @NotBlank String city,
            @NotBlank String countryCode,
            String vatId,
            String registrationId,
            String identifier,
            String taxNumber,
            String email,
            String phone
    ) {
    }

    public record InvoiceLine(
            @NotBlank String id,
            @NotBlank String name,
            @NotNull BigDecimal quantity,
            @NotBlank String unitCode,
            @NotNull BigDecimal netUnitPrice,
            @NotNull BigDecimal netLineTotal,
            @NotNull BigDecimal vatRate,
            @NotBlank String taxCategory,
            String vin
    ) {
    }

    public record TaxSummary(
            @NotBlank String category,
            @NotNull BigDecimal rate,
            @NotNull BigDecimal basisAmount,
            @NotNull BigDecimal taxAmount,
            String exemptionReason
    ) {
    }

    public record InvoiceTotals(
            @NotNull BigDecimal lineTotal,
            @NotNull BigDecimal taxBasisTotal,
            @NotNull BigDecimal taxTotal,
            @NotNull BigDecimal grandTotal,
            @NotNull BigDecimal duePayable
    ) {
    }

    public record Payment(
            @NotBlank String terms,
            @NotBlank String iban,
            String bic,
            String bankName
    ) {
    }
}
