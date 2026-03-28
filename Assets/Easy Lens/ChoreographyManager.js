// ChoreographyManager.js - Choreography Data & Guide Avatar Animation
// Stores dance sequences and drives the guide skeleton through them.

//@input SceneObject guideSkeletonRoot {"label": "Guide Skeleton Root (Hips)"}

// Joint names we track (must match skeleton hierarchy names)
var JOINT_NAMES = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForearm", "LeftHand",
    "RightShoulder", "RightArm", "RightForearm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot",
    "RightUpLeg", "RightLeg", "RightFoot"
];

var guideJoints = {}; // name -> SceneObject
var restRotations = {}; // name -> quat (bind pose)
var playing = false;
var currentTime = 0.0;

// ============================================================
// DANCE DATA - "Basic Groove" (16 seconds)
// Each pose: { time, joints: { JointName: [rx, ry, rz] in degrees } }
// Unspecified joints default to rest pose [0,0,0].
// ============================================================
var DANCE = {
    name: "Basic Groove",
    duration: 16.0,
    poses: [
        // t=0: Neutral standing
        { time: 0.0, joints: {} },

        // t=2: Right arm raised out
        {
            time: 2.0, joints: {
                "RightArm": [0, 0, 60],
                "RightForearm": [0, 0, 30]
            }
        },

        // t=4: Switch - left arm raised
        {
            time: 4.0, joints: {
                "LeftArm": [0, 0, -60],
                "LeftForearm": [0, 0, -30]
            }
        },

        // t=6: Both arms raised high
        {
            time: 6.0, joints: {
                "RightArm": [0, 0, 80],
                "RightForearm": [0, 0, 20],
                "LeftArm": [0, 0, -80],
                "LeftForearm": [0, 0, -20]
            }
        },

        // t=8: Arms down, squat
        {
            time: 8.0, joints: {
                "LeftUpLeg": [-35, 0, 0],
                "LeftLeg": [55, 0, 0],
                "RightUpLeg": [-35, 0, 0],
                "RightLeg": [55, 0, 0],
                "Spine": [-10, 0, 0]
            }
        },

        // t=10: Stand, lean right with right arm out
        {
            time: 10.0, joints: {
                "Spine": [0, 0, 15],
                "Spine1": [0, 0, 5],
                "RightArm": [-20, 0, 50]
            }
        },

        // t=12: Lean left with left arm out
        {
            time: 12.0, joints: {
                "Spine": [0, 0, -15],
                "Spine1": [0, 0, -5],
                "LeftArm": [-20, 0, -50]
            }
        },

        // t=14: Wide stance, both arms out
        {
            time: 14.0, joints: {
                "RightArm": [-20, 0, 55],
                "LeftArm": [-20, 0, -55],
                "LeftUpLeg": [-25, 0, 0],
                "LeftLeg": [40, 0, 0],
                "RightUpLeg": [-25, 0, 0],
                "RightLeg": [40, 0, 0]
            }
        },

        // t=16: Return to neutral
        { time: 16.0, joints: {} }
    ],

    // Scoring checkpoints - times where scoring is evaluated
    checkpoints: [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0]
};

// ============================================================
// SKELETON TRAVERSAL
// ============================================================
function findJoints(root, target) {
    if (!root) return;
    var name = root.name;
    if (JOINT_NAMES.indexOf(name) >= 0) {
        target[name] = root;
    }
    for (var i = 0; i < root.getChildrenCount(); i++) {
        findJoints(root.getChild(i), target);
    }
}

// ============================================================
// ROTATION HELPERS
// ============================================================
var DEG2RAD = Math.PI / 180.0;

function eulerToQuat(rx, ry, rz) {
    return quat.fromEulerAngles(rx * DEG2RAD, ry * DEG2RAD, rz * DEG2RAD);
}

function getJointRotationAtPose(pose, jointName) {
    if (pose.joints[jointName]) {
        var r = pose.joints[jointName];
        return eulerToQuat(r[0], r[1], r[2]);
    }
    return quat.quatIdentity();
}

// ============================================================
// PUBLIC API
// ============================================================
script.getDuration = function () {
    return DANCE.duration;
};

script.getCheckpoints = function () {
    return DANCE.checkpoints;
};

script.startPlayback = function () {
    playing = true;
    currentTime = 0.0;
};

script.stopPlayback = function () {
    playing = false;
};

script.getTime = function () {
    return currentTime;
};

// Returns an object { JointName: quat } with the current guide rotations
script.getCurrentRotations = function () {
    if (DANCE.poses.length === 0) return null;

    // Find surrounding keyframe poses
    var poseA = DANCE.poses[0];
    var poseB = DANCE.poses[0];
    var blend = 0.0;

    for (var i = 0; i < DANCE.poses.length - 1; i++) {
        if (currentTime >= DANCE.poses[i].time && currentTime <= DANCE.poses[i + 1].time) {
            poseA = DANCE.poses[i];
            poseB = DANCE.poses[i + 1];
            var span = poseB.time - poseA.time;
            blend = span > 0 ? (currentTime - poseA.time) / span : 0;
            break;
        }
    }

    var rotations = {};
    for (var j = 0; j < JOINT_NAMES.length; j++) {
        var name = JOINT_NAMES[j];
        var rotA = getJointRotationAtPose(poseA, name);
        var rotB = getJointRotationAtPose(poseB, name);
        rotations[name] = quat.slerp(rotA, rotB, blend);
    }
    return rotations;
};

script.update = function (dt) {
    if (!playing) return;

    currentTime += dt;
    if (currentTime > DANCE.duration) {
        currentTime = DANCE.duration;
    }

    // Apply rotations to guide skeleton
    var rotations = script.getCurrentRotations();
    if (!rotations) return;

    for (var name in rotations) {
        if (guideJoints[name]) {
            // Combine rest rotation with choreography rotation
            var finalRot = restRotations[name]
                ? restRotations[name].multiply(rotations[name])
                : rotations[name];
            guideJoints[name].getTransform().setLocalRotation(finalRot);
        }
    }
};

// ============================================================
// INIT
// ============================================================
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    if (!script.guideSkeletonRoot) {
        print("ChoreographyManager: ERROR - guideSkeletonRoot not set!");
        return;
    }

    // Find all joints in the guide skeleton
    findJoints(script.guideSkeletonRoot, guideJoints);

    // Save rest rotations
    for (var i = 0; i < JOINT_NAMES.length; i++) {
        var name = JOINT_NAMES[i];
        if (guideJoints[name]) {
            restRotations[name] = guideJoints[name].getTransform().getLocalRotation();
        }
    }

    print("ChoreographyManager: Initialized with " + Object.keys(guideJoints).length + " joints");
});
