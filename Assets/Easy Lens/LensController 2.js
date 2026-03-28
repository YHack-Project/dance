// Main Controller
//
// Made with Easy Lens

//@input Component.ScriptComponent canvas_api
//@input Component.ScriptComponent touch_events
//@input Component.ScriptComponent hand_tracking
//@input Component.ScriptComponent gyroscope
//@input Component.ScriptComponent ui_hint_text
//@input Component.ScriptComponent face_landmarks


try {

// Full-body pose guide driven by full body tracking (when available),
// falling back to hand + head tracking with gyro stabilization.
// Tap-to-calibrate. All initialization after OnStartEvent as required by Canvas API notes.

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

// Head state (2D)
let head = {
    visible: false,
    lastPos2D: null,
    alpha: 0.0,
    timeSinceUpdate: 0.0
};
const HEAD_VIS_TIMEOUT = 0.2; // seconds without updates to consider hidden

// Full body tracking state
let bodyTracking = {
    available: false,
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
const JOINT_DIAM_PIX = 14;   // generic small joint circles
const HEAD_DIAM_PIX = 64;    // visual head circle
const FINGER_STROKE = 5;
const ARM_STROKE = 6;
const TORSO_STROKE = 7;
const LEG_STROKE = 7;
const GUIDE_ALPHA = 220; // base white alpha; per-element alpha multiplies this
const FOREARM_LEN_PIX = 40; // short forearm stub from wrist along rotation
const SHOULDER_HALF_WIDTH_PIX = 70; // half distance from body center to shoulder (default)
const TORSO_LEN_PIX = 120;  // default torso length in pixels

// Stabilization
let stabilized = false;
let calibrationOffset = new vec2(0.0, 0.0); // offset in pixels applied as counter motion
const STAB_GAIN = 0.25;   // how much of motion to cancel [0..1]
const STAB_LERP = 8.0;    // smoothing per second

// Cached canvas size
let widthPx = 0;
let heightPx = 0;

// Breathing sway for fallback stick figure
let swayPhase = 0.0;

// Skeleton bone connections for full body drawing
const SKELETON_BONES = [
    // Torso
    ["Neck", "LeftShoulder"],
    ["Neck", "RightShoulder"],
    ["LeftShoulder", "LeftElbow"],
    ["LeftElbow", "LeftWrist"],
    ["RightShoulder", "RightElbow"],
    ["RightElbow", "RightWrist"],
    ["Neck", "Hip"],
    // Legs
    ["LeftHip", "LeftKnee"],
    ["LeftKnee", "LeftAnkle"],
    ["RightHip", "RightKnee"],
    ["RightKnee", "RightAnkle"],
    ["LeftHip", "RightHip"],
];

// Joint names that get drawn as circles
const SKELETON_JOINTS = [
    "Nose", "Neck",
    "LeftShoulder", "RightShoulder",
    "LeftElbow", "RightElbow",
    "LeftWrist", "RightWrist",
    "LeftHip", "RightHip",
    "LeftKnee", "RightKnee",
    "LeftAnkle", "RightAnkle",
];
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
    if (bodyTracking.available) {
        msg = "Full body tracked";
    } else {
        const handsVisible = leftHand.visible || rightHand.visible;
        if (!head.visible && !handsVisible) {
            msg = "Step back for full body\nor show head + hands";
        } else if (!head.visible && handsVisible) {
            msg = "Show your head to align";
        } else if (head.visible && !handsVisible) {
            msg = "Raise your hands";
        } else if (head.visible && handsVisible && !(leftHand.visible && rightHand.visible)) {
            msg = leftHand.visible ? "Right hand not visible" : "Left hand not visible";
        } else {
            msg = "Pose guide active\nStep back for full body";
        }
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
    swayPhase = 0.0;
    hintFlashTimer = HINT_FLASH_DURATION;
    // Brief "Calibrated" flash
    script.ui_hint_text.text = "Calibrated";
    script.ui_hint_text.forceSafeRegion(true);
    script.ui_hint_text.position = new vec2(0.5, 0.1);
});

// Track head 2D center
script.face_landmarks.onHeadCenterPosition2DUpdated.add(function(position2d) {
    head.lastPos2D = position2d;
    head.timeSinceUpdate = 0.0;
    head.visible = true;
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
    script.ui_hint_text.text = "Step back for full body\nor show head + hands";
});

// Helper: get screen position of a body joint as pixel vec2, or null if not tracking
function getBodyJointPx(jointName) {
    if (!global.FullBodyTracking || !global.FullBodyTracking[jointName]) {
        return null;
    }
    const joint = global.FullBodyTracking[jointName];
    if (!joint.isTracking()) {
        return null;
    }
    const screenPos = joint.getScreenPosition();
    return new vec2(screenPos.x * widthPx, screenPos.y * heightPx);
}

// Draw the full tracked skeleton using real joint positions
function drawFullBodySkeleton(aMul) {
    // Draw bones
    canvas.stroke(255, 255, 255, aMul);
    canvas.noFill();
    canvas.strokeWeight(TORSO_STROKE);

    for (let i = 0; i < SKELETON_BONES.length; i = i + 1) {
        const bone = SKELETON_BONES[i];
        const a = getBodyJointPx(bone[0]);
        const b = getBodyJointPx(bone[1]);
        if (a && b) {
            const strokeW = (bone[0].indexOf("Knee") >= 0 || bone[0].indexOf("Hip") >= 0 ||
                             bone[1].indexOf("Knee") >= 0 || bone[1].indexOf("Ankle") >= 0)
                ? LEG_STROKE : TORSO_STROKE;
            canvas.strokeWeight(strokeW);
            canvas.line(a.x, a.y, b.x, b.y);
        }
    }

    // Draw joint circles
    canvas.noStroke();
    canvas.fill(255, 255, 255, aMul);
    for (let j = 0; j < SKELETON_JOINTS.length; j = j + 1) {
        const pos = getBodyJointPx(SKELETON_JOINTS[j]);
        if (pos) {
            const diam = (SKELETON_JOINTS[j] === "Nose") ? HEAD_DIAM_PIX : JOINT_DIAM_PIX;
            canvas.circle(pos.x, pos.y, diam);
        }
    }
    canvas.noFill();
}

// Per-frame draw
script.createEvent("UpdateEvent").bind(function() {
    if (!canvas) {
        return;
    }

    const dt = getDeltaTime();

    // Check full body tracking availability
    bodyTracking.available = (global.FullBodyTracking && global.FullBodyTracking.isTracking && global.FullBodyTracking.isTracking());

    // Head visibility timeout
    head.timeSinceUpdate = head.timeSinceUpdate + dt;
    if (head.timeSinceUpdate > HEAD_VIS_TIMEOUT) {
        head.visible = false;
    }

    // Handle hint flash decay and normal hint updates
    if (hintFlashTimer > 0.0) {
        hintFlashTimer -= dt;
        if (hintFlashTimer <= 0.0) {
            updateHintText();
        }
    } else {
        updateHintText();
    }

    // Smooth alphas
    leftHand.alpha = lerp(leftHand.alpha, leftHand.visible ? 1.0 : 0.0, (leftHand.visible ? FADE_IN_SPEED : FADE_OUT_SPEED) * dt);
    rightHand.alpha = lerp(rightHand.alpha, rightHand.visible ? 1.0 : 0.0, (rightHand.visible ? FADE_IN_SPEED : FADE_OUT_SPEED) * dt);
    head.alpha = lerp(head.alpha, head.visible ? 1.0 : 0.0, (head.visible ? FADE_IN_SPEED : FADE_OUT_SPEED) * dt);
    bodyTracking.alpha = lerp(bodyTracking.alpha, bodyTracking.available ? 1.0 : 0.0, (bodyTracking.available ? FADE_IN_SPEED : FADE_OUT_SPEED) * dt);

    // Stabilization: compute counter-motion offset from gyro
    const rot = script.gyroscope.getRotationEuler();
    const wrapped = script.gyroscope.wrapEuler(rot);
    const maxNudge = Math.min(widthPx, heightPx) * 0.03;
    const targetOffset = new vec2(
        -wrapped.y / 30.0 * maxNudge * STAB_GAIN,
        wrapped.x / 30.0 * maxNudge * STAB_GAIN
    );
    const lerpT = Math.min(1.0, STAB_LERP * dt);
    calibrationOffset = lerpVec2(calibrationOffset, stabilized ? targetOffset : new vec2(0.0, 0.0), lerpT);

    // Start frame: clear to transparent
    canvas.background(255, 255, 255, 0);

    // Common styling
    canvas.stroke(255, 255, 255, GUIDE_ALPHA);
    canvas.strokeCap('round');
    canvas.strokeJoin('round');
    canvas.noFill();

    // === FULL BODY TRACKING MODE ===
    if (bodyTracking.available && bodyTracking.alpha > 0.001) {
        const aMul = Math.floor(GUIDE_ALPHA * MathUtils.clamp(bodyTracking.alpha, 0, 1));
        drawFullBodySkeleton(aMul);

        // Also draw hand details (fingers) on top of tracked wrists if hand tracking available
        function drawHandFingers(hand) {
            if (!hand.lastData || hand.alpha <= 0.001) {
                return;
            }
            const aMulHand = Math.floor(GUIDE_ALPHA * MathUtils.clamp(hand.alpha, 0, 1));
            const wristPx = toPx(hand.lastData.joints.wrist.position2D);
            // Palm circle
            canvas.noStroke();
            canvas.fill(255, 255, 255, aMulHand);
            canvas.circle(wristPx.x, wristPx.y, PALM_DIAM_PIX);
            // Finger rays
            const tips = [
                hand.lastData.joints.thumb3.position2D,
                hand.lastData.joints.index3.position2D,
                hand.lastData.joints.mid3.position2D
            ];
            canvas.noFill();
            canvas.stroke(255, 255, 255, aMulHand);
            canvas.strokeWeight(FINGER_STROKE);
            for (let i = 0; i < tips.length; i = i + 1) {
                const tipPx = toPx(tips[i]);
                canvas.line(wristPx.x, wristPx.y, tipPx.x, tipPx.y);
            }
        }
        drawHandFingers(leftHand);
        drawHandFingers(rightHand);

        return; // Skip fallback drawing when full body is tracked
    }

    // === FALLBACK MODE: hand + head tracking with estimated body ===

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

        // Short forearm stub from wrist using rotation2D
        const rot2D = hand.lastData.rotation2D;
        const foreEnd = endpointFrom(wristPx, rot2D + 180.0, FOREARM_LEN_PIX);
        canvas.strokeWeight(ARM_STROKE);
        canvas.line(wristPx.x, wristPx.y, foreEnd.x, foreEnd.y);

        return wristPx;
    }

    // Draw both hands and store wrist pixel positions
    const leftWristPx = drawHand(leftHand, true);
    const rightWristPx = drawHand(rightHand, false);

    // Draw head if available
    let headPx = null;
    if (head.lastPos2D && head.alpha > 0.001) {
        const aMulHead = Math.floor(GUIDE_ALPHA * MathUtils.clamp(head.alpha, 0, 1));
        headPx = toPx(head.lastPos2D).add(calibrationOffset);
        canvas.noStroke();
        canvas.fill(255, 255, 255, aMulHead);
        canvas.circle(headPx.x, headPx.y, HEAD_DIAM_PIX);
        canvas.noFill();
    }

    // Compute body guide scale and joints
    let chest = null;
    let shoulderHalfWidth = SHOULDER_HALF_WIDTH_PIX;
    let torsoLen = TORSO_LEN_PIX;

    if (leftWristPx && rightWristPx) {
        chest = new vec2(lerp(leftWristPx.x, rightWristPx.x, 0.5), lerp(leftWristPx.y, rightWristPx.y, 0.5));
        const wristDist = leftWristPx.distance(rightWristPx);
        const scaleK = MathUtils.clamp(wristDist / 200.0, 0.6, 2.0);
        shoulderHalfWidth = SHOULDER_HALF_WIDTH_PIX * scaleK;
        torsoLen = TORSO_LEN_PIX * scaleK;
    } else if (headPx) {
        chest = new vec2(headPx.x, headPx.y + 60);
    }

    // Draw estimated upper body when chest known
    if (chest) {
        const visAlpha = Math.max(head.alpha || 0.0, Math.min(leftHand.alpha, rightHand.alpha) || 0.0);
        const aMul = Math.floor(GUIDE_ALPHA * MathUtils.clamp(visAlpha, 0, 1));
        const shoulderL = new vec2(chest.x - shoulderHalfWidth, chest.y - 40);
        const shoulderR = new vec2(chest.x + shoulderHalfWidth, chest.y - 40);
        canvas.stroke(255, 255, 255, aMul);
        canvas.strokeWeight(TORSO_STROKE);
        canvas.line(shoulderL.x, shoulderL.y, shoulderR.x, shoulderR.y);

        const hip = new vec2(chest.x, chest.y + torsoLen);
        canvas.line(chest.x, chest.y, hip.x, hip.y);

        const hipOffset = shoulderHalfWidth * 0.8;
        const hipL = new vec2(hip.x - hipOffset, hip.y);
        const hipR = new vec2(hip.x + hipOffset, hip.y);
        const thighLen = torsoLen * 0.9;
        const shinLen = torsoLen * 0.85;
        const footOffset = shoulderHalfWidth * 0.2;
        const kneeL = new vec2(hipL.x - footOffset, hipL.y + thighLen * 0.55);
        const kneeR = new vec2(hipR.x + footOffset, hipR.y + thighLen * 0.55);
        const ankleL = new vec2(hipL.x - footOffset * 1.2, hipL.y + thighLen + shinLen * 0.45);
        const ankleR = new vec2(hipR.x + footOffset * 1.2, hipR.y + thighLen + shinLen * 0.45);

        canvas.strokeWeight(LEG_STROKE);
        canvas.line(hipL.x, hipL.y, kneeL.x, kneeL.y);
        canvas.line(kneeL.x, kneeL.y, ankleL.x, ankleL.y);
        canvas.line(hipR.x, hipR.y, kneeR.x, kneeR.y);
        canvas.line(kneeR.x, kneeR.y, ankleR.x, ankleR.y);

        canvas.noStroke();
        canvas.fill(255, 255, 255, aMul);
        canvas.circle(hipL.x, hipL.y, JOINT_DIAM_PIX);
        canvas.circle(hipR.x, hipR.y, JOINT_DIAM_PIX);
        canvas.circle(kneeL.x, kneeL.y, JOINT_DIAM_PIX);
        canvas.circle(kneeR.x, kneeR.y, JOINT_DIAM_PIX);
        canvas.circle(ankleL.x, ankleL.y, JOINT_DIAM_PIX);
        canvas.circle(ankleR.x, ankleR.y, JOINT_DIAM_PIX);
        canvas.noFill();
    }

    // Gentle breathing sway when only head visible
    if (headPx && !(leftWristPx && rightWristPx)) {
        swayPhase = swayPhase + dt;
        const swayX = Math.sin(swayPhase * 1.2) * 6.0;
        const baseChest = new vec2(headPx.x, headPx.y + 60);
        const chestSway = new vec2(baseChest.x + swayX, baseChest.y);
        const aMul = Math.floor(GUIDE_ALPHA * MathUtils.clamp(head.alpha, 0, 1));
        const shoulderL = new vec2(chestSway.x - SHOULDER_HALF_WIDTH_PIX * 0.9, chestSway.y - 36);
        const shoulderR = new vec2(chestSway.x + SHOULDER_HALF_WIDTH_PIX * 0.9, chestSway.y - 36);
        canvas.stroke(255, 255, 255, aMul);
        canvas.strokeWeight(TORSO_STROKE);
        canvas.line(shoulderL.x, shoulderL.y, shoulderR.x, shoulderR.y);
        const hip = new vec2(chestSway.x, chestSway.y + TORSO_LEN_PIX * 0.9);
        canvas.line(chestSway.x, chestSway.y, hip.x, hip.y);
        const kneeL = new vec2(hip.x - 30, hip.y + 50);
        const kneeR = new vec2(hip.x + 30, hip.y + 50);
        const ankleL = new vec2(hip.x - 36, hip.y + 110);
        const ankleR = new vec2(hip.x + 36, hip.y + 110);
        canvas.strokeWeight(LEG_STROKE);
        canvas.line(hip.x, hip.y, kneeL.x, kneeL.y);
        canvas.line(kneeL.x, kneeL.y, ankleL.x, ankleL.y);
        canvas.line(hip.x, hip.y, kneeR.x, kneeR.y);
        canvas.line(kneeR.x, kneeR.y, ankleR.x, ankleR.y);
        canvas.noStroke();
        canvas.fill(255, 255, 255, aMul);
        canvas.circle(kneeL.x, kneeL.y, JOINT_DIAM_PIX);
        canvas.circle(kneeR.x, kneeR.y, JOINT_DIAM_PIX);
        canvas.circle(ankleL.x, ankleL.y, JOINT_DIAM_PIX);
        canvas.circle(ankleR.x, ankleR.y, JOINT_DIAM_PIX);
        canvas.noFill();
    }
});

} catch(e) {
  print("error in controller");
  print(e);
}
