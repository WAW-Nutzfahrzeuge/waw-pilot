export type PdfCompany = {
    legalName: string;
    street: string;
    postalCode: string;
    city: string;
    country: string;
    email: string | null;
    website?: string | null;
    phone: string | null;
    mobilePhone1?: string | null;
    mobilePhone2?: string | null;
    vatId: string | null;
    taxNumber: string | null;
};

export type PdfCustomer = {
    name: string;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    email?: string | null;
    phone?: string | null;
    vatId?: string | null;
};

export type PdfVehicle = {
    internalNumber: string;
    manufacturer: string;
    model: string;
    vehicleType: string;
    vin: string;
    licensePlate?: string | null;
    firstRegistration: string | null;
    constructionYear: number | null;
};

export type PdfDocumentContext = {
    company: PdfCompany;
    customer: PdfCustomer;
    vehicle: PdfVehicle;
};
