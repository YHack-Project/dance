import { SCORE_TIERS, getTier } from "./ScoreTiers";

@component
export class AuraGlow extends BaseScriptComponent {
    // The segmentation texture (FullGarment type from Asset Browser)
    @input
    segmentationTexture: Texture;

    // The Image component showing the glow overlay (full-screen post effect)
    @input
    glowImage: Image;

    private currentTierIndex: number = 0;
    private glowAlpha: number = 0.0;
    private isFlashing: boolean = false;
    private flashTimer: number = 0.0;
    private readonly FLASH_DURATION: number = 0.6;
    private readonly PULSE_SPEED: number = 6.0;

    onAwake(): void {
        // Wire up the segmentation texture to the glow overlay material
        if (!isNull(this.glowImage) && !isNull(this.segmentationTexture)) {
            this.glowImage.mainPass.baseTex = this.segmentationTexture;
        }

        // Start with glow hidden
        this.setGlowColor(SCORE_TIERS[0].glowColor, 0.0);

        // Register update loop for flash animation
        this.createEvent("UpdateEvent").bind(() => {
            this.onUpdate();
        });

        print("AuraGlow initialized");
    }

    /**
     * Called externally by ScoringEngine to trigger the aura.
     * Pass in the numeric score and the aura color/flash will be set automatically.
     */
    triggerScore(score: number): void {
        let tierIndex = 0;
        for (let i = SCORE_TIERS.length - 1; i >= 0; i--) {
            if (score >= SCORE_TIERS[i].minScore) {
                tierIndex = i;
                break;
            }
        }
        this.currentTierIndex = tierIndex;
        this.startFlash();
        print("AuraGlow: " + score + " -> " + SCORE_TIERS[tierIndex].name);
    }

    private startFlash(): void {
        this.isFlashing = true;
        this.flashTimer = 0.0;
        this.glowAlpha = 1.0;
    }

    private onUpdate(): void {
        if (!this.isFlashing) return;

        const dt = getDeltaTime();
        this.flashTimer += dt;

        // Pulsing flash that fades out
        const progress = this.flashTimer / this.FLASH_DURATION;

        if (progress >= 1.0) {
            // Keep a subtle idle glow after the flash
            this.glowAlpha = 0.25;
            this.isFlashing = false;
        } else {
            // Pulse: starts bright, oscillates, fades
            const fade = 1.0 - progress;
            const pulse = 0.5 + 0.5 * Math.sin(this.flashTimer * this.PULSE_SPEED * Math.PI * 2);
            this.glowAlpha = fade * (0.5 + 0.5 * pulse);
        }

        const tier = SCORE_TIERS[this.currentTierIndex];
        this.setGlowColor(tier.glowColor, this.glowAlpha);
    }

    private setGlowColor(color: vec4, alpha: number): void {
        if (isNull(this.glowImage)) return;

        // Set the tint color on the material pass with animated alpha
        this.glowImage.mainPass.baseColor = new vec4(color.r, color.g, color.b, alpha);
    }
}
