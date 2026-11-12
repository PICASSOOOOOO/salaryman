#include "PluginProcessor.h"
#include <cmath>
#include <iostream>

namespace {
bool require(bool condition, const char* message) {
  if (!condition)
    std::cerr << message << '\n';
  return condition;
}
}

int main() {
  Salaryman1999AudioProcessor processor;
  processor.prepareToPlay(44100.0, 512);

  juce::AudioBuffer<float> audio(2, 512);
  juce::MidiBuffer midi;
  midi.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(110)), 0);
  processor.processBlock(audio, midi);
  double energy = 0.0;
  for (int channel = 0; channel < audio.getNumChannels(); ++channel)
    for (int sample = 0; sample < audio.getNumSamples(); ++sample)
      energy += std::abs(audio.getSample(channel, sample));
  if (!require(energy > 0.1, "MIDI input did not produce audio"))
    return 1;

  const juce::String imported = R"json({
    "schemaVersion": 1,
    "name": "Round-trip session",
    "bpm": 107,
    "key": "F#",
    "timeSignature": "6/8",
    "tracks": [{
      "id": "trk-browser",
      "name": "Sampler",
      "kind": "instrument",
      "machineId": "mpc_sample",
      "steps": [87,0,0,0,64,0,0,0,87,0,0,0,64,0,0,0],
      "audioTrackId": null,
      "muted": false,
      "volume": 72,
      "samplerMetadata": { "sampleLibraryId": "sample-user-upload" }
    }, {
      "id": "trk-recording",
      "name": "Recorded take",
      "kind": "recording",
      "machineId": "korg_m1",
      "steps": [93,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      "audioTrackId": 44,
      "loopBars": 2,
      "overdubTrackIds": [41, 42],
      "muted": false,
      "volume": 72,
      "soundState": { "tone": 68, "decayMs": 260 }
    }],
    "browserExtension": { "kept": true }
  })json";
  if (!require(processor.importProjectJson(imported), "Valid browser project was rejected"))
    return 1;

  const auto exported = processor.exportProjectJson();
  const auto exportedValue = juce::JSON::parse(exported);
  auto* exportedRoot = exportedValue.getDynamicObject();
  if (!require(exportedRoot != nullptr, "Export is not a JSON object"))
    return 1;
  if (!require(static_cast<int>(exportedRoot->getProperty("bpm")) == 107,
      "Tempo did not survive project import/export"))
    return 1;
  if (!require(exportedRoot->getProperty("key").toString() == "F#"
      && exportedRoot->getProperty("timeSignature").toString() == "6/8",
      "Key or time signature was not preserved"))
    return 1;
  if (!require(exportedRoot->getProperty("browserExtension").getDynamicObject() != nullptr,
      "Unknown browser project metadata was discarded"))
    return 1;
  const auto exportedTracks = exportedRoot->getProperty("tracks");
  const auto* rows = exportedTracks.getArray();
  auto* firstTrack = rows == nullptr || rows->isEmpty() ? nullptr : rows->getReference(0).getDynamicObject();
  if (!require(firstTrack != nullptr
      && firstTrack->getProperty("samplerMetadata").getDynamicObject() != nullptr,
      "Track metadata was discarded"))
    return 1;
  const auto steps = firstTrack->getProperty("steps");
  if (!require(steps.isArray() && static_cast<int>(steps.getArray()->getReference(0)) == 87,
      "Imported step velocity was not preserved"))
    return 1;
  auto* recordingTrack = rows == nullptr || rows->size() < 2
    ? nullptr
    : rows->getReference(1).getDynamicObject();
  if (!require(recordingTrack != nullptr
      && recordingTrack->getProperty("kind").toString() == "recording"
      && recordingTrack->getProperty("machineId").toString() == "korg_m1"
      && static_cast<int>(recordingTrack->getProperty("audioTrackId")) == 44
      && static_cast<int>(recordingTrack->getProperty("loopBars")) == 2,
      "Recording-track metadata was changed"))
    return 1;
  processor.setStep(1, 0, false);
  const auto afterEditValue = juce::JSON::parse(processor.exportProjectJson());
  auto* afterEditRoot = afterEditValue.getDynamicObject();
  const auto afterEditTracks = afterEditRoot == nullptr
    ? juce::var()
    : afterEditRoot->getProperty("tracks");
  const auto* afterEditRows = afterEditTracks.getArray();
  auto* afterEditRecording = afterEditRows == nullptr || afterEditRows->size() < 2
    ? nullptr
    : afterEditRows->getReference(1).getDynamicObject();
  const auto recordingSteps = afterEditRecording == nullptr
    ? juce::var()
    : afterEditRecording->getProperty("steps");
  if (!require(recordingSteps.isArray()
      && static_cast<int>(recordingSteps.getArray()->getReference(0)) == 93,
      "Recording lane was editable as an instrument track"))
    return 1;

  const juce::String malformed = R"json({
    "schemaVersion": 1,
    "name": "Invalid session",
    "bpm": 120,
    "tracks": [
      { "machineId": "op1", "steps": [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
      { "machineId": "fm1", "steps": [1] }
    ]
  })json";
  if (!require(!processor.importProjectJson(malformed), "Malformed project was accepted"))
    return 1;
  if (!require(static_cast<int>(juce::JSON::parse(processor.exportProjectJson())
      .getDynamicObject()->getProperty("bpm")) == 107,
      "Rejected import partially changed the current session"))
    return 1;

  juce::MemoryBlock state;
  processor.getStateInformation(state);
  Salaryman1999AudioProcessor restored;
  restored.setStateInformation(state.getData(), static_cast<int>(state.getSize()));
  if (!require(static_cast<int>(juce::JSON::parse(restored.exportProjectJson())
      .getDynamicObject()->getProperty("bpm")) == 107,
      "Host state did not restore the session"))
    return 1;

  return 0;
}
