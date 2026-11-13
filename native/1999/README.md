# 1999 VST3

One native instrument target: `1999.vst3`. It runs without a SALARYMAN account.

The Linux VST3 provides an eight-lane 16-step sequencer, MIDI note input,
four master-FX presets, editable effect controls, host state recall, and import
and export of the browser's `schemaVersion: 1` project JSON. Imported browser
fields the plugin does not implement are preserved through round-trips. The
audio engines include original synth profiles and GPLv3 Gearmulator
Machinedrum/Monomachine emulation. Firmware/ROM files remain user-supplied;
none are included in this repository or plugin bundle.

## Build

```sh
bash native/1999/build-linux.sh
```

JUCE 8.0.17-security is fetched from its upstream repository at configure time.
The Gearmulator source is pinned as a Git submodule and its required source
submodules are initialized by the build script. The script builds one
`1999.vst3` bundle, includes the Gearmulator GPLv3 license, and runs the native
smoke test. Set
`BUILD_DIR` or `BUILD_JOBS` to override the output directory or parallelism.
Build output stays in the ignored `generated-artifacts/` directory.

Machinedrum and Monomachine require matching firmware images from hardware the
user owns. Do not download or redistribute firmware/ROM files. Gearmulator is
GPLv3; see the license notice inside the VST3 bundle and the upstream source
repository for complete corresponding source and notices. The plugin remembers
only each selected firmware file's local path in the user's application-data
folder. It does not copy firmware, or put firmware paths in projects, presets,
or host-shared state; if a file moves, the plugin asks the user to select it
again.

Browser projects can include private sample-library IDs, sampler pad settings,
and recorded take IDs. Their metadata is retained, but the plugin does not fetch
Vault audio or load the browser's sample pads and recorded takes. Recording and
mixdown use the external VST3 host. The included native smoke test checks MIDI
audio output, project metadata and velocity round-trips, rejected-import
atomicity, recording-lane preservation, and host-state restoration.
