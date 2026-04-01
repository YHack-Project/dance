// ScoringEngine.js - Real-time Pose Comparison & Scoring
// Compares user pose to guide pose using quaternion angular distance.
// Joint weights are scaled by choreography movement between checkpoints.

//@input Component.ScriptComponent choreographyManager
//@input Component.ScriptComponent bodyTracker
//@input Component.ScriptComponent uiManager
//@input Component.ScriptComponent headScore {"label": "Head Score Effect"}

var JOINT_NAMES = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForearm", "LeftHand",
    "RightShoulder", "RightArm", "RightForearm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot",
    "RightUpLeg", "RightLeg", "RightFoot"
];

// Base weights — flattened so the movement multiplier has more influence
var JOINT_WEIGHTS = {
    "Hips": 0.5, "Spine": 0.5, "Spine1": 0.3, "Spine2": 0.3,
    "Neck": 0.2, "Head": 0.2,
    "LeftShoulder": 0.4, "LeftArm": 1.2, "LeftForearm": 1.0, "LeftHand": 0.6,
    "RightShoulder": 0.4, "RightArm": 1.2, "RightForearm": 1.0, "RightHand": 0.6,
    "LeftUpLeg": 0.8, "LeftLeg": 1.0, "LeftFoot": 0.4,
    "RightUpLeg": 0.8, "RightLeg": 1.0, "RightFoot": 0.4
};

// Rating thresholds (applied to angular-distance-based score)
var PERFECT_THRESHOLD = 0.990;
var GREAT_THRESHOLD = 0.978;
var GOOD_THRESHOLD = 0.963;
var OK_THRESHOLD = 0.945;

// Minimum quaternion dot product vs identity to consider a joint "active"
var ACTIVE_JOINT_THRESHOLD = 0.995;

// Combo tier constants
var COMBO_TIER_NONE    = 0;
var COMBO_TIER_GOOD    = 1;
var COMBO_TIER_GREAT   = 2;
var COMBO_TIER_PERFECT = 3;

// Multiplier increment per rating
var MULT_INCREMENT_GOOD    = 0.1;
var MULT_INCREMENT_GREAT   = 0.2;
var MULT_INCREMENT_PERFECT = 0.35;

// Multiplier cap per combo tier
var MULT_CAP_GOOD    = 1.8;
var MULT_CAP_GREAT   = 2.5;
var MULT_CAP_PERFECT = 5.0;

// Scoring state
var totalScore = 0;
var comboMultiplier = 1.0;
var comboTier = COMBO_TIER_NONE;
var comboCount = 0;
var lastCheckpointIndex = -1;
var frameScoreSmooth = 0;
var lastCheckpointRotations = null;

// Compare two quaternions - returns 0 to 1 (1 = identical)
function quatSimilarity(a, b) {
    var dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    dot = Math.abs(dot);
    return Math.min(1.0, dot);
}

// Angular distance between two quaternions in degrees
function quatAngularDistance(a, b) {
    var dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
    dot = Math.min(1.0, dot);
    return 2.0 * Math.acos(dot) * (180.0 / Math.PI);
}

// Map choreography movement (degrees) to a 0.5x–2.0x weight multiplier
function movementMultiplier(angleDeg) {
    if (angleDeg <= 5) return 0.5;
    if (angleDeg <= 30) return 0.5 + 0.5 * ((angleDeg - 5) / 25);
    if (angleDeg <= 90) return 1.0 + 1.0 * ((angleDeg - 30) / 60);
    return 2.0;
}

// Check if a quaternion is near identity (no meaningful rotation)
function isNearIdentity(q) {
    return Math.abs(q.w) > ACTIVE_JOINT_THRESHOLD;
}

// Get weighted average similarity across ACTIVE joints
// prevGuidePose: guide rotations at the previous checkpoint (null for first checkpoint)
// debugOut: optional array — if provided, per-joint {name, weight, sim} entries are pushed into it
function computePoseSimilarity(userPose, guidePose, prevGuidePose, debugOut) {
    if (!userPose || !guidePose) return 0;

    var totalWeight = 0;
    var weightedScore = 0;
    var skippedCount = 0;

    for (var i = 0; i < JOINT_NAMES.length; i++) {
        var name = JOINT_NAMES[i];
        var weight = JOINT_WEIGHTS[name] || 1.0;

        if (guidePose[name]) {
            if (isNearIdentity(guidePose[name])) {
                skippedCount++;
                continue;
            }

            // Scale weight by how much this joint moved in the choreography
            if (prevGuidePose && prevGuidePose[name]) {
                var delta = quatAngularDistance(prevGuidePose[name], guidePose[name]);
                weight *= movementMultiplier(delta);
            }

            // Missing user joint = 0 similarity (penalize off-camera limbs)
            var sim = 0;
            if (userPose[name]) {
                sim = quatSimilarity(userPose[name], guidePose[name]);
            }
            weightedScore += sim * weight;
            totalWeight += weight;

            if (debugOut) {
                debugOut.push({ name: name, weight: weight, sim: sim });
            }
        }
    }

    if (debugOut) {
        debugOut._skipped = skippedCount;
    }

    if (totalWeight === 0) return 0;

    return weightedScore / totalWeight;
}

function getRating(similarity) {
    if (similarity >= PERFECT_THRESHOLD) return "Perfect!";
    if (similarity >= GREAT_THRESHOLD) return "Great!";
    if (similarity >= GOOD_THRESHOLD) return "Good!";
    if (similarity >= OK_THRESHOLD) return "OK";
    return "Miss";
}

function getPointsForRating(rating) {
    if (rating === "Perfect!") return 300;
    if (rating === "Great!") return 200;
    if (rating === "Good!") return 100;
    if (rating === "OK") return 25;
    return 0;
}

function getRatingTier(rating) {
    if (rating === "Perfect!") return COMBO_TIER_PERFECT;
    if (rating === "Great!")   return COMBO_TIER_GREAT;
    if (rating === "Good!")    return COMBO_TIER_GOOD;
    return COMBO_TIER_NONE;
}

function processCombo(rating) {
    var ratingTier = getRatingTier(rating);

    // Miss/OK always break combo
    if (ratingTier === COMBO_TIER_NONE) {
        comboMultiplier = 1.0;
        comboTier = COMBO_TIER_NONE;
        comboCount = 0;
        return 1.0;
    }

    // No active combo — start one (first hit gets 1.0x, no multiplier yet)
    if (comboTier === COMBO_TIER_NONE) {
        comboTier = ratingTier;
        comboCount = 1;
        return 1.0;
    }

    // Rating must be >= current combo tier to maintain
    if (ratingTier < comboTier) {
        comboMultiplier = 1.0;
        comboTier = COMBO_TIER_NONE;
        comboCount = 0;
        return 1.0;
    }

    // Escalate tier if rating is higher (can't go down)
    if (ratingTier > comboTier) {
        comboTier = ratingTier;
    }
    comboCount++;

    // Apply increment based on the rating
    var increment = 0;
    if (ratingTier === COMBO_TIER_GOOD)    increment = MULT_INCREMENT_GOOD;
    if (ratingTier === COMBO_TIER_GREAT)   increment = MULT_INCREMENT_GREAT;
    if (ratingTier === COMBO_TIER_PERFECT) increment = MULT_INCREMENT_PERFECT;
    comboMultiplier += increment;

    // Cap based on current combo tier
    var cap = 1.0;
    if (comboTier === COMBO_TIER_GOOD)    cap = MULT_CAP_GOOD;
    if (comboTier === COMBO_TIER_GREAT)   cap = MULT_CAP_GREAT;
    if (comboTier === COMBO_TIER_PERFECT) cap = MULT_CAP_PERFECT;
    if (comboMultiplier > cap) comboMultiplier = cap;

    return comboMultiplier;
}

// ============================================================
// PUBLIC API
// ============================================================
script.reset = function () {
    totalScore = 0;
    comboMultiplier = 1.0;
    comboTier = COMBO_TIER_NONE;
    comboCount = 0;
    lastCheckpointIndex = -1;
    frameScoreSmooth = 0;
    lastCheckpointRotations = null;
};

script.getFinalScore = function () {
    return totalScore;
};

script.getCheckpointCount = function () {
    return script.choreographyManager.getCheckpoints().length;
};

script.update = function () {
    var userPose = script.bodyTracker.getCurrentPose();
    var guideRotations = script.choreographyManager.getCurrentRotations();
    var currentTime = script.choreographyManager.getTime();

    // Compute continuous similarity with movement-weighted joints
    var similarity = computePoseSimilarity(userPose, guideRotations, lastCheckpointRotations);

    frameScoreSmooth = frameScoreSmooth * 0.2 + similarity * 0.8;

    // Check for checkpoint scoring
    var checkpoints = script.choreographyManager.getCheckpoints();
    for (var i = 0; i < checkpoints.length; i++) {
        if (i <= lastCheckpointIndex) continue;

        if (currentTime >= checkpoints[i] - 0.10 && currentTime <= checkpoints[i] + 0.10) {
            lastCheckpointIndex = i;

            // Recompute with debug info for logging
            var debugJoints = [];
            var debugSim = computePoseSimilarity(userPose, guideRotations, lastCheckpointRotations, debugJoints);
            debugJoints.sort(function (a, b) { return b.weight - a.weight; });
            var topJoints = debugJoints.slice(0, 6);
            var jointStr = topJoints.map(function (j) {
                return j.name + "(w=" + j.weight.toFixed(2) + " s=" + j.sim.toFixed(3) + ")";
            }).join(" | ");
            print("[CP " + (i + 1) + "/" + checkpoints.length + " t=" + checkpoints[i].toFixed(1) + "s] sim=" + frameScoreSmooth.toFixed(3) + " | " + jointStr + " | active=" + debugJoints.length + " skipped=" + (debugJoints._skipped || 0));

            var rating = getRating(frameScoreSmooth);
            var points = getPointsForRating(rating);

            // Tiered combo multiplier
            var multiplier = processCombo(rating);
            points = Math.floor(points * multiplier);

            totalScore += points;

            // Save guide rotations for next checkpoint's movement comparison
            lastCheckpointRotations = guideRotations;

            // Update UI
            if (script.uiManager) {
                script.uiManager.updateScore(totalScore);
            }

            // Trigger head score popup and aura glow
            if (script.headScore) {
                print("ScoringEngine: triggerScore(" + points + ", " + rating + ", mult=" + comboMultiplier.toFixed(2) + ")");
                script.headScore.triggerScore(points, rating, comboMultiplier);
            } else {
                print("ScoringEngine: headScore input is null!");
            }

            break;
        }
    }
};
