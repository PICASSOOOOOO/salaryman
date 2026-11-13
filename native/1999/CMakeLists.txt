cmake_minimum_required(VERSION 3.22)
project(SALARYMAN1999 VERSION 1.0.0 LANGUAGES C CXX)

include(FetchContent)
include(CTest)

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

juce_generate_juce_header(SALARYMAN1999)

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
  juce::juce_recommended_warning_flags
)

set(GEARMULATOR_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/gearmulator-md-mm")
if(NOT EXISTS "${GEARMULATOR_SOURCE_DIR}/source/elektron/md/mdLib/CMakeLists.txt")
  message(FATAL_ERROR
    "Gearmulator source is missing. Initialize the native/1999/third_party/gearmulator-md-mm submodule.")
endif()
foreach(required_submodule
    "source/dsp56300/source/CMakeLists.txt"
    "source/mc68k/CMakeLists.txt"
    "source/3rdparty/RmlUi/CMakeLists.txt"
    "source/3rdparty/freetype/CMakeLists.txt")
  if(NOT EXISTS "${GEARMULATOR_SOURCE_DIR}/${required_submodule}")
    message(FATAL_ERROR
      "Gearmulator dependency ${required_submodule} is missing. Run native/1999/build-linux.sh to initialize it.")
  endif()
endforeach()

# Gearmulator is a GPLv3 source dependency. Build only its shared emulator
# libraries; 1999 remains the sole VST3 target and supplies its own UI.
set(_1999_build_testing "${BUILD_TESTING}")
set(BUILD_TESTING OFF)
set(gearmulator_BUILD_JUCEPLUGIN OFF CACHE BOOL "" FORCE)
set(gearmulator_BUILD_JUCEPLUGIN_CLAP OFF CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_OSIRUS OFF CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_OSTIRUS OFF CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_VAVRA OFF CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_XENIA OFF CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_NODALRED2X OFF CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_JE8086 OFF CACHE BOOL "" FORCE)
set(gearmulator_SYNTH_ELEKTRON ON CACHE BOOL "" FORCE)
add_subdirectory("${GEARMULATOR_SOURCE_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/gearmulator" EXCLUDE_FROM_ALL)
set(BUILD_TESTING "${_1999_build_testing}")
target_link_libraries(SALARYMAN1999 PRIVATE mdLib)

add_custom_command(TARGET SALARYMAN1999_VST3 POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
    "${GEARMULATOR_SOURCE_DIR}/LICENSE.md"
    "$<TARGET_BUNDLE_DIR:SALARYMAN1999_VST3>/GEARMULATOR-GPL-3.0.md"
  COMMENT "Copying Gearmulator GPLv3 license into the 1999 VST3 bundle"
  VERBATIM
)

if(BUILD_TESTING)
  add_executable(1999_native_smoke tests/NativeSmoke.cpp)
  target_compile_features(1999_native_smoke PRIVATE cxx_std_17)
  target_include_directories(1999_native_smoke PRIVATE
    src
    "${CMAKE_CURRENT_BINARY_DIR}/SALARYMAN1999_artefacts/JuceLibraryCode"
    "${juce_SOURCE_DIR}/modules"
  )
  target_link_libraries(1999_native_smoke PRIVATE SALARYMAN1999)
  add_test(NAME 1999_native_smoke COMMAND 1999_native_smoke)
endif()
