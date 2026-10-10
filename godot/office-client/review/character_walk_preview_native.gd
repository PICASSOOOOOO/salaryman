extends "res://main.gd"
## Review-only player walkthrough inside the production Tower shell.

const REVIEW_CAMERA_DISTANCE := 13.0
const SALARYMAN_REVIEW_TEXTURE := preload("res://review/colormap-salaryman-tour-review.png")

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
	_build_static_furniture()
	_keep_only_lobby_area()
	_add_lobby_reception_desk()

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
	_apply_salaryman_review_texture()
	_actor.visual_root.scale = Vector3.ONE * 3.0
	# Start near reception in the real first-floor lobby, rather than at an
	# unrelated F06 business-suite entrance.
	_actor.global_position = _pygame_to_world(2700, 2200, "lobby")
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


func _keep_only_lobby_area() -> void:
	# Keep the actual first-floor lobby, its approved furniture, and the adjacent
	# hallway floor; discard unrelated Tower floors from the shared builder.
	for child in world_root.get_children():
		var node_name := str(child.name)
		if (
			node_name.begins_with("lobby")
			or node_name.begins_with("Lobby")
			or node_name == "recreationHallwayFloor0"
			or node_name in ["BridgeObjects", "AutomationCharacters", "BasementPestsAndCrew"]
		):
			continue
		world_root.remove_child(child)
		child.queue_free()


func _add_lobby_reception_desk() -> void:
	# Match the established lobby reception position used by the service-object
	# tests; the live bridge normally supplies this object at runtime.
	var reception := OfficeProp.create("desk", true)
	reception.name = "ReviewLobbyReceptionDesk"
	reception.position = _pygame_to_world(1900, 2200, "lobby")
	world_root.add_child(reception)


func _apply_salaryman_review_texture() -> void:
	# This atlas override belongs only to the review actor. The production player
	# and NPC roster continue to use the approved source texture until the user
	# approves the appearance.
	if _actor.visual_root == null:
		return
	for node in _actor.visual_root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		if mesh_instance.name == "body-mesh":
			var suit := StandardMaterial3D.new()
			suit.albedo_color = Color("#26384e")
			suit.roughness = 0.88
			for surface_index in range(mesh_instance.mesh.get_surface_count()):
				mesh_instance.set_surface_override_material(surface_index, suit)
			continue
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			var source := mesh_instance.get_active_material(surface_index)
			var material := source.duplicate() as StandardMaterial3D if source is StandardMaterial3D else StandardMaterial3D.new()
			material.albedo_texture = SALARYMAN_REVIEW_TEXTURE
			material.albedo_color = Color.WHITE
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			mesh_instance.set_surface_override_material(surface_index, material)
	_add_review_salaryman_details()


func _add_review_salaryman_details() -> void:
	var tie := MeshInstance3D.new()
	tie.name = "ReviewBurgundyTie"
	var tie_shape := BoxMesh.new()
	tie_shape.size = Vector3(0.045, 0.15, 0.012)
	tie.mesh = tie_shape
	var tie_material := StandardMaterial3D.new()
	tie_material.albedo_color = Color("#963942")
	tie_material.roughness = 0.72
	tie.material_override = tie_material
	tie.position = Vector3(0.0, 0.27, 0.16)
	_actor.visual_root.add_child(tie)

	var case := MeshInstance3D.new()
	case.name = "ReviewLeatherBriefcase"
	var case_shape := BoxMesh.new()
	case_shape.size = Vector3(0.16, 0.12, 0.055)
	case.mesh = case_shape
	var leather := StandardMaterial3D.new()
	leather.albedo_color = Color("#473629")
	leather.roughness = 0.76
	case.material_override = leather
	case.position = Vector3(-0.41, 0.12, 0.0)
	_actor.visual_root.add_child(case)

	var handle := MeshInstance3D.new()
	handle.name = "ReviewBriefcaseHandle"
	var handle_shape := BoxMesh.new()
	handle_shape.size = Vector3(0.075, 0.018, 0.014)
	handle.mesh = handle_shape
	handle.material_override = leather
	handle.position = Vector3(-0.41, 0.19, 0.0)
	_actor.visual_root.add_child(handle)


func _add_review_labels() -> void:
	var layer := CanvasLayer.new()
	layer.name = "PreviewControls"
	layer.layer = 1
	add_child(layer)

	var title := Label.new()
	title.text = "SHADOW TOWER  /  FLOOR 01 LOBBY"
	title.position = Vector2(28.0, 18.0)
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color("#f0e3c7"))
	layer.add_child(title)

	if _clip_mode in ["idle", "walk"]:
		var clip_label := Label.new()
		clip_label.text = "LOBBY / %s  ·  APPEARANCE NOT APPROVED" % _clip_mode.to_upper()
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
	# the clip ends so both locomotion and the return to idle are visible. Walk
	# south into the clear lobby floor, away from the reception lamp.
	if _frame_count == 24:
		_set_review_key(KEY_S, true)
	elif _frame_count == 48:
		_set_review_key(KEY_S, false)


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
	_review_camera.size = 12.0
	_review_camera.position = target + Vector3(0.72, 0.95, 0.72).normalized() * distance
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
