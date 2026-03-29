export const SCORE_TIERS: { name: string; minScore: number; color: vec4; glowColor: vec4 }[] = [
    { name: "Miss",    minScore: 0,    color: new vec4(0.5, 0.5, 0.5, 1.0), glowColor: new vec4(0.5, 0.5, 0.5, 0.8) },
    { name: "Good",    minScore: 1,    color: new vec4(0.1, 0.9, 0.3, 1.0), glowColor: new vec4(0.1, 0.9, 0.3, 0.8) },
    { name: "Great",   minScore: 200,  color: new vec4(1.0, 0.3, 0.6, 1.0), glowColor: new vec4(1.0, 0.3, 0.6, 0.8) },
    { name: "Perfect", minScore: 300,  color: new vec4(1.0, 0.84, 0.0, 1.0), glowColor: new vec4(1.0, 0.84, 0.0, 0.8) },
];

export function getTier(score: number): typeof SCORE_TIERS[0] {
    for (let i = SCORE_TIERS.length - 1; i >= 0; i--) {
        if (score >= SCORE_TIERS[i].minScore) {
            return SCORE_TIERS[i];
        }
    }
    return SCORE_TIERS[0];
}
