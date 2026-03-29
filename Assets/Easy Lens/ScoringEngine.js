// ScoringEngine.js - Real-time Pose Comparison & Scoring
// Compares user pose to guide pose using quaternion angular distance.

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

// Higher weight = more important for scoring
var JOINT_WEIGHTS = {
    "Hips": 0.5, "Spine": 0.5, "Spine1": 0.3, "Spine2": 0.3,
    "Neck": 0.2, "Head": 0.2,
    "LeftShoulder": 0.5, "LeftArm": 1.5, "LeftForearm": 1.2, "LeftHand": 0.8,
    "RightShoulder": 0.5, "RightArm": 1.5, "RightForearm": 1.2, "RightHand": 0.8,
    "LeftUpLeg": 1.0, "LeftLeg": 1.2, "LeftFoot": 0.5,
    "RightUpLeg": 1.0, "RightLeg": 1.2, "RightFoot": 0.5
};

// Rating thresholds (applied to angular-distance-based score)
// These are tuned so that:
//   Perfect: average <25 degrees off target
//   Good: average <50 degrees off target
//   Miss: >50 degrees off
var PERFECT_THRESHOLD = 0.97;
var GOOD_THRESHOLD = 0.90;

// Minimum quaternion dot product vs identity to consider a joint "active"
// Joints near identity in the choreography are skipped (no target pose)
var ACTIVE_JOINT_THRESHOLD = 0.995;

// Scoring
var totalScore = 0;
var combo = 0;
var lastCheckpointIndex = -1;
var frameScoreSmooth = 0;

// Compare two quaternions - returns 0 to 1 (1 = identical)
function quatSimilarity(a, b) {
    var dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    dot = Math.abs(dot);
    return Math.min(1.0, dot);
}

// Check if a quaternion is near identity (no meaningful rotation)
function isNearIdentity(q) {
    // Identity quaternion is (0, 0, 0, 1)
    // dot with identity = |q.w|
    return Math.abs(q.w) > ACTIVE_JOINT_THRESHOLD;
}

// Get weighted average similarity across ACTIVE joints only
// Active = joints that have meaningful choreography rotation (not resting)
function computePoseSimilarity(userPose, guidePose) {
    if (!userPose || !guidePose) return 0;

    var totalWeight = 0;
    var weightedScore = 0;

    for (var i = 0; i < JOINT_NAMES.length; i++) {
        var name = JOINT_NAMES[i];
        var weight = JOINT_WEIGHTS[name] || 1.0;

        if (userPose[name] && guidePose[name]) {
            // Skip joints with no active choreography target
            if (isNearIdentity(guidePose[name])) {
                continue;
            }

            var sim = quatSimilarity(userPose[name], guidePose[name]);
            weightedScore += sim * weight;
            totalWeight += weight;
        }
    }

    // If no joints are actively choreographed right now, return neutral
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
};

script.getFinalScore = function () {
    return totalScore;
};

script.update = function () {
    var userPose = script.bodyTracker.getCurrentPose();
    var guideRotations = script.choreographyManager.getCurrentRotations();
    var currentTime = script.choreographyManager.getTime();

    // Compute continuous similarity (only active joints)
    var similarity = computePoseSimilarity(userPose, guideRotations);

    // Faster-responding smoothing so score reflects current pose quickly
    frameScoreSmooth = frameScoreSmooth * 0.5 + similarity * 0.5;

    // Check for checkpoint scoring
    var checkpoints = script.choreographyManager.getCheckpoints();
    for (var i = 0; i < checkpoints.length; i++) {
        if (i <= lastCheckpointIndex) continue;

        // Check if we've passed this checkpoint (within 0.3s window)
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

            // Update UI
            if (script.uiManager) {
                script.uiManager.showRating(rating);
                script.uiManager.updateScore(totalScore);
                script.uiManager.updateCombo(combo);
            }

            // Trigger head score popup and aura glow
            if (script.headScore) {
                script.headScore.triggerScore(points);
            }

            break;
        }
    }
};
