# 1999 VST3

One native instrument target: `1999.vst3`. It runs without a SALARYMAN account.

The Linux VST3 provides an eight-lane 16-step sequencer, MIDI note input,
four master-FX presets, editable effect controls, host state recall, and import
and export of the browser's `schemaVersion: 1` project JSON. Imported browser
fields the plugin does not implement are preserved through round-trips. The
audio engines are original synth profiles; no manufacturer firmware, ROMs,
factory samples, or FM-1 / SMK-37 emulator binaries are included.

## Build

```sh
bash native/1999/build-linux.sh
```

JUCE 8.0.17-security is fetched from its upstream repository at configure time.
The script builds one `1999.vst3` bundle and runs the native smoke test. Set
`BUILD_DIR` or `BUILD_JOBS` to override the output directory or parallelism.
Build output stays in the ignored `generated-artifacts/` directory.

Browser projects can include private sample-library IDs, sampler pad settings,
and recorded take IDs. Their metadata is retained, but the plugin does not fetch
Vault audio or load the browser's sample pads and recorded takes. Recording and
mixdown use the external VST3 host. The included native smoke test checks MIDI
audio output, project metadata and velocity round-trips, rejected-import
atomicity, recording-lane preservation, and host-state restoration.
