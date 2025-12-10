# Production Task (Browser)

Offline-capable picture naming task. Open `index.html` in a modern browser. Images load from `images/{word}.jpg`. Each of the 24 words appears once in an ID-seeded order.

## How to run
- Open `index.html` (Chrome/Firefox). Enter participant ID, click “プリロード開始” to build the schedule and preload images; allow microphone access.
- Press the space bar to start. Cursor hides; keypresses do not advance trials (timing is fixed). Reload/back shows a warning to prevent interruption.
- At the end, a ZIP auto-downloads with the CSV and all WAV recordings.

## Trial structure and timing
- 24 trials (one per word). Fixed timeline: show image → record 6 s → ITI 1.5 s with fixation. 5 s rest before the first trial and after the last.
- Order: participant-ID–seeded shuffle that alternates between List1 and List2.

## Output (per run, ZIP)
- `results_{participantId}.csv` columns:  
  - `trial, word, word_id, list, image_file`  
  - `trial_start_epoch_ms`  
  - `image_onset_ms, image_onset_epoch_ms` (ms from trial start + wall-clock)  
  - `recording_start_ms, recording_end_ms` (ms from trial start)  
  - `recording_start_epoch_ms, recording_end_epoch_ms`  
  - `iti_ms, participant_id, recording_file`
- WAV per trial: `{participantId}_{word}.wav` (accent-stripped). Each recording is mic-only (no playback mixed).

## Latency analysis
- Use `analyze_latency.py` in this folder:  
  ```bash
  /usr/bin/python3 Experiment/production_task/analyze_latency.py \
    --root ./Experiment/production_task/output_dir
  ```
  Expects `results_*.csv` and WAVs in `root`. Outputs `latency_summary.csv` and QC plots in `root/qc_plots`.
- Key options: `--threshold-db` (default -40), `--guard-ms` (default 50), `--frame-ms`, `--min-frames`.

## Requirements
- Browser with Web Audio + getUserMedia (Chrome/Firefox).  
- Mic permission granted; speakers not required (no playback).  
