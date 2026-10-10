extends "res://main.gd"
## Review-only player walkthrough inside the production Tower shell.

const REVIEW_CAMERA_DISTANCE := 13.0

var _actor: PlayerController
var _review_camera: Camera3D
var _frame_count := 0
var _capture_path := ""
var _clip_mode := "interactive"
var _walk_key_down := false


func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture="):
			_capture_path = arg.trim_prefix("--capture=")
		elif arg.begins_with("--clip="):
			_clip_mode = arg.trim_prefix("--clip=")
	call_deferred("_build_preview")


func _build_preview() -> void:
	# These are the same builders and floor-plan data used by Main.tscn.
	_build_materials()
	_build_lighting()
	_build_building_shell()
	_keep_only_f06_office_area()

	var radio_station: Dictionary = floor_plan_data.get("playableFloors", {}).get("6", {})
	var radio_business: Dictionary = {}
	for business_value in radio_station.get("businesses", []):
		var business: Dictionary = business_value
		if str(business.get("businessKey", "")) == "radio_station":
			radio_business = business
			break
	var room_id := str(radio_business.get("officeRoom", ""))
	var office: Dictionary = {}
	for office_value in floor_plan_data.get("baseLayout", {}).get("offices", []):
		var office_data: Dictionary = office_value
		if str(office_data.get("id", "")) == room_id:
			office = office_data
			break
	var entrance: Array = office.get("entrance", [])
	if entrance.size() < 2:
		push_error("F06 radio station entrance is missing from floor_plan.json.")
		return

	_actor = PlayerController.new()
	_actor.name = "ReviewSalaryman"
	_actor.configure_character(load("res://agentshire-assets/characters/character-male-a.glb"))
	_actor.set_bridge_connected(true)
	world_root.add_child(_actor)
	if (
		_actor.animation_player == null
		or _actor.animation_player.get_animation_list().size() != 32
	):
		push_error("The production character must retain all 32 source animation clips.")
		return
	var door_x := float(entrance[0]) * WORLD_SCALE
	var door_z := float(entrance[1]) * WORLD_SCALE
	_actor.global_position = Vector3(door_x, PLAYER_GROUND_Y, door_z - 4.2)
	player_shadow = _add_character_shadow(_actor, 0.38)

	_review_camera = Camera3D.new()
	_review_camera.name = "FollowCamera"
	_review_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_review_camera.size = CAMERA_ORTHO_SIZE_BASE
	_review_camera.near = 0.05
	_review_camera.far = 120.0
	add_child(_review_camera)
	_review_camera.current = true
	_update_review_camera()
	_add_review_labels()


func _keep_only_f06_office_area() -> void:
	# The production builder creates all Tower floors together in shared world
	# coordinates. A character review should show the actual F06 office/concourse,
	# not overlaid geometry from unrelated floors.
	for child in world_root.get_children():
		var node_name := str(child.name)
		if (
			node_name.begins_with("executive")
			or node_name.begins_with("recreation")
			or node_name.begins_with("Floor06")
			or node_name == "BusinessSign_radio_station"
		):
			continue
		world_root.remove_child(child)
		child.queue_free()


func _add_review_labels() -> void:
	var layer := CanvasLayer.new()
	layer.name = "PreviewControls"
	layer.layer = 1
	add_child(layer)

	var title := Label.new()
	title.text = "TOWER F06  /  RADIO STATION  /  OFFICE 01"
	title.position = Vector2(28.0, 18.0)
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color("#f0e3c7"))
	layer.add_child(title)

	if _clip_mode in ["idle", "walk"]:
		var clip_label := Label.new()
		clip_label.text = (
			"PRODUCTION MODEL  ·  %s CLIP" % _clip_mode.to_upper()
		)
		clip_label.position = Vector2(28.0, 48.0)
		clip_label.add_theme_font_size_override("font_size", 16)
		clip_label.add_theme_color_override("font_color", Color("#f0e3c7"))
		layer.add_child(clip_label)

	var controls := Label.new()
	controls.text = "WASD MOVE   ·   SHIFT SPRINT   ·   ESC EXIT"
	controls.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	controls.position = Vector2(28.0, -44.0)
	controls.add_theme_font_size_override("font_size", 16)
	controls.add_theme_color_override("font_color", Color("#f0e3c7"))
	layer.add_child(controls)


func _process(delta: float) -> void:
	if _actor == null or not is_instance_valid(_actor):
		return
	_frame_count += 1
	if _clip_mode == "walk":
		_update_walk_clip_input()
	if Input.is_key_pressed(KEY_ESCAPE):
		get_tree().quit()
		return
	if not _capture_path.is_empty() and _frame_count == 18:
		call_deferred("_capture_frame")


func _update_walk_clip_input() -> void:
	# At 24 fps, begin walking after a short idle lead-in and release before
	# the clip ends so both locomotion and the return to idle are visible.
	if _frame_count == 24:
		_set_review_key(KEY_D, true)
	elif _frame_count == 78:
		_set_review_key(KEY_D, false)


func _set_review_key(key: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = key
	event.physical_keycode = key
	event.pressed = pressed
	Input.parse_input_event(event)
	_walk_key_down = pressed


func _update_review_camera() -> void:
	if _actor == null or _review_camera == null:
		return
	var target := _actor.global_position + Vector3(0.0, 0.2, 0.0)
	var distance := REVIEW_CAMERA_DISTANCE
	_review_camera.position = target + Vector3(distance * 0.72, distance * 1.02, distance * 0.72)
	_review_camera.look_at(target, Vector3.UP)


func _physics_process(_delta: float) -> void:
	if _actor == null or not is_instance_valid(_actor):
		return
	_update_review_camera()


func _capture_frame() -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var error := image.save_png(_capture_path)
	print("Character preview capture: %s (error %d)" % [_capture_path, error])
	get_tree().quit(0 if error == OK else 1)
