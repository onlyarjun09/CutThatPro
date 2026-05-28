/**
 * CutThat Pro — Backend Server
 * Node.js Express server with FFmpeg + Whisper integration
 */
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const app = express();
const PORT = 3456;
const HOST = "127.0.0.1";
const FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg";

const TEMP_DIR = path.join(os.homedir(), "Documents", "CutThatPro", "temp");

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/* ============================================================
   HELPERS
   ============================================================ */
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function secondsToFrames(seconds, fps) {
  return Math.max(0, Math.round(toNumber(seconds, 0) * toNumber(fps, 25)));
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizePathForPathUrl(absPath) {
  var normalized = String(absPath || "").replace(/\\/g, "/");
  var withSlash = normalized.charAt(0) === "/" ? normalized : "/" + normalized;
  var parts = withSlash.split("/");
  var encodedParts = [];
  for (var i = 0; i < parts.length; i += 1) {
    if (i === 0) {
      encodedParts.push("");
    } else {
      encodedParts.push(encodeURIComponent(parts[i]));
    }
  }
  return encodedParts.join("/").replace(/&/g, "%26");
}

function filePathToPremierePathUrl(absPath) {
  return "file://" + sanitizePathForPathUrl(absPath);
}

/* ============================================================
   FFmpeg SILENCE DETECT
   ============================================================ */
function parseSilenceOutput(stderrText) {
  const lines = stderrText.split(/\r?\n/);
  const silences = [];
  let pendingStart = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      pendingStart = Number(startMatch[1]);
    }

    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (endMatch) {
      const end = Number(endMatch[1]);
      const duration = Number(endMatch[2]);

      if (!Number.isNaN(end) && !Number.isNaN(duration)) {
        silences.push({
          start: pendingStart !== null ? pendingStart : Number((end - duration).toFixed(2)),
          end,
          duration
        });
        pendingStart = null;
      }
    }
  }

  return silences;
}

function runSilenceDetect(filePath, noiseThreshold, minSilenceDuration) {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-hide_banner",
      "-i", filePath,
      "-af", `silencedetect=noise=${noiseThreshold}:d=${minSilenceDuration}`,
      "-f", "null",
      "-"
    ];

    const ffmpegProcess = spawn(FFMPEG_PATH, ffmpegArgs);
    let stderrData = "";
    let spawnError = null;

    ffmpegProcess.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    ffmpegProcess.on("error", (error) => {
      spawnError = error;
    });

    ffmpegProcess.on("close", () => {
      if (spawnError) {
        reject(new Error(String(spawnError.message || spawnError)));
        return;
      }
      try {
        const silences = parseSilenceOutput(stderrData);
        resolve(silences);
      } catch (err) {
        reject(new Error("parse failure"));
      }
    });
  });
}

/* ============================================================
   PYTHON ANALYZER RUNNER
   ============================================================ */
function runPythonAnalyzer(scriptName, payload) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    const pythonCmd = "python3";
    const args = [scriptPath];

    // Build args from payload
    Object.keys(payload).forEach((key) => {
      const value = payload[key];
      if (typeof value === "boolean") {
        args.push("--" + key, value ? "true" : "false");
      } else if (value !== undefined && value !== null && value !== "") {
        args.push("--" + key, String(value));
      }
    });

    const proc = spawn(pythonCmd, args);
    let stdoutData = "";
    let stderrData = "";
    let spawnErr = null;

    proc.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    proc.on("error", (err) => {
      spawnErr = err;
    });

    proc.on("close", (code) => {
      if (spawnErr) {
        reject(new Error(String(spawnErr.message || spawnErr)));
        return;
      }

      if (code !== 0 && !stdoutData.trim()) {
        reject(new Error(stderrData || scriptName + " failed with code " + code));
        return;
      }

      try {
        resolve(JSON.parse(stdoutData.trim()));
      } catch (err) {
        reject(new Error(scriptName + " parse failure: " + String(err.message || err)));
      }
    });
  });
}

/* ============================================================
   XML GENERATION — KEEP RANGES
   ============================================================ */
function buildKeepRanges(cutPlan, sourceClip) {
  const sourceStart = toNumber(sourceClip.sourceIn, 0);
  const sourceEnd = sourceClip.sourceOut !== undefined && sourceClip.sourceOut !== null
    ? toNumber(sourceClip.sourceOut, sourceStart)
    : toNumber(sourceClip.duration, sourceStart);

  if (!(sourceEnd > sourceStart)) {
    return { keepRanges: [], sourceStart, sourceEnd };
  }

  const autoCuts = Array.isArray(cutPlan && cutPlan.autoApplyCuts) ? cutPlan.autoApplyCuts : [];
  const validCuts = [];

  for (let i = 0; i < autoCuts.length; i += 1) {
    const c = autoCuts[i] || {};
    const s = toNumber(c.start, NaN);
    const e = toNumber(c.end, NaN);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    const cs = Math.max(s, sourceStart);
    const ce = Math.min(e, sourceEnd);
    if (ce > cs) validCuts.push({ start: cs, end: ce });
  }
  validCuts.sort((a, b) => a.start - b.start);

  const keepRanges = [];
  let cursor = sourceStart;
  for (let i = 0; i < validCuts.length; i += 1) {
    if (validCuts[i].start > cursor + 0.000001) {
      keepRanges.push({ sourceIn: cursor, sourceOut: validCuts[i].start });
    }
    if (validCuts[i].end > cursor) cursor = validCuts[i].end;
  }
  if (cursor < sourceEnd - 0.000001) keepRanges.push({ sourceIn: cursor, sourceOut: sourceEnd });

  const out = [];
  for (let i = 0; i < keepRanges.length; i += 1) {
    const kr = keepRanges[i];
    const dur = kr.sourceOut - kr.sourceIn;
    if (!(dur > 0.05)) continue;
    out.push({ sourceIn: kr.sourceIn, sourceOut: kr.sourceOut, duration: dur });
  }
  return { keepRanges: out, sourceStart, sourceEnd };
}

/* ============================================================
   XML GENERATION — FCP7 XML
   ============================================================ */
function buildFcp7FileNode(indent, fileId, fileName, pathUrl, fps, durationFrames, width, height, sampleRate) {
  return indent + '<file id="' + fileId + '">\n' +
    indent + '  <name>' + fileName + '</name>\n' +
    indent + '  <pathurl>' + pathUrl + '</pathurl>\n' +
    indent + '  <rate><timebase>' + fps + '</timebase><ntsc>FALSE</ntsc></rate>\n' +
    indent + '  <duration>' + durationFrames + '</duration>\n' +
    indent + '  <media>\n' +
    indent + '    <video>\n' +
    indent + '      <samplecharacteristics>\n' +
    indent + '        <rate><timebase>' + fps + '</timebase><ntsc>FALSE</ntsc></rate>\n' +
    indent + '        <width>' + width + '</width>\n' +
    indent + '        <height>' + height + '</height>\n' +
    indent + '        <anamorphic>FALSE</anamorphic>\n' +
    indent + '        <pixelaspectratio>square</pixelaspectratio>\n' +
    indent + '        <fielddominance>none</fielddominance>\n' +
    indent + '      </samplecharacteristics>\n' +
    indent + '    </video>\n' +
    indent + '    <audio>\n' +
    indent + '      <samplecharacteristics>\n' +
    indent + '        <depth>16</depth>\n' +
    indent + '        <samplerate>' + sampleRate + '</samplerate>\n' +
    indent + '      </samplecharacteristics>\n' +
    indent + '      <channelcount>2</channelcount>\n' +
    indent + '    </audio>\n' +
    indent + '  </media>\n' +
    indent + '</file>\n';
}

function generatePremiereXml(payload) {
  const cutPlan = payload && payload.cutPlan ? payload.cutPlan : null;
  const sourceClip = payload && payload.sourceClip
    ? payload.sourceClip
    : (payload && payload.sourceClips && payload.sourceClips[0]
      ? payload.sourceClips[0]
      : (cutPlan && cutPlan.sourceClip ? cutPlan.sourceClip : null));
  const sequenceInfo = payload && payload.sequenceInfo ? payload.sequenceInfo : {};

  if (!cutPlan) throw { stage: "VALIDATE_INPUT", message: "Missing cutPlan" };
  if (!Array.isArray(cutPlan.autoApplyCuts)) throw { stage: "VALIDATE_INPUT", message: "cutPlan.autoApplyCuts must be an array" };
  if (!sourceClip) throw { stage: "VALIDATE_INPUT", message: "Missing source clip data" };

  const filePath = sourceClip.filePath || sourceClip.mediaPath || sourceClip.sourceMediaPath || sourceClip.path;
  if (!filePath) throw { stage: "VALIDATE_INPUT", message: "Missing source media filePath" };
  if (!path.isAbsolute(filePath)) throw { stage: "VALIDATE_INPUT", message: "filePath must be absolute" };
  if (!fs.existsSync(filePath)) throw { stage: "SOURCE_FILE_NOT_FOUND", message: "Source file does not exist", filePath };

  const fps = Math.max(1, Math.round(toNumber(sequenceInfo.fps, 25)));
  const width = Math.max(16, Math.round(toNumber(sequenceInfo.width, 1920)));
  const height = Math.max(16, Math.round(toNumber(sequenceInfo.height, 1080)));
  const sampleRate = Math.round(toNumber(sequenceInfo.sampleRate, 48000));
  const originalSequenceName = String(sequenceInfo.sequenceName || cutPlan.sequenceName || "Sequence");
  const cleanSequenceName = originalSequenceName + " - CutThatPro Clean";

  const keepData = buildKeepRanges(cutPlan, sourceClip);
  const keepRanges = keepData.keepRanges;
  if (!keepRanges.length) throw { stage: "VALIDATE_KEEP_RANGES", message: "No keep ranges generated" };

  let expectedDuration = 0;
  for (let i = 0; i < keepRanges.length; i += 1) {
    const r = keepRanges[i];
    if (!(r.sourceOut > r.sourceIn) || !(r.duration > 0)) {
      throw { stage: "VALIDATE_KEEP_RANGES", rangeIndex: i, message: "Invalid keep range" };
    }
    expectedDuration += r.duration;
  }

  const sequenceDurationFrames = secondsToFrames(expectedDuration, fps);
  const sourceDuration = sourceClip.sourceOut !== undefined && sourceClip.sourceOut !== null
    ? toNumber(sourceClip.sourceOut, 0) - toNumber(sourceClip.sourceIn, 0)
    : toNumber(sourceClip.duration, expectedDuration);
  const sourceDurationFrames = Math.max(sequenceDurationFrames, secondsToFrames(sourceDuration, fps));
  const pathUrl = filePathToPremierePathUrl(filePath);
  const fileName = xmlEscape(path.basename(filePath));
  const escapedSequenceName = xmlEscape(cleanSequenceName);

  let timelineCursorSec = 0;
  const videoItems = [];
  const audioItems = [];

  for (let i = 0; i < keepRanges.length; i += 1) {
    const r = keepRanges[i];
    const startF = secondsToFrames(timelineCursorSec, fps);
    const endF = secondsToFrames(timelineCursorSec + r.duration, fps);
    const inF = secondsToFrames(r.sourceIn, fps);
    const outF = secondsToFrames(r.sourceOut, fps);
    const clipDurationFrames = Math.max(1, endF - startF);
    const clipId = i + 1;

    const videoFileNode = clipId === 1
      ? buildFcp7FileNode('            ', 'file-1', fileName, pathUrl, fps, sourceDurationFrames, width, height, sampleRate)
      : '            <file id="file-1"/>\n';
    const audioFileNode = clipId === 1
      ? buildFcp7FileNode('            ', 'file-1', fileName, pathUrl, fps, sourceDurationFrames, width, height, sampleRate)
      : '            <file id="file-1"/>\n';

    videoItems.push(
      '          <clipitem id="clipitem-v-' + clipId + '">\n' +
      '            <name>' + fileName + '</name>\n' +
      '            <enabled>TRUE</enabled>\n' +
      '            <duration>' + clipDurationFrames + '</duration>\n' +
      '            <start>' + startF + '</start>\n' +
      '            <end>' + endF + '</end>\n' +
      '            <in>' + inF + '</in>\n' +
      '            <out>' + outF + '</out>\n' +
      videoFileNode +
      '          </clipitem>'
    );

    audioItems.push(
      '          <clipitem id="clipitem-a-' + clipId + '">\n' +
      '            <name>' + fileName + '</name>\n' +
      '            <enabled>TRUE</enabled>\n' +
      '            <duration>' + clipDurationFrames + '</duration>\n' +
      '            <start>' + startF + '</start>\n' +
      '            <end>' + endF + '</end>\n' +
      '            <in>' + inF + '</in>\n' +
      '            <out>' + outF + '</out>\n' +
      audioFileNode +
      '            <sourcetrack>\n' +
      '              <mediatype>audio</mediatype>\n' +
      '              <trackindex>1</trackindex>\n' +
      '            </sourcetrack>\n' +
      '          </clipitem>'
    );
    timelineCursorSec += r.duration;
  }

  const xml =
'<?xml version="1.0" encoding="UTF-8"?>\n' +
'<!DOCTYPE xmeml>\n' +
'<xmeml version="4">\n' +
'  <sequence id="sequence-1">\n' +
'    <name>' + escapedSequenceName + '</name>\n' +
'    <duration>' + sequenceDurationFrames + '</duration>\n' +
'    <rate>\n' +
'      <timebase>' + fps + '</timebase>\n' +
'      <ntsc>FALSE</ntsc>\n' +
'    </rate>\n' +
'    <media>\n' +
'      <video>\n' +
'        <format>\n' +
'          <samplecharacteristics>\n' +
'            <rate><timebase>' + fps + '</timebase><ntsc>FALSE</ntsc></rate>\n' +
'            <width>' + width + '</width>\n' +
'            <height>' + height + '</height>\n' +
'            <anamorphic>FALSE</anamorphic>\n' +
'            <pixelaspectratio>square</pixelaspectratio>\n' +
'            <fielddominance>none</fielddominance>\n' +
'          </samplecharacteristics>\n' +
'        </format>\n' +
'        <track>\n' +
videoItems.join('\n') + '\n' +
'        </track>\n' +
'      </video>\n' +
'      <audio>\n' +
'        <format>\n' +
'          <samplecharacteristics>\n' +
'            <depth>16</depth>\n' +
'            <samplerate>' + sampleRate + '</samplerate>\n' +
'          </samplecharacteristics>\n' +
'        </format>\n' +
'        <track>\n' +
audioItems.join('\n') + '\n' +
'        </track>\n' +
'      </audio>\n' +
'    </media>\n' +
'  </sequence>\n' +
'</xmeml>\n';

  const outPath = path.join(TEMP_DIR, 'cutthatpro_clean_' + Date.now() + '.xml');
  fs.writeFileSync(outPath, xml, "utf8");

  let estimatedRemoved = 0;
  for (let i = 0; i < cutPlan.autoApplyCuts.length; i += 1) {
    const d = toNumber(cutPlan.autoApplyCuts[i] && cutPlan.autoApplyCuts[i].duration, NaN);
    if (Number.isFinite(d) && d > 0) estimatedRemoved += d;
  }

  return {
    success: true,
    xmlPath: outPath,
    sequenceName: cleanSequenceName,
    expectedDuration: Number(expectedDuration.toFixed(3)),
    keptSegments: keepRanges.length,
    removedSegments: cutPlan.autoApplyCuts.length,
    estimatedRemoved: Number(estimatedRemoved.toFixed(3)),
    sourceFileExists: fs.existsSync(filePath),
    sourceFilePath: filePath,
    pathurl: pathUrl,
    fileSize: fs.statSync(filePath).size,
    xmlFileSize: fs.statSync(outPath).size,
    xmlPreview: xml.substring(0, 300)
  };
}

/* ============================================================
   SRT EXPORT
   ============================================================ */
function segmentsToSrt(segments) {
  let srt = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = formatSrtTime(seg.start);
    const end = formatSrtTime(seg.end);
    const text = (seg.text || "").trim();
    srt += (i + 1) + "\n";
    srt += start + " --> " + end + "\n";
    srt += text + "\n\n";
  }
  return srt;
}

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return pad2(h) + ":" + pad2(m) + ":" + pad2(s) + "," + pad3(ms);
}

function pad2(n) { return n < 10 ? "0" + n : String(n); }
function pad3(n) { return n < 10 ? "00" + n : (n < 100 ? "0" + n : String(n)); }

/* ============================================================
   KEYWORD EXTRACTION (simple TF-IDF fallback)
   ============================================================ */
function extractKeywordsSimple(text, maxKeywords) {
  // Simple stopword removal + frequency-based extraction
  const stopwords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "because", "but", "and", "or", "if", "while", "about", "up", "down",
    "that", "this", "these", "those", "what", "which", "who", "whom",
    "it", "its", "i", "me", "my", "we", "our", "you", "your", "he",
    "him", "his", "she", "her", "they", "them", "their", "think", "like",
    "know", "want", "look", "use", "find", "give", "tell", "say", "get",
    "make", "go", "see", "come", "take", "thing", "really", "right",
    "yeah", "okay", "well", "also", "much", "going", "thing", "things"
  ]);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));

  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  return sorted.slice(0, maxKeywords || 5);
}

/* ============================================================
   ROUTES
   ============================================================ */

// Health check
app.get("/health", (req, res) => {
  return res.json({ ok: true, service: "CutThatPro backend", version: "1.0.0" });
});

// File existence check
app.get("/file-exists", (req, res) => {
  try {
    const filePath = decodeURIComponent(req.query.path || "");
    if (!filePath) return res.status(400).json({ exists: false, error: "Missing path" });
    return res.json({ exists: fs.existsSync(filePath), path: filePath });
  } catch (error) {
    return res.status(500).json({ exists: false, error: error.message });
  }
});

// FFmpeg silence detection
app.post("/analyze-silence", async (req, res) => {
  try {
    const filePath = req.body && req.body.filePath ? String(req.body.filePath) : "";
    const noiseThreshold = req.body && req.body.noiseThreshold ? String(req.body.noiseThreshold) : "-35dB";
    const minSilenceDuration = req.body && req.body.minSilenceDuration !== undefined ? Number(req.body.minSilenceDuration) : 0.5;

    if (!filePath) return res.status(400).json({ success: false, error: "missing filePath" });
    if (!fs.existsSync(filePath)) return res.status(400).json({ success: false, error: "file does not exist" });

    const silences = await runSilenceDetect(filePath, noiseThreshold, minSilenceDuration);

    return res.json({
      success: true,
      silences,
      totalSilences: silences.length,
      totalDuration: silences.reduce((sum, s) => sum + s.duration, 0)
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Silero VAD analysis
app.post("/analyze-vad", async (req, res) => {
  try {
    const payload = {
      filePath: req.body.filePath || "",
      minPauseDuration: req.body.minPauseDuration || 0.9,
      paddingBefore: req.body.paddingBefore || 0.25,
      paddingAfter: req.body.paddingAfter || 0.25,
      maxCutDuration: req.body.maxCutDuration || 3.0,
      allowLongCuts: req.body.allowLongCuts || false
    };

    if (!payload.filePath) return res.status(400).json({ success: false, error: "missing filePath" });
    if (!fs.existsSync(payload.filePath)) return res.status(400).json({ success: false, error: "file does not exist" });

    const result = await runPythonAnalyzer("vad_analyzer.py", payload);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Whisper VAD analysis
app.post("/analyze-whisper-vad", async (req, res) => {
  try {
    const payload = {
      filePath: req.body.filePath || "",
      language: req.body.language || "en",
      removePauses: req.body.removePauses !== false,
      removeRepeatedWords: req.body.removeRepeatedWords !== false,
      removeRepeatedPhrases: req.body.removeRepeatedPhrases !== false,
      removeFillers: req.body.removeFillers || false,
      minPauseDuration: req.body.minPauseDuration || 0.9,
      paddingBefore: req.body.paddingBefore || 0.25,
      paddingAfter: req.body.paddingAfter || 0.25,
      maxCutDuration: req.body.maxCutDuration || 3.0,
      minEffectiveCutDuration: req.body.minEffectiveCutDuration || 0.35
    };

    if (!payload.filePath) return res.status(400).json({ success: false, error: "missing filePath" });
    if (!fs.existsSync(payload.filePath)) return res.status(400).json({ success: false, error: "file does not exist" });

    const result = await runPythonAnalyzer("whisper_vad_analyzer.py", payload);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Transcription
app.post("/transcribe", async (req, res) => {
  try {
    const payload = {
      filePath: req.body.filePath || "",
      language: req.body.language || "en",
      model: req.body.model || "small"
    };

    if (!payload.filePath) return res.status(400).json({ success: false, error: "missing filePath" });
    if (!fs.existsSync(payload.filePath)) return res.status(400).json({ success: false, error: "file does not exist" });

    const result = await runPythonAnalyzer("vad_analyzer.py", {
      ...payload,
      mode: "transcribe"
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Export SRT
app.post("/export-srt", (req, res) => {
  try {
    const segments = req.body.segments || [];
    if (segments.length === 0) return res.status(400).json({ success: false, error: "No segments provided" });

    const srt = segmentsToSrt(segments);
    const outputPath = req.body.outputPath || path.join(TEMP_DIR, "cutthatpro_captions_" + Date.now() + ".srt");

    fs.writeFileSync(outputPath, srt, "utf8");

    return res.json({
      success: true,
      outputPath,
      segments: segments.length,
      fileSize: fs.statSync(outputPath).size
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Extract keywords
app.post("/extract-keywords", (req, res) => {
  try {
    const text = req.body.text || "";
    const maxKeywords = req.body.maxKeywords || 5;

    if (!text.trim()) return res.status(400).json({ success: false, error: "No text provided" });

    const keywords = extractKeywordsSimple(text, maxKeywords);

    return res.json({
      success: true,
      keywords,
      method: "frequency-based"
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Search B-Roll (Pexels API)
app.post("/search-broll", async (req, res) => {
  try {
    const keywords = req.body.keywords || [];
    const apiKey = req.body.apiKey || "";
    const orientation = req.body.orientation || "landscape";
    const maxResults = req.body.maxResults || 8;

    if (!apiKey) return res.status(400).json({ success: false, error: "Pexels API key required" });
    if (keywords.length === 0) return res.status(400).json({ success: false, error: "No keywords provided" });

    const query = keywords.join(",");
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${maxResults}&orientation=${orientation}`;

    const fetch = (await import("node-fetch")).default;
    const response = await fetch(url, {
      headers: { Authorization: apiKey }
    });

    if (!response.ok) {
      throw new Error("Pexels API error: HTTP " + response.status);
    }

    const data = await response.json();
    const videos = (data.videos || []).map((v) => ({
      id: v.id,
      description: v.url || "",
      thumbnail: v.image || "",
      url: v.video_files && v.video_files.length > 0 ? v.video_files[0].link : "",
      duration: v.duration || 0,
      width: v.width || 0,
      height: v.height || 0
    }));

    return res.json({
      success: true,
      videos,
      totalResults: videos.length,
      query
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Download B-Roll videos
app.post("/download-broll", async (req, res) => {
  try {
    const videos = req.body.videos || [];
    if (videos.length === 0) return res.status(400).json({ success: false, error: "No videos provided" });

    const fetch = (await import("node-fetch")).default;
    const filePaths = [];

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const videoUrl = video.url;
      if (!videoUrl) continue;

      try {
        const response = await fetch(videoUrl);
        if (!response.ok) continue;

        const buffer = await response.arrayBuffer();
        const ext = ".mp4";
        const outPath = path.join(TEMP_DIR, "broll_" + Date.now() + "_" + i + ext);
        fs.writeFileSync(outPath, Buffer.from(buffer));
        filePaths.push(outPath);
      } catch (dlErr) {
        // Skip failed downloads
      }
    }

    return res.json({
      success: filePaths.length > 0,
      filePaths,
      downloaded: filePaths.length,
      total: videos.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Generate clean XML
app.post("/generate-xml", (req, res) => {
  try {
    const result = generatePremiereXml(req.body);
    return res.json(result);
  } catch (error) {
    const errObj = typeof error === "object" ? error : { message: String(error) };
    return res.status(500).json({
      success: false,
      error: errObj.message || "XML generation failed",
      stage: errObj.stage || "UNKNOWN"
    });
  }
});

/* ============================================================
   START SERVER
   ============================================================ */
app.listen(PORT, HOST, () => {
  console.log(`CutThatPro backend running at http://${HOST}:${PORT}`);
  console.log(`Temp directory: ${TEMP_DIR}`);
  console.log(`FFmpeg path: ${FFMPEG_PATH}`);
});
