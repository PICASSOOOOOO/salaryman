#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <mdLib/mddevice.h>
#include <mdLib/mdromloader.h>
#include <mdLib/mdtypes.h>
#include <synthLib/plugin.h>
#include <algorithm>
#include <cstdint>
#include <utility>

namespace {
const juce::StringArray machineChoices {
  "OP-1", "SP-404MKII", "MPC", "MS-2000R", "M1", "CE-2", "FM-1", "SMK-37",
  "Minimoog", "Machinedrum", "Monomachine"
};

juce::String machineIdFromChoice(int choice) {
  const auto index = juce::jlimit(0, 10, choice);
  return Salaryman1999AudioProcessor::machineIds[static_cast<size_t>(index)];
}

int choiceFromMachineId(const juce::String& machineId) {
  for (int i = 0; i < static_cast<int>(Salaryman1999AudioProcessor::machineIds.size()); ++i)
    if (machineId == Salaryman1999AudioProcessor::machineIds[static_cast<size_t>(i)])
      return i;
  return 0;
}

bool isGearmulatorMachine(int machineIndex) {
  return machineIndex == 9 || machineIndex == 10;
}

int gearmulatorIndexForMachine(int machineIndex) {
  return machineIndex == 9 ? 0 : machineIndex == 10 ? 1 : -1;
}

float readParam(juce::AudioProcessorValueTreeState& state, const char* id, float fallback = 0.0f) {
  if (auto* value = state.getRawParameterValue(id))
    return value->load();
  return fallback;
}
}

struct Salaryman1999AudioProcessor::GearmulatorEngine {
  std::unique_ptr<md::Device> device;
  std::unique_ptr<synthLib::Plugin> runtime;
  juce::AudioBuffer<float> output;
  juce::String firmwarePath;
};

Salaryman1999AudioProcessor::Salaryman1999AudioProcessor()
  : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
    parameters(*this, nullptr, "1999_PARAMETERS", createParameterLayout()) {
  for (int track = 0; track < trackCount; ++track) {
    for (int step = 0; step < stepCount; ++step)
      steps_[static_cast<size_t>(track)][static_cast<size_t>(step)].store(0);
    machines_[static_cast<size_t>(track)].store(
      machineIndexFor(defaultMachines[static_cast<size_t>(track)]));
  }
  gearNoteOffAtSample_.fill(0);
  gearNoteOffModel_.fill(-1);
  gearNoteOffNumber_.fill(-1);
  applyPreset(0);
}

Salaryman1999AudioProcessor::~Salaryman1999AudioProcessor() = default;

juce::AudioProcessorValueTreeState::ParameterLayout Salaryman1999AudioProcessor::createParameterLayout() {
  using Float = juce::AudioParameterFloat;
  using Bool = juce::AudioParameterBool;
  juce::AudioProcessorValueTreeState::ParameterLayout layout;
  layout.add(std::make_unique<Float>("bpm", "BPM", juce::NormalisableRange<float>(40.0f, 240.0f, 1.0f), 92.0f));
  layout.add(std::make_unique<Float>("input", "Input", juce::NormalisableRange<float>(0.0f, 150.0f, 1.0f), 100.0f));
  layout.add(std::make_unique<Float>("output", "Output", juce::NormalisableRange<float>(0.0f, 150.0f, 1.0f), 100.0f));
  layout.add(std::make_unique<Float>("mix", "Mix", juce::NormalisableRange<float>(0.0f, 100.0f, 1.0f), 100.0f));
  layout.add(std::make_unique<Float>("filter", "Filter", juce::NormalisableRange<float>(0.0f, 100.0f, 1.0f), 50.0f));
  layout.add(std::make_unique<Float>("bits", "Bits", juce::NormalisableRange<float>(4.0f, 16.0f, 4.0f), 16.0f));
  layout.add(std::make_unique<Float>("rate", "Rate", juce::NormalisableRange<float>(4000.0f, 48000.0f, 1000.0f), 48000.0f));
  layout.add(std::make_unique<Float>("drive", "Drive", juce::NormalisableRange<float>(0.0f, 100.0f, 1.0f), 0.0f));
  layout.add(std::make_unique<Float>("alias", "Alias", juce::NormalisableRange<float>(0.0f, 100.0f, 1.0f), 50.0f));
  layout.add(std::make_unique<Float>("noise", "Noise", juce::NormalisableRange<float>(0.0f, 100.0f, 1.0f), 0.0f));
  layout.add(std::make_unique<Float>("drunk", "Drunk", juce::NormalisableRange<float>(0.0f, 100.0f, 1.0f), 0.0f));
  layout.add(std::make_unique<Float>("character", "Character", juce::NormalisableRange<float>(0.0f, 100.0f, 1.0f), 0.0f));
  layout.add(std::make_unique<Bool>("bassBoost", "Bass Boost", false));
  layout.add(std::make_unique<Float>("bassFrequency", "Bass Frequency", juce::NormalisableRange<float>(20.0f, 500.0f, 1.0f), 120.0f));
  layout.add(std::make_unique<Bool>("mono", "Mono", false));
  layout.add(std::make_unique<Bool>("fxEnabled", "Master FX", false));
  for (int i = 0; i < trackCount; ++i)
    layout.add(std::make_unique<juce::AudioParameterChoice>(
      "machine" + juce::String(i + 1), "Machine " + juce::String(i + 1), machineChoices,
      choiceFromMachineId(defaultMachines[static_cast<size_t>(i)])));
  return layout;
}

void Salaryman1999AudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
  sampleRate_ = juce::jmax(8000.0, sampleRate);
  maxBlockSize_ = juce::jmax(1, samplesPerBlock);
  std::lock_guard<std::mutex> lock(gearmulatorMutex_);
  for (auto& engine : gearmulatorEngines_) {
    if (!engine || !engine->runtime) continue;
    engine->output.setSize(6, maxBlockSize_, false, false, true);
    engine->runtime->setHostSamplerate(static_cast<float>(sampleRate_), static_cast<float>(md::g_samplerate));
    engine->runtime->setBlockSize(static_cast<uint32_t>(maxBlockSize_));
  }
  resetDsp();
}

void Salaryman1999AudioProcessor::releaseResources() {
  resetDsp();
}

bool Salaryman1999AudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
  const auto output = layouts.getMainOutputChannelSet();
  return output == juce::AudioChannelSet::mono() || output == juce::AudioChannelSet::stereo();
}

void Salaryman1999AudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
  juce::ScopedNoDenormals noDenormals;
  const auto sampleCount = buffer.getNumSamples();
  if (sampleCount <= 0) {
    buffer.clear();
    return;
  }
  const auto blockStart = processSampleCounter_;
  const auto blockEnd = blockStart + static_cast<std::uint64_t>(sampleCount);
  const auto bpm = juce::jlimit(40.0, 240.0, static_cast<double>(readParam(parameters, "bpm", 92.0f)));
  const auto samplesPerStep = sampleRate_ * 60.0 / bpm / 4.0;
  std::lock_guard<std::mutex> engineLock(gearmulatorMutex_);

  std::array<bool, 2> gearmulatorUsed {};
  for (int track = 0; track < trackCount; ++track) {
    const auto machineIndex = machineIndexFor(machineForTrack(track));
    const auto gearIndex = gearmulatorIndexForMachine(machineIndex);
    if (gearIndex >= 0)
      gearmulatorUsed[static_cast<size_t>(gearIndex)] = true;
  }

  for (int track = 0; track < trackCount; ++track) {
    const auto due = gearNoteOffAtSample_[static_cast<size_t>(track)];
    if (due == 0 || due > blockEnd)
      continue;
    const auto modelIndex = gearNoteOffModel_[static_cast<size_t>(track)];
    if (modelIndex >= 0 && modelIndex < static_cast<int>(gearmulatorEngines_.size())) {
      auto& engine = gearmulatorEngines_[static_cast<size_t>(modelIndex)];
      if (engine && engine->runtime) {
        const auto offset = static_cast<uint32_t>(std::max<std::int64_t>(
          0, std::min<std::int64_t>(sampleCount - 1, due - static_cast<std::int64_t>(blockStart))));
        engine->runtime->addMidiEvent(synthLib::SMidiEvent(
          synthLib::MidiEventSource::Internal,
          static_cast<uint8_t>(synthLib::M_NOTEOFF),
          static_cast<uint8_t>(gearNoteOffNumber_[static_cast<size_t>(track)]),
          0,
          offset));
      }
    }
    gearNoteOffAtSample_[static_cast<size_t>(track)] = 0;
    gearNoteOffModel_[static_cast<size_t>(track)] = -1;
    gearNoteOffNumber_[static_cast<size_t>(track)] = -1;
  }

  for (const auto metadata : midi) {
    const auto message = metadata.getMessage();
    const auto firstTrackIsGearmulator =
      isGearmulatorMachine(machineIndexFor(machineForTrack(1)));
    if (message.isNoteOn() && trackKinds_[0].load() == 0 && !firstTrackIsGearmulator)
      triggerVoice(1, message.getVelocity(), message.getNoteNumber());
    const auto* rawData = message.getRawData();
    if (rawData == nullptr || message.getRawDataSize() <= 0)
      continue;
    for (size_t modelIndex = 0; modelIndex < gearmulatorUsed.size(); ++modelIndex) {
      auto& engine = gearmulatorEngines_[modelIndex];
      if (!gearmulatorUsed[modelIndex] || !engine || !engine->runtime)
        continue;
      synthLib::SMidiEvent event;
      if (event.assignRawData(rawData, static_cast<size_t>(message.getRawDataSize()),
            synthLib::MidiEventSource::Host,
            static_cast<uint32_t>(juce::jlimit(0, sampleCount - 1, metadata.samplePosition))))
        engine->runtime->addMidiEvent(event);
    }
  }

  buffer.clear();
  const auto fxEnabled = readParam(parameters, "fxEnabled") > 0.5f;
  const auto inputGain = readParam(parameters, "input", 100.0f) / 100.0;
  const auto outputGain = readParam(parameters, "output", 100.0f) / 100.0;
  const auto wet = readParam(parameters, "mix", 100.0f) / 100.0;
  const auto filterAmount = readParam(parameters, "filter", 50.0f) / 100.0;
  const auto drive = readParam(parameters, "drive") / 100.0;
  const auto bitDepth = static_cast<int>(readParam(parameters, "bits", 16.0f));
  const auto rate = juce::jlimit(4000.0, 48000.0, static_cast<double>(readParam(parameters, "rate", 48000.0f)));
  const auto alias = readParam(parameters, "alias", 50.0f) / 100.0;
  const auto noise = readParam(parameters, "noise") / 100.0;
  const auto drunk = readParam(parameters, "drunk") / 100.0;
  const auto character = readParam(parameters, "character") / 100.0;
  const auto bassEnabled = readParam(parameters, "bassBoost") > 0.5f;
  const auto bassFrequency = readParam(parameters, "bassFrequency", 120.0f);
  const auto mono = readParam(parameters, "mono") > 0.5f;
  const auto lowpassHz = 450.0 + std::pow(filterAmount, 2.2) * 19'000.0;
  const auto lowpassCoeff = 1.0 - std::exp(-2.0 * juce::MathConstants<double>::pi * lowpassHz / sampleRate_);
  const auto bassCoeff = 1.0 - std::exp(-2.0 * juce::MathConstants<double>::pi * bassFrequency / sampleRate_);
  const auto holdEvery = juce::jmax(1.0, sampleRate_ / rate);
  const auto quantization = std::pow(2.0, juce::jlimit(4, 16, bitDepth) - 1);

  for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
    if (sequencerPlaying_.load()) {
      samplesUntilStep_ -= 1.0;
      if (samplesUntilStep_ <= 0.0) {
        const auto step = currentStep_.load();
        for (int track = 0; track < trackCount; ++track) {
          if (trackKinds_[static_cast<size_t>(track)].load() != 0)
            continue;
          const auto velocity = steps_[static_cast<size_t>(track)][static_cast<size_t>(step)].load();
          if (velocity > 0)
            triggerVoice(track, velocity, -1, sample, static_cast<int>(samplesPerStep * 0.8));
        }
        currentStep_.store((step + 1) % stepCount);
        samplesUntilStep_ += samplesPerStep;
      }
    }

    double dry = 0.0;
    for (auto& voice : voices_)
      dry += renderVoice(voice, sampleRate_);
    dry *= 0.22 * inputGain;

    if (buffer.getNumChannels() == 1) {
      buffer.setSample(0, sample, static_cast<float>(dry));
    } else {
      buffer.setSample(0, sample, static_cast<float>(dry));
      buffer.setSample(1, sample, static_cast<float>(dry));
    }
  }

  const synthLib::TAudioInputs engineInputs { nullptr, nullptr, nullptr, nullptr };
  for (size_t modelIndex = 0; modelIndex < gearmulatorEngines_.size(); ++modelIndex) {
    auto& engine = gearmulatorEngines_[modelIndex];
    if (!gearmulatorUsed[modelIndex] || !engine || !engine->runtime || !engine->runtime->isValid())
      continue;
    if (engine->output.getNumSamples() < sampleCount) {
      engine->output.setSize(6, sampleCount, false, false, true);
      engine->runtime->setBlockSize(static_cast<uint32_t>(sampleCount));
    }
    engine->output.clear();
    synthLib::TAudioOutputs engineOutputs {};
    for (int channel = 0; channel < engine->output.getNumChannels(); ++channel)
      engineOutputs[static_cast<size_t>(channel)] = engine->output.getWritePointer(channel);
    engine->runtime->process(
      engineInputs,
      engineOutputs,
      static_cast<size_t>(sampleCount),
      bpm,
      0.0,
      sequencerPlaying_.load(),
      false);
  }

  for (int sample = 0; sample < sampleCount; ++sample) {
    auto dryLeft = static_cast<double>(buffer.getSample(0, sample));
    auto dryRight = buffer.getNumChannels() > 1
      ? static_cast<double>(buffer.getSample(1, sample))
      : dryLeft;
    for (size_t modelIndex = 0; modelIndex < gearmulatorEngines_.size(); ++modelIndex) {
      if (!gearmulatorUsed[modelIndex])
        continue;
      const auto& engine = gearmulatorEngines_[modelIndex];
      if (!engine || engine->output.getNumSamples() < sampleCount)
        continue;
      dryLeft += engine->output.getSample(0, sample) * inputGain;
      dryRight += engine->output.getSample(1, sample) * inputGain;
    }

    if (fxEnabled) {
      noiseState_ ^= noiseState_ << 13;
      noiseState_ ^= noiseState_ >> 17;
      noiseState_ ^= noiseState_ << 5;
      const auto noiseSample = (static_cast<double>(noiseState_) / 2147483648.0 - 1.0) * noise * 0.04;
      const auto wobble = 1.0 + drunk * 0.012 * std::sin(
        2.0 * juce::MathConstants<double>::pi * (sample / sampleRate_) * (0.18 + character * 0.7));
      auto processedLeft = std::tanh((dryLeft * wobble + noiseSample) * (1.0 + drive * 8.0));
      auto processedRight = std::tanh((dryRight * wobble + noiseSample) * (1.0 + drive * 8.0));
      filterLeft_ += lowpassCoeff * (processedLeft - filterLeft_);
      filterRight_ += lowpassCoeff * (processedRight - filterRight_);
      processedLeft = filterLeft_;
      processedRight = filterRight_;
      bassLeft_ += bassCoeff * (processedLeft - bassLeft_);
      bassRight_ += bassCoeff * (processedRight - bassRight_);
      if (bassEnabled)
      {
        processedLeft += bassLeft_ * 0.9;
        processedRight += bassRight_ * 0.9;
      }

      if (samplesUntilStep_ > 0.0 && alias > 0.0) {
        const auto reducedRateHold = juce::jmax(1.0, holdEvery * (1.0 + alias * 3.0));
        if ((sample % static_cast<int>(reducedRateHold)) == 0)
          heldSample_ = processedLeft;
        processedLeft = heldSample_;
        processedRight = heldSample_;
      }

      if (quantization > 1.0)
      {
        processedLeft = std::round(processedLeft * quantization) / quantization;
        processedRight = std::round(processedRight * quantization) / quantization;
      }
      quantizedLeft_ = dryLeft * (1.0 - wet) + processedLeft * wet;
      quantizedRight_ = mono
        ? quantizedLeft_
        : dryRight * (1.0 - wet) + processedRight * wet;
    } else {
      quantizedLeft_ = dryLeft;
      quantizedRight_ = mono ? dryLeft : dryRight;
    }

    const auto left = static_cast<float>(quantizedLeft_ * outputGain);
    const auto right = static_cast<float>(quantizedRight_ * outputGain);
    if (buffer.getNumChannels() == 1) {
      buffer.setSample(0, sample, (left + right) * 0.5f);
    } else {
      buffer.setSample(0, sample, left);
      buffer.setSample(1, sample, right);
    }
  }
  processSampleCounter_ = blockEnd;
}

juce::AudioProcessorEditor* Salaryman1999AudioProcessor::createEditor() {
  return new Salaryman1999AudioProcessorEditor(*this);
}

void Salaryman1999AudioProcessor::setCurrentProgram(int index) {
  currentProgram_ = juce::jlimit(0, getNumPrograms() - 1, index);
  applyPreset(currentProgram_);
}

const juce::String Salaryman1999AudioProcessor::getProgramName(int index) {
  static const juce::StringArray names { "CLEAN", "DUST", "CRUSH", "WOBBLE" };
  return names[juce::jlimit(0, names.size() - 1, index)];
}

void Salaryman1999AudioProcessor::getStateInformation(juce::MemoryBlock& destinationData) {
  const auto json = exportProjectJson();
  destinationData.replaceWith(json.toRawUTF8(), static_cast<size_t>(json.getNumBytesAsUTF8()));
}

void Salaryman1999AudioProcessor::setStateInformation(const void* data, int sizeInBytes) {
  if (data == nullptr || sizeInBytes <= 0 || sizeInBytes > 256 * 1024)
    return;
  importProjectJson(juce::String::fromUTF8(static_cast<const char*>(data), sizeInBytes));
}

bool Salaryman1999AudioProcessor::stepIsOn(int track, int step) const {
  if (track < 0 || track >= trackCount || step < 0 || step >= stepCount)
    return false;
  return steps_[static_cast<size_t>(track)][static_cast<size_t>(step)].load() > 0;
}

void Salaryman1999AudioProcessor::setStep(int track, int step, bool enabled) {
  if (track < 0 || track >= trackCount || step < 0 || step >= stepCount)
    return;
  if (trackKinds_[static_cast<size_t>(track)].load() != 0)
    return;
  steps_[static_cast<size_t>(track)][static_cast<size_t>(step)].store(enabled ? 100 : 0);
}

juce::String Salaryman1999AudioProcessor::machineForTrack(int track) const {
  if (track < 0 || track >= trackCount)
    return "op1";
  auto* parameter = parameters.getParameter("machine" + juce::String(track + 1));
  const auto choice = parameter == nullptr ? machines_[static_cast<size_t>(track)].load()
    : static_cast<int>(std::round(parameter->convertFrom0to1(parameter->getValue())));
  return machineIdFromChoice(choice);
}

void Salaryman1999AudioProcessor::setMachineForTrack(int track, const juce::String& machineId) {
  if (track < 0 || track >= trackCount)
    return;
  if (trackKinds_[static_cast<size_t>(track)].load() != 0)
    return;
  const auto choice = choiceFromMachineId(machineId);
  machines_[static_cast<size_t>(track)].store(choice);
  if (auto* parameter = parameters.getParameter("machine" + juce::String(track + 1)))
    parameter->setValueNotifyingHost(parameter->convertTo0to1(static_cast<float>(choice)));
}

bool Salaryman1999AudioProcessor::gearmulatorFirmwareReady(GearmulatorModel model) const {
  const auto index = model == GearmulatorModel::Machinedrum ? 0u : 1u;
  std::lock_guard<std::mutex> lock(gearmulatorMutex_);
  const auto& engine = gearmulatorEngines_[index];
  return engine != nullptr && engine->runtime != nullptr && engine->runtime->isValid();
}

bool Salaryman1999AudioProcessor::loadGearmulatorFirmware(
    GearmulatorModel model, const juce::File& file, juce::String& error) {
  const auto modelIndex = model == GearmulatorModel::Machinedrum ? 0u : 1u;
  const auto nativeModel = model == GearmulatorModel::Machinedrum
    ? md::MachineModel::Machinedrum
    : md::MachineModel::Monomachine;
  const auto expectedName = model == GearmulatorModel::Machinedrum ? "Machinedrum" : "Monomachine";

  if (!file.existsAsFile()) {
    error = "Select an existing " + juce::String(expectedName) + " firmware file.";
    return false;
  }
  if (file.getSize() != 8 * 1024 * 1024) {
    error = juce::String(expectedName) + " firmware must be an 8 MiB image. No firmware is included with 1999.";
    return false;
  }

  juce::FileInputStream stream(file);
  if (!stream.openedOk()) {
    error = "1999 could not read that firmware file.";
    return false;
  }
  std::vector<uint8_t> rom(static_cast<size_t>(file.getSize()));
  if (stream.read(rom.data(), static_cast<int>(rom.size())) != static_cast<int>(rom.size())) {
    error = "1999 could not read the complete firmware image.";
    return false;
  }
  if (!md::RomLoader::isRomForModel(rom, nativeModel)) {
    error = "That file is not recognized as " + juce::String(expectedName) + " firmware.";
    return false;
  }

  double hostSamplerate = 44100.0;
  int blockSize = 512;
  {
    std::lock_guard<std::mutex> lock(gearmulatorMutex_);
    hostSamplerate = sampleRate_;
    blockSize = maxBlockSize_;
  }

  const auto storageRoot = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
    .getChildFile("Picasso AI").getChildFile("1999").getChildFile("Gearmulator")
    .getChildFile(expectedName);
  const auto storageResult = storageRoot.createDirectory();
  if (storageResult.failed()) {
    error = "1999 could not create its local Gearmulator settings folder.";
    return false;
  }

  synthLib::DeviceCreateParams params;
  params.preferredSamplerate = static_cast<float>(md::g_samplerate);
  params.hostSamplerate = static_cast<float>(hostSamplerate);
  params.romName = file.getFileName().toStdString();
  params.romData = std::move(rom);
  params.customData = md::deviceCustomData(nativeModel);
  params.homePath = storageRoot.getFullPathName().toStdString();

  auto candidate = std::make_unique<GearmulatorEngine>();
  candidate->device = std::make_unique<md::Device>(params);
  if (!candidate->device->isValid()) {
    error = "Gearmulator could not start from that firmware image.";
    return false;
  }
  candidate->runtime = std::make_unique<synthLib::Plugin>(
    candidate->device.get(), [](synthLib::Device*) {});
  candidate->runtime->setHostSamplerate(static_cast<float>(hostSamplerate), static_cast<float>(md::g_samplerate));
  candidate->runtime->setBlockSize(static_cast<uint32_t>(juce::jmax(1, blockSize)));
  candidate->runtime->reserveMidiEventCapacity();
  candidate->output.setSize(6, juce::jmax(1, blockSize), false, false, true);
  candidate->firmwarePath = file.getFullPathName();

  {
    std::lock_guard<std::mutex> lock(gearmulatorMutex_);
    candidate->runtime->setHostSamplerate(static_cast<float>(sampleRate_), static_cast<float>(md::g_samplerate));
    candidate->runtime->setBlockSize(static_cast<uint32_t>(juce::jmax(1, maxBlockSize_)));
    candidate->output.setSize(6, juce::jmax(1, maxBlockSize_), false, false, true);
    gearmulatorEngines_[modelIndex] = std::move(candidate);
  }
  error.clear();
  return true;
}

juce::String Salaryman1999AudioProcessor::exportProjectJson() const {
  auto rootValue = projectTemplateJson_.isNotEmpty()
    ? juce::JSON::parse(projectTemplateJson_)
    : juce::var();
  auto* root = rootValue.getDynamicObject();
  if (root == nullptr) {
    rootValue = juce::var(new juce::DynamicObject());
    root = rootValue.getDynamicObject();
  }
  root->setProperty("schemaVersion", 1);
  if (root->getProperty("name").toString().trim().isEmpty())
    root->setProperty("name", "1999 session");
  root->setProperty("bpm", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "bpm", 92.0f)));
  if (root->getProperty("key").toString().isEmpty())
    root->setProperty("key", "C");
  if (root->getProperty("timeSignature").toString().isEmpty())
    root->setProperty("timeSignature", "4/4");

  const auto existingTracks = root->getProperty("tracks");
  const auto* existingTrackArray = existingTracks.getArray();
  auto tracks = juce::Array<juce::var>();
  for (int track = 0; track < trackCount; ++track) {
    auto* item = existingTrackArray != nullptr && track < existingTrackArray->size()
      ? existingTrackArray->getReference(track).getDynamicObject()
      : nullptr;
    if (item == nullptr) {
      item = new juce::DynamicObject();
      item->setProperty("id", "trk-" + juce::String(track + 1));
      item->setProperty("name", defaultTrackNames[static_cast<size_t>(track)]);
      item->setProperty("kind", "instrument");
      item->setProperty("audioTrackId", juce::var());
      item->setProperty("muted", false);
      item->setProperty("volume", 72);
      auto soundState = new juce::DynamicObject();
      soundState->setProperty("tone", 68);
      soundState->setProperty("decayMs", 260);
      item->setProperty("soundState", juce::var(soundState));
    }
    if (item->getProperty("kind").toString() != "recording") {
      item->setProperty("machineId", machineForTrack(track));
      auto pattern = juce::Array<juce::var>();
      for (int step = 0; step < stepCount; ++step)
        pattern.add(steps_[static_cast<size_t>(track)][static_cast<size_t>(step)].load());
      item->setProperty("steps", pattern);
    }
    tracks.add(juce::var(item));
  }
  root->setProperty("tracks", tracks);

  if (root->getProperty("emulatorState").getDynamicObject() == nullptr) {
    auto emulator = new juce::DynamicObject();
    emulator->setProperty("firmwareIds", juce::var(new juce::DynamicObject()));
    emulator->setProperty("patchSaves", juce::var(new juce::DynamicObject()));
    root->setProperty("emulatorState", juce::var(emulator));
  }

  auto fx = new juce::DynamicObject();
  fx->setProperty("enabled", readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "fxEnabled") > 0.5f);
  fx->setProperty("input", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "input", 100.0f)));
  fx->setProperty("output", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "output", 100.0f)));
  fx->setProperty("mix", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "mix", 100.0f)));
  fx->setProperty("filter", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "filter", 50.0f)));
  fx->setProperty("bits", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "bits", 16.0f)));
  fx->setProperty("rate", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "rate", 48000.0f)));
  fx->setProperty("drive", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "drive")));
  fx->setProperty("alias", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "alias", 50.0f)));
  fx->setProperty("noise", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "noise")));
  fx->setProperty("drunk", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "drunk")));
  fx->setProperty("character", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "character")));
  fx->setProperty("bassBoost", readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "bassBoost") > 0.5f);
  fx->setProperty("bassFrequency", static_cast<int>(readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "bassFrequency", 120.0f)));
  fx->setProperty("stereoMode", readParam(const_cast<juce::AudioProcessorValueTreeState&>(parameters), "mono") > 0.5f ? "mono" : "stereo");
  root->setProperty("lofiFx", juce::var(fx));
  return juce::JSON::toString(rootValue, true);
}

bool Salaryman1999AudioProcessor::importProjectJson(const juce::String& json) {
  if (json.isEmpty() || json.getNumBytesAsUTF8() > 256 * 1024)
    return false;
  const auto parsed = juce::JSON::parse(json);
  auto* root = parsed.getDynamicObject();
  if (root == nullptr || static_cast<int>(root->getProperty("schemaVersion")) != 1)
    return false;
  const auto projectName = root->getProperty("name").toString().trim();
  const auto bpm = static_cast<int>(root->getProperty("bpm"));
  const auto trackList = root->getProperty("tracks");
  if (projectName.isEmpty() || projectName.length() > 80 || bpm < 40 || bpm > 240
      || !trackList.isArray() || trackList.getArray()->size() > trackCount)
    return false;

  std::array<std::array<int, stepCount>, trackCount> importedSteps {};
  std::array<int, trackCount> importedMachines {};
  std::array<int, trackCount> importedKinds {};

  const auto& rows = *trackList.getArray();
  for (int track = 0; track < rows.size(); ++track) {
    auto* item = rows[track].getDynamicObject();
    if (item == nullptr)
      return false;
    const auto kind = item->getProperty("kind").toString();
    if (kind != "instrument" && kind != "recording")
      return false;
    importedKinds[static_cast<size_t>(track)] = kind == "recording" ? 1 : 0;
    const auto machineId = item->getProperty("machineId").toString();
    const auto machineIndex = machineIndexFor(machineId);
    if (machineIndex < 0)
      return false;
    importedMachines[static_cast<size_t>(track)] = machineIndex;
    const auto pattern = item->getProperty("steps");
    if (!pattern.isArray() || pattern.getArray()->size() != stepCount)
      return false;
    for (int step = 0; step < stepCount; ++step) {
      const auto velocityValue = pattern.getArray()->getReference(step);
      if (!velocityValue.isInt() && !velocityValue.isInt64())
        return false;
      const auto velocity = static_cast<int>(velocityValue);
      if (velocity < 0 || velocity > 127)
        return false;
      importedSteps[static_cast<size_t>(track)][static_cast<size_t>(step)] = velocity;
    }
  }

  const auto fxValue = root->getProperty("lofiFx");
  auto* fx = fxValue.getDynamicObject();
  if (!fxValue.isVoid() && fx == nullptr)
    return false;

  auto* bpmParameter = parameters.getParameter("bpm");
  if (bpmParameter != nullptr)
    bpmParameter->setValueNotifyingHost(bpmParameter->convertTo0to1(static_cast<float>(bpm)));
  for (int track = 0; track < trackCount; ++track) {
    trackKinds_[static_cast<size_t>(track)].store(
      track < rows.size() ? importedKinds[static_cast<size_t>(track)] : 0);
    for (int step = 0; step < stepCount; ++step)
      steps_[static_cast<size_t>(track)][static_cast<size_t>(step)].store(
        importedSteps[static_cast<size_t>(track)][static_cast<size_t>(step)]);
    if (track < rows.size())
      setMachineForTrack(track, machineIds[static_cast<size_t>(importedMachines[static_cast<size_t>(track)])]);
  }

  if (fx != nullptr) {
    const auto setFloat = [this, fx](const char* property, const char* id, float minimum, float maximum) {
      if (auto* parameter = parameters.getParameter(id)) {
        const auto value = static_cast<float>(fx->getProperty(property));
        if (value >= minimum && value <= maximum)
          parameter->setValueNotifyingHost(parameter->convertTo0to1(value));
      }
    };
    setFloat("input", "input", 0.0f, 150.0f);
    setFloat("output", "output", 0.0f, 150.0f);
    setFloat("mix", "mix", 0.0f, 100.0f);
    setFloat("filter", "filter", 0.0f, 100.0f);
    setFloat("bits", "bits", 4.0f, 16.0f);
    setFloat("rate", "rate", 4000.0f, 48000.0f);
    setFloat("drive", "drive", 0.0f, 100.0f);
    setFloat("alias", "alias", 0.0f, 100.0f);
    setFloat("noise", "noise", 0.0f, 100.0f);
    setFloat("drunk", "drunk", 0.0f, 100.0f);
    setFloat("character", "character", 0.0f, 100.0f);
    setFloat("bassFrequency", "bassFrequency", 20.0f, 500.0f);
    if (auto* parameter = parameters.getParameter("fxEnabled"))
      parameter->setValueNotifyingHost(fx->getProperty("enabled") ? 1.0f : 0.0f);
    if (auto* parameter = parameters.getParameter("bassBoost"))
      parameter->setValueNotifyingHost(fx->getProperty("bassBoost") ? 1.0f : 0.0f);
    if (auto* parameter = parameters.getParameter("mono"))
      parameter->setValueNotifyingHost(fx->getProperty("stereoMode").toString() == "mono" ? 1.0f : 0.0f);
  }
  projectTemplateJson_ = json;
  return true;
}

void Salaryman1999AudioProcessor::applyPreset(int presetIndex) {
  const std::array<std::array<float, 12>, 4> presets {{
    {{ 100, 100, 100, 50, 16, 48000, 0, 50, 0, 0, 0, 120 }},
    {{ 100, 100, 78, 43, 12, 24000, 12, 42, 8, 0, 18, 90 }},
    {{ 100, 100, 90, 48, 8, 12000, 38, 82, 0, 0, 24, 120 }},
    {{ 100, 100, 72, 50, 12, 22000, 0, 58, 5, 46, 10, 120 }}
  }};
  const auto index = juce::jlimit(0, 3, presetIndex);
  const auto& values = presets[static_cast<size_t>(index)];
  const std::array<const char*, 12> ids {
    "input", "output", "mix", "filter", "bits", "rate", "drive",
    "alias", "noise", "drunk", "character", "bassFrequency"
  };
  for (int i = 0; i < ids.size(); ++i) {
    if (auto* parameter = parameters.getParameter(ids[static_cast<size_t>(i)]))
      parameter->setValueNotifyingHost(parameter->convertTo0to1(values[static_cast<size_t>(i)]));
  }
  if (auto* parameter = parameters.getParameter("fxEnabled"))
    parameter->setValueNotifyingHost(index == 0 ? 0.0f : 1.0f);
  if (auto* parameter = parameters.getParameter("bassBoost"))
    parameter->setValueNotifyingHost(index == 1 ? 1.0f : 0.0f);
  currentProgram_ = index;
}

int Salaryman1999AudioProcessor::machineIndexFor(const juce::String& machineId) {
  for (int i = 0; i < static_cast<int>(machineIds.size()); ++i)
    if (machineId == machineIds[static_cast<size_t>(i)])
      return i;
  return -1;
}

void Salaryman1999AudioProcessor::triggerVoice(
    int track, int velocity, int midiNote, int sampleOffset, int gateSamples) {
  if (track < 0 || track >= trackCount)
    return;

  const auto machineIndex = machineIndexFor(machineForTrack(track));
  if (isGearmulatorMachine(machineIndex)) {
    const auto modelIndex = gearmulatorIndexForMachine(machineIndex);
    auto& engine = gearmulatorEngines_[static_cast<size_t>(modelIndex)];
    if (engine == nullptr || engine->runtime == nullptr || !engine->runtime->isValid())
      return;

    const auto note = midiNote >= 0
      ? midiNote
      : (modelIndex == 0 ? 36 : 60) + (track % 8);
    const auto offset = static_cast<uint32_t>(juce::jmax(0, sampleOffset));
    if (gearNoteOffAtSample_[static_cast<size_t>(track)] != 0) {
      const auto previousModel = gearNoteOffModel_[static_cast<size_t>(track)];
      if (previousModel >= 0 && previousModel < static_cast<int>(gearmulatorEngines_.size())) {
        auto& previousEngine = gearmulatorEngines_[static_cast<size_t>(previousModel)];
        if (previousEngine && previousEngine->runtime)
          previousEngine->runtime->addMidiEvent(synthLib::SMidiEvent(
            synthLib::MidiEventSource::Internal,
            static_cast<uint8_t>(synthLib::M_NOTEOFF),
            static_cast<uint8_t>(gearNoteOffNumber_[static_cast<size_t>(track)]),
            0,
            offset));
      }
    }
    gearNoteOffAtSample_[static_cast<size_t>(track)] = 0;
    gearNoteOffModel_[static_cast<size_t>(track)] = -1;
    gearNoteOffNumber_[static_cast<size_t>(track)] = -1;
    engine->runtime->addMidiEvent(synthLib::SMidiEvent(
      synthLib::MidiEventSource::Internal,
      static_cast<uint8_t>(synthLib::M_NOTEON),
      static_cast<uint8_t>(juce::jlimit(0, 127, note)),
      static_cast<uint8_t>(juce::jlimit(1, 127, velocity)),
      offset));
    gearNoteOffAtSample_[static_cast<size_t>(track)] =
      static_cast<std::int64_t>(processSampleCounter_) + sampleOffset + juce::jmax(1, gateSamples);
    gearNoteOffModel_[static_cast<size_t>(track)] = modelIndex;
    gearNoteOffNumber_[static_cast<size_t>(track)] = note;
    return;
  }

  auto& voice = voices_[static_cast<size_t>(track)];
  voice = {};
  voice.active = true;
  voice.envelope = 1.0f;
  voice.velocity = juce::jlimit(1, 127, velocity) / 127.0f;
  voice.machine = machineIndex;
  const auto note = midiNote >= 0 ? midiNote : 36 + (track * 5) + currentStep_.load() % 12;
  voice.frequency = 440.0 * std::pow(2.0, (note - 69) / 12.0);
  if (voice.machine == 2)
    voice.frequency = track == 0 ? 52.0 : (track == 1 ? 180.0 : 800.0);
}

float Salaryman1999AudioProcessor::renderVoice(Voice& voice, double sampleRate) {
  if (!voice.active || voice.envelope <= 0.0001f)
    return 0.0f;
  const auto phase = voice.phase;
  float wave = static_cast<float>(std::sin(phase));
  if (voice.machine == 0 || voice.machine == 4 || voice.machine == 8)
    wave = static_cast<float>(std::sin(phase) * 0.72 + std::sin(phase * 2.01) * 0.2 + std::sin(phase * 3.0) * 0.08);
  else if (voice.machine == 6 || voice.machine == 7)
    wave = static_cast<float>(std::sin(phase) > 0.0 ? 1.0 : -1.0) * 0.45f
      + static_cast<float>(std::sin(phase * 2.0)) * 0.35f;
  else if (voice.machine == 1 || voice.machine == 5)
    wave = static_cast<float>(std::sin(phase) * 0.5 + std::sin(phase * 1.5) * 0.5);

  const auto output = wave * voice.envelope * voice.velocity;
  voice.phase += 2.0 * juce::MathConstants<double>::pi * voice.frequency / sampleRate;
  if (voice.phase > 2.0 * juce::MathConstants<double>::pi)
    voice.phase -= 2.0 * juce::MathConstants<double>::pi;
  const auto decay = voice.machine == 2 ? 0.9992f : 0.99985f;
  voice.envelope *= decay;
  if (voice.envelope < 0.0001f)
    voice.active = false;
  return output;
}

void Salaryman1999AudioProcessor::resetDsp() {
  samplesUntilStep_ = 0.0;
  heldSample_ = 0.0;
  quantizedLeft_ = quantizedRight_ = 0.0;
  filterLeft_ = filterRight_ = 0.0;
  bassLeft_ = bassRight_ = 0.0;
  for (auto& voice : voices_)
    voice = {};
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
  return new Salaryman1999AudioProcessor();
}
