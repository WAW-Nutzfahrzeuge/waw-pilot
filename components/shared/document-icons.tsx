import {
    BadgeCheck,
    BookOpenCheck,
    ClipboardCheck,
    FileArchive,
    FileCheck2,
    FileSignature,
    FileText,
    Landmark,
    Receipt,
    Truck,
} from "lucide-react";

export function getDocumentIcon(documentType: string) {
    if (documentType.includes("invoice") || documentType.includes("rechnung")) return Receipt;
    if (documentType.includes("entry_certificate") || documentType.includes("gelangen")) return FileCheck2;
    if (documentType.includes("transport") || documentType.includes("verbring")) return Truck;
    if (documentType.includes("end_use") || documentType.includes("endverbleib")) return FileSignature;
    if (documentType.includes("handover") || documentType.includes("uebergabe")) return ClipboardCheck;
    if (documentType.includes("signature") || documentType.includes("stamp")) return FileSignature;
    if (documentType.includes("register") || documentType.includes("tax")) return Landmark;
    if (documentType.includes("archive") || documentType.includes("zip")) return FileArchive;
    if (documentType.includes("terms") || documentType.includes("agb")) return BookOpenCheck;
    if (documentType.includes("approved") || documentType.includes("check")) return BadgeCheck;

    return FileText;
}
