#!/usr/bin/env python3
"""CutThat Pro — VAD Analyzer
Silence detection using FFmpeg + optional Whisper transcription"""
import sys
import json
import os
import subprocess
import argparse
import tempfile

FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg"

def detect_silence_ffmpeg(audio_path, noise_threshold="-35dB", min_duration=0.5):
    """Detect silence using FFmpeg silencedetect filter"""
    cmd = [
        FFMPEG_PATH, "-i", audio_path,
        "-af", f"silencedetect=noise={noise_threshold}:d={min_duration}",
        "-f", "null", "-"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        silences = []
        pending_start = None
        for line in result.stderr.split('\n'):
            if 'silence_start:' in line:
                try:
                    pending_start = float(line.split('silence_start:')[1].strip())
                except:
                    pass
            elif 'silence_end:' in line and pending_start is not None:
                try:
                    parts = line.split('silence_end:')[1].strip()
                    end = float(parts.split('|')[0].strip())
                    duration = end - pending_start
                    silences.append({
                        "start": round(pending_start, 3),
                        "end": round(end, 3),
                        "duration": round(duration, 3),
                        "category": "SAFE_CUT" if duration < 2.0 else "REVIEW_CUT"
                    })
                    pending_start = None
                except:
                    pass
        return silences, None
    except Exception as e:
        return [], str(e)

def main():
    parser = argparse.ArgumentParser(description="VAD Analyzer")
    parser.add_argument("--filePath", required=True, help="Path to audio/video file")
    parser.add_argument("--minPauseDuration", type=float, default=0.9)
    parser.add_argument("--paddingBefore", type=float, default=0.25)
    parser.add_argument("--paddingAfter", type=float, default=0.25)
    parser.add_argument("--maxCutDuration", type=float, default=3.0)
    parser.add_argument("--allowLongCuts", type=str, default="false")
    parser.add_argument("--noiseThreshold", default="-35dB")
    parser.add_argument("--minSilenceDuration", type=float, default=0.5)
    
    args = parser.parse_args()
    
    if not os.path.exists(args.filePath):
        print(json.dumps({"error": f"File not found: {args.filePath}"}))
        sys.exit(1)
    
    # Detect silence
    silences, error = detect_silence_ffmpeg(args.filePath, args.noiseThreshold, args.minSilenceDuration)
    
    if error:
        print(json.dumps({"error": f"FFmpeg error: {error}"}))
        sys.exit(1)
    
    # Apply padding and filtering
    cut_candidates = []
    for s in silences:
        cut_start = max(0, s["start"] + args.paddingBefore)
        cut_end = s["end"] - args.paddingAfter
        cut_duration = cut_end - cut_start
        
        if cut_duration > 0 and cut_duration <= args.maxCutDuration:
            cut_candidates.append({
                "start": round(cut_start, 3),
                "end": round(cut_end, 3),
                "duration": round(cut_duration, 3),
                "category": "SAFE_CUT" if cut_duration < 2.0 else "REVIEW_CUT",
                "source": "ffmpeg"
            })
    
    result = {
        "success": True,
        "cutCandidates": cut_candidates,
        "totalSilences": len(silences),
        "totalCuts": len(cut_candidates),
        "totalCutDuration": round(sum(c["duration"] for c in cut_candidates), 3),
        "silenceError": None
    }
    
    print(json.dumps(result))

if __name__ == "__main__":
    main()
