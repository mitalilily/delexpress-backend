"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredKycFieldMap = exports.requiredKycDetails = exports.OTP_EXPIRY = void 0;
exports.OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes
exports.requiredKycDetails = {
    individual: ["panCardUrl", "aadhaarUrl", "cancelledChequeUrl"],
    sole_proprietor: [
        "panCardUrl",
        "aadhaarUrl",
        "cancelledChequeUrl",
        "gstin",
        "gstCertificateUrl",
    ],
    partnership_firm: [
        "partnershipDeedUrl",
        "panCardUrl",
        "aadhaarUrl",
        "cancelledChequeUrl",
        "gstin",
        "gstCertificateUrl",
    ],
    company: {
        private_limited: [
            "cin",
            "gstin",
            "gstCertificateUrl",
            "boardResolutionUrl",
            "businessPanUrl",
            "aadhaarUrl",
            "gstCertificateUrl",
        ],
        llp: [
            "businessPanUrl",
            "aadhaarUrl",
            "companyAddressProofUrl",
            "cancelledChequeUrl",
            "llpAgreementUrl",
            "gstin",
            "gstCertificateUrl",
        ],
        one_person_company: [
            "businessPanUrl",
            "aadhaarUrl",
            "cin",
            "companyAddressProofUrl",
            "cancelledChequeUrl",
        ],
        section_8_company: [
            "businessPanUrl",
            "aadhaarUrl",
            "companyAddressProofUrl",
            "boardResolutionUrl",
            "cancelledChequeUrl",
        ],
        public_limited: [
            "businessPanUrl",
            "aadhaarUrl",
            "gstin",
            "gstCertificateUrl",
        ],
    },
};
exports.requiredKycFieldMap = {
    individual: {
        panCardUrl: true,
        aadhaarUrl: true,
        cancelledChequeUrl: true,
    },
    sole_proprietor: {
        panCardUrl: true,
        aadhaarUrl: true,
        cancelledChequeUrl: true,
        gstin: false,
    },
    partnership_firm: {
        partnershipDeedUrl: true,
        panCardUrl: true,
        aadhaarUrl: true,
        cancelledChequeUrl: true,
        gstin: false,
        gstCertificateUrl: false,
    },
    company: {
        private_limited: {
            cin: true,
            gstin: false,
            gstCertificateUrl: true,
            boardResolutionUrl: true,
            businessPanUrl: true,
            aadhaarUrl: true,
        },
        llp: {
            businessPanUrl: true,
            aadhaarUrl: true,
            companyAddressProofUrl: true,
            cancelledChequeUrl: true,
            llpAgreementUrl: true,
            gstin: false,
            gstCertificateUrl: false,
        },
        one_person_company: {
            businessPanUrl: true,
            aadhaarUrl: true,
            cin: true,
            companyAddressProofUrl: true,
            cancelledChequeUrl: true,
        },
        section_8_company: {
            businessPanUrl: true,
            aadhaarUrl: true,
            companyAddressProofUrl: true,
            boardResolutionUrl: true,
            cancelledChequeUrl: true,
        },
        public_limited: {
            businessPanUrl: true,
            aadhaarUrl: true,
            gstin: false,
            gstCertificateUrl: true,
        },
    },
};
