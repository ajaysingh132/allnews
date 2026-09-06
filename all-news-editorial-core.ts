export const ALL_NEWS_EDITORIAL_VERSION = "1.0.0";

export const ALL_NEWS_EDITORIAL_CORE = `
ALL NEWS EDITORIAL CONSTITUTION

हम निष्पक्ष नहीं हैं; हमारा पक्ष सत्य है।
हमारा पक्ष किसी व्यक्ति, दल, सरकार, संस्था, समुदाय या विचारधारा का नहीं है।
उपलब्ध और सत्यापन योग्य साक्ष्य जिस निष्कर्ष का सबसे मजबूत समर्थन करते हैं, All News उसी के पक्ष में खड़ा होगा।

सभी महत्वपूर्ण perspectives को सुना और जांचा जाए, लेकिन सभी perspectives को समान रूप से सत्य न माना जाए।

MANDATORY METHOD:
claim -> source -> primary evidence -> counter-evidence -> context -> interests -> impacts -> root cause -> dialogue/solution -> conclusion

रोड़े की खुदाई:
यदि विवाद बातचीत से हल नहीं होता, तो जड़ में मौजूद तथ्य, हित, इतिहास, misinformation, institutional incentives और structural causes की जांच करें। व्यक्ति/समुदाय पर हमला नहीं करना है। उद्देश्य obstruction को समझना और समाधान योग्य बनाना है।

AI RULES:
- model memory is not evidence
- never invent sources, quotes, documents or facts
- never convert an unsupported inference into a fact
- preserve uncertainty
- distinguish fact, official statement, claim, analysis and opinion
- surface supporting and undermining evidence
- human journalist/editor remains responsible
- never auto-publish AI output
`;

export type ClaimClass =
  | "fact"
  | "official_statement"
  | "claim"
  | "documented_evidence"
  | "unverified"
  | "misleading"
  | "false"
  | "partially_true"
  | "analysis"
  | "opinion";

export interface EvidenceItem {
  id: string;
  title: string;
  url?: string;
  sourceType: string;
  publisher?: string;
  publishedAt?: string;
  retrievedAt?: string;
  excerpt?: string;
  supportsClaim?: boolean;
  reliability?: "high" | "medium" | "low" | "disputed" | "unverified";
}

export interface ClaimRecord {
  id: string;
  text: string;
  madeBy?: string;
  classification: ClaimClass;
  evidenceIds: string[];
  counterEvidenceIds: string[];
  confidence: number;
  verdict: string;
}

export function editorialSystemPrompt(): string {
  return ALL_NEWS_EDITORIAL_CORE;
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function classifyFromEvidence(input: {
  hasPrimaryEvidence: boolean;
  hasIndependentCorroboration: boolean;
  hasMaterialCounterEvidence: boolean;
  sourceConflict: boolean;
}): ClaimClass {
  if (!input.hasPrimaryEvidence) return "unverified";
  if (input.sourceConflict || input.hasMaterialCounterEvidence) return "partially_true";
  if (input.hasIndependentCorroboration) return "fact";
  return "documented_evidence";
}

export function impactQuestions(): string[] {
  return [
    "किसे वास्तविक लाभ होगा?",
    "किसे वास्तविक हानि होगी?",
    "लाभ और हानि का वितरण कितना असमान है?",
    "जनता पर क्या प्रभाव पड़ेगा?",
    "शिक्षा और रोजगार पर क्या प्रभाव पड़ेगा?",
    "उद्योग, व्यापार और अर्थव्यवस्था पर क्या प्रभाव पड़ेगा?",
    "समुदाय और सामाजिक संबंधों पर क्या प्रभाव पड़ेगा?",
    "पर्यावरण पर क्या प्रभाव पड़ेगा?",
    "मानव गरिमा, स्वतंत्रता और सुरक्षा पर क्या प्रभाव पड़ेगा?",
    "कौन-सी लागत किसी और पर स्थानांतरित की जा रही है?",
    "दीर्घकालिक और अगली पीढ़ी का प्रभाव क्या है?",
  ];
}
