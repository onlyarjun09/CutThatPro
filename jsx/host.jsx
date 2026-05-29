/**
 * CutThat Pro — ExtendScript Host
 * Premiere Pro DOM manipulation via QE engine
 * All functions return JSON.stringify() results
 */

/* ============================================================
   GUARD & PING
   ============================================================ */
function cutThatHostPing() {
    try {
        if (typeof app === "undefined") {
            return "PING_FAIL: app object not found";
        }
        if (!app.project) {
            return "PING_WARN: Connected but no project open";
        }
        var name = app.project.name || "Untitled";
        var seq = app.project.activeSequence;
        var seqName = seq ? (seq.name || "Unnamed") : "None";
        return "PING_OK: Project=" + name + " | Sequence=" + seqName;
    } catch (e) {
        return "PING_ERROR: " + e.toString();
    }
}

/* ============================================================
   CONNECTION TEST
   ============================================================ */
function testPremiereConnection() {
    try {
        if (typeof app === "undefined") {
            return "Premiere app object not found.";
        }
        if (!app.project) {
            return "Connected to Premiere, but no active project object found.";
        }
        var projectName = app.project.name;
        if (!projectName || projectName === "") {
            return "Connected to Premiere. No project is currently open.";
        }
        return "Connected to Premiere. Active project: " + projectName;
    } catch (err) {
        return "Connection test error: " + err;
    }
}

/* ============================================================
   AUDIO EXPORT
   ============================================================ */
function exportActiveSequenceAudioForCutThat() {
    var result = {
        success: false,
        filePath: "",
        sequenceName: "",
        error: "",
        details: ""
    };

    try {
        if (typeof app === "undefined" || !app || !app.project) {
            result.error = "No active Premiere project found";
            return JSON.stringify(result);
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            result.error = "No active sequence found";
            return JSON.stringify(result);
        }

        result.sequenceName = seq.name ? String(seq.name) : "Unknown Sequence";

        // Get source media file path from the first clip in the sequence
        // No Media Encoder needed — backend will use FFmpeg directly
        var filePath = "";
        
        try {
            // Try video tracks first
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
        } catch (e) {
            // Fallback: try audio tracks
        }

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
            } catch (e2) {
                result.error = "Could not get media path from sequence";
                result.details = e2.toString();
                return JSON.stringify(result);
            }
        }

        if (!filePath) {
            result.error = "No media files found in sequence";
            result.details = "Add video/audio clips to the timeline first";
            return JSON.stringify(result);
        }

        // Verify file exists
        var mediaFile = new File(filePath);
        if (!mediaFile.exists) {
            result.error = "Media file not found: " + filePath;
            return JSON.stringify(result);
        }

        result.success = true;
        result.filePath = filePath;
        return JSON.stringify(result);

    } catch (err) {
        result.error = "Failed to get media path";
        result.details = err.toString();
        return JSON.stringify(result);
    }
}
        return JSON.stringify(result);
    }
}

/* ============================================================
   AUDIO EXPORT INFO (returns path of expected audio output)
   ============================================================ */
function getAudioExportInfo() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project found" });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence found" });
        }

        var sequenceName = seq.name ? String(seq.name) : "Unknown";

        // Get source media file path directly — no export needed
        var filePath = "";
        
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
            audioPath: filePath,  // backward compat
            sequenceName: sequenceName
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   DUPLICATE SEQUENCE
   ============================================================ */
function duplicateActiveSequenceForCutThat() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return "Error: No active Premiere project found.";
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return "Error: No active sequence found. Please open a timeline sequence first.";
        }

        var originalName = seq.name ? String(seq.name) : "Untitled Sequence";
        var newName = originalName + " - CutThatPro Edit";

        var sequences = app.project.sequences;
        var beforeCount = sequences && sequences.numSequences ? sequences.numSequences : 0;

        var methodErrors = [];
        var duplicateRef = null;

        // Try standard clone
        try {
            if (seq.clone && typeof seq.clone === "function") {
                duplicateRef = seq.clone();
            } else {
                methodErrors.push("activeSequence.clone() not available");
            }
        } catch (e1) {
            methodErrors.push("activeSequence.clone() failed: " + e1.toString());
        }

        // Try QE clone fallback
        if (!duplicateRef) {
            try {
                app.enableQE();
                if (typeof qe !== "undefined" && qe && qe.project && qe.project.getActiveSequence) {
                    var qeSeq = qe.project.getActiveSequence();
                    if (qeSeq && qeSeq.clone) {
                        duplicateRef = qeSeq.clone();
                    } else {
                        methodErrors.push("QE active sequence clone() not available");
                    }
                } else {
                    methodErrors.push("QE project API not available");
                }
            } catch (e2) {
                methodErrors.push("QE clone() failed: " + e2.toString());
            }
        }

        var afterCount = sequences && sequences.numSequences ? sequences.numSequences : 0;
        var duplicateSequence = null;

        if (afterCount > beforeCount && sequences) {
            try {
                duplicateSequence = sequences[afterCount - 1];
            } catch (e3) {}
        }

        if (!duplicateSequence && duplicateRef && duplicateRef.name !== undefined) {
            duplicateSequence = duplicateRef;
        }

        if (!duplicateSequence) {
            return "Error: Could not find duplicated sequence after clone attempt.\n" +
                "Details: " + methodErrors.join(" | ");
        }

        var finalName = "";
        try {
            duplicateSequence.name = newName;
            finalName = duplicateSequence.name ? String(duplicateSequence.name) : newName;
        } catch (renameErr) {
            return "Error: Sequence duplicated but rename failed.\n" +
                "Original: " + originalName + "\n" +
                "Requested: " + newName + "\n" +
                "Error: " + renameErr.toString();
        }

        return "Duplicated active sequence successfully.\n" +
            "Original: " + originalName + "\n" +
            "Duplicate: " + finalName;
    } catch (err) {
        return "Error duplicating sequence: " + err.toString();
    }
}

/* ============================================================
   SEQUENCE INFO FOR CLEAN CUT
   ============================================================ */
function getSequenceInfoForCleanCut() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project found" });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence found" });
        }

        var sequenceName = seq.name ? String(seq.name) : "Unknown";
        var fps = 25;
        var width = 1920;
        var height = 1080;
        var sampleRate = 48000;

        // Try to get frame rate
        try {
            if (seq.timebase) {
                var tb = Number(seq.timebase);
                if (isFinite(tb) && tb > 0) {
                    fps = Math.round(254016000000 / tb);
                }
            }
        } catch (tbErr) {}

        // Try to get resolution from first video clip
        try {
            if (seq.videoTracks && seq.videoTracks.numTracks > 0) {
                var vTrack = seq.videoTracks[0];
                if (vTrack && vTrack.clips && vTrack.clips.numItems > 0) {
                    var vClip = vTrack.clips[0];
                    if (vClip && vClip.projectItem) {
                        var pi = vClip.projectItem;
                        if (pi.getMediaPath) {
                            // Width/height from project item
                        }
                    }
                }
            }
        } catch (resErr) {}

        // Get first source clip info
        var sourceClip = null;
        try {
            if (seq.videoTracks && seq.videoTracks.numTracks > 0) {
                var vt = seq.videoTracks[0];
                if (vt && vt.clips && vt.clips.numItems > 0) {
                    var vc = vt.clips[0];
                    var filePath = "";
                    var clipName = vc.name ? String(vc.name) : "";

                    if (vc.projectItem) {
                        try {
                            filePath = vc.projectItem.getMediaPath ? String(vc.projectItem.getMediaPath()) : "";
                        } catch (pathErr) {}
                    }

                    var startTicks = vc.start && vc.start.ticks ? Number(vc.start.ticks) : 0;
                    var endTicks = vc.end && vc.end.ticks ? Number(vc.end.ticks) : 0;
                    var ticksPerSec = 254016000000;

                    sourceClip = {
                        filePath: filePath,
                        clipName: clipName,
                        sourceIn: startTicks / ticksPerSec,
                        sourceOut: endTicks / ticksPerSec,
                        duration: (endTicks - startTicks) / ticksPerSec
                    };
                }
            }
        } catch (clipErr) {}

        // Also check audio tracks for file path if video didn't have it
        if (sourceClip && !sourceClip.filePath) {
            try {
                if (seq.audioTracks && seq.audioTracks.numTracks > 0) {
                    var at = seq.audioTracks[0];
                    if (at && at.clips && at.clips.numItems > 0) {
                        var ac = at.clips[0];
                        if (ac.projectItem) {
                            try {
                                sourceClip.filePath = String(ac.projectItem.getMediaPath());
                            } catch (aPathErr) {}
                        }
                    }
                }
            } catch (aErr) {}
        }

        return JSON.stringify({
            success: true,
            sequenceInfo: {
                sequenceName: sequenceName,
                fps: fps,
                width: width,
                height: height,
                sampleRate: sampleRate
            },
            sourceClip: sourceClip
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   TIMELINE ANALYSIS
   ============================================================ */
function analyzeActiveSequence() {
    try {
        if (typeof app === "undefined") {
            return "Premiere app object not found.";
        }
        if (!app.project) {
            return "No open project found. Please open a Premiere project first.";
        }

        var sequence = app.project.activeSequence;
        if (!sequence) {
            return "No active sequence found. Please open a timeline sequence first.";
        }

        var sequenceName = sequence.name ? sequence.name : "Unknown";
        var videoTrackCount = sequence.videoTracks ? sequence.videoTracks.numTracks : 0;
        var audioTrackCount = sequence.audioTracks ? sequence.audioTracks.numTracks : 0;

        var timebase = "Not available";
        try {
            if (sequence.timebase !== undefined && sequence.timebase !== null) {
                timebase = sequence.timebase;
            }
        } catch (e1) {}

        var report = "Sequence Analysis Report\n";
        report += "------------------------\n";
        report += "Project open: Yes\n";
        report += "Active sequence: " + sequenceName + "\n";
        report += "Video tracks: " + videoTrackCount + "\n";
        report += "Audio tracks: " + audioTrackCount + "\n";
        report += "Timebase: " + timebase;

        return report;
    } catch (err) {
        return "Sequence analysis error: " + err;
    }
}

/* ============================================================
   TICK CONVERSION HELPERS
   ============================================================ */
function safeTicks(value) {
    try {
        if (value === undefined || value === null) return "N/A";
        if (value.ticks !== undefined && value.ticks !== null) return String(value.ticks);
        if (typeof value === "string" || typeof value === "number") return String(value);
        if (value.toString) return String(value.toString());
        return "N/A";
    } catch (err) {
        return "N/A";
    }
}

function ticksToSeconds(ticks) {
    try {
        if (ticks === undefined || ticks === null || ticks === "N/A") return "N/A";
        var numericTicks = Number(ticks);
        if (!isFinite(numericTicks)) return "N/A";
        var TICKS_PER_SECOND = 254016000000;
        return (numericTicks / TICKS_PER_SECOND).toFixed(2);
    } catch (err) {
        return "N/A";
    }
}

/* ============================================================
   TIMELINE CLIP SCAN
   ============================================================ */
function scanTrackClips(trackCollection, label) {
    var report = "";
    if (!trackCollection) {
        report += label + " tracks: 0\n";
        return report;
    }

    var trackCount = trackCollection.numTracks ? trackCollection.numTracks : 0;
    report += label + " tracks: " + trackCount + "\n";

    for (var t = 0; t < trackCount; t++) {
        var track = trackCollection[t];
        var clips = track && track.clips ? track.clips : null;
        var clipCount = clips && clips.numItems ? clips.numItems : 0;
        report += "  Track " + (t + 1) + " clips: " + clipCount + "\n";

        for (var c = 0; c < clipCount; c++) {
            var clip = clips[c];
            var clipName = clip && clip.name ? clip.name : "Unknown Clip";
            var startSec = ticksToSeconds(safeTicks(clip ? clip.start : null));
            var endSec = ticksToSeconds(safeTicks(clip ? clip.end : null));
            var durSec = ticksToSeconds(safeTicks(clip ? clip.duration : null));

            report += "    " + clipName + " [" + startSec + "s - " + endSec + "s, dur=" + durSec + "s]\n";
        }
    }
    return report;
}

function scanTimelineClips() {
    try {
        if (typeof app === "undefined") return "Premiere app object not found.";
        if (!app.project) return "No open project found.";

        var sequence = app.project.activeSequence;
        if (!sequence) return "No active sequence found.";

        var report = "Timeline Clip Scan\n";
        report += "Sequence: " + (sequence.name || "Unknown") + "\n\n";
        report += scanTrackClips(sequence.videoTracks, "Video");
        report += "\n" + scanTrackClips(sequence.audioTracks, "Audio");
        return report;
    } catch (err) {
        return "Timeline scan error: " + err;
    }
}

/* ============================================================
   MARKER MANAGEMENT
   ============================================================ */
function cutThatMarkerExists(seq, markerName, markerSeconds, toleranceSeconds) {
    try {
        if (!seq || !seq.markers || !seq.markers.getFirstMarker || !seq.markers.getNextMarker) {
            return false;
        }
        var marker = seq.markers.getFirstMarker();
        while (marker) {
            try {
                var existingName = marker.name ? String(marker.name) : "";
                var startObj = marker.start ? marker.start : null;
                var ticks = startObj && startObj.ticks !== undefined ? Number(startObj.ticks) : NaN;
                var markerAt = isFinite(ticks) ? (ticks / 254016000000) : NaN;
                if (existingName === markerName && isFinite(markerAt) && Math.abs(markerAt - markerSeconds) <= toleranceSeconds) {
                    return true;
                }
            } catch (readErr) {}
            marker = seq.markers.getNextMarker(marker);
        }
    } catch (err) {}
    return false;
}

function parseJsonSafe(jsonString) {
    try {
        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(jsonString);
        }
    } catch (e1) {}
    try {
        return eval("(" + jsonString + ")");
    } catch (e2) {
        throw e2;
    }
}

function addSilenceMarkersToTimeline(encodedJsonString) {
    try {
        if (!app || !app.project) {
            return "Error: No active Premiere project found.";
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return "Error: No active sequence found.";
        }

        var decodedString = decodeURIComponent(encodedJsonString);
        var ranges;

        try {
            ranges = parseJsonSafe(decodedString);
        } catch (parseErr) {
            return "Failed to parse ranges JSON.\n" + parseErr.toString();
        }

        if (!ranges || ranges.length === 0) {
            return "Error: No ranges found.";
        }

        if (!seq.markers || !seq.markers.createMarker) {
            return "Error: Sequence markers API not available.";
        }

        var addedCount = 0;
        var existingCount = 0;
        var safeIdx = 0;
        var reviewIdx = 0;
        var tolerance = 0.02;

        for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i] || {};
            var startSeconds = Number(range.start);
            var endSeconds = Number(range.end);
            var category = range.category ? String(range.category) : "SAFE_CUT";

            if (isNaN(startSeconds) || isNaN(endSeconds) || endSeconds <= startSeconds) {
                continue;
            }

            var labelBase = "";
            if (category === "SAFE_CUT") {
                safeIdx++;
                labelBase = "CutThatPro SAFE " + (safeIdx < 10 ? "0" + safeIdx : safeIdx);
            } else {
                reviewIdx++;
                labelBase = "CutThatPro REVIEW " + (reviewIdx < 10 ? "0" + reviewIdx : reviewIdx);
            }

            try {
                var startName = labelBase + " START";
                var endName = labelBase + " END";

                if (!cutThatMarkerExists(seq, startName, startSeconds, tolerance)) {
                    var mStart = seq.markers.createMarker(Number(startSeconds));
                    if (mStart) {
                        mStart.name = startName;
                        mStart.comments = "Cut range: " + startSeconds.toFixed(2) + "s - " + endSeconds.toFixed(2) + "s";
                        addedCount++;
                    }
                } else {
                    existingCount++;
                }

                if (!cutThatMarkerExists(seq, endName, endSeconds, tolerance)) {
                    var mEnd = seq.markers.createMarker(Number(endSeconds));
                    if (mEnd) {
                        mEnd.name = endName;
                        mEnd.comments = "Cut end: " + endSeconds.toFixed(2) + "s";
                        addedCount++;
                    }
                } else {
                    existingCount++;
                }
            } catch (markerErr) {}
        }

        return "Markers added: " + addedCount + " | Already existed: " + existingCount + "\nTotal ranges: " + ranges.length;
    } catch (err) {
        return "Error adding markers: " + err.toString();
    }
}

/* ============================================================
   CLEAR CUTTHAT MARKERS
   ============================================================ */
function clearCutThatMarkers() {
    try {
        if (!app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project" });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence" });
        }

        if (!seq.markers || !seq.markers.getMarkers) {
            return JSON.stringify({ success: false, error: "Markers API not available" });
        }

        var markers = seq.markers.getMarkers();
        var removedCount = 0;

        for (var i = markers.numMarkers - 1; i >= 0; i--) {
            try {
                var marker = markers[i];
                var name = marker && marker.name ? String(marker.name) : "";
                if (name.indexOf("CutThatPro") === 0 || name.indexOf("CutThat") === 0) {
                    seq.markers.deleteMarker(marker);
                    removedCount++;
                }
            } catch (delErr) {}
        }

        return JSON.stringify({ success: true, removed: removedCount });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   RAZOR CUTS (QE ENGINE)
   ============================================================ */
function addRazorCutsToTimeline(encodedJsonString) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project" });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence" });
        }

        var decodedString = decodeURIComponent(encodedJsonString);
        var ranges;
        try {
            ranges = parseJsonSafe(decodedString);
        } catch (parseErr) {
            return JSON.stringify({ success: false, error: "JSON parse failed: " + parseErr.toString() });
        }

        if (!ranges || ranges.length === 0) {
            return JSON.stringify({ success: false, error: "No ranges provided" });
        }

        // Enable QE engine
        try {
            app.enableQE();
        } catch (qeErr) {
            return JSON.stringify({ success: false, error: "QE engine not available: " + qeErr.toString() });
        }

        if (typeof qe === "undefined" || !qe || !qe.project) {
            return JSON.stringify({ success: false, error: "QE project not available" });
        }

        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) {
            return JSON.stringify({ success: false, error: "QE active sequence not found" });
        }

        var cutsAdded = 0;
        var cutsFailed = 0;
        var TICKS_PER_SECOND = 254016000000;

        // Sort ranges by start time (descending) to avoid offset issues
        var sortedRanges = ranges.slice().sort(function (a, b) {
            return Number(b.start) - Number(a.start);
        });

        for (var i = 0; i < sortedRanges.length; i++) {
            var range = sortedRanges[i];
            var startSec = Number(range.start);
            var endSec = Number(range.end);

            if (!isFinite(startSec) || !isFinite(endSec) || endSec <= startSec) {
                continue;
            }

            var startTicks = String(Math.round(startSec * TICKS_PER_SECOND));
            var endTicks = String(Math.round(endSec * TICKS_PER_SECOND));

            try {
                // Use razorInOut to cut at start and end of range
                if (qeSeq.razorInOut && typeof qeSeq.razorInOut === "function") {
                    qeSeq.razorInOut(startTicks, endTicks);
                    cutsAdded++;
                } else if (qeSeq.razor && typeof qeSeq.razor === "function") {
                    // Fallback: razor at each point
                    qeSeq.razor(startTicks);
                    qeSeq.razor(endTicks);
                    cutsAdded++;
                } else {
                    cutsFailed++;
                }
            } catch (cutErr) {
                cutsFailed++;
            }
        }

        return JSON.stringify({
            success: true,
            cutsAdded: cutsAdded,
            cutsFailed: cutsFailed,
            totalRanges: ranges.length
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   ACTUAL TIMELINE CONTENT DURATION
   ============================================================ */
function getActualTimelineContentDurationSeconds() {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project" });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence" });
        }

        var sequenceName = seq.name ? String(seq.name) : "Unknown";
        var maxEndTicks = 0;

        // Scan video tracks
        try {
            if (seq.videoTracks) {
                for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
                    var vTrack = seq.videoTracks[vt];
                    if (vTrack && vTrack.clips) {
                        for (var vc = 0; vc < vTrack.clips.numItems; vc++) {
                            var vClip = vTrack.clips[vc];
                            if (vClip && vClip.end && vClip.end.ticks) {
                                var vt2 = Number(vClip.end.ticks);
                                if (isFinite(vt2) && vt2 > maxEndTicks) maxEndTicks = vt2;
                            }
                        }
                    }
                }
            }
        } catch (veErr) {}

        // Scan audio tracks
        try {
            if (seq.audioTracks) {
                for (var at = 0; at < seq.audioTracks.numTracks; at++) {
                    var aTrack = seq.audioTracks[at];
                    if (aTrack && aTrack.clips) {
                        for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
                            var aClip = aTrack.clips[ac];
                            if (aClip && aClip.end && aClip.end.ticks) {
                                var at2 = Number(aClip.end.ticks);
                                if (isFinite(at2) && at2 > maxEndTicks) maxEndTicks = at2;
                            }
                        }
                    }
                }
            }
        } catch (aeErr) {}

        var durationSeconds = maxEndTicks / 254016000000;

        return JSON.stringify({
            success: true,
            sequenceName: sequenceName,
            durationSeconds: Number(durationSeconds.toFixed(3)),
            maxEndTicks: String(maxEndTicks)
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   ZOOM KEYFRAMES
   ============================================================ */
function applyZoomKeyframes(encodedJsonString) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project" });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence" });
        }

        var decodedString = decodeURIComponent(encodedJsonString);
        var data;
        try {
            data = parseJsonSafe(decodedString);
        } catch (parseErr) {
            return JSON.stringify({ success: false, error: "JSON parse failed" });
        }

        var moments = data.moments || [];
        var settings = data.settings || {};
        var scale = Number(settings.scale) || 120;
        var duration = Number(settings.duration) || 1.5;

        if (moments.length === 0) {
            return JSON.stringify({ success: false, error: "No zoom moments provided" });
        }

        // Get first video clip for scale property access
        var keyframesAdded = 0;

        try {
            if (seq.videoTracks && seq.videoTracks.numTracks > 0) {
                var vTrack = seq.videoTracks[0];
                if (vTrack && vTrack.clips && vTrack.clips.numItems > 0) {
                    var vClip = vTrack.clips[0];

                    // Try to access motion effect properties
                    var components = vClip.components;
                    if (components) {
                        for (var ci = 0; ci < components.numItems; ci++) {
                            var comp = components[ci];
                            if (comp && comp.displayName && comp.displayName === "Motion") {
                                var props = comp.properties;
                                if (props) {
                                    for (var pi = 0; pi < props.numItems; pi++) {
                                        var prop = props[pi];
                                        if (prop && prop.displayName === "Scale") {
                                            // Add keyframes at each zoom moment
                                            for (var mi = 0; mi < moments.length; mi++) {
                                                var moment = moments[mi];
                                                var timeSec = Number(moment.time);
                                                if (!isFinite(timeSec)) continue;

                                                try {
                                                    // Set keyframe at zoom-in point
                                                    prop.setValueAtKey(timeSec, scale);
                                                    keyframesAdded++;

                                                    // Set keyframe at zoom-out point (return to 100)
                                                    var outTime = timeSec + duration;
                                                    prop.setValueAtKey(outTime, 100);
                                                    keyframesAdded++;
                                                } catch (kfErr) {}
                                            }
                                            break;
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
        } catch (zoomErr) {
            return JSON.stringify({ success: false, error: "Zoom error: " + zoomErr.toString() });
        }

        return JSON.stringify({
            success: true,
            keyframesAdded: keyframesAdded,
            momentsProcessed: moments.length
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   CAPTION TRACK
   ============================================================ */
function addCaptionTrackToTimeline(encodedJsonString) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project" });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence" });
        }

        var decodedString = decodeURIComponent(encodedJsonString);
        var segments;
        try {
            segments = parseJsonSafe(decodedString);
        } catch (parseErr) {
            return JSON.stringify({ success: false, error: "JSON parse failed" });
        }

        if (!segments || segments.length === 0) {
            return JSON.stringify({ success: false, error: "No segments provided" });
        }

        // Add markers as caption placeholders (Premiere caption API varies by version)
        var addedCount = 0;

        if (seq.markers && seq.markers.createMarker) {
            for (var i = 0; i < segments.length; i++) {
                var seg = segments[i];
                var startSec = Number(seg.start);
                var endSec = Number(seg.end);
                var text = seg.text ? String(seg.text).trim() : "";

                if (!isFinite(startSec) || !text) continue;

                try {
                    var marker = seq.markers.createMarker(startSec);
                    if (marker) {
                        marker.name = "Caption " + (i + 1);
                        marker.comments = text;
                        addedCount++;
                    }
                } catch (markerErr) {}
            }
        }

        return JSON.stringify({
            success: true,
            captionsAdded: addedCount,
            totalSegments: segments.length,
            note: addedCount > 0 ? "Captions added as markers" : "Could not add captions"
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   B-ROLL INSERT
   ============================================================ */
function insertBrollClips(encodedJsonString) {
    try {
        if (typeof app === "undefined" || !app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project" });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence" });
        }

        var decodedString = decodeURIComponent(encodedJsonString);
        var filePaths;
        try {
            filePaths = parseJsonSafe(decodedString);
        } catch (parseErr) {
            return JSON.stringify({ success: false, error: "JSON parse failed" });
        }

        if (!filePaths || filePaths.length === 0) {
            return JSON.stringify({ success: false, error: "No file paths provided" });
        }

        var insertedCount = 0;

        for (var i = 0; i < filePaths.length; i++) {
            var filePath = filePaths[i];
            var file = new File(filePath);

            if (!file.exists) continue;

            try {
                // Import file into project
                app.project.importFiles([filePath], true, app.project.rootItem, false);
                insertedCount++;
            } catch (importErr) {}
        }

        return JSON.stringify({
            success: true,
            inserted: insertedCount,
            total: filePaths.length
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   XML TEMPLATE EXPORT
   ============================================================ */
function exportActiveSequenceXmlTemplate() {
    try {
        if (!app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project found." });
        }

        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, error: "No active sequence found." });
        }

        var tempFolder = new Folder(Folder.myDocuments.fsName + "/CutThatPro/temp");
        if (!tempFolder.exists) {
            tempFolder.create();
        }
        var templatePath = tempFolder.fsName + "/template.xml";

        try {
            if (seq.exportAsFinalCutProXML && typeof seq.exportAsFinalCutProXML === "function") {
                seq.exportAsFinalCutProXML(templatePath, 1);
            } else {
                return JSON.stringify({
                    success: false,
                    error: "exportAsFinalCutProXML API not available",
                    templateXmlPath: templatePath
                });
            }
        } catch (exportErr) {
            return JSON.stringify({
                success: false,
                error: exportErr.toString(),
                templateXmlPath: templatePath
            });
        }

        var xmlFile = new File(templatePath);
        if (!xmlFile.exists) {
            return JSON.stringify({ success: false, error: "Template XML was not created" });
        }

        return JSON.stringify({
            success: true,
            templateXmlPath: templatePath,
            sequenceName: seq.name ? String(seq.name) : "",
            fileSize: xmlFile.length
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}

/* ============================================================
   XML IMPORT
   ============================================================ */
function importSequenceXML(xmlPath) {
    var safePath = xmlPath ? String(xmlPath) : "";

    function getAllSequenceNames() {
        var names = [];
        try {
            if (!app || !app.project || !app.project.sequences) return names;
            var seqs = app.project.sequences;
            var count = seqs.numSequences ? seqs.numSequences : 0;
            for (var i = 0; i < count; i++) {
                try {
                    var s = seqs[i];
                    if (s && s.name) names[names.length] = String(s.name);
                } catch (e1) {}
            }
        } catch (e2) {}
        return names;
    }

    function findInArray(arr, value) {
        if (!arr || !arr.length) return false;
        for (var i = 0; i < arr.length; i++) {
            if (String(arr[i]) === String(value)) return true;
        }
        return false;
    }

    function extractExpectedSequenceName(fileObj) {
        try {
            if (!fileObj || !fileObj.exists) return "";
            if (!fileObj.open("r")) return "";
            var content = fileObj.read();
            fileObj.close();
            var m = content.match(/<sequence[^>]*>[\s\S]*?<name>([^<]+)<\/name>/i);
            if (m && m[1]) return String(m[1]);
        } catch (e4) {}
        return "";
    }

    try {
        if (!app || !app.project) {
            return JSON.stringify({ success: false, error: "No active Premiere project found." });
        }
        if (!safePath) {
            return JSON.stringify({ success: false, error: "Missing xmlPath." });
        }

        var xmlFile = new File(safePath);
        if (!xmlFile.exists) {
            return JSON.stringify({ success: false, error: "XML file does not exist." });
        }

        var expectedSequenceName = extractExpectedSequenceName(xmlFile);
        var seqs = app.project.sequences;
        var beforeCount = seqs && seqs.numSequences ? seqs.numSequences : 0;
        var beforeNames = getAllSequenceNames();
        var imported = false;

        // Try importSequences
        try {
            if (app.project.importSequences && typeof app.project.importSequences === "function") {
                app.project.importSequences(safePath);
                imported = true;
            }
        } catch (e1) {}

        // Try importFiles fallback
        if (!imported) {
            try {
                if (app.project.importFiles && typeof app.project.importFiles === "function") {
                    app.project.importFiles([safePath], true, app.project.rootItem, false);
                    imported = true;
                }
            } catch (e2) {}
        }

        if (!imported) {
            return JSON.stringify({ success: false, error: "No supported XML import API available." });
        }

        seqs = app.project.sequences;
        var afterCount = seqs && seqs.numSequences ? seqs.numSequences : beforeCount;
        var afterNames = getAllSequenceNames();
        var sequenceName = "";

        if (afterCount > beforeCount) {
            try {
                var newSeq = seqs[afterCount - 1];
                if (newSeq && newSeq.name) sequenceName = String(newSeq.name);
            } catch (e3) {}
        }

        var sequenceFound = false;
        if (expectedSequenceName) {
            var existedBefore = findInArray(beforeNames, expectedSequenceName);
            var existsAfter = findInArray(afterNames, expectedSequenceName);
            sequenceFound = existsAfter && (!existedBefore || afterCount > beforeCount);
            if (sequenceFound) sequenceName = expectedSequenceName;
        } else {
            sequenceFound = afterCount > beforeCount;
        }

        if (!sequenceFound) {
            return JSON.stringify({
                success: false,
                error: "XML import returned but no valid sequence was created.",
                beforeCount: beforeCount,
                afterCount: afterCount
            });
        }

        return JSON.stringify({
            success: true,
            sequenceName: sequenceName,
            beforeCount: beforeCount,
            afterCount: afterCount
        });
    } catch (err) {
        return JSON.stringify({ success: false, error: err.toString() });
    }
}
