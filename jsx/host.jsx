/**
 * CutThat Pro — ExtendScript Host
 * Premiere Pro DOM manipulation
 * ES3 only — no arrow functions, no let/const, no template literals
 */

/* ============================================================
   HELPER: Convert seconds to Premiere ticks
   ============================================================ */
var TICKS_PER_SECOND = 254016000000;

function secondsToTicks(sec) {
    return String(Math.round(parseFloat(sec) * TICKS_PER_SECOND));
}

function ticksToSeconds(ticks) {
    return Number(ticks) / TICKS_PER_SECOND;
}

function getTimeSeconds(timeObj) {
    if (!timeObj) return 0;
    if (typeof timeObj === "number") return timeObj;
    if (timeObj.ticks !== undefined) return ticksToSeconds(timeObj.ticks);
    if (timeObj.seconds !== undefined) return Number(timeObj.seconds);
    return 0;
}

/* ============================================================
   DIAGNOSTIC: List all clips on timeline
   ============================================================ */
function diagnosticListClips() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No sequence" });

        var result = { videoTracks: [], audioTracks: [] };

        // Video tracks
        for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
            var vTrack = seq.videoTracks[vt];
            var vClips = [];
            for (var vc = 0; vc < vTrack.clips.numItems; vc++) {
                var vClip = vTrack.clips[vc];
                var vStart = vClip.start;
                var vEnd = vClip.end;
                vClips.push({
                    index: vc,
                    startSec: getTimeSeconds(vStart),
                    endSec: getTimeSeconds(vEnd),
                    startType: typeof vStart,
                    hasTicks: vStart && vStart.ticks !== undefined,
                    hasSeconds: vStart && vStart.seconds !== undefined,
                    methods: getMethodsList(vClip)
                });
            }
            result.videoTracks.push({ track: vt, clipCount: vClips.length, clips: vClips });
        }

        // Audio tracks
        for (var at = 0; at < seq.audioTracks.numTracks; at++) {
            var aTrack = seq.audioTracks[at];
            var aClips = [];
            for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
                var aClip = aTrack.clips[ac];
                var aStart = aClip.start;
                var aEnd = aClip.end;
                aClips.push({
                    index: ac,
                    startSec: getTimeSeconds(aStart),
                    endSec: getTimeSeconds(aEnd),
                    startType: typeof aStart,
                    hasTicks: aStart && aStart.ticks !== undefined,
                    hasSeconds: aStart && aStart.seconds !== undefined,
                    methods: getMethodsList(aClip)
                });
            }
            result.audioTracks.push({ track: at, clipCount: aClips.length, clips: aClips });
        }

        return JSON.stringify({ success: true, data: result });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

function getMethodsList(obj) {
    var methods = [];
    for (var key in obj) {
        if (typeof obj[key] === "function") {
            methods.push(key);
        }
    }
    return methods.sort().slice(0, 30); // limit to 30
}

/* ============================================================
   DIAGNOSTIC: Test clip removal methods
   ============================================================ */
function diagnosticTestRemove() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No sequence" });

        // Find the LAST video clip (least likely to break timeline)
        var vTrack = seq.videoTracks[0];
        if (!vTrack || vTrack.clips.numItems < 2) {
            return JSON.stringify({ success: false, error: "Need at least 2 clips to test removal" });
        }

        var lastIdx = vTrack.clips.numItems - 1;
        var clip = vTrack.clips[lastIdx];
        var clipInfo = {
            index: lastIdx,
            startSec: getTimeSeconds(clip.start),
            endSec: getTimeSeconds(clip.end)
        };

        var tests = [];

        // Test 1: clip.remove(1, 1) — ripple delete
        try {
            clip.remove(1, 1);
            tests.push("PASS: clip.remove(1, 1)");
        } catch (e1) {
            tests.push("FAIL: clip.remove(1, 1) — " + e1.toString());
        }

        // If that failed, test other methods on remaining clips
        if (tests[0].indexOf("FAIL") === 0 && lastIdx > 0) {
            var clip2 = vTrack.clips[lastIdx - 1];
            try {
                clip2.remove(1);
                tests.push("PASS: clip.remove(1)");
            } catch (e2) {
                tests.push("FAIL: clip.remove(1) — " + e2.toString());
            }
        }

        return JSON.stringify({
            success: true,
            clipTested: clipInfo,
            totalClipsBefore: vTrack.clips.numItems,
            tests: tests
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   TEST RAZOR CUT — diagnostic: tries different time formats
   ============================================================ */
function testRazorCut() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No sequence" });

        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return JSON.stringify({ success: false, error: "No QE sequence" });

        var playhead = seq.getPlayerPosition();
        var results = [];

        // Test 1: float seconds
        try {
            var sec = parseFloat(playhead.seconds) + 1.0;
            qeSeq.razor(sec);
            results.push("PASS: float seconds=" + sec);
        } catch (e1) {
            results.push("FAIL: float seconds — " + e1.toString());
        }

        // Test 2: ticks string
        try {
            var ticks = secondsToTicks(parseFloat(playhead.seconds) + 2.0);
            qeSeq.razor(ticks);
            results.push("PASS: ticks=" + ticks);
        } catch (e2) {
            results.push("FAIL: ticks — " + e2.toString());
        }

        // Test 3: timecode string
        try {
            var tc = playhead.toString();
            qeSeq.razor(tc);
            results.push("PASS: timecode=" + tc);
        } catch (e3) {
            results.push("FAIL: timecode — " + e3.toString());
        }

        return JSON.stringify({
            success: true,
            playheadSeconds: playhead.seconds,
            playheadTicks: String(playhead.ticks),
            playheadString: playhead.toString(),
            tests: results
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   HOST PING (used by loadJSX to verify host loaded)
   ============================================================ */
function cutThatHostPing() {
    return "PING_OK";
}

/* ============================================================
   TEST CONNECTION
   ============================================================ */
function testPremiereConnection() {
    try {
        if (typeof app === "undefined") {
            return JSON.stringify({ success: false, error: "Premiere app not found" });
        }
        if (!app.project) {
            return JSON.stringify({ success: false, error: "No project open" });
        }
        var projectName = app.project.name || "Untitled";
        var seq = app.project.activeSequence;
        var seqName = seq ? (seq.name || "Unnamed") : "None";
        return JSON.stringify({
            success: true,
            projectName: projectName,
            sequenceName: seqName
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   GET SOURCE MEDIA PATH
   ============================================================ */
function getSourceMediaPath() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project found" });
        }
        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence found" });
        }
        var sequenceName = seq.name ? String(seq.name) : "Unknown";
        var filePath = "";

        // Try video tracks first
        try {
            var videoTracks = seq.videoTracks;
            if (videoTracks && videoTracks.numTracks > 0) {
                var vTrack = videoTracks[0];
                if (vTrack && vTrack.clips && vTrack.clips.numItems > 0) {
                    var clip = vTrack.clips[0];
                    if (clip && clip.projectItem) {
                        filePath = clip.projectItem.getMediaPath ? String(clip.projectItem.getMediaPath()) : "";
                    }
                }
            }
        } catch (e) {}

        // Fallback: audio tracks
        if (!filePath) {
            try {
                var audioTracks = seq.audioTracks;
                if (audioTracks && audioTracks.numTracks > 0) {
                    var aTrack = audioTracks[0];
                    if (aTrack && aTrack.clips && aTrack.clips.numItems > 0) {
                        var aClip = aTrack.clips[0];
                        if (aClip && aClip.projectItem) {
                            filePath = aClip.projectItem.getMediaPath ? String(aClip.projectItem.getMediaPath()) : "";
                        }
                    }
                }
            } catch (e2) {}
        }

        if (!filePath) {
            return JSON.stringify({ success: false, error: "No media found in timeline. Add clips first." });
        }

        var mediaFile = new File(filePath);
        if (!mediaFile.exists) {
            return JSON.stringify({ success: false, error: "File not found: " + filePath });
        }

        return JSON.stringify({
            success: true,
            filePath: filePath,
            audioPath: filePath,
            sequenceName: sequenceName
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   GET AUDIO EXPORT INFO (alias for getSourceMediaPath)
   ============================================================ */
function getAudioExportInfo() {
    return getSourceMediaPath();
}

/* ============================================================
   EXPORT ACTIVE SEQUENCE AUDIO (alias for getSourceMediaPath)
   ============================================================ */
function exportActiveSequenceAudioForCutThat() {
    return getSourceMediaPath();
}

/* ============================================================
   DUPLICATE ACTIVE SEQUENCE
   ============================================================ */
function duplicateActiveSequence() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project found" });
        }
        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence found" });
        }

        var newSeq = null;

        // Method 1: ExtendScript clone
        try {
            if (seq.clone && typeof seq.clone === "function") {
                newSeq = seq.clone();
            }
        } catch (e1) {}

        // Method 2: QE API clone
        if (!newSeq) {
            try {
                app.enableQE();
                if (typeof qe !== "undefined" && qe.project) {
                    var qeSeq = qe.project.getActiveSequence();
                    if (qeSeq && qeSeq.clone) {
                        newSeq = qeSeq.clone();
                    }
                }
            } catch (e2) {}
        }

        if (!newSeq) {
            return JSON.stringify({ success: false, error: "Could not duplicate sequence" });
        }

        return JSON.stringify({
            success: true,
            newSequenceName: newSeq.name ? String(newSeq.name) : "Duplicated"
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   APPLY CUT PLAN (razor + delete via QE API)
   ============================================================ */
function applyCutPlan(cutsJSON) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project" });
        }

        var cuts;
        try {
            var raw = decodeURIComponent(cutsJSON);
            cuts = JSON.parse(raw);
        } catch (e) {
            try { cuts = JSON.parse(cutsJSON); } catch (e2) {
                return JSON.stringify({ success: false, error: "Invalid cuts JSON: " + e.toString() });
            }
        }

        if (!cuts || !cuts.length || cuts.length === 0) {
            return JSON.stringify({ success: false, error: "No cuts to apply" });
        }

        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
            return JSON.stringify({ success: false, error: "No active sequence in QE" });
        }

        cuts.sort(function(a, b) { return b.start - a.start; });

        var cutsApplied = 0;
        for (var i = 0; i < cuts.length; i++) {
            try {
                qeSeq.razor(secondsToTicks(cuts[i].start));
                qeSeq.razor(secondsToTicks(cuts[i].end));
                cutsApplied++;
            } catch (razorErr) {}
        }

        return JSON.stringify({ success: true, cutsApplied: cutsApplied });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   ADD MARKERS FROM CUTS
   ============================================================ */
function addMarkersFromCuts(cutsJSON) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project" });
        }

        var cuts;
        try {
            var raw = decodeURIComponent(cutsJSON);
            cuts = JSON.parse(raw);
        } catch (e) {
            try { cuts = JSON.parse(cutsJSON); } catch (e2) {
                return JSON.stringify({ success: false, error: "Invalid cuts JSON" });
            }
        }

        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No active sequence" });

        var markersAdded = 0;
        for (var i = 0; i < cuts.length; i++) {
            try {
                var marker = seq.markers.createMarker(cuts[i].start);
                if (marker) {
                    marker.name = "Silence " + (i + 1);
                    marker.comments = "Duration: " + cuts[i].duration.toFixed(2) + "s";
                    markersAdded++;
                }
            } catch (markerErr) {}
        }

        return JSON.stringify({ success: true, markersAdded: markersAdded });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   GET SEQUENCE INFO FOR CLEAN CUT
   ============================================================ */
function getSequenceInfoForCleanCut() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No sequence" });
        var sourceClip = "";
        try {
            var vTrack = seq.videoTracks[0];
            if (vTrack && vTrack.clips && vTrack.clips.numItems > 0) {
                sourceClip = vTrack.clips[0].projectItem.getMediaPath ? String(vTrack.clips[0].projectItem.getMediaPath()) : "";
            }
        } catch (e) {}
        return JSON.stringify({
            success: true,
            sourceClip: sourceClip,
            sequenceInfo: {
                name: seq.name || "Untitled",
                videoTracks: seq.videoTracks ? seq.videoTracks.numTracks : 0,
                audioTracks: seq.audioTracks ? seq.audioTracks.numTracks : 0
            }
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   DUPLICATE SEQUENCE (alias)
   ============================================================ */
function duplicateActiveSequenceForCutThat() {
    return duplicateActiveSequence();
}

/* ============================================================
   ADD RAZOR CUTS TO TIMELINE
   ============================================================ */
function addRazorCutsToTimeline(cutsJSON) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var cuts;
        try {
            var raw = decodeURIComponent(cutsJSON);
            cuts = JSON.parse(raw);
        } catch (e) {
            try { cuts = JSON.parse(cutsJSON); } catch (e2) {
                return JSON.stringify({ success: false, error: "Invalid JSON" });
            }
        }
        if (!cuts || cuts.length === 0) {
            return JSON.stringify({ success: false, error: "No cuts" });
        }
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return JSON.stringify({ success: false, error: "No QE sequence" });
        var cutsAdded = 0;
        for (var i = 0; i < cuts.length; i++) {
            try {
                qeSeq.razor(secondsToTicks(cuts[i].start));
                qeSeq.razor(secondsToTicks(cuts[i].end));
                cutsAdded++;
            } catch (razorErr) {}
        }
        return JSON.stringify({ success: true, cutsAdded: cutsAdded });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   ADD SILENCE MARKERS TO TIMELINE
   ============================================================ */
function addSilenceMarkersToTimeline(cutsJSON) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var cuts;
        try {
            var raw = decodeURIComponent(cutsJSON);
            cuts = JSON.parse(raw);
        } catch (e) {
            try { cuts = JSON.parse(cutsJSON); } catch (e2) {
                return JSON.stringify({ success: false, error: "Invalid JSON" });
            }
        }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No sequence" });
        var markersAdded = 0;
        for (var i = 0; i < cuts.length; i++) {
            try {
                var marker = seq.markers.createMarker(cuts[i].start);
                if (marker) {
                    marker.name = "Silence " + (i + 1);
                    marker.comments = "Duration: " + (cuts[i].duration || 0).toFixed(2) + "s";
                    markersAdded++;
                }
            } catch (mErr) {}
        }
        return JSON.stringify({ success: true, markersAdded: markersAdded });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   ADD CAPTION TRACK TO TIMELINE
   ============================================================ */
function addCaptionTrackToTimeline(srtContent) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var decodedSrt = srtContent;
        try { decodedSrt = decodeURIComponent(srtContent); } catch(de) {}
        var tempPath = Folder.myDocuments.fsName + "/CutThatPro/temp/captions.srt";
        var tempFolder = new Folder(Folder.myDocuments.fsName + "/CutThatPro/temp");
        if (!tempFolder.exists) { tempFolder.create(); }
        var srtFile = new File(tempPath);
        srtFile.open("w");
        srtFile.write(decodedSrt);
        srtFile.close();
        var importResult = app.project.importFiles([tempPath], false, app.project.rootItem, false);
        return JSON.stringify({ success: true, imported: importResult ? "yes" : "no", path: tempPath });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   APPLY ZOOM KEYFRAMES
   ============================================================ */
function applyZoomKeyframes(zoomJSON) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var zooms;
        try { zooms = JSON.parse(zoomJSON); } catch (e) {
            return JSON.stringify({ success: false, error: "Invalid JSON" });
        }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No sequence" });
        return JSON.stringify({ success: true, message: "Zoom keyframes: feature in development", count: zooms.length });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   IMPORT SEQUENCE XML
   ============================================================ */
function importSequenceXML(xmlPath) {
    return JSON.stringify({ success: false, error: "Use applyCleanCutDirect instead" });
}

/* ============================================================
   APPLY CLEAN CUT DIRECT (razor + ripple delete via QE API)
   ============================================================ */
function applyCleanCutDirect(cutsJSON) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }

        var ranges;
        try {
            var raw = decodeURIComponent(cutsJSON);
            ranges = JSON.parse(raw);
        } catch (e) {
            try { ranges = JSON.parse(cutsJSON); } catch (e2) {
                return JSON.stringify({ success: false, error: "Invalid JSON: " + e.toString() });
            }
        }
        if (!ranges || ranges.length === 0) {
            return JSON.stringify({ success: false, error: "No ranges" });
        }

        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No active sequence" });

        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return JSON.stringify({ success: false, error: "No QE sequence" });

        var debug = [];
        var razorCount = 0;
        var removedCount = 0;

        debug.push("rangesLen:" + ranges.length);
        if (ranges.length > 0) {
            debug.push("range0:" + Number(ranges[0].start) + "-" + Number(ranges[0].end));
        }

        // Step 1: Razor at start and end of each silence range
        // Try BOTH sequence-level and track-level razor
        for (var i = 0; i < ranges.length; i++) {
            var rStart = Number(ranges[i].start);
            var rEnd = Number(ranges[i].end);
            if (isNaN(rStart) || isNaN(rEnd)) continue;

            var startTicks = secondsToTicks(rStart);
            var endTicks = secondsToTicks(rEnd);

            try {
                // Method A: Sequence-level QE razor
                qeSeq.razor(startTicks);
                qeSeq.razor(endTicks);
                razorCount++;
            } catch (razorErr) {
                // Method B: Track-level razor
                try {
                    if (seq.videoTracks[0]) {
                        seq.videoTracks[0].razor(startTicks);
                        seq.videoTracks[0].razor(endTicks);
                    }
                    if (seq.audioTracks[0]) {
                        seq.audioTracks[0].razor(startTicks);
                        seq.audioTracks[0].razor(endTicks);
                    }
                    razorCount++;
                } catch (trackErr) {
                    debug.push("razorFail[" + i + "]:qe=" + razorErr.toString() + ";track=" + trackErr.toString());
                }
            }
        }

        // Step 1b: List clips after razor for debugging
        var vTrack = seq.videoTracks[0];
        var aTrack = seq.audioTracks[0];
        if (vTrack) {
            debug.push("vClips:" + vTrack.clips.numItems);
            for (var d = 0; d < Math.min(vTrack.clips.numItems, 5); d++) {
                try {
                    var dc = vTrack.clips[d];
                    debug.push("vClip" + d + ":" + getTimeSeconds(dc.start).toFixed(3) + "-" + getTimeSeconds(dc.end).toFixed(3));
                } catch(de) {}
            }
        }
        if (aTrack) {
            debug.push("aClips:" + aTrack.clips.numItems);
        }

        // Step 3: Remove silence clips using midpoint comparison
        for (var r = ranges.length - 1; r >= 0; r--) {
            var rangeStart = Number(ranges[r].start);
            var rangeEnd = Number(ranges[r].end);

            // Video clips
            if (vTrack) {
                for (var vc = vTrack.clips.numItems - 1; vc >= 0; vc--) {
                    try {
                        var vClip = vTrack.clips[vc];
                        var vStart = getTimeSeconds(vClip.start);
                        var vEnd = getTimeSeconds(vClip.end);
                        var vMid = (vStart + vEnd) / 2;
                        if (vMid >= rangeStart && vMid <= rangeEnd) {
                            vClip.remove(1, 1);
                            removedCount++;
                            debug.push("vRm:" + vc + " mid=" + vMid.toFixed(3));
                        }
                    } catch (rmErr) {
                        debug.push("vRmErr:" + vc + ":" + rmErr.toString());
                    }
                }
            }

            // Audio clips
            if (aTrack) {
                for (var ac = aTrack.clips.numItems - 1; ac >= 0; ac--) {
                    try {
                        var aClip = aTrack.clips[ac];
                        var aStart = getTimeSeconds(aClip.start);
                        var aEnd = getTimeSeconds(aClip.end);
                        var aMid = (aStart + aEnd) / 2;
                        if (aMid >= rangeStart && aMid <= rangeEnd) {
                            aClip.remove(1, 1);
                            removedCount++;
                            debug.push("aRm:" + ac + " mid=" + aMid.toFixed(3));
                        }
                    } catch (rmErr) {
                        debug.push("aRmErr:" + ac + ":" + rmErr.toString());
                    }
                }
            }
        }

        return JSON.stringify({
            success: true,
            rangesProcessed: ranges.length,
            razorCount: razorCount,
            clipsRemoved: removedCount,
            debug: debug.join("; ")
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   INSERT B-ROLL CLIPS
   ============================================================ */
function insertBrollClips(brollJSON) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var brolls;
        try { brolls = JSON.parse(brollJSON); } catch (e) {
            return JSON.stringify({ success: false, error: "Invalid JSON" });
        }
        return JSON.stringify({ success: true, message: "B-Roll insertion: feature in development", count: brolls.length });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   GET TIMELINE INFO
   ============================================================ */
function getTimelineInfo() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No project" });
        }
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No sequence" });

        var videoCount = 0;
        var audioCount = 0;
        try { videoCount = seq.videoTracks ? seq.videoTracks.numTracks : 0; } catch(e) {}
        try { audioCount = seq.audioTracks ? seq.audioTracks.numTracks : 0; } catch(e) {}

        return JSON.stringify({
            success: true,
            sequenceName: seq.name || "Untitled",
            videoTracks: videoCount,
            audioTracks: audioCount
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}
