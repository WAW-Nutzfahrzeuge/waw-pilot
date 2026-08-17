import { normalizeEmailLanguage, type EmailLanguage } from "@/lib/customers/email-languages";
import { composeBilingualEmailText } from "@/lib/email/bilingual-email";

type InvoiceEmailTemplateParams = {
    invoiceNumber: string;
    customerName: string;
};

type InvoiceEmailTemplate = {
    subject: string;
    text: string;
    html: string;
};

export function getDatevInvoiceEmailTemplate(invoiceNumber: string): InvoiceEmailTemplate {
    const subject = `Rechnung ${invoiceNumber} für DATEV`;
    const text = [
        "Guten Tag,",
        "",
        `anbei erhalten Sie die Rechnung ${invoiceNumber} zur Verarbeitung in DATEV.`,
        "",
        "Mit freundlichen Grüßen",
        "WAW Nutzfahrzeuge",
    ].join("\n");

    return {
        subject,
        text,
        html: toHtml(text),
    };
}

type TemplateText = {
    subject: string;
    greeting: string;
    attachment: string;
    questions: string;
    closing: string;
};

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function toHtml(text: string): string {
    return text
        .split("\n\n")
        .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
        .join("");
}

function getLanguageForTemplate(language: string | null | undefined): EmailLanguage {
    if (!language) return "de";

    return normalizeEmailLanguage(language, "en");
}

export function getInvoiceEmailTemplate(
    language: string | null | undefined,
    params: InvoiceEmailTemplateParams,
): InvoiceEmailTemplate {
    const normalizedLanguage = getLanguageForTemplate(language);
    const invoiceNumber = params.invoiceNumber;
    const customerName = params.customerName;

    const templates: Record<EmailLanguage, TemplateText> = {
        de: {
            subject: `Ihre Rechnung ${invoiceNumber} von WAW Nutzfahrzeuge`,
            greeting: `Guten Tag ${customerName},`,
            attachment: `anbei erhalten Sie Ihre Rechnung ${invoiceNumber} als PDF.`,
            questions: "Bei Fragen melden Sie sich gerne bei uns.",
            closing: "Mit freundlichen Grüßen\nWAW Nutzfahrzeuge",
        },
        en: {
            subject: `Your invoice ${invoiceNumber} from WAW Nutzfahrzeuge`,
            greeting: `Hello ${customerName},`,
            attachment: `please find attached your invoice ${invoiceNumber} as a PDF.`,
            questions: "If you have any questions, feel free to contact us.",
            closing: "Kind regards\nWAW Nutzfahrzeuge",
        },
        sq: {
            subject: `Fatura juaj ${invoiceNumber} nga WAW Nutzfahrzeuge`,
            greeting: `Përshëndetje ${customerName},`,
            attachment: `bashkëngjitur gjeni faturën tuaj ${invoiceNumber} si PDF.`,
            questions: "Nëse keni pyetje, ju lutemi na kontaktoni.",
            closing: "Me respekt\nWAW Nutzfahrzeuge",
        },
        ar: {
            subject: `فاتورتكم ${invoiceNumber} من WAW Nutzfahrzeuge`,
            greeting: `مرحباً ${customerName},`,
            attachment: `تجدون مرفقاً فاتورتكم ${invoiceNumber} بصيغة PDF.`,
            questions: "إذا كانت لديكم أي أسئلة، يرجى التواصل معنا.",
            closing: "مع أطيب التحيات\nWAW Nutzfahrzeuge",
        },
        be: {
            subject: `Ваш рахунак ${invoiceNumber} ад WAW Nutzfahrzeuge`,
            greeting: `Добры дзень ${customerName},`,
            attachment: `у дадатку вы знойдзеце ваш рахунак ${invoiceNumber} у фармаце PDF.`,
            questions: "Калі ў вас ёсць пытанні, калі ласка, звяжыцеся з намі.",
            closing: "З павагай\nWAW Nutzfahrzeuge",
        },
        bs: {
            subject: `Vaša faktura ${invoiceNumber} od WAW Nutzfahrzeuge`,
            greeting: `Dobar dan ${customerName},`,
            attachment: `u prilogu vam šaljemo fakturu ${invoiceNumber} u PDF formatu.`,
            questions: "Ako imate pitanja, slobodno nam se obratite.",
            closing: "Srdačan pozdrav\nWAW Nutzfahrzeuge",
        },
        bg: {
            subject: `Вашата фактура ${invoiceNumber} от WAW Nutzfahrzeuge`,
            greeting: `Здравейте ${customerName},`,
            attachment: `в прикачения файл ще намерите вашата фактура ${invoiceNumber} като PDF.`,
            questions: "Ако имате въпроси, моля свържете се с нас.",
            closing: "С уважение\nWAW Nutzfahrzeuge",
        },
        ca: {
            subject: `La vostra factura ${invoiceNumber} de WAW Nutzfahrzeuge`,
            greeting: `Bon dia ${customerName},`,
            attachment: `adjunta trobareu la vostra factura ${invoiceNumber} en format PDF.`,
            questions: "Si teniu cap pregunta, no dubteu a contactar-nos.",
            closing: "Atentament\nWAW Nutzfahrzeuge",
        },
        hr: {
            subject: `Vaš račun ${invoiceNumber} od WAW Nutzfahrzeuge`,
            greeting: `Dobar dan ${customerName},`,
            attachment: `u privitku vam šaljemo račun ${invoiceNumber} u PDF formatu.`,
            questions: "Ako imate pitanja, slobodno nam se obratite.",
            closing: "Srdačan pozdrav\nWAW Nutzfahrzeuge",
        },
        da: {
            subject: `Din faktura ${invoiceNumber} fra WAW Nutzfahrzeuge`,
            greeting: `Hej ${customerName},`,
            attachment: `vedhæftet finder du din faktura ${invoiceNumber} som PDF.`,
            questions: "Hvis du har spørgsmål, er du velkommen til at kontakte os.",
            closing: "Venlig hilsen\nWAW Nutzfahrzeuge",
        },
        et: {
            subject: `Teie arve ${invoiceNumber} ettevõttelt WAW Nutzfahrzeuge`,
            greeting: `Tere ${customerName},`,
            attachment: `manusest leiate oma arve ${invoiceNumber} PDF-failina.`,
            questions: "Küsimuste korral võtke meiega ühendust.",
            closing: "Lugupidamisega\nWAW Nutzfahrzeuge",
        },
        fi: {
            subject: `Laskunne ${invoiceNumber} yritykseltä WAW Nutzfahrzeuge`,
            greeting: `Hei ${customerName},`,
            attachment: `liitteenä on laskunne ${invoiceNumber} PDF-muodossa.`,
            questions: "Jos teillä on kysyttävää, ottakaa meihin yhteyttä.",
            closing: "Ystävällisin terveisin\nWAW Nutzfahrzeuge",
        },
        fr: {
            subject: `Votre facture ${invoiceNumber} de WAW Nutzfahrzeuge`,
            greeting: `Bonjour ${customerName},`,
            attachment: `veuillez trouver ci-joint votre facture ${invoiceNumber} au format PDF.`,
            questions: "Pour toute question, n'hésitez pas à nous contacter.",
            closing: "Cordialement\nWAW Nutzfahrzeuge",
        },
        el: {
            subject: `Το τιμολόγιό σας ${invoiceNumber} από την WAW Nutzfahrzeuge`,
            greeting: `Καλημέρα ${customerName},`,
            attachment: `συνημμένα θα βρείτε το τιμολόγιό σας ${invoiceNumber} σε μορφή PDF.`,
            questions: "Εάν έχετε ερωτήσεις, μη διστάσετε να επικοινωνήσετε μαζί μας.",
            closing: "Με εκτίμηση\nWAW Nutzfahrzeuge",
        },
        ga: {
            subject: `Do shonrasc ${invoiceNumber} ó WAW Nutzfahrzeuge`,
            greeting: `Dia duit ${customerName},`,
            attachment: `tá do shonrasc ${invoiceNumber} ceangailte mar PDF.`,
            questions: "Má tá aon cheist agat, déan teagmháil linn.",
            closing: "Le dea-mhéin\nWAW Nutzfahrzeuge",
        },
        is: {
            subject: `Reikningurinn þinn ${invoiceNumber} frá WAW Nutzfahrzeuge`,
            greeting: `Góðan dag ${customerName},`,
            attachment: `í viðhengi finnur þú reikninginn þinn ${invoiceNumber} sem PDF.`,
            questions: "Ef þú hefur spurningar skaltu hafa samband við okkur.",
            closing: "Kær kveðja\nWAW Nutzfahrzeuge",
        },
        it: {
            subject: `La sua fattura ${invoiceNumber} da WAW Nutzfahrzeuge`,
            greeting: `Buongiorno ${customerName},`,
            attachment: `in allegato trova la sua fattura ${invoiceNumber} in formato PDF.`,
            questions: "Per qualsiasi domanda, non esiti a contattarci.",
            closing: "Cordiali saluti\nWAW Nutzfahrzeuge",
        },
        lv: {
            subject: `Jūsu rēķins ${invoiceNumber} no WAW Nutzfahrzeuge`,
            greeting: `Labdien ${customerName},`,
            attachment: `pielikumā atradīsiet savu rēķinu ${invoiceNumber} PDF formātā.`,
            questions: "Ja jums ir jautājumi, lūdzu, sazinieties ar mums.",
            closing: "Ar cieņu\nWAW Nutzfahrzeuge",
        },
        lt: {
            subject: `Jūsų sąskaita ${invoiceNumber} iš WAW Nutzfahrzeuge`,
            greeting: `Laba diena ${customerName},`,
            attachment: `prisegtuke rasite savo sąskaitą ${invoiceNumber} PDF formatu.`,
            questions: "Jei turite klausimų, susisiekite su mumis.",
            closing: "Pagarbiai\nWAW Nutzfahrzeuge",
        },
        lb: {
            subject: `Är Rechnung ${invoiceNumber} vu WAW Nutzfahrzeuge`,
            greeting: `Moien ${customerName},`,
            attachment: `am Unhang fannt Dir Är Rechnung ${invoiceNumber} als PDF.`,
            questions: "Bei Froen kënnt Dir Iech gär bei eis mellen.",
            closing: "Mat beschte Gréiss\nWAW Nutzfahrzeuge",
        },
        mk: {
            subject: `Вашата фактура ${invoiceNumber} од WAW Nutzfahrzeuge`,
            greeting: `Добар ден ${customerName},`,
            attachment: `во прилог ја добивате вашата фактура ${invoiceNumber} како PDF.`,
            questions: "Доколку имате прашања, слободно контактирајте нè.",
            closing: "Со почит\nWAW Nutzfahrzeuge",
        },
        mt: {
            subject: `Il-fattura tiegħek ${invoiceNumber} minn WAW Nutzfahrzeuge`,
            greeting: `Bonġu ${customerName},`,
            attachment: `mehmuża ssib il-fattura tiegħek ${invoiceNumber} bħala PDF.`,
            questions: "Jekk għandek xi mistoqsijiet, jekk jogħġbok ikkuntattjana.",
            closing: "Tislijiet\nWAW Nutzfahrzeuge",
        },
        nl: {
            subject: `Uw factuur ${invoiceNumber} van WAW Nutzfahrzeuge`,
            greeting: `Goedendag ${customerName},`,
            attachment: `bijgevoegd ontvangt u uw factuur ${invoiceNumber} als PDF.`,
            questions: "Neem gerust contact met ons op als u vragen heeft.",
            closing: "Met vriendelijke groet\nWAW Nutzfahrzeuge",
        },
        no: {
            subject: `Din faktura ${invoiceNumber} fra WAW Nutzfahrzeuge`,
            greeting: `Hei ${customerName},`,
            attachment: `vedlagt finner du fakturaen din ${invoiceNumber} som PDF.`,
            questions: "Ta gjerne kontakt med oss hvis du har spørsmål.",
            closing: "Med vennlig hilsen\nWAW Nutzfahrzeuge",
        },
        pl: {
            subject: `Faktura ${invoiceNumber} od WAW Nutzfahrzeuge`,
            greeting: `Dzień dobry ${customerName},`,
            attachment: `w załączniku przesyłamy fakturę ${invoiceNumber} w formacie PDF.`,
            questions: "W razie pytań prosimy o kontakt.",
            closing: "Z poważaniem\nWAW Nutzfahrzeuge",
        },
        pt: {
            subject: `A sua fatura ${invoiceNumber} da WAW Nutzfahrzeuge`,
            greeting: `Bom dia ${customerName},`,
            attachment: `em anexo enviamos a sua fatura ${invoiceNumber} em PDF.`,
            questions: "Se tiver alguma dúvida, entre em contacto connosco.",
            closing: "Com os melhores cumprimentos\nWAW Nutzfahrzeuge",
        },
        ro: {
            subject: `Factura dumneavoastră ${invoiceNumber} de la WAW Nutzfahrzeuge`,
            greeting: `Bună ziua ${customerName},`,
            attachment: `atașat găsiți factura dumneavoastră ${invoiceNumber} în format PDF.`,
            questions: "Dacă aveți întrebări, vă rugăm să ne contactați.",
            closing: "Cu stimă\nWAW Nutzfahrzeuge",
        },
        ru: {
            subject: `Ваш счет ${invoiceNumber} от WAW Nutzfahrzeuge`,
            greeting: `Здравствуйте, ${customerName},`,
            attachment: `во вложении вы найдете ваш счет ${invoiceNumber} в формате PDF.`,
            questions: "Если у вас есть вопросы, пожалуйста, свяжитесь с нами.",
            closing: "С уважением\nWAW Nutzfahrzeuge",
        },
        sr: {
            subject: `Vaša faktura ${invoiceNumber} od WAW Nutzfahrzeuge`,
            greeting: `Dobar dan ${customerName},`,
            attachment: `u prilogu vam šaljemo fakturu ${invoiceNumber} u PDF formatu.`,
            questions: "Ako imate pitanja, slobodno nas kontaktirajte.",
            closing: "Srdačan pozdrav\nWAW Nutzfahrzeuge",
        },
        sk: {
            subject: `Vaša faktúra ${invoiceNumber} od WAW Nutzfahrzeuge`,
            greeting: `Dobrý deň ${customerName},`,
            attachment: `v prílohe nájdete svoju faktúru ${invoiceNumber} vo formáte PDF.`,
            questions: "Ak máte otázky, neváhajte nás kontaktovať.",
            closing: "S pozdravom\nWAW Nutzfahrzeuge",
        },
        sl: {
            subject: `Vaš račun ${invoiceNumber} od WAW Nutzfahrzeuge`,
            greeting: `Dober dan ${customerName},`,
            attachment: `v prilogi vam pošiljamo račun ${invoiceNumber} v obliki PDF.`,
            questions: "Če imate vprašanja, nas prosimo kontaktirajte.",
            closing: "Lep pozdrav\nWAW Nutzfahrzeuge",
        },
        es: {
            subject: `Su factura ${invoiceNumber} de WAW Nutzfahrzeuge`,
            greeting: `Buenos días ${customerName},`,
            attachment: `adjuntamos su factura ${invoiceNumber} en formato PDF.`,
            questions: "Si tiene alguna pregunta, no dude en contactarnos.",
            closing: "Atentamente\nWAW Nutzfahrzeuge",
        },
        sv: {
            subject: `Din faktura ${invoiceNumber} från WAW Nutzfahrzeuge`,
            greeting: `Hej ${customerName},`,
            attachment: `bifogat får du din faktura ${invoiceNumber} som PDF.`,
            questions: "Kontakta oss gärna om du har frågor.",
            closing: "Med vänliga hälsningar\nWAW Nutzfahrzeuge",
        },
        cs: {
            subject: `Vaše faktura ${invoiceNumber} od WAW Nutzfahrzeuge`,
            greeting: `Dobrý den ${customerName},`,
            attachment: `v příloze naleznete svou fakturu ${invoiceNumber} ve formátu PDF.`,
            questions: "Máte-li dotazy, neváhejte nás kontaktovat.",
            closing: "S pozdravem\nWAW Nutzfahrzeuge",
        },
        tr: {
            subject: `WAW Nutzfahrzeuge faturanız ${invoiceNumber}`,
            greeting: `Merhaba ${customerName},`,
            attachment: `${invoiceNumber} numaralı faturanızı PDF olarak ekte bulabilirsiniz.`,
            questions: "Herhangi bir sorunuz varsa lütfen bizimle iletişime geçin.",
            closing: "Saygılarımızla\nWAW Nutzfahrzeuge",
        },
        uk: {
            subject: `Ваш рахунок ${invoiceNumber} від WAW Nutzfahrzeuge`,
            greeting: `Доброго дня ${customerName},`,
            attachment: `у вкладенні ви знайдете ваш рахунок ${invoiceNumber} у форматі PDF.`,
            questions: "Якщо у вас є запитання, будь ласка, зв'яжіться з нами.",
            closing: "З повагою\nWAW Nutzfahrzeuge",
        },
        hu: {
            subject: `Az Ön számlája ${invoiceNumber} a WAW Nutzfahrzeuge-tól`,
            greeting: `Jó napot ${customerName},`,
            attachment: `mellékelten küldjük a(z) ${invoiceNumber} számú számláját PDF formátumban.`,
            questions: "Kérdés esetén kérjük, vegye fel velünk a kapcsolatot.",
            closing: "Üdvözlettel\nWAW Nutzfahrzeuge",
        },
    };

    const template = templates[normalizedLanguage] ?? templates.en;
    const englishTemplate = templates.en;
    const localizedText = `${template.greeting}\n\n${template.attachment}\n\n${template.questions}\n\n${template.closing}`;
    const englishText = `${englishTemplate.greeting}\n\n${englishTemplate.attachment}\n\n${englishTemplate.questions}\n\n${englishTemplate.closing}`;
    const text = composeBilingualEmailText({
        language: normalizedLanguage,
        localizedText,
        englishText,
    });

    return {
        subject: template.subject,
        text,
        html: toHtml(text),
    };
}

export function getZugferdInvoiceEmailTemplate(
    language: string | null | undefined,
    params: InvoiceEmailTemplateParams,
): InvoiceEmailTemplate {
    const normalizedLanguage = normalizeEmailLanguage(language, "de");
    const invoiceNumber = params.invoiceNumber;
    const customerName = params.customerName;

    const templates: Partial<Record<EmailLanguage, TemplateText>> = {
        de: {
            subject: `Ihre E-Rechnung ${invoiceNumber} von WAW Nutzfahrzeuge`,
            greeting: `Guten Tag ${customerName},`,
            attachment: `anbei erhalten Sie Ihre Rechnung ${invoiceNumber} im ZUGFeRD-Format als PDF mit eingebetteten strukturierten Rechnungsdaten.`,
            questions: "Bei Fragen melden Sie sich gerne bei uns.",
            closing: "Mit freundlichen Grüßen\nWAW Nutzfahrzeuge",
        },
        en: {
            subject: `Your e-invoice ${invoiceNumber} from WAW Nutzfahrzeuge`,
            greeting: `Hello ${customerName},`,
            attachment: `please find attached your invoice ${invoiceNumber} in ZUGFeRD format as a PDF with embedded structured invoice data.`,
            questions: "If you have any questions, feel free to contact us.",
            closing: "Kind regards\nWAW Nutzfahrzeuge",
        },
        pl: {
            subject: `E-faktura ${invoiceNumber} od WAW Nutzfahrzeuge`,
            greeting: `Dzień dobry ${customerName},`,
            attachment: `w załączniku przesyłamy fakturę ${invoiceNumber} w formacie ZUGFeRD jako PDF z osadzonymi ustrukturyzowanymi danymi faktury.`,
            questions: "W razie pytań prosimy o kontakt.",
            closing: "Z poważaniem\nWAW Nutzfahrzeuge",
        },
        bg: {
            subject: `Вашата електронна фактура ${invoiceNumber} от WAW Nutzfahrzeuge`,
            greeting: `Здравейте ${customerName},`,
            attachment: `в прикачения файл ще намерите фактура ${invoiceNumber} във формат ZUGFeRD като PDF с вградени структурирани данни за фактурата.`,
            questions: "Ако имате въпроси, моля свържете се с нас.",
            closing: "С уважение\nWAW Nutzfahrzeuge",
        },
    };

    const fallbackTemplate: TemplateText = {
        subject: `Ihre E-Rechnung ${invoiceNumber} von WAW Nutzfahrzeuge`,
        greeting: `Guten Tag ${customerName},`,
        attachment: `anbei erhalten Sie Ihre Rechnung ${invoiceNumber} im ZUGFeRD-Format als PDF mit eingebetteten strukturierten Rechnungsdaten.`,
        questions: "Bei Fragen melden Sie sich gerne bei uns.",
        closing: "Mit freundlichen Grüßen\nWAW Nutzfahrzeuge",
    };
    const template = templates[normalizedLanguage] ?? fallbackTemplate;
    const englishTemplate = templates.en ?? fallbackTemplate;
    const localizedText = `${template.greeting}\n\n${template.attachment}\n\n${template.questions}\n\n${template.closing}`;
    const englishText = `${englishTemplate.greeting}\n\n${englishTemplate.attachment}\n\n${englishTemplate.questions}\n\n${englishTemplate.closing}`;
    const text = composeBilingualEmailText({
        language: normalizedLanguage,
        localizedText,
        englishText,
    });

    return {
        subject: template.subject,
        text,
        html: toHtml(text),
    };
}
