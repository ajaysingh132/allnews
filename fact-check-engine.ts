import { ClaimRecord, EvidenceItem, ClaimClass, classifyFromEvidence, clampConfidence } from "./all-news-editorial-core";

export interface FactCheckResult extends ClaimRecord {
  supportingEvidence: EvidenceItem[];
  counterEvidence: EvidenceItem[];
  missingEvidence: string[];
}

export function factCheckClaim(input: {
  id: string;
  claim: string;
  madeBy?: string;
  evidence: EvidenceItem[];
}): FactCheckResult {
  const supportingEvidence = input.evidence.filter((e) => e.supportsClaim === true);
  const counterEvidence = input.evidence.filter((e) => e.supportsClaim === false);
  const hasPrimaryEvidence = input.evidence.some((e) =>
    ["government", "court", "parliament", "official_document", "research_paper", "academic"].includes(e.sourceType)
  );
  const independentPublishers = new Set(input.evidence.map((e) => e.publisher).filter(Boolean));
  const hasIndependentCorroboration = independentPublishers.size >= 2 && supportingEvidence.length >= 2;
  const hasMaterialCounterEvidence = counterEvidence.length > 0;
  const sourceConflict = supportingEvidence.length > 0 && counterEvidence.length > 0;

  const classification = classifyFromEvidence({
    hasPrimaryEvidence,
    hasIndependentCorroboration,
    hasMaterialCounterEvidence,
    sourceConflict,
  });

  const confidence = clampConfidence(
    Math.min(1, (supportingEvidence.length * 0.2) + (hasPrimaryEvidence ? 0.35 : 0) + (hasIndependentCorroboration ? 0.25 : 0) - (hasMaterialCounterEvidence ? 0.2 : 0))
  );

  const missingEvidence: string[] = [];
  if (!hasPrimaryEvidence) missingEvidence.push("प्राथमिक/आधिकारिक साक्ष्य");
  if (!hasIndependentCorroboration) missingEvidence.push("कम-से-कम दो स्वतंत्र विश्वसनीय स्रोत");
  if (sourceConflict) missingEvidence.push("विरोधी साक्ष्य का निर्णायक समाधान");

  return {
    id: input.id,
    text: input.claim,
    madeBy: input.madeBy,
    classification,
    evidenceIds: supportingEvidence.map((e) => e.id),
    counterEvidenceIds: counterEvidence.map((e) => e.id),
    confidence,
    verdict: buildVerdict(classification, confidence),
    supportingEvidence,
    counterEvidence,
    missingEvidence,
  };
}

function buildVerdict(classification: ClaimClass, confidence: number): string {
  const pct = Math.round(confidence * 100);
  switch (classification) {
    case "fact": return `उपलब्ध स्वतंत्र साक्ष्य दावे का मजबूत समर्थन करते हैं (${pct}% confidence)।`;
    case "partially_true": return `दावे के कुछ हिस्से समर्थित हैं, लेकिन महत्वपूर्ण विरोधी/अपूर्ण साक्ष्य मौजूद हैं (${pct}% confidence)।`;
    case "documented_evidence": return `दावे के समर्थन में दस्तावेजित साक्ष्य मिला है, पर स्वतंत्र corroboration अभी सीमित है (${pct}% confidence)।`;
    default: return `दावे को अभी तथ्य के रूप में स्थापित करने के लिए पर्याप्त साक्ष्य नहीं है (${pct}% confidence)।`;
  }
}
