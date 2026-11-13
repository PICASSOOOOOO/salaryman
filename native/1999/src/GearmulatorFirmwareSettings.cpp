#include "GearmulatorFirmwareSettings.h"
#include <mutex>

namespace {
std::mutex settingsMutex;

const char* keyForModel(GearmulatorModel model) {
  return model == GearmulatorModel::Machinedrum ? "machinedrumPath" : "monomachinePath";
}

}

juce::File gearmulatorFirmwareSettings::userSettingsFile() {
  return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
    .getChildFile("Picasso AI")
    .getChildFile("1999")
    .getChildFile("Gearmulator")
    .getChildFile("firmware-paths.json");
}

juce::Result gearmulatorFirmwareSettings::read(
    const juce::File& settingsFile, std::array<juce::File, 2>& paths) {
  std::lock_guard<std::mutex> lock(settingsMutex);
  paths = {};
  if (!settingsFile.existsAsFile())
    return juce::Result::ok();

  const auto settings = juce::JSON::parse(settingsFile.loadFileAsString());
  const auto* object = settings.getDynamicObject();
  if (object == nullptr)
    return juce::Result::fail("Gearmulator firmware settings are invalid.");

  paths[0] = juce::File(object->getProperty(keyForModel(GearmulatorModel::Machinedrum)).toString());
  paths[1] = juce::File(object->getProperty(keyForModel(GearmulatorModel::Monomachine)).toString());
  return juce::Result::ok();
}

juce::Result gearmulatorFirmwareSettings::write(
    const juce::File& settingsFile, GearmulatorModel model, const juce::File& firmwareFile) {
  std::lock_guard<std::mutex> lock(settingsMutex);
  const auto directoryResult = settingsFile.getParentDirectory().createDirectory();
  if (directoryResult.failed())
    return juce::Result::fail("1999 could not create its local firmware settings folder.");

  auto settings = settingsFile.existsAsFile()
    ? juce::JSON::parse(settingsFile.loadFileAsString())
    : juce::var(new juce::DynamicObject());
  auto* object = settings.getDynamicObject();
  if (object == nullptr) {
    settings = juce::var(new juce::DynamicObject());
    object = settings.getDynamicObject();
  }

  object->setProperty(keyForModel(model), firmwareFile.getFullPathName());
  juce::TemporaryFile temporary(settingsFile, juce::TemporaryFile::useHiddenFile);
  if (!temporary.getFile().replaceWithText(juce::JSON::toString(settings, true))
      || !temporary.overwriteTargetFileWithTemporary())
    return juce::Result::fail("1999 could not save the local firmware path.");
  return juce::Result::ok();
}
