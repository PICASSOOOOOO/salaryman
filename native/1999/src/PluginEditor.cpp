#include "PluginEditor.h"

namespace {
constexpr juce::uint32 background = 0xff050806;
constexpr juce::uint32 panel = 0xff101512;
constexpr juce::uint32 green = 0xff53cf74;
constexpr juce::uint32 dimGreen = 0xff28683a;
constexpr juce::uint32 cream = 0xffe8e8dc;
const juce::StringArray machineNames {
  "OP-1", "SP-404MKII", "MPC", "MS-2000R", "M1", "CE-2", "FM-1", "SMK-37", "MINIMOOG"
};
const juce::StringArray machineIds {
  "op1", "sp404mkii", "mpc_sample", "korg_ms2000r", "korg_m1",
  "boss_ce2", "fm1", "smk37", "minimoog"
};
}

Salaryman1999AudioProcessorEditor::Salaryman1999AudioProcessorEditor(Salaryman1999AudioProcessor& processor)
  : AudioProcessorEditor(&processor),
    processor_(processor),
    fxEnabledAttachment_(processor.parameters, "fxEnabled", fxEnabledButton),
    bassBoostAttachment_(processor.parameters, "bassBoost", bassBoostButton) {
  setSize(1120, 720);
  setResizable(true, true);
  setResizeLimits(900, 620, 1500, 980);
  playButton.setClickingTogglesState(true);
  playButton.setColour(juce::TextButton::buttonColourId, panel);
  playButton.onClick = [this] {
    const auto playing = playButton.getToggleState();
    processor_.setSequencerPlaying(playing);
    playButton.setButtonText(playing ? "STOP" : "PLAY");
  };
  addAndMakeVisible(playButton);

  for (auto* button : { &exportButton, &importButton }) {
    button->setColour(juce::TextButton::buttonColourId, panel);
    addAndMakeVisible(*button);
  }
  exportButton.onClick = [this] { exportProject(); };
  importButton.onClick = [this] { importProject(); };

  presetBox.addItemList({ "CLEAN", "DUST", "CRUSH", "WOBBLE" }, 1);
  presetBox.setSelectedId(1, juce::dontSendNotification);
  presetBox.onChange = [this] { choosePreset(presetBox.getSelectedId() - 1); };
  addAndMakeVisible(presetBox);

  for (int track = 0; track < Salaryman1999AudioProcessor::trackCount; ++track) {
    auto& label = trackLabels_[static_cast<size_t>(track)];
    label.setText(Salaryman1999AudioProcessor::defaultTrackNames[static_cast<size_t>(track)], juce::dontSendNotification);
    label.setColour(juce::Label::textColourId, cream);
    label.setFont(juce::Font(juce::FontOptions(14.0f, juce::Font::bold)));
    addAndMakeVisible(label);

    auto& machine = machineBoxes_[static_cast<size_t>(track)];
    machine.addItemList(machineNames, 1);
    const auto current = processor_.machineForTrack(track);
    for (int index = 0; index < machineIds.size(); ++index)
      if (machineIds[index] == current)
        machine.setSelectedId(index + 1, juce::dontSendNotification);
    machine.onChange = [this, track, &machine] {
      const auto index = machine.getSelectedId() - 1;
      if (index >= 0 && index < machineIds.size())
        processor_.setMachineForTrack(track, machineIds[index]);
    };
    addAndMakeVisible(machine);

    for (int step = 0; step < Salaryman1999AudioProcessor::stepCount; ++step) {
      auto button = std::make_unique<juce::TextButton>(juce::String(step + 1));
      button->setClickingTogglesState(true);
      button->setToggleState(processor_.stepIsOn(track, step), juce::dontSendNotification);
      button->setColour(juce::TextButton::buttonColourId, panel);
      button->setColour(juce::TextButton::buttonOnColourId, dimGreen);
      button->onClick = [this, track, step, raw = button.get()] {
        processor_.setStep(track, step, raw->getToggleState());
      };
      addAndMakeVisible(*button);
      stepButtons_[static_cast<size_t>(track)][static_cast<size_t>(step)] = std::move(button);
    }
  }

  const std::array<std::pair<const char*, const char*>, 12> specs {{
    { "BPM", "bpm" }, { "IN", "input" }, { "OUT", "output" }, { "MIX", "mix" },
    { "FILTER", "filter" }, { "BITS", "bits" }, { "RATE", "rate" }, { "DRIVE", "drive" },
    { "ALIAS", "alias" }, { "NOISE", "noise" }, { "DRUNK", "drunk" }, { "CHAR", "character" }
  }};
  for (const auto& [labelText, parameterId] : specs) {
    auto label = std::make_unique<juce::Label>();
    label->setText(labelText, juce::dontSendNotification);
    label->setColour(juce::Label::textColourId, green);
    label->setFont(juce::Font(juce::FontOptions(11.0f, juce::Font::bold)));
    addAndMakeVisible(*label);
    sliderLabels_.push_back(std::move(label));

    auto slider = std::make_unique<juce::Slider>(juce::Slider::RotaryHorizontalVerticalDrag, juce::Slider::TextBoxBelow);
    slider->setColour(juce::Slider::rotarySliderFillColourId, green);
    slider->setColour(juce::Slider::thumbColourId, cream);
    slider->setColour(juce::Slider::textBoxTextColourId, cream);
    slider->setColour(juce::Slider::textBoxOutlineColourId, dimGreen);
    addAndMakeVisible(*slider);
    attachments_.push_back(std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
      processor_.parameters, parameterId, *slider));
    sliders_.push_back(std::move(slider));
  }
  addAndMakeVisible(fxEnabledButton);
  addAndMakeVisible(bassBoostButton);
  startTimerHz(12);
}

void Salaryman1999AudioProcessorEditor::paint(juce::Graphics& g) {
  g.fillAll(juce::Colour(background));
  g.setColour(juce::Colour(green));
  g.setFont(juce::Font(juce::FontOptions(23.0f, juce::Font::bold)));
  g.drawText("1999", 24, 15, 130, 34, juce::Justification::left);
  g.setColour(juce::Colour(cream));
  g.setFont(juce::Font(juce::FontOptions(12.0f)));
  g.drawText("WORKSTATION / SEQUENCER", 160, 22, 280, 24, juce::Justification::left);
  g.setColour(juce::Colour(dimGreen));
  g.drawLine(24.0f, 54.0f, static_cast<float>(getWidth() - 24), 54.0f, 1.0f);

  g.setColour(juce::Colour(panel));
  g.fillRoundedRectangle(24.0f, 70.0f, static_cast<float>(getWidth() - 48), 345.0f, 6.0f);
  g.fillRoundedRectangle(24.0f, 430.0f, static_cast<float>(getWidth() - 48), static_cast<float>(getHeight() - 454), 6.0f);
  g.setColour(juce::Colour(green));
  g.setFont(juce::Font(juce::FontOptions(12.0f, juce::Font::bold)));
  g.drawText("STEP SEQUENCER", 40, 79, 200, 20, juce::Justification::left);
  g.drawText("MASTER FX", 40, 439, 180, 20, juce::Justification::left);
}

void Salaryman1999AudioProcessorEditor::resized() {
  const auto width = getWidth();
  playButton.setBounds(width - 340, 16, 72, 30);
  presetBox.setBounds(width - 250, 16, 110, 30);
  importButton.setBounds(width - 130, 16, 104, 30);
  exportButton.setBounds(width - 130, 52, 104, 26);

  const int left = 42;
  const int labelWidth = 72;
  const int machineWidth = 118;
  const int gridX = left + labelWidth + machineWidth + 12;
  const int availableWidth = getWidth() - gridX - 46;
  const int cellGap = 4;
  const int cellWidth = juce::jmax(22, (availableWidth - cellGap * 15) / 16);
  const int rowHeight = 34;
  for (int track = 0; track < Salaryman1999AudioProcessor::trackCount; ++track) {
    const int y = 112 + track * rowHeight;
    trackLabels_[static_cast<size_t>(track)].setBounds(left, y + 5, labelWidth, 22);
    machineBoxes_[static_cast<size_t>(track)].setBounds(left + labelWidth, y + 1, machineWidth, 28);
    for (int step = 0; step < Salaryman1999AudioProcessor::stepCount; ++step) {
      stepButtons_[static_cast<size_t>(track)][static_cast<size_t>(step)]->setBounds(
        gridX + step * (cellWidth + cellGap), y + 1, cellWidth, 28);
    }
  }

  fxEnabledButton.setBounds(44, 470, 108, 28);
  bassBoostButton.setBounds(160, 470, 76, 28);
  const int knobY = 505;
  const int knobGap = 12;
  const int knobWidth = juce::jmax(58, (getWidth() - 88 - knobGap * 5) / 6);
  for (int i = 0; i < static_cast<int>(sliders_.size()); ++i) {
    const int row = i / 6;
    const int column = i % 6;
    const int x = 44 + column * (knobWidth + knobGap);
    const int y = knobY + row * 92;
    sliderLabels_[static_cast<size_t>(i)]->setBounds(x, y, knobWidth, 15);
    sliders_[static_cast<size_t>(i)]->setBounds(x, y + 12, knobWidth, 74);
  }
}

void Salaryman1999AudioProcessorEditor::timerCallback() {
  const auto activeStep = processor_.isSequencerPlaying() ? processor_.currentStep() : -1;
  for (int track = 0; track < Salaryman1999AudioProcessor::trackCount; ++track) {
    for (int step = 0; step < Salaryman1999AudioProcessor::stepCount; ++step) {
      auto* button = stepButtons_[static_cast<size_t>(track)][static_cast<size_t>(step)].get();
      button->setToggleState(processor_.stepIsOn(track, step), juce::dontSendNotification);
      button->setColour(juce::TextButton::textColourOffId,
        step == activeStep ? juce::Colour(0xfff6f5e8) : juce::Colour(green));
      button->setColour(juce::TextButton::buttonColourId,
        step == activeStep ? juce::Colour(0xff347946) : juce::Colour(panel));
    }
  }
}

void Salaryman1999AudioProcessorEditor::choosePreset(int preset) {
  processor_.applyPreset(preset);
}

void Salaryman1999AudioProcessorEditor::exportProject() {
  fileChooser_ = std::make_unique<juce::FileChooser>("Export 1999 project", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory), "*.1999.json");
  fileChooser_->launchAsync(juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles,
    [this](const juce::FileChooser& chooser) {
      const auto file = chooser.getResult();
      if (file == juce::File())
        return;
      auto destination = file;
      if (!destination.hasFileExtension("json"))
        destination = destination.withFileExtension("1999.json");
      destination.replaceWithText(processor_.exportProjectJson());
    });
}

void Salaryman1999AudioProcessorEditor::importProject() {
  fileChooser_ = std::make_unique<juce::FileChooser>("Import 1999 project", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory), "*.json");
  fileChooser_->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
    [this](const juce::FileChooser& chooser) {
      const auto file = chooser.getResult();
      if (file == juce::File())
        return;
      if (file.getSize() > 256 * 1024 || !processor_.importProjectJson(file.loadFileAsString()))
        juce::AlertWindow::showMessageBoxAsync(juce::MessageBoxIconType::WarningIcon, "1999", "That file is not a supported 1999 project.");
    });
}
