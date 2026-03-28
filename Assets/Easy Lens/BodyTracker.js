// BodyTracker.js - User Pose Extraction
// Reads joint rotations from the live body-tracked skeleton.

//@input SceneObject userSkeletonRoot {"label": "User Skeleton Root (Hips)"}
//@input float smoothing = 0.3 {"label": "Smoothing Factor", "widget": "slider", "min": 0.0, "max": 1.0, "step": 0.05}

var JOINT_NAMES = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForearm", "LeftHand",
    "RightShoulder", "RightArm", "RightForearm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot",
    "RightUpLeg", "RightLeg", "RightFoot"
];

var userJoints = {}; // name -> SceneObject
var smoothedRotations = {}; // name -> quat
var initialized = false;

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

// Returns current user pose as { JointName: quat }
script.getCurrentPose = function () {
    if (!initialized) return null;

    var pose = {};
    var alpha = script.smoothing;

    for (var i = 0; i < JOINT_NAMES.length; i++) {
        var name = JOINT_NAMES[i];
        if (userJoints[name]) {
            var raw = userJoints[name].getTransform().getLocalRotation();

            // Apply exponential smoothing
            if (smoothedRotations[name]) {
                smoothedRotations[name] = quat.slerp(raw, smoothedRotations[name], alpha);
            } else {
                smoothedRotations[name] = raw;
            }

            pose[name] = smoothedRotations[name];
        }
    }
    return pose;
};

script.getJointNames = function () {
    return JOINT_NAMES;
};

// Init
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    if (!script.userSkeletonRoot) {
        print("BodyTracker: ERROR - userSkeletonRoot not set!");
        return;
    }

    findJoints(script.userSkeletonRoot, userJoints);
    initialized = true;
    print("BodyTracker: Initialized with " + Object.keys(userJoints).length + " joints");
});
