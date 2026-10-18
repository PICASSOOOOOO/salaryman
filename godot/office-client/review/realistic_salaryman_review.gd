extends Node3D
## Standalone appearance review. This does not touch the gameplay character roster.

const MODEL_SCENE: PackedScene = preload("res://review/realistic_salaryman_preview.glb")
const MODEL_SCALE := 2.55
const REVIEW_HEAD_SCALE := 0.88

var _model: Node3D
var _camera: Camera3D
var _status_label: Label
var _help_label: Label
var _turning := false


func _ready() -> void:
	_build_environment()
	_build_character()
	_build_camera()
	_build_review_overlay()


func _build_environment() -> void:
	var world := WorldEnvironment.new()
	world.name = "ReviewWorldEnvironment"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#d9ded2")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#f0e5d1")
	environment.ambient_light_energy = 0.72
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = environment
	add_child(world)

	var key_light := DirectionalLight3D.new()
	key_light.name = "SoftKey"
	key_light.rotation_degrees = Vector3(-38.0, -34.0, 0.0)
	key_light.light_color = Color("#fff0d9")
	key_light.light_energy = 1.35
	key_light.shadow_enabled = true
	add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.name = "CoolFill"
	fill_light.rotation_degrees = Vector3(-18.0, 146.0, 0.0)
	fill_light.light_color = Color("#d5e1db")
	fill_light.light_energy = 0.42
	add_child(fill_light)

	var floor := MeshInstance3D.new()
	floor.name = "ReviewFloor"
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(200.0, 200.0)
	floor.mesh = floor_mesh
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("#c8d0c5")
	floor_material.roughness = 0.94
	floor.material_override = floor_material
	floor.position.y = -0.035
	add_child(floor)

	var plinth := MeshInstance3D.new()
	plinth.name = "CharacterDisplayPlinth"
	var plinth_mesh := CylinderMesh.new()
	plinth_mesh.top_radius = 0.88
	plinth_mesh.bottom_radius = 0.88
	plinth_mesh.height = 0.055
	plinth_mesh.radial_segments = 64
	plinth.mesh = plinth_mesh
	var plinth_material := StandardMaterial3D.new()
	plinth_material.albedo_color = Color("#879b8e")
	plinth_material.roughness = 0.76
	plinth.material_override = plinth_material
	plinth.position.y = -0.005
	add_child(plinth)


func _build_character() -> void:
	_model = MODEL_SCENE.instantiate() as Node3D
	if _model == null:
		push_error("The review candidate did not instantiate as Node3D.")
		return
	_model.name = "UnapprovedSalarymanCandidate"
	_model.scale = Vector3.ONE * MODEL_SCALE
	_model.rotation_degrees.y = 17.0
	_model.position.y = 0.025
	add_child(_model)

	var hidden_mesh_count := 0
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		if _is_explicit_glasses_node(mesh_instance.name):
			mesh_instance.visible = false
			hidden_mesh_count += 1
	if hidden_mesh_count < 2:
		push_warning("Expected explicit glasses nodes were not all found; check imported candidate node names.")

	_apply_head_joint_proportion()


func _is_explicit_glasses_node(node_name: String) -> bool:
	var lowered := node_name.to_lower()
	return lowered.contains("glasses") or lowered.contains("proceduralglasses")


func _apply_head_joint_proportion() -> void:
	var skeleton_nodes := _model.find_children("*", "Skeleton3D", true, false)
	for node in skeleton_nodes:
		var skeleton := node as Skeleton3D
		for bone_index in range(skeleton.get_bone_count()):
			if skeleton.get_bone_name(bone_index).to_lower() != "head":
				continue
			# Scale the head joint only. The torso, neck, skin weights, and source
			# mesh stay untouched to keep the neck transition continuous.
			skeleton.set_bone_pose_scale(bone_index, Vector3.ONE * REVIEW_HEAD_SCALE)
			return
	push_warning("No head skeleton joint found; the candidate is shown at source proportions.")


func _build_camera() -> void:
	_camera = Camera3D.new()
	_camera.name = "ReviewIsometricCamera"
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = 2.42
	_camera.near = 0.05
	_camera.far = 80.0
	add_child(_camera)
	_camera.current = true
	_update_camera()


func _update_camera() -> void:
	if _camera == null:
		return
	var focus := Vector3(0.0, 0.91, 0.0)
	_camera.position = focus + Vector3(2.85, 2.0, 4.25).normalized() * 5.2
	_camera.look_at(focus, Vector3.UP)


func _build_review_overlay() -> void:
	var layer := CanvasLayer.new()
	layer.name = "ReviewLabels"
	layer.layer = 2
	add_child(layer)

	var header := Label.new()
	header.text = "SALARYMAN  /  CHARACTER STUDY"
	header.position = Vector2(30.0, 24.0)
	header.add_theme_font_size_override("font_size", 18)
	header.add_theme_color_override("font_color", Color("#243c37"))
	layer.add_child(header)

	_status_label = Label.new()
	_status_label.text = "UNAPPROVED REVIEW ART"
	_status_label.position = Vector2(30.0, 54.0)
	_status_label.add_theme_font_size_override("font_size", 13)
	_status_label.add_theme_color_override("font_color", Color("#7c3c44"))
	layer.add_child(_status_label)

	var character_note := Label.new()
	character_note.text = "MID-50s  ·  JAPANESE  ·  SALT-AND-PEPPER"
	character_note.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	character_note.position = Vector2(-388.0, 28.0)
	character_note.size = Vector2(358.0, 28.0)
	character_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	character_note.add_theme_font_size_override("font_size", 12)
	character_note.add_theme_color_override("font_color", Color("#425a50"))
	layer.add_child(character_note)

	_help_label = Label.new()
	_help_label.text = "← / → TURN   ·   R RESET   ·   ESC EXIT"
	_help_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	_help_label.position = Vector2(30.0, -42.0)
	_help_label.add_theme_font_size_override("font_size", 13)
	_help_label.add_theme_color_override("font_color", Color("#243c37"))
	layer.add_child(_help_label)

	var footer := Label.new()
	footer.text = "FACE + HEAD SHAPE SHOWN AT GAMEPLAY SCALE"
	footer.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	footer.position = Vector2(-365.0, -42.0)
	footer.size = Vector2(335.0, 24.0)
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	footer.add_theme_font_size_override("font_size", 11)
	footer.add_theme_color_override("font_color", Color("#425a50"))
	layer.add_child(footer)


func _process(delta: float) -> void:
	if _model == null or not is_instance_valid(_model):
		return
	if Input.is_key_pressed(KEY_ESCAPE):
		get_tree().quit()
		return
	if Input.is_key_pressed(KEY_LEFT):
		_turning = true
		_model.rotation.y += delta * 0.75
	elif Input.is_key_pressed(KEY_RIGHT):
		_turning = true
		_model.rotation.y -= delta * 0.75
	if Input.is_key_pressed(KEY_R):
		_model.rotation_degrees.y = 17.0
		_turning = false
	_status_label.text = "UNAPPROVED REVIEW ART  ·  TURNING" if _turning else "UNAPPROVED REVIEW ART"
