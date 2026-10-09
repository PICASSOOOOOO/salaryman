extends Node3D
## Isolated, walkable review scene for the stylized salaryman character.
## Run with: godot --path godot/office-client res://review/character_walk_preview.tscn

const CHARACTER_SCENE := preload("res://review/realistic_salaryman_preview.glb")
const Prop := preload("res://office_prop.gd")
const Service := preload("res://office_service_prop.gd")

const MODEL_SCALE := 2.15
const WALK_SPEED := 2.2
const SPRINT_SPEED := 5.0
const REVIEW_WALK_DURATION := 0.9
const PIXEL_VIEW_SIZE := Vector2i(640, 360)
const CAMERA_DISTANCE := 8.5
const CAMERA_ORTHO_SIZE := 8.5

var _actor: CharacterBody3D
var _model: Node3D
var _animation_player: AnimationPlayer
var _camera: Camera3D
var _stage: Node3D
var _elapsed := 0.0
var _frame_count := 0
var _demo_mode := false
var _capture_path := ""


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	for arg in args:
		if arg == "--demo":
			_demo_mode = true
		elif arg.begins_with("--capture="):
			_capture_path = arg.trim_prefix("--capture=")
	call_deferred("_build_preview")


func _build_preview() -> void:
	var viewport_container := SubViewportContainer.new()
	viewport_container.name = "PixelGameView"
	viewport_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	viewport_container.stretch = true
	viewport_container.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var view_layer := CanvasLayer.new()
	view_layer.name = "PixelGameViewLayer"
	add_child(view_layer)
	view_layer.add_child(viewport_container)

	var game_viewport := SubViewport.new()
	game_viewport.name = "LowResolutionGameView"
	game_viewport.size = PIXEL_VIEW_SIZE
	game_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	game_viewport.transparent_bg = false
	viewport_container.add_child(game_viewport)

	_stage = Node3D.new()
	_stage.name = "CharacterWalkPreview"
	game_viewport.add_child(_stage)

	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("#c9bd9f")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("#e7d8ba")
	environment.environment.ambient_light_energy = 0.48
	_stage.add_child(environment)

	var sunlight := DirectionalLight3D.new()
	sunlight.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	sunlight.light_color = Color("#f4dfb7")
	sunlight.light_energy = 0.72
	sunlight.shadow_enabled = true
	_stage.add_child(sunlight)

	_build_office_stage(_stage)
	_actor = CharacterBody3D.new()
	_actor.name = "WalkableCharacter"
	_actor.motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	_actor.position = Vector3(0.0, 0.0, 1.5)
	_stage.add_child(_actor)
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.34
	capsule.height = 1.48
	var collision := CollisionShape3D.new()
	collision.shape = capsule
	collision.position.y = capsule.height * 0.5
	_actor.add_child(collision)

	_model = CHARACTER_SCENE.instantiate() as Node3D
	_model.name = "CharacterModel"
	_actor.add_child(_model)
	_animation_player = _configure_character(_model, Color("#252d33"))
	if (
		_animation_player == null
		or not _animation_player.has_animation("idle")
		or not _animation_player.has_animation("walk")
		or _animation_player.get_animation_list().size() != 32
	or not is_equal_approx(_animation_player.get_animation("walk").length, REVIEW_WALK_DURATION)
	):
		push_error("The realistic salaryman preview requires all 32 source animations, including idle and walk.")
	else:
		_animation_player.play("idle")
		_model.rotation.y = 0.0
	_add_review_npcs(_stage)

	_camera = Camera3D.new()
	_camera.name = "FollowCamera"
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = CAMERA_ORTHO_SIZE
	_camera.near = 0.1
	_camera.far = 60.0
	_stage.add_child(_camera)
	_camera.current = true
	_update_camera()
	_add_review_labels()


func _build_office_stage(parent: Node3D) -> void:
	var floor_body := StaticBody3D.new()
	floor_body.name = "F06OfficeFloor"
	parent.add_child(floor_body)
	var floor_shape := CollisionShape3D.new()
	var floor_collision := BoxShape3D.new()
	floor_collision.size = Vector3(12.0, 0.24, 12.0)
	floor_shape.shape = floor_collision
	floor_shape.position.y = -0.12
	floor_body.add_child(floor_shape)
	_add_box(parent, "WarmWoodFloor", Vector3(0, -0.12, 0), Vector3(12.0, 0.24, 12.0), "#785c42")
	_add_box(parent, "OfficeRug", Vector3(0.0, 0.012, 0.55), Vector3(7.0, 0.025, 4.4), "#705447")
	_add_box(parent, "RugBrassEdge", Vector3(0.0, 0.027, -1.61), Vector3(6.82, 0.018, 0.035), "#ad884e", 0.55)
	_add_box(parent, "RugBrassEdge", Vector3(0.0, 0.027, 2.71), Vector3(6.82, 0.018, 0.035), "#ad884e", 0.55)

	# Open-cutaway walls keep the room readable while matching the Tower's
	# green enamel, warm wood, and brass material language.
	_add_box(parent, "BackWallLeft", Vector3(-2.04, 1.42, -6.0), Vector3(7.92, 2.84, 0.24), "#35574a")
	_add_box(parent, "BackWallRight", Vector3(5.13, 1.42, -6.0), Vector3(1.74, 2.84, 0.24), "#35574a")
	_add_box(parent, "BackWallAboveDoor", Vector3(3.08, 2.60, -6.0), Vector3(2.32, 0.48, 0.24), "#35574a")
	_add_box(parent, "BackWallWoodWainscotLeft", Vector3(-2.04, 0.45, -5.86), Vector3(7.92, 0.9, 0.05), "#78523b")
	_add_box(parent, "BackWallWoodWainscotRight", Vector3(5.13, 0.45, -5.86), Vector3(1.74, 0.9, 0.05), "#78523b")
	_add_box(parent, "BackWallBrassRailLeft", Vector3(-2.04, 0.92, -5.82), Vector3(7.92, 0.045, 0.045), "#ad884e", 0.55)
	_add_box(parent, "BackWallBrassRailRight", Vector3(5.13, 0.92, -5.82), Vector3(1.74, 0.045, 0.045), "#ad884e", 0.55)
	_add_box(parent, "LeftWall", Vector3(-6.0, 1.42, 0.0), Vector3(0.24, 2.84, 12.0), "#35574a")
	_add_box(parent, "LeftWallWainscot", Vector3(-5.86, 0.45, 0.0), Vector3(0.05, 0.9, 11.8), "#78523b")
	_add_box(parent, "LeftWallBrassRail", Vector3(-5.82, 0.92, 0.0), Vector3(0.045, 0.045, 11.8), "#ad884e", 0.55)

	for window_x in [-4.65, -3.5, -2.35]:
		_add_window(parent, Vector3(window_x, 1.72, -5.84), Vector2(0.98, 1.16))
	_add_box(parent, "DoorFrameLeft", Vector3(2.0, 1.18, -5.78), Vector3(0.12, 2.36, 0.16), "#ad884e", 0.55)
	_add_box(parent, "DoorFrameRight", Vector3(4.2, 1.18, -5.78), Vector3(0.12, 2.36, 0.16), "#ad884e", 0.55)
	_add_box(parent, "DoorFrameTop", Vector3(3.1, 2.36, -5.78), Vector3(2.32, 0.12, 0.16), "#ad884e", 0.55)
	var door_pivot := Node3D.new()
	door_pivot.name = "OpenOfficeDoorHinge"
	door_pivot.position = Vector3(2.05, 0.0, -5.82)
	door_pivot.rotation.y = deg_to_rad(-24.0)
	parent.add_child(door_pivot)
	_add_box(door_pivot, "OpenWoodDoor", Vector3(1.03, 1.1, 0.0), Vector3(2.0, 2.2, 0.12), "#78523b")
	_add_box(door_pivot, "DoorInset", Vector3(1.03, 1.1, 0.07), Vector3(1.65, 1.83, 0.018), "#8a6445")
	_add_box(door_pivot, "DoorHandle", Vector3(1.76, 1.02, 0.1), Vector3(0.06, 0.14, 0.06), "#ad884e", 0.55)
	_add_label_3d(parent, "PABLO CORP  /  FLOOR 06", Vector3(0.0, 2.48, -5.78), 22, 0.0)
	_add_label_3d(parent, "RADIO STATION  ·  OPEN OFFICE", Vector3(0.0, 2.12, -5.78), 15, 0.0)

	_add_prop(parent, "library_shelf", Vector3(-4.72, 0.0, -3.7), 0.62)
	_add_prop(parent, "desk", Vector3(-2.55, 0.0, -2.55), 0.74)
	_add_prop(parent, "chair", Vector3(-2.55, 0.0, -1.30), 0.76)
	_add_prop(parent, "telephone", Vector3(-3.22, 0.0, -2.45), 0.48)
	_add_prop(parent, "desk_lamp", Vector3(-1.95, 0.0, -2.45), 0.60)
	_add_crt_terminal(parent, Vector3(-2.55, 0.0, -2.55))
	_add_prop(parent, "desk", Vector3(2.45, 0.0, -3.1), 0.67)
	_add_prop(parent, "chair", Vector3(2.45, 0.0, -1.95), 0.72)
	_add_prop(parent, "desk_lamp", Vector3(3.15, 0.0, -3.0), 0.52)
	_add_crt_terminal(parent, Vector3(2.45, 0.0, -3.1))
	_add_prop(parent, "pay_phone", Vector3(5.25, 0.0, 3.35), 0.63)
	_add_prop(parent, "trash_can", Vector3(-4.6, 0.0, 1.5), 0.72)
	_add_service_prop(parent, "vending_machine", Vector3(4.82, 0.0, -4.55), 0.66)
	_add_service_prop(parent, "atm", Vector3(4.78, 0.0, -2.15), 0.62)


func _add_prop(parent: Node3D, kind: String, at: Vector3, prop_scale: float) -> Node3D:
	var prop := Prop.create(kind)
	prop.position = at
	prop.scale = Vector3.ONE * prop_scale
	parent.add_child(prop)
	return prop


func _add_service_prop(parent: Node3D, kind: String, at: Vector3, prop_scale: float) -> Node3D:
	var prop := Service.create_service(kind)
	prop.position = at
	prop.scale = Vector3.ONE * prop_scale
	parent.add_child(prop)
	return prop


func _add_box(parent: Node3D, box_name: String, at: Vector3, size: Vector3, color: String, metallic := 0.0) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = box_name
	var box := BoxMesh.new()
	box.size = size
	var material := _material(color)
	material.metallic = metallic
	if metallic > 0.0:
		material.roughness = 0.4
	box.material = material
	instance.mesh = box
	instance.position = at
	parent.add_child(instance)
	return instance


func _add_window(parent: Node3D, at: Vector3, size: Vector2) -> void:
	var glass := MeshInstance3D.new()
	glass.name = "BrassFramedWindow"
	var pane := BoxMesh.new()
	pane.size = Vector3(size.x, size.y, 0.055)
	var glass_material := StandardMaterial3D.new()
	glass_material.albedo_color = Color(0.38, 0.62, 0.63, 0.54)
	glass_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass_material.roughness = 0.2
	pane.material = glass_material
	glass.mesh = pane
	glass.position = at
	parent.add_child(glass)
	for edge in [-1.0, 1.0]:
		_add_box(parent, "WindowBrassMullion", at + Vector3(edge * size.x * 0.5, 0.0, 0.04), Vector3(0.07, size.y + 0.14, 0.08), "#ad884e", 0.55)
		_add_box(parent, "WindowBrassSill", at + Vector3(0.0, edge * size.y * 0.5, 0.04), Vector3(size.x + 0.14, 0.07, 0.08), "#ad884e", 0.55)


func _add_label_3d(parent: Node3D, text: String, at: Vector3, font_size: int, facing: float) -> void:
	var label := Label3D.new()
	label.text = text
	label.position = at
	label.rotation.y = facing
	label.font_size = font_size
	label.pixel_size = 0.007
	label.modulate = Color("#f0e3c7")
	label.outline_size = 5
	label.outline_modulate = Color("#1a2623")
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	parent.add_child(label)


func _add_crt_terminal(parent: Node3D, desk_position: Vector3) -> void:
	_add_box(parent, "1980s CRT Terminal", desk_position + Vector3(0.0, 1.05, -0.12), Vector3(0.66, 0.48, 0.48), "#8d856e")
	_add_box(parent, "CRT Bezel", desk_position + Vector3(0.0, 1.06, 0.14), Vector3(0.53, 0.36, 0.045), "#353a31")
	var screen := _add_box(parent, "Phosphor Screen", desk_position + Vector3(0.0, 1.07, 0.166), Vector3(0.43, 0.27, 0.012), "#466a50")
	var screen_material := screen.mesh.surface_get_material(0) as StandardMaterial3D
	screen_material.emission_enabled = true
	screen_material.emission = Color("#6eaa74")
	screen_material.emission_energy_multiplier = 0.34
	_add_box(parent, "TerminalKeyboard", desk_position + Vector3(0.0, 0.61, 0.34), Vector3(0.56, 0.045, 0.22), "#4b4d42")
	_add_box(parent, "TerminalStatusLight", desk_position + Vector3(0.23, 0.87, 0.17), Vector3(0.025, 0.025, 0.012), "#b79a55", 0.2)


func _configure_character(model: Node3D, suit_color: Color) -> AnimationPlayer:
	# Broaden the game character slightly without changing his adult height.
	model.scale = Vector3(MODEL_SCALE * 1.16, MODEL_SCALE, MODEL_SCALE * 1.08)
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh == null or not mesh_instance.name.to_lower().contains("jacket"):
			continue
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			var source_material := mesh_instance.get_active_material(surface_index)
			var material := source_material.duplicate() as StandardMaterial3D if source_material is StandardMaterial3D else StandardMaterial3D.new()
			material.albedo_color = suit_color
			material.roughness = 0.76
			mesh_instance.set_surface_override_material(surface_index, material)
	var animation_nodes := model.find_children("*", "AnimationPlayer", true, false)
	if animation_nodes.is_empty():
		push_error("Salaryman review model has no AnimationPlayer.")
		return null
	var skeleton_nodes := model.find_children("*", "Skeleton3D", true, false)
	if not skeleton_nodes.is_empty():
		var skeleton := skeleton_nodes[0] as Skeleton3D
		var head_index := skeleton.find_bone("head")
		if head_index >= 0:
			skeleton.set_bone_pose_scale(head_index, Vector3.ONE * 1.12)
	var player := animation_nodes[0] as AnimationPlayer
	_install_review_walk(player)
	if player.has_animation("idle"):
		player.play("idle")
	return player


func _install_review_walk(player: AnimationPlayer) -> void:
	var original_library := player.get_animation_library("")
	if original_library == null or not original_library.has_animation("walk"):
		return
	# Work on a private in-memory copy. The imported GLB and its 32 source clips
	# remain unchanged outside this isolated review scene.
	var review_library := original_library.duplicate(true) as AnimationLibrary
	var walk := review_library.get_animation("walk").duplicate(true) as Animation
	var time_scale := REVIEW_WALK_DURATION / walk.length
	for track_index in range(walk.get_track_count()):
		var track_path := str(walk.track_get_path(track_index)).to_lower()
		var rotation_blend := 1.0
		if track_path.contains("leg-"):
			rotation_blend = 0.72
		elif track_path.contains("arm-"):
			rotation_blend = 0.22
		elif track_path.contains("torso"):
			rotation_blend = 0.35
		elif track_path.contains("head"):
			rotation_blend = 0.5
		for key_index in range(walk.track_get_key_count(track_index)):
			var key_time := walk.track_get_key_time(track_index, key_index)
			walk.track_set_key_time(track_index, key_index, key_time * time_scale)
			if (
				rotation_blend < 1.0
				and walk.track_get_type(track_index) == Animation.TYPE_ROTATION_3D
			):
				var source_rotation := walk.track_get_key_value(track_index, key_index) as Quaternion
				var softened_rotation := Quaternion.IDENTITY.slerp(source_rotation, rotation_blend).normalized()
				walk.track_set_key_value(track_index, key_index, softened_rotation)
	walk.length = REVIEW_WALK_DURATION
	review_library.remove_animation("walk")
	review_library.add_animation("walk", walk)
	player.remove_animation_library("")
	player.add_animation_library("", review_library)


func _add_review_npcs(parent: Node3D) -> void:
	var coworker_one := CHARACTER_SCENE.instantiate() as Node3D
	coworker_one.name = "RadioStationCoworker"
	coworker_one.position = Vector3(-2.55, 0.0, -0.45)
	parent.add_child(coworker_one)
	var first_animation := _configure_character(coworker_one, Color("#51413a"))
	if first_animation != null:
		first_animation.speed_scale = 0.78
	var coworker_two := CHARACTER_SCENE.instantiate() as Node3D
	coworker_two.name = "OfficeCoworker"
	coworker_two.position = Vector3(1.9, 0.0, -0.55)
	coworker_two.rotation.y = 0.0
	parent.add_child(coworker_two)
	var second_animation := _configure_character(coworker_two, Color("#2d3b37"))
	if second_animation != null:
		second_animation.speed_scale = 0.92


func _material(color: String) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = Color(color)
	result.roughness = 0.94
	return result


func _add_review_labels() -> void:
	var layer := CanvasLayer.new()
	layer.name = "PreviewControls"
	layer.layer = 1
	add_child(layer)

	var title := Label.new()
	title.text = "TOWER F06  /  RADIO STATION"
	title.position = Vector2(28.0, 18.0)
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color("#f0e3c7"))
	layer.add_child(title)

	var controls := Label.new()
	controls.text = "MATURE SALARYMAN REVIEW   ·   WASD MOVE   ·   SHIFT SPRINT   ·   ESC EXIT"
	controls.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	controls.position = Vector2(28.0, -44.0)
	controls.add_theme_font_size_override("font_size", 16)
	controls.add_theme_color_override("font_color", Color("#f0e3c7"))
	layer.add_child(controls)


func _process(delta: float) -> void:
	if _actor == null or not is_instance_valid(_actor):
		return
	_elapsed += delta
	_frame_count += 1
	var direction := _demo_direction() if _demo_mode else _keyboard_direction()
	var moving := not direction.is_zero_approx()
	var sprinting := moving and Input.is_key_pressed(KEY_SHIFT)
	var speed := SPRINT_SPEED if sprinting else WALK_SPEED
	if moving:
		direction = direction.normalized()
		_actor.velocity = Vector3(direction.x * speed, 0.0, direction.z * speed)
		_model.rotation.y = atan2(direction.x, direction.z)
	else:
		_actor.velocity = Vector3.ZERO
	_actor.move_and_slide()
	_update_camera()
	_update_animation("sprint" if sprinting else "walk" if moving else "idle")
	if Input.is_key_pressed(KEY_ESCAPE):
		get_tree().quit()
	elif not _capture_path.is_empty() and _frame_count == 18:
		call_deferred("_capture_frame")


func _keyboard_direction() -> Vector3:
	var x := float(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT))
	x -= float(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT))
	var z := float(Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN))
	z -= float(Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP))
	return Vector3(x, 0.0, z).limit_length(1.0)


func _demo_direction() -> Vector3:
	var phase := fposmod(_elapsed, 8.0)
	if phase < 2.0:
		return Vector3(1.0, 0.0, 0.0)
	if phase < 4.0:
		return Vector3(0.0, 0.0, -1.0)
	if phase < 6.0:
		return Vector3(0.0, 0.0, 1.0)
	return Vector3(-1.0, 0.0, 0.0)


func _update_animation(animation: String) -> void:
	if _animation_player == null or not _animation_player.has_animation(animation):
		return
	if _animation_player.current_animation != animation:
		_animation_player.play(animation)


func _update_camera() -> void:
	if _camera == null:
		return
	var target := _actor.global_position + Vector3(0.0, 0.72, -0.55)
	# Match the game's elevated overhead 3D camera instead of a near-character
	# perspective chase view.
	_camera.position = target + Vector3(
		CAMERA_DISTANCE * 0.72,
		CAMERA_DISTANCE * 1.02,
		CAMERA_DISTANCE * 0.72,
	)
	_camera.look_at(target, Vector3.UP)


func _capture_frame() -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var error := image.save_png(_capture_path)
	print("Character preview capture: %s (error %d)" % [_capture_path, error])
	get_tree().quit(0 if error == OK else 1)
