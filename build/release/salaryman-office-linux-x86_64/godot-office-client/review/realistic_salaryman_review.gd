extends Node3D
## Standalone appearance review. This does not touch the gameplay character roster.

const MODEL_SCENE: PackedScene = preload("res://review/realistic_salaryman_preview.glb")
const MODEL_SCALE := 2.55
const REVIEW_HEAD_SCALE := 0.82

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
	environment.background_color = Color("#b9c5bb")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#f0e5d1")
	environment.ambient_light_energy = 0.42
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = environment
	add_child(world)

	var key_light := DirectionalLight3D.new()
	key_light.name = "SoftKey"
	key_light.rotation_degrees = Vector3(-38.0, -34.0, 0.0)
	key_light.light_color = Color("#fff0d9")
	key_light.light_energy = 0.88
	key_light.shadow_enabled = true
	add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.name = "CoolFill"
	fill_light.rotation_degrees = Vector3(-18.0, 146.0, 0.0)
	fill_light.light_color = Color("#d5e1db")
	fill_light.light_energy = 0.26
	add_child(fill_light)

	var floor := MeshInstance3D.new()
	floor.name = "ReviewFloor"
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(200.0, 200.0)
	floor.mesh = floor_mesh
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("#64766c")
	floor_material.roughness = 0.94
	floor.material_override = floor_material
	floor.position.y = -0.035
	add_child(floor)

	var backdrop := MeshInstance3D.new()
	backdrop.name = "ReviewBackdrop"
	var backdrop_mesh := PlaneMesh.new()
	backdrop_mesh.size = Vector2(10.0, 7.0)
	backdrop.mesh = backdrop_mesh
	backdrop.rotation_degrees.x = 90.0
	backdrop.position = Vector3(0.0, 2.65, -1.45)
	var backdrop_material := StandardMaterial3D.new()
	backdrop_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	backdrop_material.albedo_color = Color("#d4ddd3")
	backdrop.material_override = backdrop_material
	add_child(backdrop)

	var plinth := MeshInstance3D.new()
	plinth.name = "CharacterDisplayPlinth"
	var plinth_mesh := CylinderMesh.new()
	plinth_mesh.top_radius = 0.76
	plinth_mesh.bottom_radius = 0.76
	plinth_mesh.height = 0.055
	plinth_mesh.radial_segments = 64
	plinth.mesh = plinth_mesh
	var plinth_material := StandardMaterial3D.new()
	plinth_material.albedo_color = Color("#65796f")
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

	_apply_sprite_palette_review_overrides()
	_apply_head_joint_proportion()


func _apply_sprite_palette_review_overrides() -> void:
	# Color cues are reinterpreted as 3D materials; the pixel sheet itself is
	# never imported, sampled, or used as a rendered texture.
	_set_review_material("ProceduralShortHair", Color("#563a2a"), 0.88)
	_set_review_material("ProceduralSideburn", Color("#563a2a"), 0.88)
	_set_review_material("ProceduralSideburn.001", Color("#563a2a"), 0.88)
	_set_review_material("salarymanMesh", Color("#bf805d"), 0.78)
	_set_review_material("high-polyMesh", Color("#35241b"), 0.38)
	_set_review_material("Ivory shirt front", Color("#f3f0e6"), 0.86)
	_set_review_material("Shirt collar", Color("#f3f0e6"), 0.86)
	_set_review_material("Burgundy tie", Color("#17191c"), 0.82)
	_set_review_material("PlaneMesh", Color("#24262a"), 0.5)

	var suit_nodes: Array[Node] = []
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		if _normalized_node_name(node.name) == "jackettiepantsmesh":
			suit_nodes.append(node)
	if suit_nodes.is_empty():
		push_warning("The combined jacket/trouser mesh was not found for review palette overrides.")
		return

	# The candidate combines jacket and trousers in one skinned surface. Use its
	# original local height to tint jacket and trousers separately without
	# editing the source GLB or disturbing its skeleton weights.
	var suit_shader := Shader.new()
	suit_shader.code = """
shader_type spatial;

uniform vec4 jacket_color : source_color = vec4(0.13, 0.23, 0.40, 1.0);
uniform vec4 trouser_color : source_color = vec4(0.075, 0.082, 0.095, 1.0);
varying float garment_height;

void vertex() {
	garment_height = VERTEX.y;
}

void fragment() {
	ALBEDO = garment_height < 0.325 ? trouser_color.rgb : jacket_color.rgb;
	ROUGHNESS = 0.82;
}
"""
	var suit_material := ShaderMaterial.new()
	suit_material.shader = suit_shader
	for node in suit_nodes:
		(node as MeshInstance3D).material_override = suit_material


func _set_review_material(mesh_name: String, color: Color, roughness: float) -> void:
	var requested_name := _normalized_node_name(mesh_name)
	var meshes: Array[Node] = []
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		if _normalized_node_name(node.name) == requested_name:
			meshes.append(node)
	if meshes.is_empty():
		push_warning("Review palette mesh not found: %s" % mesh_name)
		return
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	for node in meshes:
		(node as MeshInstance3D).material_override = material


func _normalized_node_name(node_name: String) -> String:
	return node_name.to_lower().replace(".", "").replace("_", "").replace("-", "")


func _is_explicit_glasses_node(node_name: String) -> bool:
	var lowered := node_name.to_lower()
	return lowered.contains("glasses") or lowered.contains("proceduralglasses")


func _apply_head_joint_proportion() -> void:
	var skeleton_nodes := _model.find_children("*", "Skeleton3D", true, false)
	for node in skeleton_nodes:
		var skeleton := node as Skeleton3D
		var head_index := -1
		for bone_index in range(skeleton.get_bone_count()):
			if skeleton.get_bone_name(bone_index).to_lower() == "head":
				head_index = bone_index
				break
		if head_index < 0:
			continue
		# Scale the head joint only. The torso, neck, skin weights, and source
		# mesh stay untouched to keep the neck transition continuous.
		skeleton.set_bone_pose_scale(head_index, Vector3.ONE * REVIEW_HEAD_SCALE)
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
	character_note.text = "MID-50s  ·  JAPANESE  ·  WARM BROWN HAIR"
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
