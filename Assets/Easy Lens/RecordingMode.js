// RecordingMode.js - Dance Recording Helper
// Records user body tracking data and prints it as choreography JSON.
// Usage: Enable this script, perform a dance, then check the Logger for output.

//@input Component.ScriptComponent bodyTracker
//@input float recordDuration = 16.0 {"label": "Record Duration (seconds)"}
//@input bool autoStart = false {"label": "Auto Start Recording"}

var JOINT_NAMES = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForearm", "LeftHand",
    "RightShoulder", "RightArm", "RightForearm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot",
    "RightUpLeg", "RightLeg", "RightFoot"
];

var recording = false;
var recordedFrames = [];
var recordTimer = 0;
var SAMPLE_RATE = 5; // samples per second
var sampleInterval = 1.0 / SAMPLE_RATE;
var sampleTimer = 0;

function quatToEulerDeg(q) {
    // Convert quaternion to Euler angles in degrees
    var sinr = 2 * (q.w * q.x + q.y * q.z);
    var cosr = 1 - 2 * (q.x * q.x + q.y * q.y);
    var rx = Math.atan2(sinr, cosr) * (180 / Math.PI);

    var sinp = 2 * (q.w * q.y - q.z * q.x);
    var ry;
    if (Math.abs(sinp) >= 1) {
        ry = (sinp >= 0 ? 1 : -1) * 90;
    } else {
        ry = Math.asin(sinp) * (180 / Math.PI);
    }

    var siny = 2 * (q.w * q.z + q.x * q.y);
    var cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
    var rz = Math.atan2(siny, cosy) * (180 / Math.PI);

    return [Math.round(rx * 10) / 10, Math.round(ry * 10) / 10, Math.round(rz * 10) / 10];
}

script.startRecording = function () {
    print("RecordingMode: RECORDING STARTED - hold your poses!");
    recording = true;
    recordedFrames = [];
    recordTimer = 0;
    sampleTimer = 0;
};

script.stopRecording = function () {
    recording = false;
    print("RecordingMode: RECORDING STOPPED - " + recordedFrames.length + " frames captured");
    exportData();
};

function exportData() {
    // Build poses array from recorded frames
    var poses = [];
    for (var i = 0; i < recordedFrames.length; i++) {
        var frame = recordedFrames[i];
        var jointData = {};
        for (var name in frame.joints) {
            var euler = frame.joints[name];
            // Only include joints with significant rotation
            if (Math.abs(euler[0]) > 3 || Math.abs(euler[1]) > 3 || Math.abs(euler[2]) > 3) {
                jointData[name] = euler;
            }
        }
        poses.push({ time: Math.round(frame.time * 10) / 10, joints: jointData });
    }

    print("=== CHOREOGRAPHY DATA START ===");
    print(JSON.stringify({ name: "Recorded Dance", duration: script.recordDuration, poses: poses }, null, 2));
    print("=== CHOREOGRAPHY DATA END ===");
}

var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(function (eventData) {
    if (!recording) return;

    var dt = eventData.getDeltaTime();
    recordTimer += dt;
    sampleTimer += dt;

    if (recordTimer >= script.recordDuration) {
        script.stopRecording();
        return;
    }

    if (sampleTimer >= sampleInterval) {
        sampleTimer -= sampleInterval;

        var pose = script.bodyTracker.getCurrentPose();
        if (!pose) return;

        var frameJoints = {};
        for (var i = 0; i < JOINT_NAMES.length; i++) {
            var name = JOINT_NAMES[i];
            if (pose[name]) {
                frameJoints[name] = quatToEulerDeg(pose[name]);
            }
        }

        recordedFrames.push({ time: recordTimer, joints: frameJoints });
    }
});

// Auto-start if configured
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    if (script.autoStart) {
        // Delay 3 seconds to give time to get in position
        var delay = script.createEvent("DelayedCallbackEvent");
        delay.bind(function () {
            script.startRecording();
        });
        delay.reset(3.0);
    }
});
