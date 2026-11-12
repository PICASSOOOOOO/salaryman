cmake_minimum_required(VERSION 3.22)
project(SALARYMAN1999 VERSION 1.0.0 LANGUAGES C CXX)

include(FetchContent)

set(JUCE_BUILD_EXTRAS OFF CACHE BOOL "" FORCE)
set(JUCE_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(JUCE_ENABLE_MODULE_SOURCE_GROUPS OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
  JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG 8.0.17-security
  GIT_SHALLOW TRUE
  GIT_PROGRESS TRUE
)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(SALARYMAN1999
  COMPANY_NAME "Picasso AI"
  BUNDLE_ID "ai.picasso.salaryman.1999"
  PLUGIN_MANUFACTURER_CODE Slry
  PLUGIN_CODE N199
  PRODUCT_NAME "1999"
  DESCRIPTION "1999 workstation"
  FORMATS VST3
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  COPY_PLUGIN_AFTER_BUILD FALSE
)

target_sources(SALARYMAN1999 PRIVATE
  src/PluginProcessor.cpp
  src/PluginEditor.cpp
)

target_compile_features(SALARYMAN1999 PRIVATE cxx_std_17)
target_compile_definitions(SALARYMAN1999 PUBLIC
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
)
target_link_libraries(SALARYMAN1999 PRIVATE
  juce::juce_audio_utils
  juce::juce_dsp
  PUBLIC
  juce::juce_recommended_config_flags
  juce::juce_recommended_lto_flags
  juce::juce_recommended_warning_flags
)
