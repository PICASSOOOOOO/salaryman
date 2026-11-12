extends Control

const SAMPLE_RATE := 22050
const TRACK_NAMES := ["DRUMS", "PULSE", "GLASS", "SUB", "FM", "LEAD", "TAPE", "AIR"]
const MACHINE_IDS := [
	"op1", "sp404mkii", "mpc_sample", "korg_ms2000r", "korg_m1",
	"boss_ce2", "fm1", "smk37", "minimoog",
]
const MACHINE_NAMES := [
	"OP-1", "SP-404MKII", "MPC", "MS-2000R", "M1",
	"CE-2", "FM-1", "SMK-37", "MINIMOOG",
]
const DEFAULT_PATTERNS := [
	[100, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0],
	[0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0],
	[0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100, 0],
	[100, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0],
	[0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 100, 0],
	[0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0],
	[0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 100, 0],
]
const DEFAULT_FX := {
	"enabled": false,
	"input": 100,
	"output": 100,
	"mix": 100,
	"filter": 50,
	"bits": 16,
	"rate": 48000,
	"drive": 0,
	"alias": 50,
	"noise": 0,
	"drunk": 0,
	"character": 0,
	"bassBoost": false,
	"bassFrequency": 120,
	"stereoMode": "stereo",
}
const PRESET_FX := [
	{"enabled": false, "input": 100, "output": 100, "mix": 100, "filter": 50, "bits": 16, "rate": 48000, "drive": 0, "alias": 50, "noise": 0, "drunk": 0, "character": 0, "bassBoost": false, "bassFrequency": 120, "stereoMode": "stereo"},
	{"enabled": true, "input": 100, "output": 100, "mix": 78, "filter": 43, "bits": 12, "rate": 24000, "drive": 12, "alias": 42, "noise": 8, "drunk": 0, "character": 18, "bassBoost": true, "bassFrequency": 90, "stereoMode": "stereo"},
	{"enabled": true, "input": 100, "output": 100, "mix": 90, "filter": 48, "bits": 8, "rate": 12000, "drive": 38, "alias": 82, "noise": 0, "drunk": 0, "character": 24, "bassBoost": false, "bassFrequency": 120, "stereoMode": "stereo"},
	{"enabled": true, "input": 100, "output": 100, "mix": 72, "filter": 50, "bits": 12, "rate": 22000, "drive": 0, "alias": 58, "noise": 5, "drunk": 46, "character": 10, "bassBoost": false, "bassFrequency": 120, "stereoMode": "stereo"},
]

var project: Dictionary = {}
var station_location := ""
var is_playing := false
var is_recording := false
var active_step := -1
var samples_until_step := 0.0
var sample_clock := 0
var voice_phases: Array[float] = []
var voice_frequencies: Array[float] = []
var voice_envelopes: Array[float] = []
var voice_velocities: Array[float] = []
var step_buttons: Array[Array] = []
var track_labels: Array[Label] = []
var machine_selectors: Array[OptionButton] = []
var playback: AudioStreamGeneratorPlayback
var audio_player: AudioStreamPlayer
var recorded_samples := PackedVector2Array()
var last_take_path := ""
var lowpass_state := 0.0
var bass_state := 0.0
var held_sample := 0.0
var current_step_label: Label
var status_label: Label
var play_button: Button
var record_button: Button
var bpm_input: SpinBox
var preset_selector: OptionButton
var key_selector: OptionButton
var meter_selector: OptionButton


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	_build_panel()
	_setup_audio()
	project = _default_project()
	_load_local_project()
	_refresh_controls()
	set_process(true)


func _exit_tree() -> void:
	if audio_player != null:
		audio_player.stop()
	recorded_samples.clear()


func set_station_open(open: bool, location: String) -> void:
	station_location = location
	visible = open
	if open:
		_update_location_label()
	elif is_playing:
		_set_playing(false)
		if is_recording:
			_finish_recording()


func toggle_play() -> void:
	_set_playing(not is_playing)


func toggle_record() -> void:
	if is_recording:
		_finish_recording()
		return
	recorded_samples.clear()
	is_recording = true
	if not is_playing:
		_set_playing(true)
	record_button.text = "STOP TAPE"
	_set_status("RECORDING MIX")


func save_project_dialog() -> void:
	_show_file_dialog(FileDialog.FILE_MODE_SAVE_FILE, "*.json ; 1999 project", _save_project_file)


func load_project_dialog() -> void:
	_show_file_dialog(FileDialog.FILE_MODE_OPEN_FILE, "*.json ; 1999 project", _load_project_file)


func export_take_dialog() -> void:
	if last_take_path.is_empty() or not FileAccess.file_exists(last_take_path):
		_set_status("NO RECORDED TAKE")
		return
	_show_file_dialog(FileDialog.FILE_MODE_SAVE_FILE, "*.wav ; WAV audio", _copy_take_file)


func _build_panel() -> void:
	var panel := Panel.new()
	panel.name = "1999Workstation"
	panel.position = Vector2(62, 72)
	panel.size = Vector2(1056, 572)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color("#070b08")
	panel_style.border_color = Color("#41884f")
	panel_style.set_border_width_all(2)
	panel_style.set_corner_radius_all(3)
	panel.add_theme_stylebox_override("panel", panel_style)
	add_child(panel)

	var content := MarginContainer.new()
	content.add_theme_constant_override("margin_left", 20)
	content.add_theme_constant_override("margin_right", 20)
	content.add_theme_constant_override("margin_top", 14)
	content.add_theme_constant_override("margin_bottom", 12)
	panel.add_child(content)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	content.add_child(column)

	var heading := HBoxContainer.new()
	column.add_child(heading)
	var title := Label.new()
	title.text = "1999  /  MUSIC WORKSTATION"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color("#73df85"))
	heading.add_child(title)
	current_step_label = Label.new()
	current_step_label.text = "STEP  —"
	current_step_label.add_theme_color_override("font_color", Color("#d6dfd2"))
	heading.add_child(current_step_label)

	var location := Label.new()
	location.name = "StationLocation"
	location.add_theme_font_size_override("font_size", 11)
	location.add_theme_color_override("font_color", Color("#96a292"))
	column.add_child(location)

	var controls := HBoxContainer.new()
	controls.add_theme_constant_override("separation", 8)
	column.add_child(controls)
	play_button = _make_button("PLAY")
	play_button.pressed.connect(toggle_play)
	controls.add_child(play_button)
	record_button = _make_button("TAPE REC")
	record_button.pressed.connect(toggle_record)
	controls.add_child(record_button)
	var bpm_label := Label.new()
	bpm_label.text = "BPM"
	bpm_label.add_theme_color_override("font_color", Color("#d6dfd2"))
	controls.add_child(bpm_label)
	bpm_input = SpinBox.new()
	bpm_input.min_value = 40
	bpm_input.max_value = 240
	bpm_input.step = 1
	bpm_input.custom_minimum_size = Vector2(92, 30)
	bpm_input.value_changed.connect(_on_bpm_changed)
	controls.add_child(bpm_input)
	preset_selector = OptionButton.new()
	preset_selector.add_item("CUSTOM")
	preset_selector.add_item("CLEAN")
	preset_selector.add_item("DUST")
	preset_selector.add_item("CRUSH")
	preset_selector.add_item("WOBBLE")
	preset_selector.item_selected.connect(_on_preset_selected)
	preset_selector.custom_minimum_size = Vector2(110, 30)
	controls.add_child(preset_selector)
	key_selector = OptionButton.new()
	for key in ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]:
		key_selector.add_item(key)
	key_selector.item_selected.connect(_on_key_selected)
	key_selector.custom_minimum_size = Vector2(62, 30)
	controls.add_child(key_selector)
	meter_selector = OptionButton.new()
	for meter in ["4/4", "3/4", "6/8"]:
		meter_selector.add_item(meter)
	meter_selector.item_selected.connect(_on_meter_selected)
	meter_selector.custom_minimum_size = Vector2(68, 30)
	controls.add_child(meter_selector)
	var save_button := _make_button("SAVE JSON")
	save_button.pressed.connect(save_project_dialog)
	controls.add_child(save_button)
	var load_button := _make_button("LOAD JSON")
	load_button.pressed.connect(load_project_dialog)
	controls.add_child(load_button)
	var export_button := _make_button("EXPORT TAKE")
	export_button.pressed.connect(export_take_dialog)
	controls.add_child(export_button)

	var grid := GridContainer.new()
	grid.name = "StepGrid"
	grid.columns = 18
	grid.add_theme_constant_override("h_separation", 3)
	grid.add_theme_constant_override("v_separation", 4)
	column.add_child(grid)
	_add_grid_header(grid, "TRACK")
	_add_grid_header(grid, "MACHINE")
	for step in range(16):
		_add_grid_header(grid, str(step + 1).pad_zeros(2))
	for track in range(8):
		var track_label := Label.new()
		track_label.text = TRACK_NAMES[track]
		track_label.custom_minimum_size = Vector2(74, 26)
		track_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		track_label.add_theme_font_size_override("font_size", 11)
		track_label.add_theme_color_override("font_color", Color("#d6dfd2"))
		track_labels.append(track_label)
		grid.add_child(track_label)

		var machine := OptionButton.new()
		machine.custom_minimum_size = Vector2(128, 26)
		machine.add_theme_font_size_override("font_size", 10)
		for machine_name in MACHINE_NAMES:
			machine.add_item(machine_name)
		machine.item_selected.connect(_on_machine_selected.bind(track))
		machine_selectors.append(machine)
		grid.add_child(machine)

		var row: Array[Button] = []
		for step in range(16):
			var cell := Button.new()
			cell.toggle_mode = true
			cell.text = "•"
			cell.custom_minimum_size = Vector2(32, 26)
			cell.add_theme_font_size_override("font_size", 12)
			cell.add_theme_color_override("font_color", Color("#6c8270"))
			cell.add_theme_color_override("font_hover_color", Color("#e7f0e4"))
			cell.add_theme_stylebox_override("normal", _cell_style(false))
			cell.add_theme_stylebox_override("pressed", _cell_style(true))
			cell.toggled.connect(_on_step_toggled.bind(track, step))
			row.append(cell)
			grid.add_child(cell)
		step_buttons.append(row)

	var footer := HBoxContainer.new()
	footer.add_theme_constant_override("separation", 12)
	column.add_child(footer)
	status_label = Label.new()
	status_label.text = "READY"
	status_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	status_label.add_theme_color_override("font_color", Color("#73df85"))
	footer.add_child(status_label)
	var controls_hint := Label.new()
	controls_hint.text = "1 PLAY  ·  2 REC  ·  3 SAVE  ·  4 LOAD  ·  5 WAV  ·  ESC CLOSE"
	controls_hint.add_theme_font_size_override("font_size", 10)
	controls_hint.add_theme_color_override("font_color", Color("#96a292"))
	footer.add_child(controls_hint)


func _setup_audio() -> void:
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = SAMPLE_RATE
	stream.buffer_length = 0.16
	audio_player = AudioStreamPlayer.new()
	audio_player.name = "1999Audio"
	audio_player.stream = stream
	add_child(audio_player)
	audio_player.play()
	playback = audio_player.get_stream_playback() as AudioStreamGeneratorPlayback
	for track in range(8):
		voice_phases.append(0.0)
		voice_frequencies.append(110.0)
		voice_envelopes.append(0.0)
		voice_velocities.append(0.0)


func _process(_delta: float) -> void:
	if playback == null:
		return
	var frames := mini(playback.get_frames_available(), 1024)
	if frames <= 0:
		return
	var output := PackedVector2Array()
	output.resize(frames)
	for frame in range(frames):
		if is_playing:
			_advance_sequencer()
		var dry := _render_voices()
		var mixed := _apply_master_fx(dry)
		output[frame] = Vector2(mixed, mixed)
		if is_recording and recorded_samples.size() < SAMPLE_RATE * 90:
			recorded_samples.append(output[frame])
		sample_clock += 1
	playback.push_buffer(output)


func _advance_sequencer() -> void:
	samples_until_step -= 1.0
	if samples_until_step > 0.0:
		return
	active_step = (active_step + 1) % 16
	var tracks: Array = project.get("tracks", [])
	for track in range(mini(8, tracks.size())):
		var row: Dictionary = tracks[track]
		if str(row.get("kind", "instrument")) == "recording":
			continue
		var steps: Array = row.get("steps", [])
		if active_step >= steps.size():
			continue
		var velocity := int(steps[active_step])
		if velocity > 0:
			_trigger_voice(track, velocity, str(row.get("machineId", "op1")))
	samples_until_step += SAMPLE_RATE * 60.0 / float(project.get("bpm", 92)) / 4.0
	if current_step_label != null:
		current_step_label.text = "STEP  %02d" % (active_step + 1)
	_update_step_highlight()


func _trigger_voice(track: int, velocity: int, machine_id: String) -> void:
	var note := 36 + track * 4 + (active_step % 5)
	if machine_id == "mpc_sample" or machine_id == "sp404mkii":
		note = [36, 38, 42, 46][track % 4]
	voice_frequencies[track] = 440.0 * pow(2.0, float(note - 69) / 12.0)
	voice_phases[track] = 0.0
	voice_envelopes[track] = 1.0
	voice_velocities[track] = float(clampi(velocity, 1, 127)) / 127.0


func _render_voices() -> float:
	var sample := 0.0
	var tracks: Array = project.get("tracks", [])
	for track in range(mini(8, tracks.size())):
		if str(tracks[track].get("kind", "instrument")) == "recording":
			continue
		var envelope := voice_envelopes[track]
		if envelope <= 0.0001:
			continue
		var phase := voice_phases[track]
		var machine_id := str(tracks[track].get("machineId", "op1"))
		var wave := sin(phase)
		if machine_id == "fm1" or machine_id == "smk37":
			wave = (1.0 if sin(phase) >= 0.0 else -1.0) * 0.55 + sin(phase * 2.0) * 0.35
		elif machine_id == "mpc_sample" or machine_id == "sp404mkii":
			wave = sin(phase) * 0.78 + sin(phase * 2.01) * 0.22
		elif machine_id == "korg_m1" or machine_id == "minimoog":
			wave = sin(phase) * 0.7 + sin(phase * 2.0) * 0.2 + sin(phase * 3.0) * 0.1
		sample += wave * envelope * voice_velocities[track] * 0.13
		voice_phases[track] = fposmod(phase + TAU * voice_frequencies[track] / SAMPLE_RATE, TAU)
		var decay := 0.9993 if track == 0 else 0.99982
		voice_envelopes[track] = envelope * decay
	return sample


func _apply_master_fx(dry: float) -> float:
	var fx: Dictionary = project.get("lofiFx", DEFAULT_FX)
	var input_gain := float(fx.get("input", 100)) / 100.0
	var output_gain := float(fx.get("output", 100)) / 100.0
	var processed_signal := dry * input_gain
	if bool(fx.get("enabled", false)):
		var drive := float(fx.get("drive", 0)) / 100.0
		var processed := tanh(processed_signal * (1.0 + drive * 8.0))
		var filter_amount := float(fx.get("filter", 50)) / 100.0
		var cutoff := 450.0 + pow(filter_amount, 2.2) * 19000.0
		var coefficient := 1.0 - exp(-TAU * cutoff / SAMPLE_RATE)
		lowpass_state += coefficient * (processed - lowpass_state)
		processed = lowpass_state
		var bass_frequency := float(fx.get("bassFrequency", 120))
		bass_state += (1.0 - exp(-TAU * bass_frequency / SAMPLE_RATE)) * (processed - bass_state)
		if bool(fx.get("bassBoost", false)):
			processed += bass_state * 0.9
		var alias := float(fx.get("alias", 50)) / 100.0
		if alias > 0.0:
			var hold_frames := maxi(1, int(SAMPLE_RATE / float(fx.get("rate", 48000)) * (1.0 + alias * 3.0)))
			if sample_clock % hold_frames == 0:
				held_sample = processed
			processed = held_sample
		var bits := clampi(int(fx.get("bits", 16)), 4, 16)
		var quantization := pow(2.0, bits - 1)
		processed = round(processed * quantization) / quantization
		processed_signal = lerp(processed_signal, processed, float(fx.get("mix", 100)) / 100.0)
	return clampf(processed_signal * output_gain, -1.0, 1.0)


func _set_playing(playing: bool) -> void:
	is_playing = playing
	if playing:
		samples_until_step = 0.0
		play_button.text = "STOP"
		_set_status("PLAYING")
	else:
		play_button.text = "PLAY"
		if not is_recording:
			_set_status("READY")


func _finish_recording() -> void:
	is_recording = false
	record_button.text = "TAPE REC"
	_set_playing(false)
	if recorded_samples.is_empty():
		_set_status("EMPTY TAKE")
		return
	last_take_path = "user://1999-last-take.wav"
	var file := FileAccess.open(last_take_path, FileAccess.WRITE)
	if file == null:
		_set_status("TAKE SAVE FAILED")
		return
	file.store_buffer(_wav_bytes(recorded_samples))
	file.close()
	_set_status("TAKE READY  ·  %d FRAMES" % recorded_samples.size())


func _wav_bytes(samples: PackedVector2Array) -> PackedByteArray:
	var data_size := samples.size() * 4
	var wav := PackedByteArray()
	wav.resize(44 + data_size)
	wav.encode_u8(0, 82)
	wav.encode_u8(1, 73)
	wav.encode_u8(2, 70)
	wav.encode_u8(3, 70)
	wav.encode_u32(4, 36 + data_size)
	wav.encode_u8(8, 87)
	wav.encode_u8(9, 65)
	wav.encode_u8(10, 86)
	wav.encode_u8(11, 69)
	wav.encode_u8(12, 102)
	wav.encode_u8(13, 109)
	wav.encode_u8(14, 116)
	wav.encode_u8(15, 32)
	wav.encode_u32(16, 16)
	wav.encode_u16(20, 1)
	wav.encode_u16(22, 2)
	wav.encode_u32(24, SAMPLE_RATE)
	wav.encode_u32(28, SAMPLE_RATE * 4)
	wav.encode_u16(32, 4)
	wav.encode_u16(34, 16)
	wav.encode_u8(36, 100)
	wav.encode_u8(37, 97)
	wav.encode_u8(38, 116)
	wav.encode_u8(39, 97)
	wav.encode_u32(40, data_size)
	for index in range(samples.size()):
		var left := int(round(clampf(samples[index].x, -1.0, 1.0) * 32767.0))
		var right := int(round(clampf(samples[index].y, -1.0, 1.0) * 32767.0))
		wav.encode_s16(44 + index * 4, left)
		wav.encode_s16(46 + index * 4, right)
	return wav


func _default_project() -> Dictionary:
	var tracks: Array[Dictionary] = []
	for track in range(8):
		tracks.append({
			"id": "trk-%d" % (track + 1),
			"name": TRACK_NAMES[track],
			"kind": "instrument",
			"machineId": MACHINE_IDS[(track + 2) % MACHINE_IDS.size()],
			"steps": DEFAULT_PATTERNS[track].duplicate(),
			"audioTrackId": null,
			"muted": false,
			"volume": 72,
			"soundState": {"tone": 68, "decayMs": 260},
		})
	return {
		"schemaVersion": 1,
		"name": "1999 in-game session",
		"bpm": 92,
		"key": "C",
		"timeSignature": "4/4",
		"tracks": tracks,
		"emulatorState": {"firmwareIds": {}, "patchSaves": {}},
		"lofiFx": DEFAULT_FX.duplicate(true),
	}


func _serialized_project() -> Dictionary:
	var result := project.duplicate(true)
	result["schemaVersion"] = 1
	result["bpm"] = int(bpm_input.value)
	result["tracks"] = project.get("tracks", []).duplicate(true)
	result["lofiFx"] = project.get("lofiFx", DEFAULT_FX).duplicate(true)
	result["key"] = key_selector.get_item_text(key_selector.selected)
	result["timeSignature"] = meter_selector.get_item_text(meter_selector.selected)
	return result


func _load_local_project() -> void:
	var path := "user://1999-session.json"
	if FileAccess.file_exists(path):
		var candidate: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		_apply_loaded_project(candidate, false)


func _save_local_project() -> void:
	var file := FileAccess.open("user://1999-session.json", FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(_serialized_project(), "\t"))
		file.close()


func _apply_loaded_project(candidate: Variant, report: bool = true) -> bool:
	if not candidate is Dictionary or int(candidate.get("schemaVersion", 0)) != 1:
		if report:
			_set_status("UNSUPPORTED PROJECT")
		return false
	var project_name := str(candidate.get("name", "")).strip_edges()
	var bpm := int(candidate.get("bpm", 0))
	var incoming: Variant = candidate.get("tracks", [])
	var fx: Variant = candidate.get("lofiFx", {})
	if project_name.is_empty() or project_name.length() > 80 or bpm < 40 or bpm > 240 \
		or not incoming is Array or incoming.size() > 8 or not fx is Dictionary:
		if report:
			_set_status("INVALID PROJECT")
		return false
	var next_project: Dictionary = candidate.duplicate(true)
	var next_tracks: Array[Dictionary] = []
	for row_value in incoming:
		if not row_value is Dictionary:
			if report:
				_set_status("INVALID TRACK")
			return false
		var row: Dictionary = row_value
		var steps: Variant = row.get("steps", [])
		if str(row.get("kind", "")) not in ["instrument", "recording"] \
			or not steps is Array or steps.size() != 16 \
			or not MACHINE_IDS.has(str(row.get("machineId", ""))):
			if report:
				_set_status("INVALID TRACK")
			return false
		for velocity in steps:
			if not (velocity is int) or velocity < 0 or velocity > 127:
				if report:
					_set_status("INVALID PATTERN")
				return false
		next_tracks.append(row.duplicate(true))
	for index in range(next_tracks.size(), 8):
		next_tracks.append(_default_project()["tracks"][index])
	next_project["tracks"] = next_tracks
	project = next_project
	_refresh_controls()
	_save_local_project()
	if report:
		_set_status("PROJECT LOADED")
	return true


func _show_file_dialog(mode: FileDialog.FileMode, filter: String, callback: Callable) -> void:
	var dialog := FileDialog.new()
	dialog.file_mode = mode
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.add_filter(filter)
	dialog.file_selected.connect(func(path: String) -> void:
		callback.call(path)
		dialog.queue_free()
	)
	dialog.canceled.connect(func() -> void: dialog.queue_free())
	add_child(dialog)
	dialog.popup_centered(Vector2i(720, 500))


func _save_project_file(path: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		_set_status("PROJECT SAVE FAILED")
		return
	file.store_string(JSON.stringify(_serialized_project(), "\t"))
	file.close()
	_set_status("PROJECT EXPORTED")


func _load_project_file(path: String) -> void:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		_set_status("PROJECT LOAD FAILED")
		return
	var candidate: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	_apply_loaded_project(candidate)


func _copy_take_file(path: String) -> void:
	var bytes := FileAccess.get_file_as_bytes(last_take_path)
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		_set_status("TAKE EXPORT FAILED")
		return
	file.store_buffer(bytes)
	file.close()
	_set_status("WAV EXPORTED")


func _refresh_controls() -> void:
	if project.is_empty():
		return
	bpm_input.set_value_no_signal(int(project.get("bpm", 92)))
	key_selector.select(0)
	meter_selector.select(0)
	var key := str(project.get("key", "C"))
	for index in range(key_selector.get_item_count()):
		if key_selector.get_item_text(index) == key:
			key_selector.select(index)
	var meter := str(project.get("timeSignature", "4/4"))
	for index in range(meter_selector.get_item_count()):
		if meter_selector.get_item_text(index) == meter:
			meter_selector.select(index)
	var fx: Dictionary = project.get("lofiFx", DEFAULT_FX)
	var matching_preset := -1
	for index in range(PRESET_FX.size()):
		if fx == PRESET_FX[index]:
			matching_preset = index + 1
			break
	preset_selector.select(matching_preset if matching_preset >= 0 else 0)
	var tracks: Array = project.get("tracks", [])
	for track in range(mini(8, tracks.size())):
		var row: Dictionary = tracks[track]
		var is_recording_track := str(row.get("kind", "instrument")) == "recording"
		track_labels[track].text = "REC %02d" % (track + 1) if is_recording_track else str(row.get("name", TRACK_NAMES[track]))
		track_labels[track].add_theme_color_override(
			"font_color", Color("#d9b783") if is_recording_track else Color("#d6dfd2")
		)
		machine_selectors[track].disabled = is_recording_track
		var machine_index := MACHINE_IDS.find(str(row.get("machineId", MACHINE_IDS[0])))
		machine_selectors[track].select(maxi(0, machine_index))
		var steps: Array = row.get("steps", [])
		for step in range(16):
			var cell := step_buttons[track][step] as Button
			cell.disabled = is_recording_track
			cell.set_pressed_no_signal(step < steps.size() and int(steps[step]) > 0)
			cell.add_theme_color_override("font_color", Color("#d7f0d1") if cell.button_pressed else Color("#6c8270"))
	_update_location_label()


func _update_location_label() -> void:
	var label := get_node_or_null("1999Workstation/MarginContainer/VBoxContainer/StationLocation") as Label
	if label != null:
		label.text = station_location


func _on_step_toggled(enabled: bool, track: int, step: int) -> void:
	var tracks: Array = project.get("tracks", [])
	if track < 0 or track >= tracks.size() or not tracks[track] is Dictionary \
		or str(tracks[track].get("kind", "instrument")) == "recording":
		return
	project["tracks"][track]["steps"][step] = 100 if enabled else 0
	step_buttons[track][step].add_theme_color_override(
		"font_color", Color("#d7f0d1") if enabled else Color("#6c8270")
	)
	_save_local_project()


func _on_machine_selected(index: int, track: int) -> void:
	var tracks: Array = project.get("tracks", [])
	if track < 0 or track >= tracks.size() or not tracks[track] is Dictionary \
		or str(tracks[track].get("kind", "instrument")) == "recording" \
		or index < 0 or index >= MACHINE_IDS.size():
		return
	project["tracks"][track]["machineId"] = MACHINE_IDS[index]
	_save_local_project()


func _on_bpm_changed(value: float) -> void:
	if project.is_empty():
		return
	project["bpm"] = int(value)
	_save_local_project()


func _on_key_selected(index: int) -> void:
	project["key"] = key_selector.get_item_text(index)
	_save_local_project()


func _on_meter_selected(index: int) -> void:
	project["timeSignature"] = meter_selector.get_item_text(index)
	_save_local_project()


func _on_preset_selected(index: int) -> void:
	if index == 0:
		return
	project["lofiFx"] = PRESET_FX[index - 1].duplicate(true)
	_set_status("MASTER FX  ·  %s" % preset_selector.get_item_text(index))
	_save_local_project()


func _update_step_highlight() -> void:
	for row in step_buttons:
		for step in range(row.size()):
			var cell := row[step] as Button
			cell.add_theme_stylebox_override("normal", _cell_style(step == active_step and cell.button_pressed))
			cell.add_theme_color_override("font_color", Color("#f1f5e9") if step == active_step else (Color("#d7f0d1") if cell.button_pressed else Color("#6c8270")))


func _add_grid_header(grid: GridContainer, text: String) -> void:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.custom_minimum_size = Vector2(28, 20)
	label.add_theme_font_size_override("font_size", 9)
	label.add_theme_color_override("font_color", Color("#8aaa91"))
	grid.add_child(label)


func _make_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(86, 30)
	button.add_theme_font_size_override("font_size", 10)
	button.add_theme_color_override("font_color", Color("#e5eddf"))
	button.add_theme_color_override("font_hover_color", Color("#ffffff"))
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#132017")
	style.border_color = Color("#386343")
	style.set_border_width_all(1)
	style.set_corner_radius_all(2)
	button.add_theme_stylebox_override("normal", style)
	var hover := style.duplicate()
	hover.bg_color = Color("#1c3022")
	button.add_theme_stylebox_override("hover", hover)
	return button


func _cell_style(active: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#3f9852") if active else Color("#111a14")
	style.border_color = Color("#6ab878") if active else Color("#2c4932")
	style.set_border_width_all(1)
	style.set_corner_radius_all(2)
	return style


func _set_status(text: String) -> void:
	if status_label != null:
		status_label.text = text

