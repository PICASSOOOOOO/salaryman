extends Node3D
## Candidate C: adult-proportioned stylized salaryman, isolated for review.

const MODEL_SCENE: PackedScene = preload("res://review/realistic_salaryman_preview.glb")
const MODEL_SCALE := 2.55
const HEAD_SCALE := 0.80
const EXPECTED_ANIMATION_COUNT := 32
const ARM_RELAXATION_DEGREES := 10.0

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
	world.name = "CandidateCEnvironment"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#bbc7bd")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#eee2ce")
	environment.ambient_light_energy = 0.42
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = environment
	add_child(world)

	var key_light := DirectionalLight3D.new()
	key_light.name = "SoftKey"
	key_light.rotation_degrees = Vector3(-38.0, -34.0, 0.0)
	key_light.light_color = Color("#fff0dc")
	key_light.light_energy = 0.9
	key_light.shadow_enabled = true
	add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.name = "CoolFill"
	fill_light.rotation_degrees = Vector3(-18.0, 146.0, 0.0)
	fill_light.light_color = Color("#d6e2dc")
	fill_light.light_energy = 0.28
	add_child(fill_light)

	var floor := MeshInstance3D.new()
	floor.name = "ReviewFloor"
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(200.0, 200.0)
	floor.mesh = floor_mesh
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("#62766b")
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
	backdrop_material.albedo_color = Color("#d7dfd6")
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
	plinth_material.albedo_color = Color("#657a70")
	plinth_material.roughness = 0.78
	plinth.material_override = plinth_material
	plinth.position.y = -0.005
	add_child(plinth)


func _build_character() -> void:
	_model = MODEL_SCENE.instantiate() as Node3D
	if _model == null:
		push_error("The adult-proportion review GLB did not instantiate as Node3D.")
		return
	_model.name = "UnapprovedAdultSalarymanCandidateC"
	_model.scale = Vector3.ONE * MODEL_SCALE
	_model.rotation_degrees.y = 17.0
	_model.position.y = 0.025
	add_child(_model)

	_hide_source_eyewear()
	_apply_review_palette()
	_set_source_static_pose()
	_apply_head_proportion()
	_add_review_shirt_and_tie()


func _hide_source_eyewear() -> void:
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		var lowered := mesh_instance.name.to_lower()
		if lowered.contains("glasses") or lowered.contains("eyewear"):
			mesh_instance.visible = false


func _apply_review_palette() -> void:
	_set_surface_color("salarymanMesh", Color("#c68b68"), 0.8)
	_set_surface_color("high-polyMesh", Color("#34251d"), 0.42)
	_set_surface_color("ProceduralShortHair", Color("#563a2a"), 0.88)
	_set_surface_color("ProceduralSideburn", Color("#563a2a"), 0.88)
	_set_surface_color("ProceduralSideburn.001", Color("#563a2a"), 0.88)
	_set_surface_color("Ivory shirt front", Color("#f5f1e7"), 0.86)
	_set_surface_color("Shirt collar", Color("#f5f1e7"), 0.84)
	_set_surface_color("Burgundy tie", Color("#17191c"), 0.82)
	_set_surface_color("PlaneMesh", Color("#222428"), 0.52)
	_split_suit_material_surfaces()


func _split_suit_material_surfaces() -> void:
	# Separate the source's combined jacket/trouser triangles into review-only
	# material surfaces. Keeping standard materials preserves skinning and the
	# shoulder-joint arm pose (a custom shader can bypass that in this asset).
	var suit_meshes := _find_meshes("jacket_tie_pantsMesh")
	if suit_meshes.is_empty():
		push_warning("Candidate C could not find the combined jacket/trouser surface.")
		return
	var jacket_material := _flat_review_material(Color("#263f65"), 0.82)
	var trouser_material := _flat_review_material(Color("#202328"), 0.82)
	for node in suit_meshes:
		var mesh_instance := node as MeshInstance3D
		if not mesh_instance.mesh is ArrayMesh:
			push_warning("Candidate C suit mesh is not an ArrayMesh.")
			continue
		var source_mesh := mesh_instance.mesh as ArrayMesh
		if source_mesh.get_surface_count() != 1 or source_mesh.get_blend_shape_count() > 0:
			push_warning("Candidate C suit mesh layout is unexpected; palette split skipped.")
			continue
		var source_arrays := source_mesh.surface_get_arrays(0)
		var vertices: PackedVector3Array = source_arrays[Mesh.ARRAY_VERTEX]
		var source_indices: PackedInt32Array = source_arrays[Mesh.ARRAY_INDEX]
		var jacket_indices := PackedInt32Array()
		var trouser_indices := PackedInt32Array()
		for index in range(0, source_indices.size(), 3):
			var center_y := (
				vertices[source_indices[index]].y
				+ vertices[source_indices[index + 1]].y
				+ vertices[source_indices[index + 2]].y
			) / 3.0
			var destination := trouser_indices if center_y < 0.325 else jacket_indices
			destination.append_array(
				PackedInt32Array([
					source_indices[index],
					source_indices[index + 1],
					source_indices[index + 2],
				])
			)
		var split_mesh := ArrayMesh.new()
		var trouser_arrays: Array = source_arrays.duplicate()
		trouser_arrays[Mesh.ARRAY_INDEX] = trouser_indices
		split_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, trouser_arrays)
		var jacket_arrays: Array = source_arrays.duplicate()
		jacket_arrays[Mesh.ARRAY_INDEX] = jacket_indices
		split_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, jacket_arrays)
		mesh_instance.mesh = split_mesh
		mesh_instance.set_surface_override_material(0, trouser_material)
		mesh_instance.set_surface_override_material(1, jacket_material)


func _set_surface_color(mesh_name: String, color: Color, roughness: float) -> void:
	for node in _find_meshes(mesh_name):
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
			# Duplicate source materials so their alpha/cutout settings survive.
			material.albedo_color = color
			material.roughness = roughness
			mesh_instance.set_surface_override_material(surface_index, material)


func _find_meshes(mesh_name: String) -> Array[Node]:
	var result: Array[Node] = []
	var desired := _normalized_name(mesh_name)
	for node in _model.find_children("*", "MeshInstance3D", true, false):
		if _normalized_name(node.name) == desired:
			result.append(node)
	return result


func _normalized_name(value: String) -> String:
	return value.to_lower().replace(".", "").replace("_", "").replace("-", "")


func _set_source_static_pose() -> void:
	var animation_players := _model.find_children("*", "AnimationPlayer", true, false)
	if animation_players.is_empty():
		push_error("The adult-proportion candidate has no AnimationPlayer.")
		return
	var animation_player := animation_players[0] as AnimationPlayer
	var source_clips := animation_player.get_animation_list()
	if source_clips.size() != EXPECTED_ANIMATION_COUNT:
		push_error(
			"Expected all %d source clips, found %d." % [
				EXPECTED_ANIMATION_COUNT,
				source_clips.size(),
			]
		)
	if animation_player.has_animation("static"):
		animation_player.play("static")
		animation_player.seek(0.0, true)
		animation_player.pause()
	else:
		push_error("The source static standing clip is missing.")


func _apply_head_proportion() -> void:
	var skeleton_nodes := _model.find_children("*", "Skeleton3D", true, false)
	for node in skeleton_nodes:
		var skeleton := node as Skeleton3D
		for bone_index in range(skeleton.get_bone_count()):
			match skeleton.get_bone_name(bone_index).to_lower():
				"head":
					# The head joint alone is reduced; the neck and torso stay at
					# source scale to keep a clean seam.
					skeleton.set_bone_pose_scale(bone_index, Vector3.ONE * HEAD_SCALE)
				"arm-left":
					var pose := skeleton.get_bone_pose_rotation(bone_index)
					skeleton.set_bone_pose_rotation(
						bone_index,
						pose * Quaternion(Vector3.BACK, deg_to_rad(-ARM_RELAXATION_DEGREES))
					)
				"arm-right":
					var pose := skeleton.get_bone_pose_rotation(bone_index)
					skeleton.set_bone_pose_rotation(
						bone_index,
						pose * Quaternion(Vector3.BACK, deg_to_rad(ARM_RELAXATION_DEGREES))
					)
		skeleton.force_update_all_bone_transforms()
		return
	push_warning("No head joint found; displaying source proportions for review.")


func _add_review_shirt_and_tie() -> void:
	# The candidate's original shirt/tie cutouts are too slight to read at
	# gameplay scale. These restrained overlays stay inside the jacket opening.
	var shirt_color := _flat_review_material(Color("#f4f0e5"), 0.86)
	var tie_color := _flat_review_material(Color("#17191c"), 0.8)
	var shirt := _make_polygon(
		"ReviewIvoryShirtFront",
		[
			Vector2(-0.035, 0.405),
			Vector2(0.035, 0.405),
			Vector2(0.030, 0.515),
			Vector2(0.016, 0.535),
			Vector2(-0.016, 0.535),
			Vector2(-0.030, 0.515),
		],
		0.015,
		shirt_color
	)
	_model.add_child(shirt)

	var left_collar := _make_polygon(
		"ReviewLeftCollar",
		[Vector2(-0.020, 0.532), Vector2(-0.002, 0.509), Vector2(-0.014, 0.493)],
		0.020,
		shirt_color
	)
	_model.add_child(left_collar)
	var right_collar := _make_polygon(
		"ReviewRightCollar",
		[Vector2(0.020, 0.532), Vector2(0.002, 0.509), Vector2(0.014, 0.493)],
		0.020,
		shirt_color
	)
	_model.add_child(right_collar)

	var knot := _make_polygon(
		"ReviewBlackTieKnot",
		[
			Vector2(-0.008, 0.512),
			Vector2(0.008, 0.512),
			Vector2(0.011, 0.493),
			Vector2(0.0, 0.482),
			Vector2(-0.011, 0.493),
		],
		0.024,
		tie_color
	)
	_model.add_child(knot)
	var tie := _make_polygon(
		"ReviewBlackTie",
		[
			Vector2(-0.010, 0.493),
			Vector2(0.010, 0.493),
			Vector2(0.015, 0.425),
			Vector2(0.0, 0.395),
			Vector2(-0.015, 0.425),
		],
		0.024,
		tie_color
	)
	_model.add_child(tie)


func _flat_review_material(color: Color, roughness: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material


func _make_polygon(
	node_name: String,
	points: Array[Vector2],
	front_z: float,
	material: Material,
) -> MeshInstance3D:
	var center := Vector2.ZERO
	for point in points:
		center += point
	center /= float(points.size())

	var vertices := PackedVector3Array([Vector3(center.x, center.y, front_z)])
	for point in points:
		vertices.append(Vector3(point.x, point.y, front_z))
	var indices := PackedInt32Array()
	for point_index in range(points.size()):
		indices.append(0)
		indices.append(point_index + 1)
		indices.append((point_index + 1) % points.size() + 1)
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_INDEX] = indices
	var polygon_mesh := ArrayMesh.new()
	polygon_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)

	var result := MeshInstance3D.new()
	result.name = node_name
	result.mesh = polygon_mesh
	result.material_override = material
	return result


func _build_camera() -> void:
	_camera = Camera3D.new()
	_camera.name = "CandidateCIsometricCamera"
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
	header.text = "SALARYMAN  /  ADULT-PROPORTION STUDY"
	header.position = Vector2(30.0, 24.0)
	header.add_theme_font_size_override("font_size", 18)
	header.add_theme_color_override("font_color", Color("#243c37"))
	layer.add_child(header)

	_status_label = Label.new()
	_status_label.text = "UNAPPROVED REVIEW ART  ·  CANDIDATE C"
	_status_label.position = Vector2(30.0, 54.0)
	_status_label.add_theme_font_size_override("font_size", 13)
	_status_label.add_theme_color_override("font_color", Color("#7c3c44"))
	layer.add_child(_status_label)

	var source_note := Label.new()
	source_note.text = "ADULT BODY  ·  RELAXED ARMS  ·  NO EYEWEAR"
	source_note.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	source_note.position = Vector2(-420.0, 28.0)
	source_note.size = Vector2(390.0, 28.0)
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
	footer.text = "BLUE SUIT  ·  IVORY SHIRT  ·  BLACK TIE"
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
		_model.rotation.y += delta * 0.75
		_turning = true
	elif Input.is_key_pressed(KEY_RIGHT):
		_model.rotation.y -= delta * 0.75
		_turning = true
	if Input.is_key_pressed(KEY_R):
		_model.rotation_degrees.y = 17.0
		_turning = false
	_status_label.text = (
		"UNAPPROVED REVIEW ART  ·  CANDIDATE C  ·  TURNING"
		if _turning
		else "UNAPPROVED REVIEW ART  ·  CANDIDATE C"
	)
