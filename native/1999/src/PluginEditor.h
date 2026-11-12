#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

class Salaryman1999AudioProcessorEditor final : public juce::AudioProcessorEditor,
                                                private juce::Timer {
public:
  explicit Salaryman1999AudioProcessorEditor(Salaryman1999AudioProcessor&);
  ~Salaryman1999AudioProcessorEditor() override = default;
  void paint(juce::Graphics&) override;
  void resized() override;

private:
  void timerCallback() override;
  void choosePreset(int preset);
  void exportProject();
  void importProject();

  Salaryman1999AudioProcessor& processor_;
  juce::TextButton playButton { "PLAY" };
  juce::TextButton exportButton { "EXPORT PROJECT" };
  juce::TextButton importButton { "IMPORT PROJECT" };
  juce::ComboBox presetBox;
  std::array<std::array<std::unique_ptr<juce::TextButton>, Salaryman1999AudioProcessor::stepCount>,
    Salaryman1999AudioProcessor::trackCount> stepButtons_;
  std::array<juce::ComboBox, Salaryman1999AudioProcessor::trackCount> machineBoxes_;
  std::array<juce::Label, Salaryman1999AudioProcessor::trackCount> trackLabels_;
  std::vector<std::unique_ptr<juce::Slider>> sliders_;
  std::vector<std::unique_ptr<juce::Label>> sliderLabels_;
  std::vector<std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>> attachments_;
  juce::AudioProcessorValueTreeState::ButtonAttachment fxEnabledAttachment_;
  juce::ToggleButton fxEnabledButton { "MASTER FX" };
  juce::AudioProcessorValueTreeState::ButtonAttachment bassBoostAttachment_;
  juce::ToggleButton bassBoostButton { "BASS" };
  std::unique_ptr<juce::FileChooser> fileChooser_;
  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(Salaryman1999AudioProcessorEditor)
};
