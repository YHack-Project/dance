import { AuraGlow } from "./AuraGlow";
import { getTier } from "./ScoreTiers";

@component
export class HeadScore extends BaseScriptComponent {
    // The Text component to display the score
    @input
    scoreText: Text;

    // Reference to the AuraGlow script so we can trigger it with the same score
    @input
    auraGlow: AuraGlow;

    // Animation state
    private isAnimating: boolean = false;
    private animTimer: number = 0.0;
    private readonly ANIM_DURATION: number = 0.8;
    // Screen-space Y positions (anchors: -1 to 1)
    private readonly START_Y: number = 0.05;
    private readonly END_Y: number = 0.45;
    private readonly MIN_ANGLE_DEG: number = 15;
    private readonly MAX_ANGLE_DEG: number = 35;
    private readonly TILT_PROPORTION: number = 0.3;
    private launchAngleRad: number = 0;
    private tiltRad: number = 0;
    private screenTransform: ScreenTransform;

    onAwake(): void {
        this.screenTransform = this.getSceneObject().getComponent("Component.ScreenTransform");

        if (!isNull(this.scoreText)) {
            this.scoreText.text = "";
        }

        this.createEvent("UpdateEvent").bind(() => {
            this.onUpdate();
        });

        print("HeadScore initialized");
    }

    /**
     * Called by ScoringEngine at each checkpoint.
     * Displays the floating score and triggers the aura glow.
     */
    triggerScore(score: number, rating: string, multiplier: number): void {
        this.displayScore(score, rating, multiplier);

        // Also trigger the aura glow with the same score
        if (!isNull(this.auraGlow)) {
            this.auraGlow.triggerScore(score);
        }
    }

    private displayScore(score: number, rating: string, multiplier: number): void {
        if (isNull(this.scoreText)) return;

        // Determine tier
        const tier = getTier(score);

        // Show rating text + multiplier
        let display = rating;
        if (multiplier > 1.0) {
            const multStr = multiplier.toFixed(2).replace(/\.?0+$/, "");
            display += "\n" + multStr + "x";
        }
        this.scoreText.text = display;
        this.scoreText.textFill.mode = TextFillMode.Solid;
        this.scoreText.textFill.color = tier.color;

        // Enable outline for readability
        this.scoreText.outlineSettings.enabled = true;
        this.scoreText.outlineSettings.size = 0.3;
        this.scoreText.outlineSettings.fill.mode = TextFillMode.Solid;
        this.scoreText.outlineSettings.fill.color = new vec4(0, 0, 0, 1);

        // Start slide-up animation
        this.isAnimating = true;
        this.animTimer = 0.0;

        // Random angle, randomly left or right
        const angleDeg = this.MIN_ANGLE_DEG + Math.random() * (this.MAX_ANGLE_DEG - this.MIN_ANGLE_DEG);
        const sign = Math.random() < 0.5 ? -1 : 1;
        this.launchAngleRad = sign * angleDeg * (Math.PI / 180);
        this.tiltRad = this.launchAngleRad * this.TILT_PROPORTION;

        // Move to start position
        this.setScreenPosition(0, this.START_Y);

        print("HeadScore: " + score + " -> " + tier.name);
    }

    private setScreenPosition(cx: number, cy: number): void {
        if (isNull(this.screenTransform)) return;
        // Position by setting anchor rect center (parent is full screen, -1 to 1)
        const hw = 0.25;
        const hh = 0.12;
        const anchors = this.screenTransform.anchors;
        anchors.left = cx - hw;
        anchors.right = cx + hw;
        anchors.bottom = cy - hh;
        anchors.top = cy + hh;
        this.screenTransform.anchors = anchors;
    }

    private onUpdate(): void {
        if (!this.isAnimating) return;

        const dt = getDeltaTime();
        this.animTimer += dt;
        const progress = Math.min(this.animTimer / this.ANIM_DURATION, 1.0);

        // Ease-out curve
        const eased = 1.0 - (1.0 - progress) * (1.0 - progress);

        // Distance along the launch direction (in screen-space units)
        const dist = (this.END_Y - this.START_Y) * eased;
        const x = Math.sin(this.launchAngleRad) * dist;
        const y = this.START_Y + Math.cos(this.launchAngleRad) * dist;

        this.setScreenPosition(x, y);

        // Tilt the text slightly in the launch direction
        const transform = this.getSceneObject().getTransform();
        transform.setLocalRotation(quat.fromEulerAngles(0, 0, -this.tiltRad));

        // Scale pop
        const scaleFactor = 1.0 + 0.2 * Math.sin(progress * Math.PI);
        transform.setLocalScale(new vec3(scaleFactor, scaleFactor, scaleFactor));

        // Fade out in the last 30%
        if (progress >= 0.7 && !isNull(this.scoreText)) {
            const fadeProgress = (progress - 0.7) / 0.3;
            const alpha = 1.0 - fadeProgress;
            const c = this.scoreText.textFill.color;
            this.scoreText.textFill.color = new vec4(c.r, c.g, c.b, alpha);
        }

        if (progress >= 1.0) {
            this.isAnimating = false;
            transform.setLocalScale(new vec3(1, 1, 1));
            if (!isNull(this.scoreText)) {
                this.scoreText.text = "";
            }
        }
    }
}
