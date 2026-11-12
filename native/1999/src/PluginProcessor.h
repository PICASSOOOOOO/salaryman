#pragma once

#include <JuceHeader.h>
#include <array>
#include <atomic>

class Salaryman1999AudioProcessor final : public juce::AudioProcessor {
public:
  static constexpr int trackCount = 8;
  static constexpr int stepCount = 16;
  static constexpr std::array<const char*, trackCount> defaultMachines {
    "mpc_sample", "op1", "korg_m1", "fm1",
    "smk37", "minimoog", "sp404mkii", "korg_ms2000r"
  };
  static constexpr std::array<const char*, trackCount> defaultTrackNames {
    "DRUMS", "PULSE", "GLASS", "SUB",
    "FM", "LEAD", "TAPE", "AIR"
  };
  static constexpr std::array<const char*, 9> machineIds {
    "op1", "sp404mkii", "mpc_sample", "korg_ms2000r", "korg_m1",
    "boss_ce2", "fm1", "smk37", "minimoog"
  };

  Salaryman1999AudioProcessor();
  ~Salaryman1999AudioProcessor() override = default;

  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override;
  bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
  void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

  juce::AudioProcessorEditor* createEditor() override;
  bool hasEditor() const override { return true; }
  const juce::String getName() const override { return "1999"; }
  bool acceptsMidi() const override { return true; }
  bool producesMidi() const override { return false; }
  bool isMidiEffect() const override { return false; }
  double getTailLengthSeconds() const override { return 2.0; }
  int getNumPrograms() override { return 4; }
  int getCurrentProgram() override { return currentProgram_; }
  void setCurrentProgram(int index) override;
  const juce::String getProgramName(int index) override;
  void changeProgramName(int, const juce::String&) override {}
  void getStateInformation(juce::MemoryBlock& destinationData) override;
  void setStateInformation(const void* data, int sizeInBytes) override;

  juce::AudioProcessorValueTreeState parameters;
  bool stepIsOn(int track, int step) const;
  void setStep(int track, int step, bool enabled);
  juce::String machineForTrack(int track) const;
  void setMachineForTrack(int track, const juce::String& machineId);
  bool isSequencerPlaying() const { return sequencerPlaying_.load(); }
  void setSequencerPlaying(bool playing) { sequencerPlaying_.store(playing); }
  int currentStep() const { return currentStep_.load(); }
  juce::String exportProjectJson() const;
  bool importProjectJson(const juce::String& json);
  void applyPreset(int presetIndex);

private:
  struct Voice {
    double phase = 0.0;
    double frequency = 110.0;
    float envelope = 0.0f;
    float velocity = 0.0f;
    int machine = 0;
    bool active = false;
  };

  static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
  static int machineIndexFor(const juce::String& machineId);
  void triggerVoice(int track, int velocity, int midiNote = -1);
  float renderVoice(Voice& voice, double sampleRate);
  void resetDsp();

  std::array<std::array<std::atomic<int>, stepCount>, trackCount> steps_ {};
  std::array<std::atomic<int>, trackCount> machines_ {};
  std::array<Voice, trackCount> voices_ {};
  std::atomic<bool> sequencerPlaying_ { false };
  std::atomic<int> currentStep_ { 0 };
  int currentProgram_ = 0;
  double sampleRate_ = 44100.0;
  double samplesUntilStep_ = 0.0;
  double heldSample_ = 0.0;
  double quantizedLeft_ = 0.0;
  double quantizedRight_ = 0.0;
  double filterLeft_ = 0.0;
  double filterRight_ = 0.0;
  double bassLeft_ = 0.0;
  double bassRight_ = 0.0;
  std::uint32_t noiseState_ = 0x1999a11u;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(Salaryman1999AudioProcessor)
};
