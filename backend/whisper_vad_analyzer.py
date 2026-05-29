#!/usr/bin/env python3
"""CutThat Pro — Whisper VAD Analyzer
Combines Whisper transcription with VAD-based silence detection"""
import sys
import json
import os
import subprocess
import argparse
import tempfile

FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg"

def extract_audio_from_video(video_path, output_path=None):
    """Extract audio from video file using FFmpeg"""
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav")
    
    cmd = [
        FFMPEG_PATH, "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        output_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            return None, f"FFmpeg error: {result.stderr[:500]}"
        return output_path, None
    except Exception as e:
        return None, str(e)

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
                        "duration": round(duration, 3)
                    })
                    pending_start = None
                except:
                    pass
        
        return silences, None
    except Exception as e:
        return [], str(e)

def transcribe_with_whisper(audio_path, model_size="base", language=None):
    """Transcribe audio using faster-whisper"""
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_size, device="auto", compute_type="auto")
        segments, info = model.transcribe(audio_path, language=language, vad_filter=True)
        
        result_segments = []
        for seg in segments:
            result_segments.append({
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "no_speech_prob": round(seg.no_speech_prob, 4)
            })
        
        return result_segments, info.language, info.duration, None
    except ImportError:
        return [], None, 0, "faster-whisper not installed"
    except Exception as e:
        return [], None, 0, str(e)

def find_silence_from_transcript(segments, min_pause=0.9, padding_before=0.25, padding_after=0.25, max_cut_duration=3.0):
    """Find silence gaps from transcript segments"""
    gaps = []
    
    for i in range(len(segments) - 1):
        gap_start = segments[i]["end"]
        gap_end = segments[i + 1]["start"]
        gap_duration = gap_end - gap_start
        
        if gap_duration >= min_pause:
            # Apply padding
            cut_start = max(0, gap_start + padding_before)
            cut_end = gap_end - padding_after
            cut_duration = cut_end - cut_start
            
            if cut_duration > 0 and cut_duration <= max_cut_duration:
                gaps.append({
                    "start": round(cut_start, 3),
                    "end": round(cut_end, 3),
                    "duration": round(cut_duration, 3),
                    "category": "SAFE_CUT" if cut_duration < 2.0 else "REVIEW_CUT"
                })
    
    return gaps

def main():
    parser = argparse.ArgumentParser(description="Whisper VAD Analyzer")
    parser.add_argument("--filePath", required=True, help="Path to audio/video file")
    parser.add_argument("--modelSize", default="base", help="Whisper model size")
    parser.add_argument("--language", default=None, help="Language code")
    parser.add_argument("--minPauseDuration", type=float, default=0.9, help="Min pause duration")
    parser.add_argument("--paddingBefore", type=float, default=0.25, help="Padding before cut")
    parser.add_argument("--paddingAfter", type=float, default=0.25, help="Padding after cut")
    parser.add_argument("--maxCutDuration", type=float, default=3.0, help="Max cut duration")
    parser.add_argument("--noiseThreshold", default="-35dB", help="FFmpeg noise threshold")
    parser.add_argument("--minSilenceDuration", type=float, default=0.5, help="Min silence duration")
    parser.add_argument("--removePauses", type=str, default="true", help="Remove pauses")
    parser.add_argument("--removeRepeatedWords", type=str, default="true", help="Remove repeated words")
    parser.add_argument("--removeRepeatedPhrases", type=str, default="true", help="Remove repeated phrases")
    parser.add_argument("--removeFillers", type=str, default="false", help="Remove fillers")
    parser.add_argument("--minEffectiveCutDuration", type=float, default=0.35, help="Min effective cut duration")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.filePath):
        print(json.dumps({"error": f"File not found: {args.filePath}"}))
        sys.exit(1)
    
    # Normalize language: "auto" or "null" means let Whisper auto-detect
    lang = args.language
    if lang and lang.lower() in ("auto", "null", "none", ""):
        lang = None
    
    # Check if it's a video or audio file
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.mxf', '.m4v', '.webm', '.flv'}
    _, ext = os.path.splitext(args.filePath.lower())
    
    audio_path = args.filePath
    temp_audio = None
    
    # If video, extract audio first
    if ext in video_exts:
        audio_path, error = extract_audio_from_video(args.filePath)
        if error:
            print(json.dumps({"error": f"Audio extraction failed: {error}"}))
            sys.exit(1)
        temp_audio = audio_path
    
    try:
        # Step 1: FFmpeg silence detection
        silences, sil_error = detect_silence_ffmpeg(audio_path, args.noiseThreshold, args.minSilenceDuration)
        
        # Step 2: Whisper transcription
        segments, detected_lang, duration, whisper_error = transcribe_with_whisper(audio_path, args.modelSize, lang)
        
        # Step 3: Find gaps from transcript
        transcript_gaps = []
        if segments:
            transcript_gaps = find_silence_from_transcript(
                segments, 
                args.minPauseDuration, 
                args.paddingBefore, 
                args.paddingAfter, 
                args.maxCutDuration
            )
        
        # Combine results
        all_cuts = []
        
        # Add FFmpeg-detected silences
        for s in silences:
            all_cuts.append({
                "start": s["start"],
                "end": s["end"],
                "duration": s["duration"],
                "category": "SAFE_CUT",
                "source": "ffmpeg"
            })
        
        # Add transcript-based gaps
        for g in transcript_gaps:
            # Avoid duplicates
            is_dup = False
            for existing in all_cuts:
                if abs(existing["start"] - g["start"]) < 0.5 and abs(existing["end"] - g["end"]) < 0.5:
                    is_dup = True
                    break
            if not is_dup:
                all_cuts.append({
                    "start": g["start"],
                    "end": g["end"],
                    "duration": g["duration"],
                    "category": g["category"],
                    "source": "whisper"
                })
        
        # Sort by start time
        all_cuts.sort(key=lambda x: x["start"])
        
        result = {
            "success": True,
            "cutCandidates": all_cuts,
            "segments": segments if segments else [],
            "totalSilences": len(silences),
            "totalTranscriptGaps": len(transcript_gaps),
            "totalCuts": len(all_cuts),
            "duration": duration,
            "totalCutDuration": round(sum(c["duration"] for c in all_cuts), 3),
            "reductionPercent": round(sum(c["duration"] for c in all_cuts) / max(duration, 1) * 100, 1) if duration else 0,
            "language": detected_lang,
            "whisperError": whisper_error,
            "silenceError": sil_error
        }
        
        print(json.dumps(result))
        
    finally:
        # Clean up temp audio file
        if temp_audio and os.path.exists(temp_audio):
            try:
                os.remove(temp_audio)
            except:
                pass

if __name__ == "__main__":
    main()
