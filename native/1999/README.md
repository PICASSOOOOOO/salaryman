# 1999 VST3

One native instrument target: `1999.vst3`. It runs without a SALARYMAN account.

The first native build provides an eight-lane 16-step sequencer, MIDI note input,
four master-FX presets, editable effect controls, host state recall, and import
and export of the browser's `schemaVersion: 1` project JSON. The audio engines
are original synth profiles. They do not include manufacturer firmware, ROMs,
factory samples, or the FM-1 / SMK-37 emulator binaries.

## Build

```sh
cmake -S native/1999 -B generated-artifacts/1999-vst3-build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build generated-artifacts/1999-vst3-build --target SALARYMAN1999_VST3
```

JUCE 8.0.17-security is fetched from its upstream repository at configure time.
The resulting VST3 bundle is written under `generated-artifacts/1999-vst3-build`.

Browser projects can include private sample-library IDs and recorded take IDs.
Those audio files are not embedded in project JSON, so this native build imports
the arrangement, machine IDs, step patterns, tempo, and master-FX settings but
does not fetch SALARYMAN Vault audio. Record and mixdown are handled by the
VST3 host.
