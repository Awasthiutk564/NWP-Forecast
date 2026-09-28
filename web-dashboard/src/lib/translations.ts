export type Language = "en" | "te" | "hi";

export interface TranslationStrings {
  title: string;
  subtitle: string;
  liveMap: string;
  overview: string;
  alerts: string;
  scores: string;
  weights: string;
  forecastMap: string;
  alertMap: string;
  weightMap: string;
  variable: string;
  rainfall: string;
  temperature: string;
  issuedOn: string;
  validFor: string;
  leadTime: string;
  day: string;
  daysAhead: string;
  areaMax: string;
  areaMean: string;
  areaMin: string;
  allDistricts: string;
  selectDistrict: string;
  districtDetails: string;
  alertLevel: string;
  hazard: string;
  heavyRain: string;
  heatwave: string;
  noAlerts: string;
  redAlert: string;
  orangeAlert: string;
  yellowAlert: string;
  greenAlert: string;
  mapLayer: string;
  contourGrid: string;
  districtBorders: string;
  sourceTrust: string;
  quickDates: string;
  michaungCyclone: string;
  monsoonPeak: string;
  latest: string;
  instructions: string;
  legend: string;
  trustLow: string;
  trustHigh: string;
}

export const TRANSLATIONS: Record<Language, TranslationStrings> = {
  en: {
    title: "Hybrid AI–NWP Live Map: AP & Telangana",
    subtitle: "Real-time high-resolution numerical weather prediction and district alerts",
    liveMap: "Live Map",
    overview: "Overview",
    alerts: "Alerts",
    scores: "Skill Scores",
    weights: "Weight Maps",
    forecastMap: "Gridded Forecast Map",
    alertMap: "District Alert Choropleth",
    weightMap: "Blend Weight Comparison",
    variable: "Variable",
    rainfall: "Rainfall (mm/day)",
    temperature: "Max Temperature (°C)",
    issuedOn: "Forecast Issued",
    validFor: "Valid For",
    leadTime: "Lead Horizon",
    day: "Day",
    daysAhead: "days ahead",
    areaMax: "Area Maximum",
    areaMean: "Area Mean",
    areaMin: "Area Minimum",
    allDistricts: "All Districts",
    selectDistrict: "Filter / Inspect District",
    districtDetails: "District Warning Card",
    alertLevel: "Alert Level",
    hazard: "Hazard Category",
    heavyRain: "Heavy Rainfall",
    heatwave: "Severe Heatwave",
    noAlerts: "No severe weather alerts active for this selection.",
    redAlert: "Red Alert (Take Action)",
    orangeAlert: "Orange Alert (Be Prepared)",
    yellowAlert: "Yellow Alert (Be Aware)",
    greenAlert: "Normal (No Warning)",
    mapLayer: "Map Overlay View",
    contourGrid: "Continuous Forecast Field",
    districtBorders: "Vector District Boundaries",
    sourceTrust: "Multi-Model Trust & Weights",
    quickDates: "Key Scenarios:",
    michaungCyclone: "Cyclone Michaung (04 Dec 2023)",
    monsoonPeak: "Monsoon Peak (15 Jul 2023)",
    latest: "Latest Forecast",
    instructions: "Click or hover over any district polygon or coordinate to inspect real-time forecast values.",
    legend: "Legend & Scale",
    trustLow: "Low Weight (0%)",
    trustHigh: "High Weight (80%+)"
  },
  te: {
    title: "హైబ్రిడ్ AI–NWP లైవ్ మ్యాప్: ఆంధ్రప్రదేశ్ & తెలంగాణ",
    subtitle: "రియల్ టైమ్ వాతావరణ అంచనా మరియు జిల్లా హెచ్చరికల పటం",
    liveMap: "లైవ్ మ్యాప్",
    overview: "సమీక్ష",
    alerts: "హెచ్చరికలు",
    scores: "ఖచ్చితత్వ స్కోర్లు",
    weights: "మోడల్ వెయిట్స్",
    forecastMap: "గ్రిడ్ ఆధారిత వాతావరణ పటం",
    alertMap: "జిల్లాల వారీ హెచ్చరిక పటం",
    weightMap: "మోడల్ విశ్వసనీయత పటం",
    variable: "వాతావరణ అంశం",
    rainfall: "వర్షపాతం (మి.మీ/రోజు)",
    temperature: "గరిష్ట ఉష్ణోగ్రత (°C)",
    issuedOn: "అంచనా విడుదల తేది",
    validFor: "వర్తించే తేది",
    leadTime: "ముందస్తు వ్యవధి",
    day: "రోజు",
    daysAhead: "రోజుల ముందు",
    areaMax: "ప్రాంతీయ గరిష్టం",
    areaMean: "ప్రాంతీయ సగటు",
    areaMin: "ప్రాంతీయ కనిష్టం",
    allDistricts: "అన్ని జిల్లాలు",
    selectDistrict: "జిల్లాను ఎంచుకోండి",
    districtDetails: "జిల్లా హెచ్చరిక వివరాలు",
    alertLevel: "హెచ్చరిక స్థాయి",
    hazard: "ప్రమాద రకం",
    heavyRain: "భారీ వర్షం",
    heatwave: "తీవ్ర వడగాల్పులు",
    noAlerts: "ఈ ఎంపికకు ఎలాంటి ప్రమాద హెచ్చరికలు లేవు.",
    redAlert: "ఎరుపు రంగు హెచ్చరిక (వెంటనే చర్యలు చేపట్టండి)",
    orangeAlert: "నారింజ రంగు హెచ్చరిక (సిద్ధంగా ఉండండి)",
    yellowAlert: "పసుపు రంగు హెచ్చరిక (అప్రమత్తంగా ఉండండి)",
    greenAlert: "సాధారణం (ఎలాంటి ప్రమాదం లేదు)",
    mapLayer: "మ్యాప్ వీక్షణ",
    contourGrid: "నిరంతర వాతావరణ గ్రిడ్",
    districtBorders: "జిల్లా సరిహద్దులు",
    sourceTrust: "మోడళ్ల వెయిట్స్ మరియు నమ్మకశీలం",
    quickDates: "ముఖ్య సందర్భాలు:",
    michaungCyclone: "మిచాంగ్ తుఫాను (04 డిసెంబర్ 2023)",
    monsoonPeak: "రుతుపవనాల గరిష్టం (15 జూలై 2023)",
    latest: "తాజా అంచనా",
    instructions: "రియల్ టైమ్ వాతావరణ వివరాల కోసం మ్యాప్‌లోని జిల్లాపై క్లిక్ చేయండి.",
    legend: "కొలమానం",
    trustLow: "తక్కువ బరువు (0%)",
    trustHigh: "ఎక్కువ బరువు (80%+)"
  },
  hi: {
    title: "हाइब्रिड AI–NWP लाइव मैप: आंध्र प्रदेश एवं तेलंगाना",
    subtitle: "रीयल-टाइम संख्यात्मक मौसम पूर्वानुमान एवं जिला-स्तरीय आपदा चेतावनी",
    liveMap: "लाइव मैप",
    overview: "अवलोकन",
    alerts: "चेतावनी",
    scores: "सटीकता स्कोर",
    weights: "मॉडल भार",
    forecastMap: "ग्रिडेड पूर्वानुमान मानचित्र",
    alertMap: "जिला-स्तरीय चेतावनी मानचित्र",
    weightMap: "मॉडल विश्वसनीयता तुलना",
    variable: "मौसम चर",
    rainfall: "वर्षा (मिमी/दिन)",
    temperature: "अधिकतम तापमान (°C)",
    issuedOn: "पूर्वानुमान जारी दिनांक",
    validFor: "प्रभावी दिनांक",
    leadTime: "लीड समय",
    day: "दिन",
    daysAhead: "दिन पूर्व",
    areaMax: "क्षेत्रीय अधिकतम",
    areaMean: "क्षेत्रीय औसत",
    areaMin: "क्षेत्रीय न्यूनतम",
    allDistricts: "सभी जिले",
    selectDistrict: "जिला चुनें / निरीक्षण करें",
    districtDetails: "जिला चेतावनी कार्ड",
    alertLevel: "चेतावनी स्तर",
    hazard: "आपदा श्रेणी",
    heavyRain: "भारी वर्षा",
    heatwave: "भीषण लू (हीटवेव)",
    noAlerts: "इस चयन के लिए कोई गंभीर चेतावनी नहीं है।",
    redAlert: "रेड अलर्ट (तत्काल कार्रवाई करें)",
    orangeAlert: "ऑरेंज अलर्ट (सतर्क रहें)",
    yellowAlert: "येलो अलर्ट (सावधान रहें)",
    greenAlert: "सामान्य (कोई चेतावनी नहीं)",
    mapLayer: "मानचित्र दृश्य",
    contourGrid: "निरंतर पूर्वानुमान क्षेत्र",
    districtBorders: "जिला सीमाएं",
    sourceTrust: "मॉडल योगदान एवं भार",
    quickDates: "प्रमुख घटनाएं:",
    michaungCyclone: "मिचौंग चक्रवात (04 दिस 2023)",
    monsoonPeak: "मानसून चरम (15 जुला 2023)",
    latest: "नवीनतम पूर्वानुमान",
    instructions: "रीयल-टाइम मौसम आंकड़े देखने के लिए किसी भी जिले पर क्लिक या होवर करें।",
    legend: "पैमाना",
    trustLow: "न्यूनतम भार (0%)",
    trustHigh: "उच्चतम भार (80%+)"
  }
};
