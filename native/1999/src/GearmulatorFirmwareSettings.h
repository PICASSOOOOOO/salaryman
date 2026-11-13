#pragma once

#include <JuceHeader.h>
#include <array>

enum class GearmulatorModel {
  Machinedrum,
  Monomachine
};

namespace gearmulatorFirmwareSettings {

juce::File userSettingsFile();
juce::Result read(const juce::File& settingsFile, std::array<juce::File, 2>& paths);
juce::Result write(const juce::File& settingsFile, GearmulatorModel model, const juce::File& firmwareFile);

}
