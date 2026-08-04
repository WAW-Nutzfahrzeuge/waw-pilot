import type { EmailLanguage } from "@/lib/customers/email-languages";
import { composeBilingualEmailText } from "@/lib/email/bilingual-email";
import type { SaleType } from "@/lib/sales/sale-queries";

export const STAMP_DOCUMENT_TYPES = [
    {
        key: "transport_proof",
        label: "Verbringungsnachweis",
        acceptedDocumentTypes: ["transport_proof", "transfer_receipt"],
        filePatterns: [/verbringungsnachweis/i, /transport[_\s-]?proof/i],
    },
    {
        key: "entry_certificate",
        label: "Gelangensbestätigung",
        acceptedDocumentTypes: ["entry_certificate", "confirmation_of_arrival"],
        filePatterns: [/gelangensbestaetigung/i, /gelangensbestätigung/i, /entry[_\s-]?certificate/i],
    },
    {
        key: "handover_protocol",
        label: "Übergabebestätigung",
        acceptedDocumentTypes: [
            "handover_protocol",
            "handover_confirmation",
            "handover_certificate",
        ],
        filePatterns: [/uebergabe/i, /übergabe/i, /handover/i],
    },
] as const;

export type StampDocumentKey = (typeof STAMP_DOCUMENT_TYPES)[number]["key"];

const STAMP_DOCUMENT_KEYS_BY_SALE_TYPE: Record<SaleType, readonly StampDocumentKey[]> = {
    inland: ["handover_protocol"],
    eu: ["entry_certificate", "transport_proof", "handover_protocol"],
    export_third_country: [],
};

export function getStampDocumentKeysForSaleType(
    saleType: SaleType,
): readonly StampDocumentKey[] {
    return STAMP_DOCUMENT_KEYS_BY_SALE_TYPE[saleType];
}

export type StampDocumentCandidate = {
    id: string;
    document_type: string;
    file_name: string;
    file_path: string | null;
    mime_type: string | null;
    file_size?: number | null;
    status?: string | null;
};

export function getStampDocumentType(
    document: Pick<StampDocumentCandidate, "document_type" | "file_name">,
): (typeof STAMP_DOCUMENT_TYPES)[number] | null {
    return (
        STAMP_DOCUMENT_TYPES.find(
            (definition) =>
                (definition.acceptedDocumentTypes as readonly string[]).includes(
                    document.document_type,
                ) ||
                definition.filePatterns.some((pattern) => pattern.test(document.file_name)),
        ) ?? null
    );
}

export function getAvailableStampDocuments(
    documents: StampDocumentCandidate[],
    saleType: SaleType = "eu",
): Array<StampDocumentCandidate & { stampKey: StampDocumentKey; label: string }> {
    const usedKeys = new Set<StampDocumentKey>();
    const allowedKeys = new Set(getStampDocumentKeysForSaleType(saleType));
    const result: Array<StampDocumentCandidate & { stampKey: StampDocumentKey; label: string }> = [];

    for (const document of documents) {
        const definition = getStampDocumentType(document);

        if (!definition || !allowedKeys.has(definition.key) || usedKeys.has(definition.key)) continue;
        if (!document.file_path || document.status === "missing") continue;

        usedKeys.add(definition.key);
        result.push({
            ...document,
            stampKey: definition.key,
            label: definition.label,
        });
    }

    return result;
}

export function getMissingStampDocumentLabels(
    documents: StampDocumentCandidate[],
    saleType: SaleType = "eu",
): string[] {
    const availableKeys = new Set(
        getAvailableStampDocuments(documents, saleType).map((document) => document.stampKey),
    );

    return STAMP_DOCUMENT_TYPES.filter(
        (definition) =>
            getStampDocumentKeysForSaleType(saleType).includes(definition.key) &&
            !availableKeys.has(definition.key),
    ).map((definition) => definition.label);
}

export function getStampDocumentsEmailTemplate({
                                                   language,
                                                   customerName,
                                                   vehicleLabel,
                                                   documentLabels,
                                               }: {
    language: EmailLanguage;
    customerName: string;
    vehicleLabel: string;
    documentLabels: string[];
}) {
    const documentList = documentLabels.map((label) => `- ${label}`).join("\n");

    if (language === "pl") {
        const subject = `Dokumenty do podpisu i opieczętowania - pojazd ${vehicleLabel}`;
        const text = `Dzień dobry ${customerName},

w załączniku przesyłamy dokumenty dotyczące pojazdu ${vehicleLabel}.

Prosimy o sprawdzenie załączonych dokumentów, podpisanie oraz opieczętowanie ich w wyznaczonych miejscach, a następnie odesłanie kompletnych dokumentów e-mailem.

Załączone dokumenty:
${documentList}

        Dziękujemy.

Z poważaniem
W.A.W Nutzfahrzeuge`;

        return {
            subject,
            text: composeBilingualEmailText({
                language,
                localizedText: text,
                englishText: getEnglishStampDocumentsEmailText({
                    customerName,
                    vehicleLabel,
                    documentList,
                }),
            }),
        };
    }

    if (language === "bg") {
        const subject = `Документи за подпис и печат - превозно средство ${vehicleLabel}`;
        const text = `Здравейте ${customerName},

в прикачения файл изпращаме документите за вашето превозно средство ${vehicleLabel}.

Моля, проверете приложените документи, подпишете и подпечатайте ги на посочените места и ни върнете попълнените документи по имейл.

Приложени документи:
${documentList}

Благодарим Ви.

С уважение
W.A.W Nutzfahrzeuge`;

        return {
            subject,
            text: composeBilingualEmailText({
                language,
                localizedText: text,
                englishText: getEnglishStampDocumentsEmailText({
                    customerName,
                    vehicleLabel,
                    documentList,
                }),
            }),
        };
    }

    const localizedCopy = STAMP_LANGUAGE_COPY[language];

    if (localizedCopy) {
        const localizedText = `${localizedCopy.greeting} ${customerName},

${localizedCopy.introduction} ${vehicleLabel}.

${localizedCopy.instructions}

        ${localizedCopy.documentsLabel}:
${documentLabels
    .map((label) => `- ${localizedCopy.documentLabelTranslations?.[label] ?? label}`)
    .join("\n")}

${localizedCopy.thanks}

${localizedCopy.closing}
W.A.W Nutzfahrzeuge`;

        return {
            subject: `${localizedCopy.subject} ${vehicleLabel}`,
            text: composeBilingualEmailText({
                language,
                localizedText,
                englishText: getEnglishStampDocumentsEmailText({
                    customerName,
                    vehicleLabel,
                    documentList,
                }),
            }),
        };
    }

    const englishSubject = `Documents for signature and stamp - Vehicle ${vehicleLabel}`;
    const englishText = getEnglishStampDocumentsEmailText({
        customerName,
        vehicleLabel,
        documentList,
    });

    if (language === "en") {
        return { subject: englishSubject, text: englishText };
    }

    const subject = `Dokumente zum Unterschreiben und Stempeln - Fahrzeug ${vehicleLabel}`;
    const germanText = `Guten Tag ${customerName},

anbei erhalten Sie die Unterlagen zu Ihrem Fahrzeug ${vehicleLabel}.

Bitte prüfen Sie die beigefügten Dokumente, unterschreiben beziehungsweise stempeln Sie diese an den vorgesehenen Stellen und senden Sie uns die vollständig ausgefüllten Unterlagen anschließend per E-Mail zurück.

Folgende Dokumente sind beigefügt:
${documentList}

Vielen Dank.

Mit freundlichen Grüßen
W.A.W Nutzfahrzeuge`;
    const text = composeBilingualEmailText({
        language,
        localizedText: germanText,
        englishText,
    });

    return { subject, text };
}

function getEnglishStampDocumentsEmailText({
                                                    customerName,
                                                    vehicleLabel,
                                                    documentList,
                                                }: {
    customerName: string;
    vehicleLabel: string;
    documentList: string;
}): string {
    return `Hello ${customerName},

please find attached the documents relating to your vehicle ${vehicleLabel}.

Please review the attached documents, sign and stamp them where indicated, and return the completed documents to us by email.

Attached documents:
${documentList}

Thank you.

Kind regards
W.A.W Nutzfahrzeuge`;
}

type StampLanguageCopy = {
    subject: string;
    greeting: string;
    introduction: string;
    instructions: string;
    documentsLabel: string;
    documentLabelTranslations?: Record<string, string>;
    thanks: string;
    closing: string;
};

const STAMP_LANGUAGE_COPY: Partial<Record<EmailLanguage, StampLanguageCopy>> = {
    ru: {
        subject: "Документы для подписи и печати - автомобиль",
        greeting: "Здравствуйте,",
        introduction: "во вложении отправляем документы, относящиеся к вашему автомобилю",
        instructions: "Пожалуйста, проверьте приложенные документы, подпишите и поставьте печать в указанных местах, а затем отправьте нам полностью заполненные документы по электронной почте.",
        documentsLabel: "Приложенные документы",
        documentLabelTranslations: {
            "Gelangensbestätigung": "Подтверждение прибытия",
            "Verbringungsnachweis": "Подтверждение перевозки",
            "Übergabebestätigung": "Подтверждение передачи",
        },
        thanks: "Спасибо.",
        closing: "С уважением",
    },
    sq: {
        subject: "Dokumente për nënshkrim dhe vulë - automjeti",
        greeting: "Përshëndetje",
        introduction: "në bashkëngjitje po ju dërgojmë dokumentet për automjetin",
        instructions: "Ju lutemi kontrolloni, nënshkruani dhe vulosni dokumentet në vendet e shënuara dhe na i ktheni me e-mail.",
        documentsLabel: "Dokumentet e bashkëngjitura",
        thanks: "Faleminderit.",
        closing: "Me respekt",
    },
    ar: {
        subject: "مستندات التوقيع والختم - السيارة",
        greeting: "مرحباً",
        introduction: "نرسل لكم في المرفق المستندات الخاصة بالسيارة",
        instructions: "يرجى مراجعة المستندات وتوقيعها وختمها في الأماكن المحددة ثم إعادة المستندات المكتملة إلينا عبر البريد الإلكتروني.",
        documentsLabel: "المستندات المرفقة",
        thanks: "شكراً لكم.",
        closing: "مع خالص التحية",
    },
    be: {
        subject: "Дакументы для подпісу і пячаткі - аўтамабіль",
        greeting: "Добры дзень",
        introduction: "у дадатку дасылаем дакументы на аўтамабіль",
        instructions: "Калі ласка, праверце дакументы, падпішыце і пастаўце пячатку ў пазначаных месцах, а затым дашліце іх нам па электроннай пошце.",
        documentsLabel: "Далучаныя дакументы",
        thanks: "Дзякуй.",
        closing: "З павагай",
    },
    bs: {
        subject: "Dokumenti za potpis i pečat - vozilo",
        greeting: "Dobar dan",
        introduction: "u prilogu vam šaljemo dokumente za vozilo",
        instructions: "Molimo vas da provjerite dokumente, potpišete ih i ovjerite pečatom na označenim mjestima, a zatim ih pošaljete nazad e-mailom.",
        documentsLabel: "Priloženi dokumenti",
        thanks: "Hvala vam.",
        closing: "Srdačan pozdrav",
    },
    ca: {
        subject: "Documents per signar i segellar - vehicle",
        greeting: "Bon dia",
        introduction: "adjunt us enviem els documents del vehicle",
        instructions: "Reviseu els documents adjunts, signeu-los i segelleu-los als llocs indicats i retorneu-nos-els per correu electrònic.",
        documentsLabel: "Documents adjunts",
        thanks: "Moltes gràcies.",
        closing: "Cordialment",
    },
    hr: {
        subject: "Dokumenti za potpis i pečat - vozilo",
        greeting: "Dobar dan",
        introduction: "u privitku šaljemo dokumente za vozilo",
        instructions: "Molimo vas da pregledate dokumente, potpišete ih i ovjerite pečatom na označenim mjestima te nam ih vratite e-poštom.",
        documentsLabel: "Priloženi dokumenti",
        thanks: "Hvala vam.",
        closing: "Srdačan pozdrav",
    },
    da: {
        subject: "Dokumenter til underskrift og stempel - køretøj",
        greeting: "Goddag",
        introduction: "vedhæftet sender vi dokumenterne vedrørende køretøjet",
        instructions: "Kontroller venligst dokumenterne, underskriv og stempl dem de markerede steder, og send dem derefter tilbage til os pr. e-mail.",
        documentsLabel: "Vedhæftede dokumenter",
        thanks: "Mange tak.",
        closing: "Med venlig hilsen",
    },
    et: {
        subject: "Allkirjastamise ja templi dokumendid - sõiduk",
        greeting: "Tere",
        introduction: "lisame kirjale sõidukiga seotud dokumendid",
        instructions: "Palun kontrollige dokumendid üle, allkirjastage ja tembeldage need märgitud kohtades ning saatke täidetud dokumendid meile e-posti teel tagasi.",
        documentsLabel: "Manustatud dokumendid",
        thanks: "Täname.",
        closing: "Lugupidamisega",
    },
    fi: {
        subject: "Allekirjoitettavat ja leimattavat asiakirjat - ajoneuvo",
        greeting: "Hei",
        introduction: "lähetämme liitteenä ajoneuvoa koskevat asiakirjat",
        instructions: "Tarkistathan liitteenä olevat asiakirjat, allekirjoita ja leimaa ne merkityistä kohdista ja lähetä täytetyt asiakirjat takaisin sähköpostitse.",
        documentsLabel: "Liitetyt asiakirjat",
        thanks: "Kiitos.",
        closing: "Ystävällisin terveisin",
    },
    fr: {
        subject: "Documents à signer et tamponner - véhicule",
        greeting: "Bonjour",
        introduction: "vous trouverez en pièce jointe les documents concernant le véhicule",
        instructions: "Veuillez vérifier les documents, les signer et les tamponner aux endroits indiqués, puis nous les retourner par e-mail.",
        documentsLabel: "Documents joints",
        thanks: "Merci.",
        closing: "Cordialement",
    },
    el: {
        subject: "Έγγραφα για υπογραφή και σφραγίδα - όχημα",
        greeting: "Καλημέρα",
        introduction: "επισυνάπτουμε τα έγγραφα για το όχημα",
        instructions: "Παρακαλούμε ελέγξτε τα έγγραφα, υπογράψτε και σφραγίστε τα στα επισημασμένα σημεία και επιστρέψτε τα συμπληρωμένα μέσω e-mail.",
        documentsLabel: "Συνημμένα έγγραφα",
        thanks: "Ευχαριστούμε.",
        closing: "Με εκτίμηση",
    },
    ga: {
        subject: "Doiciméid le síniú agus stampa - feithicil",
        greeting: "Dia dhuit",
        introduction: "seolaimid na doiciméid a bhaineann leis an bhfeithicil faoi iamh",
        instructions: "Seiceáil na doiciméid, sínigh agus stampáil iad sna háiteanna sonraithe agus seol na doiciméid chomhlánaithe ar ais chugainn trí ríomhphost le do thoil.",
        documentsLabel: "Doiciméid faoi iamh",
        thanks: "Go raibh maith agat.",
        closing: "Le meas",
    },
    is: {
        subject: "Skjöl til undirritunar og stimplunar - ökutæki",
        greeting: "Góðan dag",
        introduction: "meðfylgjandi eru skjöl varðandi ökutækið",
        instructions: "Vinsamlegast farið yfir skjölin, undirritið og stimplið á merktum stöðum og sendið útfyllt skjöl aftur með tölvupósti.",
        documentsLabel: "Meðfylgjandi skjöl",
        thanks: "Takk fyrir.",
        closing: "Bestu kveðjur",
    },
    it: {
        subject: "Documenti da firmare e timbrare - veicolo",
        greeting: "Buongiorno",
        introduction: "in allegato inviamo i documenti relativi al veicolo",
        instructions: "Vi preghiamo di controllare i documenti, firmarli e timbrarli nei punti indicati, quindi di restituirceli via e-mail.",
        documentsLabel: "Documenti allegati",
        thanks: "Grazie.",
        closing: "Cordiali saluti",
    },
    lv: {
        subject: "Dokumenti parakstīšanai un apzīmogošanai - transportlīdzeklis",
        greeting: "Labdien",
        introduction: "pielikumā nosūtām ar transportlīdzekli saistītos dokumentus",
        instructions: "Lūdzu, pārbaudiet dokumentus, parakstiet un apzīmogojiet tos norādītajās vietās, pēc tam nosūtiet aizpildītos dokumentus mums pa e-pastu.",
        documentsLabel: "Pievienotie dokumenti",
        thanks: "Paldies.",
        closing: "Ar cieņu",
    },
    lt: {
        subject: "Dokumentai pasirašyti ir antspauduoti - transporto priemonė",
        greeting: "Laba diena",
        introduction: "pridedame su transporto priemone susijusius dokumentus",
        instructions: "Prašome patikrinti dokumentus, pasirašyti ir antspauduoti nurodytose vietose, tada užpildytus dokumentus atsiųsti mums el. paštu.",
        documentsLabel: "Pridedami dokumentai",
        thanks: "Ačiū.",
        closing: "Pagarbiai",
    },
    lb: {
        subject: "Dokumenter fir Ënnerschrëft a Stempel - Gefier",
        greeting: "Gudde Moien",
        introduction: "am Uschloss schécke mir d'Dokumenter zum Gefier",
        instructions: "Kuckt d'Dokumenter w.e.g. no, ënnerschreift a stempelt se op de markéierte Plazen a schéckt se eis per E-Mail zréck.",
        documentsLabel: "Uschlossdokumenter",
        thanks: "Merci.",
        closing: "Mat frëndleche Gréiss",
    },
    mk: {
        subject: "Документи за потпис и печат - возило",
        greeting: "Добар ден",
        introduction: "во прилог ви ги испраќаме документите за возилото",
        instructions: "Ве молиме проверете ги документите, потпишете ги и ставете печат на означените места, а потоа испратете ни ги пополнетите документи по е-пошта.",
        documentsLabel: "Приложени документи",
        thanks: "Ви благодариме.",
        closing: "Со почит",
    },
    mt: {
        subject: "Dokumenti għall-firma u t-timbru - vettura",
        greeting: "Bongu",
        introduction: "mehmużin qed nibagħtulek id-dokumenti relatati mal-vettura",
        instructions: "Jekk jogħġbok iċċekkja d-dokumenti, iffirmahom u poġġi t-timbru fil-postijiet indikati, u mbagħad ibgħathom lura bl-e-mail.",
        documentsLabel: "Dokumenti mehmuża",
        thanks: "Grazzi.",
        closing: "Tislijiet",
    },
    nl: {
        subject: "Documenten voor ondertekening en stempel - voertuig",
        greeting: "Goedendag",
        introduction: "in de bijlage sturen wij de documenten voor het voertuig",
        instructions: "Controleer de documenten, onderteken en stempel ze op de aangegeven plaatsen en stuur de ingevulde documenten per e-mail aan ons terug.",
        documentsLabel: "Bijgevoegde documenten",
        thanks: "Hartelijk dank.",
        closing: "Met vriendelijke groet",
    },
    no: {
        subject: "Dokumenter for signering og stempel - kjøretøy",
        greeting: "God dag",
        introduction: "vedlagt sender vi dokumentene for kjøretøyet",
        instructions: "Kontroller dokumentene, signer og stemple dem på de angitte stedene, og send de utfylte dokumentene tilbake til oss på e-post.",
        documentsLabel: "Vedlagte dokumenter",
        thanks: "Takk.",
        closing: "Med vennlig hilsen",
    },
    pt: {
        subject: "Documentos para assinatura e carimbo - veículo",
        greeting: "Bom dia",
        introduction: "enviamos em anexo os documentos relativos ao veículo",
        instructions: "Por favor, verifique os documentos, assine e carimbe nos locais indicados e devolva-nos os documentos preenchidos por e-mail.",
        documentsLabel: "Documentos anexos",
        thanks: "Muito obrigado.",
        closing: "Com os melhores cumprimentos",
    },
    ro: {
        subject: "Documente pentru semnătură și ștampilă - vehicul",
        greeting: "Bună ziua",
        introduction: "în atașament vă trimitem documentele referitoare la vehicul",
        instructions: "Vă rugăm să verificați documentele, să le semnați și să le ștampilați în locurile indicate, apoi să ni le trimiteți completate prin e-mail.",
        documentsLabel: "Documente atașate",
        thanks: "Vă mulțumim.",
        closing: "Cu stimă",
    },
    sr: {
        subject: "Dokumenta za potpis i pečat - vozilo",
        greeting: "Dobar dan",
        introduction: "u prilogu vam šaljemo dokumenta za vozilo",
        instructions: "Molimo vas da proverite dokumenta, potpišete ih i overite pečatom na označenim mestima, a zatim nam ih vratite elektronskom poštom.",
        documentsLabel: "Priložena dokumenta",
        thanks: "Hvala vam.",
        closing: "Srdačan pozdrav",
    },
    sk: {
        subject: "Dokumenty na podpis a opečiatkovanie - vozidlo",
        greeting: "Dobrý deň",
        introduction: "v prílohe vám posielame dokumenty k vozidlu",
        instructions: "Skontrolujte dokumenty, podpíšte ich a opečiatkujte na označených miestach a potom nám vyplnené dokumenty pošlite späť e-mailom.",
        documentsLabel: "Priložené dokumenty",
        thanks: "Ďakujeme.",
        closing: "S pozdravom",
    },
    sl: {
        subject: "Dokumenti za podpis in žig - vozilo",
        greeting: "Dober dan",
        introduction: "v priponki vam pošiljamo dokumente za vozilo",
        instructions: "Prosimo, preverite dokumente, jih podpišite in ožigosajte na označenih mestih ter nam izpolnjene dokumente vrnite po e-pošti.",
        documentsLabel: "Priloženi dokumenti",
        thanks: "Hvala.",
        closing: "Lep pozdrav",
    },
    es: {
        subject: "Documentos para firmar y sellar - vehículo",
        greeting: "Buenos días",
        introduction: "adjuntamos los documentos relativos al vehículo",
        instructions: "Revise los documentos, fírmelos y séllelos en los lugares indicados y devuélvanos los documentos cumplimentados por correo electrónico.",
        documentsLabel: "Documentos adjuntos",
        thanks: "Muchas gracias.",
        closing: "Un cordial saludo",
    },
    sv: {
        subject: "Dokument för underskrift och stämpel - fordon",
        greeting: "God dag",
        introduction: "bifogat skickar vi dokumenten för fordonet",
        instructions: "Kontrollera dokumenten, underteckna och stämpla dem på de angivna platserna och skicka sedan tillbaka de ifyllda dokumenten via e-post.",
        documentsLabel: "Bifogade dokument",
        thanks: "Tack.",
        closing: "Med vänliga hälsningar",
    },
    cs: {
        subject: "Dokumenty k podpisu a orazítkování - vozidlo",
        greeting: "Dobrý den",
        introduction: "v příloze zasíláme dokumenty k vozidlu",
        instructions: "Zkontrolujte prosím dokumenty, podepište je a orazítkujte na označených místech a poté nám vyplněné dokumenty zašlete zpět e-mailem.",
        documentsLabel: "Přiložené dokumenty",
        thanks: "Děkujeme.",
        closing: "S pozdravem",
    },
    tr: {
        subject: "İmza ve kaşe için belgeler - araç",
        greeting: "Merhaba",
        introduction: "ekte araçla ilgili belgeleri gönderiyoruz",
        instructions: "Lütfen belgeleri kontrol edin, belirtilen yerleri imzalayıp kaşeleyin ve doldurulmuş belgeleri e-posta ile bize geri gönderin.",
        documentsLabel: "Ekli belgeler",
        thanks: "Teşekkür ederiz.",
        closing: "Saygılarımızla",
    },
    uk: {
        subject: "Документи для підпису та печатки - автомобіль",
        greeting: "Добрий день",
        introduction: "у додатку надсилаємо документи щодо автомобіля",
        instructions: "Будь ласка, перевірте документи, підпишіть і поставте печатку у зазначених місцях, а потім надішліть нам заповнені документи електронною поштою.",
        documentsLabel: "Додані документи",
        thanks: "Дякуємо.",
        closing: "З повагою",
    },
    hu: {
        subject: "Aláírandó és lebélyegzendő dokumentumok - jármű",
        greeting: "Jó napot kívánok",
        introduction: "mellékelten küldjük a járműhöz tartozó dokumentumokat",
        instructions: "Kérjük, ellenőrizze a dokumentumokat, írja alá és bélyegezze le őket a megjelölt helyeken, majd küldje vissza a kitöltött dokumentumokat e-mailben.",
        documentsLabel: "Mellékelt dokumentumok",
        thanks: "Köszönjük.",
        closing: "Üdvözlettel",
    },
};
