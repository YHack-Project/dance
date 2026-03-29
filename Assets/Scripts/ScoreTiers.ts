export const SCORE_TIERS: { name: string; minScore: number; color: vec4; glowColor: vec4 }[] = [
    { name: "Miss",    minScore: 0,    color: new vec4(1.0, 0.45, 0.45, 1.0), glowColor: new vec4(1.0, 0.45, 0.45, 0.7) },
    { name: "OK",      minScore: 1,    color: new vec4(1.0, 0.75, 0.35, 1.0), glowColor: new vec4(1.0, 0.75, 0.35, 0.7) },
    { name: "Good!",   minScore: 100,  color: new vec4(1.0, 0.95, 0.4, 1.0),  glowColor: new vec4(1.0, 0.95, 0.4, 0.7) },
    { name: "Great!",  minScore: 200,  color: new vec4(0.35, 1.0, 0.55, 1.0), glowColor: new vec4(0.35, 1.0, 0.55, 0.7) },
    { name: "Perfect!", minScore: 300, color: new vec4(0.45, 0.7, 1.0, 1.0),  glowColor: new vec4(0.45, 0.7, 1.0, 0.7) },
];

export function getTier(score: number): typeof SCORE_TIERS[0] {
    for (let i = SCORE_TIERS.length - 1; i >= 0; i--) {
        if (score >= SCORE_TIERS[i].minScore) {
            return SCORE_TIERS[i];
        }
    }
    return SCORE_TIERS[0];
}
