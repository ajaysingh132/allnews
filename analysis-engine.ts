import { impactQuestions, ClaimRecord, EvidenceItem } from "./all-news-editorial-core";

export interface AnalysisInput {
  topic: string;
  claims: ClaimRecord[];
  evidence: EvidenceItem[];
  context?: string;
}

export interface AnalysisResult {
  topic: string;
  whatIsKnown: string[];
  whatIsClaimed: string[];
  unresolvedQuestions: string[];
  benefits: string[];
  harms: string[];
  interests: string[];
  impacts: Record<string, string[]>;
  rootCauseQuestions: string[];
  dialoguePath: string[];
  allNewsConclusion: string;
}

export function buildAnalysis(input: AnalysisInput): AnalysisResult {
  const verified = input.claims.filter((c) => ["fact", "documented_evidence"].includes(c.classification));
  const claims = input.claims.filter((c) => c.classification === "claim" || c.classification === "official_statement");
  const unresolved = input.claims.filter((c) => c.classification === "unverified" || c.counterEvidenceIds.length > 0);

  const impacts: Record<string, string[]> = {};
  for (const q of impactQuestions()) impacts[q] = [];

  return {
    topic: input.topic,
    whatIsKnown: verified.map((c) => c.text),
    whatIsClaimed: claims.map((c) => c.text),
    unresolvedQuestions: unresolved.map((c) => c.text),
    benefits: ["लाभ का निष्कर्ष साक्ष्य से भरना आवश्यक है; बिना evidence के लाभ घोषित न करें।"],
    harms: ["हानि का निष्कर्ष साक्ष्य से भरना आवश्यक है; अनुमान को तथ्य न बनाएं।"],
    interests: ["हितधारकों, incentives और संभावित लाभार्थियों की पहचान करें।"],
    impacts,
    rootCauseQuestions: [
      "विवाद की सबसे पुरानी निर्णायक वजह क्या है?",
      "कौन-से हित या incentives विवाद को बनाए रखते हैं?",
      "कौन-सा तथ्य या दस्तावेज अभी missing है?",
      "कौन-सी संरचनात्मक बाधा बातचीत को समाधान तक नहीं पहुंचने देती?",
    ],
    dialoguePath: [
      "हर पक्ष का सबसे मजबूत evidence दर्ज करें।",
      "साझा तथ्य और वास्तविक असहमति अलग करें।",
      "जहाँ संभव हो, सत्यापन योग्य साझा आधार पर समाधान खोजें।",
    ],
    allNewsConclusion: "All News का निष्कर्ष केवल उपलब्ध evidence और स्पष्ट रूप से घोषित inference पर आधारित होना चाहिए।",
  };
}
