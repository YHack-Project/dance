import { AuraGlow } from "./AuraGlow";
import { getTier } from "./ScoreTiers";

@component
export class HeadScore extends BaseScriptComponent {
    // The Text component to display the score (child of a Head Binding)
    @input
    scoreText: Text;

    // Reference to the AuraGlow script so we can trigger it with the same score
    @input
    auraGlow: AuraGlow;

    // Slide-up animation state
    private isAnimating: boolean = false;
    private animTimer: number = 0.0;
    private readonly ANIM_DURATION: number = 0.6;
    private readonly START_Y: number = 0;    // at the head joint
    private readonly END_Y: number = 30;   // above the head in skeleton space
    private readonly MIN_ANGLE_DEG: number = 20;
    private readonly MAX_ANGLE_DEG: number = 40;
    private readonly TILT_PROPORTION: number = 0.3; // tilt is 30% of launch angle
    private launchAngleRad: number = 0;  // randomized per trigger (signed)
    private tiltRad: number = 0;         // text rotation (signed)
    private baseScale: vec3 = new vec3(1, 1, 1);

    onAwake(): void {
        if (!isNull(this.scoreText)) {
            this.scoreText.text = "";
            this.baseScale = this.getSceneObject().getTransform().getLocalScale();
            // Start hidden inside the head
            const t = this.getSceneObject().getTransform();
            t.setLocalPosition(new vec3(0, this.START_Y, 0));
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
    triggerScore(score: number): void {
        this.displayScore(score);

        // Also trigger the aura glow with the same score
        if (!isNull(this.auraGlow)) {
            this.auraGlow.triggerScore(score);
        }
    }

    private displayScore(score: number): void {
        if (isNull(this.scoreText)) return;

        // Determine tier
        const tier = getTier(score);

        // Set text and color
        this.scoreText.text = score.toString();
        this.scoreText.textFill.mode = TextFillMode.Solid;
        this.scoreText.textFill.color = tier.color;

        // Enable outline for readability
        this.scoreText.outlineSettings.enabled = true;
        this.scoreText.outlineSettings.size = 0.3;
        this.scoreText.outlineSettings.fill.mode = TextFillMode.Solid;
        this.scoreText.outlineSettings.fill.color = new vec4(0, 0, 0, 1);

        // Start slide-up animation from inside the head
        this.isAnimating = true;
        this.animTimer = 0.0;
        // Random angle between 20-40 degrees, randomly left or right
        const angleDeg = this.MIN_ANGLE_DEG + Math.random() * (this.MAX_ANGLE_DEG - this.MIN_ANGLE_DEG);
        const sign = Math.random() < 0.5 ? -1 : 1;
        this.launchAngleRad = sign * angleDeg * (Math.PI / 180);
        this.tiltRad = this.launchAngleRad * this.TILT_PROPORTION;
        const transform = this.getSceneObject().getTransform();
        transform.setLocalPosition(new vec3(0, this.START_Y, 0));
        transform.setLocalScale(this.baseScale);

        print("HeadScore: " + score + " -> " + tier.name);
    }

    private onUpdate(): void {
        if (!this.isAnimating) return;

        const dt = getDeltaTime();
        this.animTimer += dt;
        const progress = Math.min(this.animTimer / this.ANIM_DURATION, 1.0);

        // Same ease-out curve for both axes (travel along the angle)
        const eased = 1.0 - (1.0 - progress) * (1.0 - progress);

        // Distance along the launch direction
        const dist = (this.END_Y - this.START_Y) * eased;
        const x = Math.sin(this.launchAngleRad) * dist;
        const y = this.START_Y + Math.cos(this.launchAngleRad) * dist;

        const transform = this.getSceneObject().getTransform();
        transform.setLocalPosition(new vec3(x, y, 0));

        // Tilt the text slightly in the launch direction (proportion of launch angle)
        transform.setLocalRotation(quat.fromEulerAngles(0, 0, -this.tiltRad));

        // Subtle scale pop at the end of the slide
        const scaleFactor = 1.0 + 0.15 * Math.sin(progress * Math.PI);
        const s = this.baseScale;
        transform.setLocalScale(new vec3(s.x * scaleFactor, s.y * scaleFactor, s.z * scaleFactor));

        if (progress >= 1.0) {
            this.isAnimating = false;
            transform.setLocalScale(this.baseScale);
        }
    }
}
