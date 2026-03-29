// ScoringEngine.js - Real-time Pose Comparison & Scoring
// Compares user pose to guide pose using quaternion angular distance.
// Joint weights are scaled by choreography movement between checkpoints.

//@input Component.ScriptComponent choreographyManager
//@input Component.ScriptComponent bodyTracker
//@input Component.ScriptComponent uiManager

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
var PERFECT_THRESHOLD = 0.97;
var GOOD_THRESHOLD = 0.90;

// Minimum quaternion dot product vs identity to consider a joint "active"
var ACTIVE_JOINT_THRESHOLD = 0.995;

// Scoring
var totalScore = 0;
var combo = 0;
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
function computePoseSimilarity(userPose, guidePose, prevGuidePose) {
    if (!userPose || !guidePose) return 0;

    var totalWeight = 0;
    var weightedScore = 0;

    for (var i = 0; i < JOINT_NAMES.length; i++) {
        var name = JOINT_NAMES[i];
        var weight = JOINT_WEIGHTS[name] || 1.0;

        if (userPose[name] && guidePose[name]) {
            if (isNearIdentity(guidePose[name])) {
                continue;
            }

            // Scale weight by how much this joint moved in the choreography
            if (prevGuidePose && prevGuidePose[name]) {
                var delta = quatAngularDistance(prevGuidePose[name], guidePose[name]);
                weight *= movementMultiplier(delta);
            }

            var sim = quatSimilarity(userPose[name], guidePose[name]);
            weightedScore += sim * weight;
            totalWeight += weight;
        }
    }

    if (totalWeight === 0) return 0.95;

    return weightedScore / totalWeight;
}

function getRating(similarity) {
    if (similarity >= PERFECT_THRESHOLD) return "Perfect!";
    if (similarity >= GOOD_THRESHOLD) return "Good!";
    return "Miss";
}

function getPointsForRating(rating) {
    if (rating === "Perfect!") return 300;
    if (rating === "Good!") return 100;
    return 0;
}

// ============================================================
// PUBLIC API
// ============================================================
script.reset = function () {
    totalScore = 0;
    combo = 0;
    lastCheckpointIndex = -1;
    frameScoreSmooth = 0;
    lastCheckpointRotations = null;
};

script.getFinalScore = function () {
    return totalScore;
};

script.update = function () {
    var userPose = script.bodyTracker.getCurrentPose();
    var guideRotations = script.choreographyManager.getCurrentRotations();
    var currentTime = script.choreographyManager.getTime();

    // Compute continuous similarity with movement-weighted joints
    var similarity = computePoseSimilarity(userPose, guideRotations, lastCheckpointRotations);

    frameScoreSmooth = frameScoreSmooth * 0.5 + similarity * 0.5;

    // Check for checkpoint scoring
    var checkpoints = script.choreographyManager.getCheckpoints();
    for (var i = 0; i < checkpoints.length; i++) {
        if (i <= lastCheckpointIndex) continue;

        if (currentTime >= checkpoints[i] - 0.15 && currentTime <= checkpoints[i] + 0.15) {
            lastCheckpointIndex = i;

            var rating = getRating(frameScoreSmooth);
            var points = getPointsForRating(rating);

            // Combo multiplier
            if (points > 0) {
                combo++;
                var multiplier = 1 + Math.floor(combo / 3) * 0.5;
                points = Math.floor(points * multiplier);
            } else {
                combo = 0;
            }

            totalScore += points;

            // Save guide rotations for next checkpoint's movement comparison
            lastCheckpointRotations = guideRotations;

            // Update UI
            if (script.uiManager) {
                script.uiManager.showRating(rating);
                script.uiManager.updateScore(totalScore);
                script.uiManager.updateCombo(combo);
            }

            break;
        }
    }
};
