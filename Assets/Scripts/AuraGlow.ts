import { SCORE_TIERS, getTier } from "./ScoreTiers";

@component
export class AuraGlow extends BaseScriptComponent {
    @input
    segmentationTexture: Texture;

    @input
    glowImage: Image;

    private currentTierIndex: number = 0;
    private glowAlpha: number = 0.0;
    private isFlashing: boolean = false;
    private flashTimer: number = 0.0;
    private readonly FLASH_DURATION: number = 0.6;
    private readonly PULSE_SPEED: number = 6.0;
    private textureWired: boolean = false;

    onAwake(): void {
        this.tryWireTexture();
        this.setGlowColor(SCORE_TIERS[0].glowColor, 0.0);

        this.createEvent("UpdateEvent").bind(() => {
            this.onUpdate();
        });

        print("AuraGlow initialized");
    }

    private tryWireTexture(): void {
        if (this.textureWired) return;
        if (isNull(this.glowImage) || isNull(this.segmentationTexture)) return;
        if (this.glowImage.mainPass == null) return;
        this.glowImage.mainPass.baseTex = this.segmentationTexture;
        this.textureWired = true;
    }

    triggerScore(score: number): void {
        this.tryWireTexture();
        let tierIndex = 0;
        for (let i = SCORE_TIERS.length - 1; i >= 0; i--) {
            if (score >= SCORE_TIERS[i].minScore) {
                tierIndex = i;
                break;
            }
        }
        this.currentTierIndex = tierIndex;
        this.startFlash();
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

        const progress = this.flashTimer / this.FLASH_DURATION;

        if (progress >= 1.0) {
            this.glowAlpha = 0.25;
            this.isFlashing = false;
        } else {
            const fade = 1.0 - progress;
            const pulse = 0.5 + 0.5 * Math.sin(this.flashTimer * this.PULSE_SPEED * Math.PI * 2);
            this.glowAlpha = fade * (0.5 + 0.5 * pulse);
        }

        const tier = SCORE_TIERS[this.currentTierIndex];
        this.setGlowColor(tier.glowColor, this.glowAlpha);
    }

    private setGlowColor(color: vec4, alpha: number): void {
        if (isNull(this.glowImage)) return;
        if (this.glowImage.mainPass == null) return;
        this.glowImage.mainPass.baseColor = new vec4(color.r, color.g, color.b, alpha);
    }
}
