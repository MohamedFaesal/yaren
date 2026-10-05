import type { ReactNode } from "react";

const codes: Record<string, string> = {
  Afghan: "AF", Albanian: "AL", Algerian: "DZ", American: "US", Andorran: "AD", Angolan: "AO", Argentine: "AR", Armenian: "AM", Australian: "AU", Austrian: "AT",
  Azerbaijani: "AZ", Bahamian: "BS", Bahraini: "BH", Bangladeshi: "BD", Barbadian: "BB", Belarusian: "BY", Belgian: "BE", Belizean: "BZ", Beninese: "BJ", Bhutanese: "BT",
  Bolivian: "BO", Bosnian: "BA", Botswanan: "BW", Brazilian: "BR", British: "GB", Bruneian: "BN", Bulgarian: "BG", Burkinabe: "BF", Burmese: "MM", Burundian: "BI",
  Cambodian: "KH", Cameroonian: "CM", Canadian: "CA", "Cape Verdean": "CV", "Central African": "CF", Chadian: "TD", Chilean: "CL", Chinese: "CN", Colombian: "CO", Comorian: "KM",
  Congolese: "CD", "Costa Rican": "CR", Croatian: "HR", Cuban: "CU", Cypriot: "CY", Czech: "CZ", Danish: "DK", Djiboutian: "DJ", Dominican: "DO", Dutch: "NL",
  "East Timorese": "TL", Ecuadorean: "EC", Egyptian: "EG", Emirati: "AE", "Equatorial Guinean": "GQ", Eritrean: "ER", Estonian: "EE", Ethiopian: "ET", Fijian: "FJ", Finnish: "FI",
  French: "FR", Gabonese: "GA", Gambian: "GM", Georgian: "GE", German: "DE", Ghanaian: "GH", Greek: "GR", Grenadian: "GD", Guatemalan: "GT", Guinean: "GN",
  Guyanese: "GY", Haitian: "HT", Honduran: "HN", Hungarian: "HU", Icelandic: "IS", Indian: "IN", Indonesian: "ID", Iranian: "IR", Iraqi: "IQ", Irish: "IE",
  Israeli: "IL", Italian: "IT", Ivorian: "CI", Jamaican: "JM", Japanese: "JP", Jordanian: "JO", Kazakh: "KZ", Kenyan: "KE", Kuwaiti: "KW", Kyrgyz: "KG",
  Laotian: "LA", Latvian: "LV", Lebanese: "LB", Liberian: "LR", Libyan: "LY", Liechtensteiner: "LI", Lithuanian: "LT", Luxembourgish: "LU", Macedonian: "MK", Malagasy: "MG",
  Malawian: "MW", Malaysian: "MY", Maldivian: "MV", Malian: "ML", Maltese: "MT", Mauritanian: "MR", Mauritian: "MU", Mexican: "MX", Moldovan: "MD", Monacan: "MC",
  Mongolian: "MN", Montenegrin: "ME", Moroccan: "MA", Mozambican: "MZ", Namibian: "NA", Nepalese: "NP", "New Zealander": "NZ", Nicaraguan: "NI", Nigerien: "NE", Nigerian: "NG",
  "North Korean": "KP", Norwegian: "NO", Omani: "OM", Pakistani: "PK", Palestinian: "PS", Panamanian: "PA", "Papua New Guinean": "PG", Paraguayan: "PY", Peruvian: "PE", Philippine: "PH",
  Polish: "PL", Portuguese: "PT", Qatari: "QA", Romanian: "RO", Russian: "RU", Rwandan: "RW", Salvadoran: "SV", Sammarinese: "SM", Saudi: "SA", Senegalese: "SN",
  Serbian: "RS", Seychellois: "SC", "Sierra Leonean": "SL", Singaporean: "SG", Slovak: "SK", Slovenian: "SI", Somali: "SO", "South African": "ZA", "South Korean": "KR", Spanish: "ES",
  "Sri Lankan": "LK", Sudanese: "SD", Surinamese: "SR", Swazi: "SZ", Swedish: "SE", Swiss: "CH", Syrian: "SY", Taiwanese: "TW", Tajik: "TJ", Tanzanian: "TZ",
  Thai: "TH", Togolese: "TG", Tongan: "TO", Trinidadian: "TT", Tunisian: "TN", Turkish: "TR", Turkmen: "TM", Ugandan: "UG", Ukrainian: "UA", Uruguayan: "UY",
  Uzbek: "UZ", Venezuelan: "VE", Vietnamese: "VN", Yemeni: "YE", Zambian: "ZM", Zimbabwean: "ZW",
};

export function nationalityFlag(nationality: string) {
  const code = codes[nationality];
  if (!code) return "";
  return [...code.toUpperCase()].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}

export function NationalityLabel({ nationality }: { nationality: string }) {
  const flag = nationalityFlag(nationality);
  if (!flag) return <>{nationality}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="text-base leading-none">{flag}</span>
      <span>{nationality}</span>
    </span>
  );
}

export function nationalityOption(nationality: string): { value: string; label: string; icon?: ReactNode } {
  const flag = nationalityFlag(nationality);
  return {
    value: nationality,
    label: nationality,
    icon: flag ? <span aria-hidden="true" className="text-base leading-none">{flag}</span> : undefined,
  };
}
