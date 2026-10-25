extends Node3D
## Second review direction: the actual in-game character with its idle clip.

const MODEL_SCENE: PackedScene = preload("res://agentshire-assets/characters/character-male-a.glb")
const SALARYMAN_ATLAS: Texture2D = preload(
	"res://agentshire-assets/characters/Textures/colormap-salaryman-1980s.png"
)
const EXPECTED_ANIMATION_COUNT := 32
const REVIEW_MODEL_SCALE := 2.55
const REVIEW_HEAD_SCALE := 0.82

var _model: Node3D
var _camera: Camera3D
var _status_label: Label
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
		push_error("The in-game character GLB did not instantiate as Node3D.")
		return
	_model.name = "UnapprovedInGameSalarymanCandidate"
	_model.scale = Vector3.ONE * REVIEW_MODEL_SCALE
	_model.rotation_degrees.y = 17.0
	_model.position.y = 0.025
	add_child(_model)

	var animation_players := _model.find_children("*", "AnimationPlayer", true, false)
	if animation_players.is_empty():
		push_error("The in-game character GLB has no AnimationPlayer.")
	else:
		var animation_player := animation_players[0] as AnimationPlayer
		var animation_count := animation_player.get_animation_list().size()
		if animation_count != EXPECTED_ANIMATION_COUNT:
			push_error(
				"Expected all %d source clips, found %d." % [
					EXPECTED_ANIMATION_COUNT,
					animation_count,
				]
			)
		if animation_player.has_animation("idle"):
			animation_player.play("idle")
		else:
			push_error("The source idle clip is missing.")

	_apply_native_review_atlas()
	_recolor_hair_and_define_eyes()
	_hide_any_named_eyewear()
	_apply_review_head_scale()


func _apply_native_review_atlas() -> void:
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			var source := mesh_instance.get_active_material(surface_index)
			var material := (
				source.duplicate() as StandardMaterial3D
				if source is StandardMaterial3D
				else StandardMaterial3D.new()
			)
			material.albedo_texture = SALARYMAN_ATLAS
			material.albedo_color = Color.WHITE
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			material.roughness = 0.82
			mesh_instance.set_surface_override_material(surface_index, material)


func _recolor_hair_and_define_eyes() -> void:
	var head_nodes: Array[Node] = []
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		if _normalized_node_name(node.name) == "headmesh":
			head_nodes.append(node)
	if head_nodes.is_empty():
		push_warning("The head mesh was not found for the review-only hair treatment.")
		return

	for node in head_nodes:
		_strip_merged_eyewear(node as MeshInstance3D)

	# Keep the supplied native atlas, but shift its grey hair sample toward the
	# requested warm brown without tinting the face or changing the source image.
	var hair_shader := Shader.new()
	hair_shader.code = """
shader_type spatial;
uniform sampler2D salaryman_atlas : source_color, filter_nearest;
varying vec3 local_position;

void vertex() {
	local_position = VERTEX;
}

void fragment() {
	vec3 atlas_color = texture(salaryman_atlas, UV).rgb;
	if (local_position.y > 0.505 || (abs(local_position.x) > 0.135 && local_position.y > 0.48)) {
		atlas_color = mix(atlas_color, vec3(0.24, 0.125, 0.060), 0.82);
	}
	// The native face atlas maps a warm highlight across the eye band. Recolor
	// that narrow front-facing strip as skin so the large eye whites read as
	// uncovered eyes, not glasses.
	if (
		local_position.z > 0.145
		&& abs(local_position.x) < 0.17
		&& local_position.y > 0.485
		&& local_position.y < 0.530
	) {
		atlas_color = vec3(0.60, 0.31, 0.20);
	}
	ALBEDO = atlas_color;
	ROUGHNESS = 0.84;
}
"""
	var hair_material := ShaderMaterial.new()
	hair_material.shader = hair_shader
	hair_material.set_shader_parameter("salaryman_atlas", SALARYMAN_ATLAS)
	for node in head_nodes:
		(node as MeshInstance3D).material_override = hair_material

	# Small dark irises/pupils clarify the source mesh's large white eye surfaces
	# as eyes rather than eyewear. They are review-only, simple 3D facial details.
	var eye_material := StandardMaterial3D.new()
	eye_material.albedo_color = Color("#302016")
	eye_material.roughness = 0.42
	for x_position in [-0.072, 0.072]:
		var pupil := MeshInstance3D.new()
		pupil.name = "ReviewEyePupil"
		var pupil_mesh := SphereMesh.new()
		pupil_mesh.radius = 0.009
		pupil_mesh.height = 0.018
		pupil_mesh.radial_segments = 12
		pupil_mesh.rings = 8
		pupil.mesh = pupil_mesh
		pupil.material_override = eye_material
		pupil.scale = Vector3(0.9, 1.1, 0.42)
		pupil.position = Vector3(x_position, 0.493, 0.174)
		_model.add_child(pupil)


func _strip_merged_eyewear(head_mesh: MeshInstance3D) -> void:
	# The imported player head has no separate glasses node, but its head mesh
	# contains small disconnected frame/bridge/temple components. Remove only
	# those front-of-eye triangles from this review instance's mesh copy.
	if not head_mesh.mesh is ArrayMesh:
		push_warning("Head mesh is not an ArrayMesh; merged eyewear could not be filtered.")
		return
	var source_mesh := head_mesh.mesh as ArrayMesh
	if source_mesh.get_surface_count() != 1 or source_mesh.get_blend_shape_count() > 0:
		push_warning("Unexpected head mesh layout; merged eyewear filter was skipped.")
		return
	var arrays := source_mesh.surface_get_arrays(0)
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var source_indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	var parents := PackedInt32Array()
	parents.resize(vertices.size())
	for vertex_index in range(vertices.size()):
		parents[vertex_index] = vertex_index
	for index in range(0, source_indices.size(), 3):
		_union_mesh_vertices(parents, source_indices[index], source_indices[index + 1])
		_union_mesh_vertices(parents, source_indices[index + 1], source_indices[index + 2])

	var component_bounds: Dictionary = {}
	for vertex_index in range(vertices.size()):
		var root := _find_mesh_root(parents, vertex_index)
		var point := vertices[vertex_index]
		if not component_bounds.has(root):
			component_bounds[root] = {
				"min_x": point.x,
				"max_x": point.x,
				"min_y": point.y,
				"max_y": point.y,
				"min_z": point.z,
				"max_z": point.z,
			}
		else:
			var bounds: Dictionary = component_bounds[root]
			bounds["min_x"] = minf(bounds["min_x"], point.x)
			bounds["max_x"] = maxf(bounds["max_x"], point.x)
			bounds["min_y"] = minf(bounds["min_y"], point.y)
			bounds["max_y"] = maxf(bounds["max_y"], point.y)
			bounds["min_z"] = minf(bounds["min_z"], point.z)
			bounds["max_z"] = maxf(bounds["max_z"], point.z)
			component_bounds[root] = bounds

	var eyewear_roots: Dictionary = {}
	for root in component_bounds:
		if _is_eyewear_component(component_bounds[root]):
			eyewear_roots[root] = true

	var filtered_indices := PackedInt32Array()
	var removed_triangles := 0
	for index in range(0, source_indices.size(), 3):
		var component_root := _find_mesh_root(parents, source_indices[index])
		if eyewear_roots.has(component_root):
			removed_triangles += 1
			continue
		filtered_indices.append_array(
			PackedInt32Array([
				source_indices[index],
				source_indices[index + 1],
				source_indices[index + 2],
			])
		)
	if removed_triangles == 0:
		push_warning("No merged eyewear triangles matched the review filter.")
		return
	arrays[Mesh.ARRAY_INDEX] = filtered_indices
	var review_mesh := ArrayMesh.new()
	review_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	head_mesh.mesh = review_mesh


func _is_eyewear_component(bounds: Dictionary) -> bool:
	if bounds["min_y"] < 0.46 or bounds["max_y"] > 0.52:
		return false
	var center_x: float = (bounds["min_x"] + bounds["max_x"]) * 0.5
	var side_distance := absf(center_x)
	var min_z: float = bounds["min_z"]
	var max_z: float = bounds["max_z"]
	if (
		side_distance < 0.05
		and bounds["max_x"] - bounds["min_x"] < 0.08
		and min_z > 0.155
	):
		return true
	if side_distance > 0.14 and side_distance < 0.17 and min_z > 0.14 and max_z > 0.16:
		return true
	return side_distance > 0.155 and side_distance < 0.18 and min_z < 0.0 and max_z < 0.15


func _find_mesh_root(parents: PackedInt32Array, vertex_index: int) -> int:
	var root := vertex_index
	while parents[root] != root:
		root = parents[root]
	while parents[vertex_index] != vertex_index:
		var next := parents[vertex_index]
		parents[vertex_index] = root
		vertex_index = next
	return root


func _union_mesh_vertices(parents: PackedInt32Array, first: int, second: int) -> void:
	var first_root := _find_mesh_root(parents, first)
	var second_root := _find_mesh_root(parents, second)
	if first_root != second_root:
		parents[first_root] = second_root


func _hide_any_named_eyewear() -> void:
	# The production GLB currently contains only body/head meshes. Keep an
	# explicit guard so this review remains glasses-free if the source evolves.
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		var lowered := mesh_instance.name.to_lower()
		if lowered.contains("glasses") or lowered.contains("eyewear"):
			mesh_instance.visible = false


func _apply_review_head_scale() -> void:
	for node in _model.find_children("*", "Skeleton3D", true, false):
		var skeleton := node as Skeleton3D
		for bone_index in range(skeleton.get_bone_count()):
			if skeleton.get_bone_name(bone_index).to_lower() != "head":
				continue
			# Modest joint-only scale leaves torso/neck geometry and all source
			# animations intact, minimizing risk of a visible neck seam.
			skeleton.set_bone_pose_scale(bone_index, Vector3.ONE * REVIEW_HEAD_SCALE)
			return
	push_warning("No head joint found; displaying source proportions for review.")


func _normalized_node_name(node_name: String) -> String:
	return node_name.to_lower().replace(".", "").replace("_", "").replace("-", "")


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
	header.text = "SALARYMAN  /  IN-GAME MODEL STUDY"
	header.position = Vector2(30.0, 24.0)
	header.add_theme_font_size_override("font_size", 18)
	header.add_theme_color_override("font_color", Color("#243c37"))
	layer.add_child(header)

	_status_label = Label.new()
	_status_label.text = "UNAPPROVED REVIEW ART  ·  CANDIDATE B"
	_status_label.position = Vector2(30.0, 54.0)
	_status_label.add_theme_font_size_override("font_size", 13)
	_status_label.add_theme_color_override("font_color", Color("#7c3c44"))
	layer.add_child(_status_label)

	var source_note := Label.new()
	source_note.text = "ACTUAL PLAYER GLB  ·  IDLE  ·  32 SOURCE CLIPS"
	source_note.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	source_note.position = Vector2(-430.0, 28.0)
	source_note.size = Vector2(400.0, 28.0)
	source_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	source_note.add_theme_font_size_override("font_size", 12)
	source_note.add_theme_color_override("font_color", Color("#425a50"))
	layer.add_child(source_note)

	var controls := Label.new()
	controls.text = "← / → TURN   ·   R RESET   ·   ESC EXIT"
	controls.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	controls.position = Vector2(30.0, -42.0)
	controls.add_theme_font_size_override("font_size", 13)
	controls.add_theme_color_override("font_color", Color("#243c37"))
	layer.add_child(controls)

	var footer := Label.new()
	footer.text = "NO EYEWEAR  ·  HEAD ADJUSTMENT REVIEW ONLY"
	footer.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	footer.position = Vector2(-390.0, -42.0)
	footer.size = Vector2(360.0, 24.0)
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
		_model.rotation.y += delta * 0.75
		_turning = true
	elif Input.is_key_pressed(KEY_RIGHT):
		_model.rotation.y -= delta * 0.75
		_turning = true
	if Input.is_key_pressed(KEY_R):
		_model.rotation_degrees.y = 17.0
		_turning = false
	_status_label.text = (
		"UNAPPROVED REVIEW ART  ·  CANDIDATE B  ·  TURNING"
		if _turning
		else "UNAPPROVED REVIEW ART  ·  CANDIDATE B"
	)
