// Main Controller
//
// Made with Easy Lens

//@input Component.ScriptComponent touch_events
//@input Component.ScriptComponent gyroscope
//@input Component.ScriptComponent ui_hint_text
//@input Component.ScriptComponent canvas_api
//@input Component.ScriptComponent hand_tracking


try {

// Full-body-style pose guide driven by hand tracking with gyro stabilization and tap-to-calibrate.
// All initialization after OnStartEvent as required by Canvas API notes.

let canvas = null;

// Hand state
let leftHand = {
    visible: false,
    lastData: null,
    alpha: 0.0
};
let rightHand = {
    visible: false,
    lastData: null,
    alpha: 0.0
};

// UI/hints
let hintFlashTimer = 0.0;
const HINT_FLASH_DURATION = 0.8;

// Fading
const FADE_IN_SPEED = 4.0;  // per second
const FADE_OUT_SPEED = 2.0; // per second

// Drawing params
const PALM_DIAM_PIX = 26;
const FINGER_STROKE = 5;
const ARM_STROKE = 6;
const TORSO_STROKE = 7;
const GUIDE_ALPHA = 220; // base white alpha; per-hand alpha multiplies this
const FOREARM_LEN_PIX = 40; // short forearm stub from wrist along rotation
const SHOULDER_HALF_WIDTH_PIX = 70; // half distance from body center to shoulder
const TORSO_LEN_PIX = 120;

// Stabilization
let stabilized = false;
let calibrationOffset = new vec2(0.0, 0.0); // offset in pixels applied as counter motion
const STAB_GAIN = 0.25;   // how much of motion to cancel [0..1]
const STAB_LERP = 8.0;    // smoothing per second

// Cached canvas size
let widthPx = 0;
let heightPx = 0;

// Helper: map normalized [0..1] to pixel vec2
function toPx(v) {
    return new vec2(v.x * widthPx, v.y * heightPx);
}

// Helper: short line from p at angle deg and len
function endpointFrom(p, angleDeg, length) {
    const a = angleDeg * Math.PI / 180.0;
    return new vec2(p.x + Math.sin(a) * length, p.y - Math.cos(a) * length);
}

// Lerp helpers
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function lerpVec2(a, b, t) {
    return new vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
}

// Update UI hint based on visibility
function updateHintText() {
    let msg = "";
    if (!leftHand.visible && !rightHand.visible) {
        msg = "Tap to start\nRaise your hands";
    } else if (!leftHand.visible) {
        msg = "Left hand not visible";
    } else if (!rightHand.visible) {
        msg = "Right hand not visible";
    } else {
        msg = "Great form";
    }
    script.ui_hint_text.text = msg;
    script.ui_hint_text.forceSafeRegion(true);
    script.ui_hint_text.position = new vec2(0.5, 0.1);
}

// Handle tap-to-calibrate
script.touch_events.onTap.add(function(tapX, tapY) {
    script.gyroscope.resetRotation();
    stabilized = true;
    calibrationOffset = new vec2(0.0, 0.0);
    hintFlashTimer = HINT_FLASH_DURATION;
    // Brief "Calibrated" flash
    script.ui_hint_text.text = "Calibrated";
    script.ui_hint_text.forceSafeRegion(true);
    script.ui_hint_text.position = new vec2(0.5, 0.1);
});

// Track hands
script.hand_tracking.onLeftTracking.add(function(data) {
    leftHand.visible = true;
    leftHand.lastData = data;
});
script.hand_tracking.onRightTracking.add(function(data) {
    rightHand.visible = true;
    rightHand.lastData = data;
});
script.hand_tracking.onLeftHandHidden.add(function() {
    leftHand.visible = false;
});
script.hand_tracking.onRightHandHidden.add(function() {
    rightHand.visible = false;
});

// Init on start: create onscreen canvas and initial calibration
script.createEvent("OnStartEvent").bind(function() {
    canvas = script.canvas_api.createOnScreenCanvas();
    widthPx = canvas.getWidth();
    heightPx = canvas.getHeight();

    // Initial calibration
    script.gyroscope.resetRotation();
    stabilized = true;
    calibrationOffset = new vec2(0.0, 0.0);

    // Initial hint
    script.ui_hint_text.forceSafeRegion(true);
    script.ui_hint_text.position = new vec2(0.5, 0.1);
    script.ui_hint_text.text = "Tap to start";
});

// Per-frame draw
script.createEvent("UpdateEvent").bind(function() {
    if (!canvas) {
        return;
    }

    const dt = getDeltaTime();

    // Handle hint flash decay and normal hint updates
    if (hintFlashTimer > 0.0) {
        hintFlashTimer -= dt;
        if (hintFlashTimer <= 0.0) {
            updateHintText();
        }
    } else {
        // Refresh hint when vis states change subtly (called every frame is ok, cheap)
        updateHintText();
    }

    // Smooth hand alpha
    leftHand.alpha = lerp(leftHand.alpha, leftHand.visible ? 1.0 : 0.0, (leftHand.visible ? FADE_IN_SPEED : FADE_OUT_SPEED) * dt);
    rightHand.alpha = lerp(rightHand.alpha, rightHand.visible ? 1.0 : 0.0, (rightHand.visible ? FADE_IN_SPEED : FADE_OUT_SPEED) * dt);

    // Stabilization: compute counter-motion offset from gyro
    // Use wrapEuler to avoid discontinuities, then map small rotations to small pixel offsets
    // We'll convert rotation to a small pixel nudge based on screen size
    const rot = script.gyroscope.getRotationEuler();
    const wrapped = script.gyroscope.wrapEuler(rot);
    // Map roll (y) and pitch (x) to screen offsets; small fraction of screen
    const maxNudge = Math.min(widthPx, heightPx) * 0.03; // up to 3% of short edge
    const targetOffset = new vec2(
        // roll: left positive per docs -> move guides slightly opposite (counter-motion)
        -wrapped.y / 30.0 * maxNudge * STAB_GAIN,
        // pitch: up positive -> move guides slightly opposite
        wrapped.x / 30.0 * maxNudge * STAB_GAIN
    );
    const lerpT = Math.min(1.0, STAB_LERP * dt);
    calibrationOffset = lerpVec2(calibrationOffset, stabilized ? targetOffset : new vec2(0.0, 0.0), lerpT);

    // Start frame: clear to transparent matching line color (white) recommendation
    canvas.background(255, 255, 255, 0);

    // Common styling
    canvas.stroke(255, 255, 255, GUIDE_ALPHA);
    canvas.strokeCap('round');
    canvas.strokeJoin('round');
    canvas.noFill();

    // Draw one hand helper
    function drawHand(hand, isLeft) {
        if (!hand.lastData || hand.alpha <= 0.001) {
            return;
        }

        const aMul = Math.floor(GUIDE_ALPHA * MathUtils.clamp(hand.alpha, 0, 1));

        // Wrist center
        const wristPx = toPx(hand.lastData.joints.wrist.position2D).add(calibrationOffset);

        // Palm circle at wrist
        canvas.noStroke();
        canvas.fill(255, 255, 255, aMul);
        canvas.circle(wristPx.x, wristPx.y, PALM_DIAM_PIX);

        // Finger rays: thumb3, index3, mid3
        const tips = [
            hand.lastData.joints.thumb3.position2D,
            hand.lastData.joints.index3.position2D,
            hand.lastData.joints.mid3.position2D
        ];
        canvas.noFill();
        canvas.stroke(255, 255, 255, aMul);
        canvas.strokeWeight(FINGER_STROKE);
        for (let i = 0; i < tips.length; i = i + 1) {
            const tipPx = toPx(tips[i]).add(calibrationOffset);
            canvas.line(wristPx.x, wristPx.y, tipPx.x, tipPx.y);
        }

        // Short forearm stub from wrist using rotation2D (0 up, CCW positive)
        const rot2D = hand.lastData.rotation2D; // degrees
        const foreEnd = endpointFrom(wristPx, rot2D + 180.0, FOREARM_LEN_PIX); // extend "down-arm" from wrist
        canvas.strokeWeight(ARM_STROKE);
        canvas.line(wristPx.x, wristPx.y, foreEnd.x, foreEnd.y);

        return wristPx;
    }

    // Draw both hands and store wrist pixel positions
    const leftWristPx = drawHand(leftHand, true);
    const rightWristPx = drawHand(rightHand, false);

    // Upper-body inference: shoulder line and torso when both wrists present (with some visibility)
    if (leftWristPx && rightWristPx && leftHand.alpha > 0.2 && rightHand.alpha > 0.2) {
        const bothAlpha = Math.min(leftHand.alpha, rightHand.alpha);
        const aMul = Math.floor(GUIDE_ALPHA * MathUtils.clamp(bothAlpha, 0, 1));

        // Midpoint between wrists as chest anchor
        const chest = new vec2(lerp(leftWristPx.x, rightWristPx.x, 0.5), lerp(leftWristPx.y, rightWristPx.y, 0.5));

        // Shoulder line: horizontal line centered on chest
        const shoulderL = new vec2(chest.x - SHOULDER_HALF_WIDTH_PIX, chest.y - 40);
        const shoulderR = new vec2(chest.x + SHOULDER_HALF_WIDTH_PIX, chest.y - 40);

        canvas.stroke(255, 255, 255, aMul);
        canvas.strokeWeight(TORSO_STROKE);
        canvas.line(shoulderL.x, shoulderL.y, shoulderR.x, shoulderR.y);

        // Torso line down from midpoint
        const torsoEnd = new vec2(chest.x, chest.y + TORSO_LEN_PIX);
        canvas.line(chest.x, chest.y, torsoEnd.x, torsoEnd.y);
    }
})

} catch(e) {
  print("error in controller");
  print(e);
}
