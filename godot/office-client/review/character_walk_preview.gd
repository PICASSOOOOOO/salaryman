extends Node3D
## Isolated, walkable review scene for the overhead salaryman character.
## Run with: godot --path godot/office-client res://review/character_walk_preview.tscn

const CHARACTER_SCENE := preload("res://agentshire-assets/characters/character-male-a.glb")
const SALARYMAN_PALETTE := preload("res://agentshire-assets/characters/Textures/colormap-salaryman-1980s.png")
const PlayerController := preload("res://player_controller.gd")

const MODEL_SCALE := 2.15
const WALK_SPEED := 3.0
const SPRINT_SPEED := 5.0
const PIXEL_VIEW_SIZE := Vector2i(320, 180)

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

	_add_floor(_stage)
	_actor = CharacterBody3D.new()
	_actor.name = "WalkableCharacter"
	_actor.motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	_stage.add_child(_actor)
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.34
	capsule.height = 1.55
	var collision := CollisionShape3D.new()
	collision.shape = capsule
	collision.position.y = capsule.height * 0.5
	_actor.add_child(collision)

	_model = CHARACTER_SCENE.instantiate() as Node3D
	_model.name = "CharacterModel"
	_actor.add_child(_model)
	_animation_player = PlayerController.configure_character_model(_model, MODEL_SCALE)
	_apply_salaryman_materials()
	_add_period_details()
	if _animation_player == null or not _animation_player.has_animation("walk"):
		push_error("The character preview requires the rig's idle and walk animations.")
	else:
		_animation_player.play("idle")
		_model.rotation.y = PI

	_camera = Camera3D.new()
	_camera.name = "OverheadFollowCamera"
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = 6.5
	_camera.position = Vector3(8.0, 11.0, 8.0)
	_stage.add_child(_camera)
	_camera.current = true
	_update_camera()
	_add_review_labels()


func _add_floor(parent: Node3D) -> void:
	var base := MeshInstance3D.new()
	var base_mesh := BoxMesh.new()
	base_mesh.size = Vector3(18.0, 0.2, 18.0)
	base_mesh.material = _material("#72694f")
	base.mesh = base_mesh
	base.position.y = -0.11
	parent.add_child(base)

	for x in range(-8, 9):
		for z in range(-8, 9):
			var tile := MeshInstance3D.new()
			var tile_mesh := BoxMesh.new()
			tile_mesh.size = Vector3(0.98, 0.025, 0.98)
			tile_mesh.material = _material("#a29576" if (x + z) % 2 == 0 else "#94896e")
			tile.mesh = tile_mesh
			tile.position = Vector3(float(x), 0.01, float(z))
			parent.add_child(tile)


func _material(color: String) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = Color(color)
	result.roughness = 0.94
	return result


func _apply_salaryman_materials() -> void:
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			var material := StandardMaterial3D.new()
			material.albedo_texture = SALARYMAN_PALETTE
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			material.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
			material.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
			material.roughness = 0.94
			mesh_instance.set_surface_override_material(surface_index, material)


func _add_period_details() -> void:
	_add_box_detail(
		"ShirtFront",
		Vector3(0.105, 0.085, 0.018),
		Vector3(0.0, 0.286, -0.158),
		"#e8ddc3",
	)
	_add_box_detail(
		"Tie",
		Vector3(0.027, 0.115, 0.012),
		Vector3(0.0, 0.235, -0.173),
		"#762d35",
	)
	_add_box_detail(
		"GlassesLeft",
		Vector3(0.046, 0.018, 0.012),
		Vector3(-0.035, 0.535, -0.173),
		"#312b2a",
	)
	_add_box_detail(
		"GlassesRight",
		Vector3(0.046, 0.018, 0.012),
		Vector3(0.035, 0.535, -0.173),
		"#312b2a",
	)
	_add_box_detail(
		"GlassesBridge",
		Vector3(0.024, 0.009, 0.012),
		Vector3(0.0, 0.535, -0.176),
		"#aa895b",
	)
	_add_box_detail(
		"Briefcase",
		Vector3(0.115, 0.12, 0.065),
		Vector3(-0.35, 0.105, 0.07),
		"#553a2a",
	)
	_add_box_detail(
		"BriefcaseHandle",
		Vector3(0.07, 0.023, 0.047),
		Vector3(-0.35, 0.175, 0.07),
		"#35261d",
	)
	_add_box_detail(
		"BriefcaseClasp",
		Vector3(0.018, 0.026, 0.012),
		Vector3(-0.35, 0.105, 0.027),
		"#b18a4d",
	)


func _add_box_detail(detail_name: String, size: Vector3, at: Vector3, color: String) -> void:
	var detail := MeshInstance3D.new()
	detail.name = detail_name
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = _material(color)
	detail.mesh = mesh
	detail.position = at
	_model.add_child(detail)


func _add_review_labels() -> void:
	var layer := CanvasLayer.new()
	layer.name = "PreviewControls"
	layer.layer = 1
	add_child(layer)

	var title := Label.new()
	title.text = "TOKYO, 1980s  /  SENIOR SALARYMAN"
	title.position = Vector2(28.0, 18.0)
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color("#283b37"))
	layer.add_child(title)

	var controls := Label.new()
	controls.text = "WASD / ARROWS MOVE   ·   SHIFT SPRINT   ·   ESC EXIT"
	controls.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	controls.position = Vector2(28.0, -44.0)
	controls.add_theme_font_size_override("font_size", 16)
	controls.add_theme_color_override("font_color", Color("#283b37"))
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
		_model.rotation.y = atan2(direction.x, -direction.z)
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
		return Vector3(0.0, 0.0, -1.0)
	if phase < 4.0:
		return Vector3(1.0, 0.0, 0.0)
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
	var target := _actor.global_position + Vector3(0.0, 0.65, 0.0)
	_camera.position = target + Vector3(8.0, 11.0, 8.0)
	_camera.look_at(target, Vector3.UP)


func _capture_frame() -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var error := image.save_png(_capture_path)
	print("Character preview capture: %s (error %d)" % [_capture_path, error])
	get_tree().quit(0 if error == OK else 1)
