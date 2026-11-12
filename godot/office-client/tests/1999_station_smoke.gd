extends SceneTree

func _initialize() -> void:
	call_deferred("_run_smoke")


func _run_smoke() -> void:
	var station_script := load("res://nineteen_ninety_nine_station.gd")
	if station_script == null:
		push_error("1999 station script did not load")
		quit(1)
		return
	var station: Control = station_script.new()
	root.add_child(station)
	await process_frame
	station.set_station_open(true, "FLOOR 07 / MUSIC STUDIO")
	if not station.visible:
		push_error("Station did not open")
		quit(1)
		return

	var session: Dictionary = station._serialized_project()
	if int(session.get("schemaVersion", 0)) != 1 or session.get("tracks", []).size() != 8:
		push_error("Station did not create a schemaVersion 1 session")
		quit(1)
		return
	var valid_import := session.duplicate(true)
	valid_import["bpm"] = 123
	valid_import["tracks"][1]["kind"] = "recording"
	valid_import["tracks"][1]["machineId"] = "korg_m1"
	valid_import["tracks"][1]["steps"][0] = 9
	valid_import["tracks"][1]["audioTrackId"] = 44
	valid_import["tracks"][1]["loopBars"] = 2
	if not station._apply_loaded_project(valid_import, false) or int(station.project["bpm"]) != 123:
		push_error("Valid 1999 project did not import")
		quit(1)
		return
	station._on_step_toggled(true, 1, 0)
	station._on_machine_selected(0, 1)
	var saved_recording: Dictionary = station._serialized_project()["tracks"][1]
	if saved_recording.get("kind") != "recording" or saved_recording.get("machineId") != "korg_m1" \
		or saved_recording.get("steps", [])[0] != 9 or saved_recording.get("audioTrackId") != 44 \
		or saved_recording.get("loopBars") != 2:
		push_error("Recording track metadata was not preserved")
		quit(1)
		return
	var invalid_import := valid_import.duplicate(true)
	invalid_import["tracks"][0]["steps"] = [1]
	if station._apply_loaded_project(invalid_import, false) or int(station.project["bpm"]) != 123:
		push_error("Invalid project changed the active session")
		quit(1)
		return

	var wave: PackedByteArray = station._wav_bytes(PackedVector2Array([Vector2(0.25, -0.25)]))
	if wave.size() != 48 or wave.decode_u32(40) != 4:
		push_error("WAV export bytes are malformed")
		quit(1)
		return

	station.toggle_record()
	for frame in range(18):
		await process_frame
	station.toggle_record()
	if station.recorded_samples.is_empty() or not FileAccess.file_exists("user://1999-last-take.wav"):
		push_error("In-game recording did not produce a WAV take")
		quit(1)
		return
	station.free()
	quit(0)
