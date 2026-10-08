extends RefCounted

## Deterministic, renderer-only scenery for the space beyond the Tower's B1 gate.
## The JSON plan is the editable scene specification; the generator builds its
## terrain foundation first, then hardscape regions and independent landmarks.

const PLAN_PATH := "res://tower_exterior_plan.json"
const WORLD_SCALE := 0.01
const FLOOR_TOP_Y := 0.16


static func build(floor_plan: Dictionary) -> Node3D:
	var layout_value: Variant = floor_plan.get("businessSuiteLayout", {})
	if not layout_value is Dictionary:
		push_error("Tower exterior cannot find businessSuiteLayout in floor_plan.json")
		return null
	var b1_value: Variant = layout_value.get("b1", {})
	if not b1_value is Dictionary:
		push_error("Tower exterior cannot find the B1 layout")
		return null

	var bounds: Array = b1_value.get("bounds", [])
	var gate: Array = b1_value.get("exteriorGate", [])
	var b1_room: Dictionary = {}
	for room_value in floor_plan.get("rooms", []):
		if room_value is Dictionary and str(room_value.get("id", "")) == "basement_b1":
			b1_room = room_value
			break
	var room_offset: Array = b1_room.get("renderOffset", [0, 0])
	if bounds.size() < 4 or gate.size() < 2 or room_offset.size() < 2:
		push_error("Tower exterior needs B1 bounds, render offset, and exterior gate coordinates")
		return null

	var plan_value = JSON.parse_string(FileAccess.get_file_as_string(PLAN_PATH))
	if not plan_value is Dictionary:
		push_error("Tower exterior plan is missing or invalid: " + PLAN_PATH)
		return null

	var root := Node3D.new()
	root.name = "TowerExteriorWorld"
	root.position = Vector3(
		float(int(bounds[0]) + int(bounds[2])) * WORLD_SCALE,
		0.0,
		float(int(bounds[1]) + int(room_offset[1]) + int(gate[1])) * WORLD_SCALE,
	)
	_build_from_plan(root, plan_value)
	return root


static func _build_from_plan(root: Node3D, plan: Dictionary) -> void:
	var materials := _make_materials()
	var terrain: Dictionary = plan.get("terrain", {})
	var terrain_center: Array = terrain.get("center", [38, 0])
	var terrain_size: Array = terrain.get("size", [88, 76])
	var terrain_segments: Array = terrain.get("segments", [28, 24])
	if terrain_center.size() < 2 or terrain_size.size() < 2 or terrain_segments.size() < 2:
		push_error("Tower exterior terrain specification is incomplete")
		return

	var seed_value := int(plan.get("seed", 1999))
	var terrain_node := _add_terrain(
		root,
		Vector2(float(terrain_center[0]), float(terrain_center[1])),
		Vector2(float(terrain_size[0]), float(terrain_size[1])),
		Vector2i(maxi(int(terrain_segments[0]), 2), maxi(int(terrain_segments[1]), 2)),
		float(terrain.get("heightAmplitude", 0.045)),
		seed_value,
		materials["terrain"],
	)
	terrain_node.name = "TerrainFoundation"

	var regions_root := Node3D.new()
	regions_root.name = "SemanticRegions"
	root.add_child(regions_root)
	for region_value in plan.get("regions", []):
		if not region_value is Dictionary:
			continue
		_add_region(regions_root, region_value, materials)

	var landmarks_root := Node3D.new()
	landmarks_root.name = "EditableLandmarks"
	root.add_child(landmarks_root)
	for landmark_value in plan.get("landmarks", []):
		if not landmark_value is Dictionary:
			continue
		_add_landmark(landmarks_root, landmark_value, materials, seed_value)


static func _make_materials() -> Dictionary:
	return {
		"terrain": _material(Color("#71816a"), 0.96),
		"path": _material(Color("#c4b595"), 0.9),
		"road": _material(Color("#414d4b"), 0.96),
		"platform": _material(Color("#b4aa91"), 0.88),
		"garden": _material(Color("#53674b"), 0.97),
		"curb": _material(Color("#d4c8a8"), 0.84),
		"marking": _material(Color("#e4d7b5"), 0.78),
		"wood": _material(Color("#8a6947"), 0.82),
		"metal": _material(Color("#345a56"), 0.38, 0.35),
		"glass": _material(Color("#9dc8bd"), 0.24, 0.45),
		"solar": _material(Color("#294c50"), 0.28, 0.52),
		"trunk": _material(Color("#625242"), 0.94),
		"foliage": _material(Color("#5f8057"), 0.93),
		"lamp": _material(Color("#f3cc74"), 0.35, 0.0, Color("#f3cc74")),
		"window": _material(Color("#628f8a"), 0.3, 0.24),
		"facade_a": _material(Color("#9e987c"), 0.88),
		"facade_b": _material(Color("#788579"), 0.88),
		"facade_c": _material(Color("#a78d70"), 0.88),
		"roof": _material(Color("#53655c"), 0.84),
	}


static func _material(
	color: Color,
	roughness: float,
	metallic := 0.0,
	emission := Color(0.0, 0.0, 0.0, 0.0),
) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	if emission.a > 0.0:
		material.emission_enabled = true
		material.emission = emission
		material.emission_energy_multiplier = 0.42
	return material


static func _add_terrain(
	parent: Node3D,
	center: Vector2,
	size: Vector2,
	segments: Vector2i,
	amplitude: float,
	seed_value: int,
	material: StandardMaterial3D,
) -> MeshInstance3D:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	surface.set_material(material)
	for x_step in range(segments.x):
		for z_step in range(segments.y):
			var x0 := center.x - size.x / 2.0 + size.x * float(x_step) / float(segments.x)
			var x1 := center.x - size.x / 2.0 + size.x * float(x_step + 1) / float(segments.x)
			var z0 := center.y - size.y / 2.0 + size.y * float(z_step) / float(segments.y)
			var z1 := center.y - size.y / 2.0 + size.y * float(z_step + 1) / float(segments.y)
			var p00 := Vector3(x0, _terrain_height(x0, z0, amplitude, seed_value), z0)
			var p10 := Vector3(x1, _terrain_height(x1, z0, amplitude, seed_value), z0)
			var p01 := Vector3(x0, _terrain_height(x0, z1, amplitude, seed_value), z1)
			var p11 := Vector3(x1, _terrain_height(x1, z1, amplitude, seed_value), z1)
			surface.add_vertex(p00)
			surface.add_vertex(p01)
			surface.add_vertex(p10)
			surface.add_vertex(p10)
			surface.add_vertex(p01)
			surface.add_vertex(p11)
	surface.generate_normals()

	var instance := MeshInstance3D.new()
	instance.mesh = surface.commit()
	instance.material_override = material
	parent.add_child(instance)
	return instance


static func _terrain_height(x: float, z: float, amplitude: float, seed_value: int) -> float:
	var phase := float(posmod(seed_value, 997)) * 0.003
	var broad := sin(x * 0.12 + phase) * cos(z * 0.11 - phase)
	var fine := sin((x + z) * 0.31 + phase * 0.5) * 0.24
	return FLOOR_TOP_Y + amplitude * (broad * 0.76 + fine)


static func _add_region(parent: Node3D, region: Dictionary, materials: Dictionary) -> void:
	var center_values: Array = region.get("center", [])
	var size_values: Array = region.get("size", [])
	if center_values.size() < 2 or size_values.size() < 2:
		push_error("Tower exterior region is missing its center or size: " + str(region.get("id", "unknown")))
		return
	var center := Vector2(float(center_values[0]), float(center_values[1]))
	var size := Vector2(float(size_values[0]), float(size_values[1]))
	var region_id := str(region.get("id", "region")).replace("-", "_")
	var kind := str(region.get("kind", ""))
	var region_node := Node3D.new()
	region_node.name = region_id
	parent.add_child(region_node)
	match kind:
		"path":
			_add_surface(region_node, region_id, center, size, materials["path"], 0.07)
			_add_path_seams(region_node, center, size)
		"street":
			_add_surface(region_node, region_id, center, size, materials["road"], 0.12)
			_add_street_markings(region_node, center, size, materials)
		"platform":
			_add_surface(region_node, region_id, center, size, materials["platform"], 0.1)
		"garden":
			_add_surface(region_node, region_id, center, size, materials["garden"], 0.08)
			_add_planter_edges(region_node, center, size, materials["curb"])
		"crosswalk":
			_add_crosswalk(region_node, center, size, materials["marking"])
		_:
			push_error("Unsupported Tower exterior region kind: " + kind)


static func _add_surface(
	parent: Node3D,
	name: String,
	center: Vector2,
	size: Vector2,
	material: StandardMaterial3D,
	thickness: float,
) -> void:
	var ground_y := _terrain_height(center.x, center.y, 0.045, 1999)
	_box(
		parent,
		name + "_surface",
		Vector3(center.x, ground_y + thickness / 2.0, center.y),
		Vector3(size.x, thickness, size.y),
		material,
	)


static func _add_path_seams(parent: Node3D, center: Vector2, size: Vector2) -> void:
	var mat := _material(Color("#a99878"), 0.92)
	var seam_count := int(size.x / 2.2)
	for seam_index in range(1, seam_count):
		var x := center.x - size.x / 2.0 + float(seam_index) * size.x / float(seam_count)
		_box(
			parent,
			"paver_joint_%02d" % seam_index,
			Vector3(x, FLOOR_TOP_Y + 0.08, center.y),
			Vector3(0.035, 0.012, size.y * 0.94),
			mat,
		)


static func _add_street_markings(
	parent: Node3D,
	center: Vector2,
	size: Vector2,
	materials: Dictionary,
) -> void:
	for mark_index in range(6):
		var z := center.y - size.y / 2.0 + 5.0 + float(mark_index) * 9.0
		_box(
			parent,
			"lane_dash_%02d" % mark_index,
			Vector3(center.x, FLOOR_TOP_Y + 0.1325, z),
			Vector3(0.11, 0.025, 3.6),
			materials["marking"],
		)
	_box(
		parent,
		"north_curb",
		Vector3(center.x, FLOOR_TOP_Y + 0.11, center.y - size.y / 2.0 + 0.3),
		Vector3(size.x, 0.18, 0.26),
		materials["curb"],
	)
	_box(
		parent,
		"south_curb",
		Vector3(center.x, FLOOR_TOP_Y + 0.11, center.y + size.y / 2.0 - 0.3),
		Vector3(size.x, 0.18, 0.26),
		materials["curb"],
	)


static func _add_crosswalk(
	parent: Node3D,
	center: Vector2,
	size: Vector2,
	material: StandardMaterial3D,
) -> void:
	for stripe_index in range(7):
		var x := center.x - size.x / 2.0 + 0.45 + float(stripe_index) * (size.x - 0.9) / 6.0
		_box(
			parent,
			"crosswalk_stripe_%02d" % stripe_index,
			Vector3(x, FLOOR_TOP_Y + 0.1375, center.y),
			Vector3(0.48, 0.035, size.y),
			material,
		)


static func _add_planter_edges(
	parent: Node3D,
	center: Vector2,
	size: Vector2,
	material: StandardMaterial3D,
) -> void:
	var y := FLOOR_TOP_Y + 0.28
	_box(parent, "planter_north_edge", Vector3(center.x, y, center.y - size.y / 2.0), Vector3(size.x, 0.22, 0.24), material)
	_box(parent, "planter_south_edge", Vector3(center.x, y, center.y + size.y / 2.0), Vector3(size.x, 0.22, 0.24), material)
	_box(parent, "planter_west_edge", Vector3(center.x - size.x / 2.0, y, center.y), Vector3(0.24, 0.22, size.y), material)
	_box(parent, "planter_east_edge", Vector3(center.x + size.x / 2.0, y, center.y), Vector3(0.24, 0.22, size.y), material)


static func _add_landmark(
	parent: Node3D,
	landmark: Dictionary,
	materials: Dictionary,
	seed_value: int,
) -> void:
	var position_values: Array = landmark.get("position", [])
	if position_values.size() < 2:
		push_error("Tower exterior landmark is missing its position: " + str(landmark.get("id", "unknown")))
		return
	var center := Vector2(float(position_values[0]), float(position_values[1]))
	var landmark_root := Node3D.new()
	landmark_root.name = str(landmark.get("id", "landmark")).replace("-", "_")
	landmark_root.position = Vector3(center.x, _terrain_height(center.x, center.y, 0.045, seed_value), center.y)
	parent.add_child(landmark_root)
	match str(landmark.get("kind", "")):
		"tree":
			_add_tree(landmark_root, float(landmark.get("height", 4.3)), Color(str(landmark.get("foliage", "#5f8057"))), materials)
		"street-light":
			_add_street_light(landmark_root, materials)
		"solar-shelter":
			var shelter_size: Array = landmark.get("size", [11, 6])
			if shelter_size.size() >= 2:
				_add_solar_shelter(landmark_root, Vector2(float(shelter_size[0]), float(shelter_size[1])), materials)
		"city-block":
			var building_size: Array = landmark.get("size", [11, 15])
			if building_size.size() >= 2:
				var facade := Color(str(landmark.get("facade", "#9e987c")))
				_add_city_block(
					landmark_root,
					Vector2(float(building_size[0]), float(building_size[1])),
					float(landmark.get("height", 12.0)),
					facade,
					materials,
				)
		_:
			push_error("Unsupported Tower exterior landmark kind: " + str(landmark.get("kind", "")))


static func _add_tree(
	parent: Node3D,
	height: float,
	foliage_color: Color,
	materials: Dictionary,
) -> void:
	var trunk_height := height * 0.55
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.16
	trunk.bottom_radius = 0.24
	trunk.height = trunk_height
	trunk.radial_segments = 7
	_mesh(parent, "trunk", trunk, Vector3(0.0, trunk_height / 2.0, 0.0), materials["trunk"])

	var canopy := SphereMesh.new()
	canopy.radius = height * 0.34
	canopy.height = height * 0.58
	canopy.radial_segments = 8
	canopy.rings = 4
	var leaf_material := _material(foliage_color, 0.94)
	_mesh(parent, "canopy", canopy, Vector3(0.0, height * 0.76, 0.0), leaf_material)

	var side_canopy := SphereMesh.new()
	side_canopy.radius = height * 0.24
	side_canopy.height = height * 0.42
	side_canopy.radial_segments = 7
	side_canopy.rings = 4
	_mesh(parent, "canopy_west", side_canopy, Vector3(-height * 0.19, height * 0.7, 0.1), leaf_material)
	_mesh(parent, "canopy_east", side_canopy, Vector3(height * 0.18, height * 0.71, -0.1), leaf_material)


static func _add_street_light(parent: Node3D, materials: Dictionary) -> void:
	var post := CylinderMesh.new()
	post.top_radius = 0.07
	post.bottom_radius = 0.11
	post.height = 5.0
	post.radial_segments = 8
	_mesh(parent, "post", post, Vector3(0.0, 2.5, 0.0), materials["metal"])
	_box(parent, "arm", Vector3(-0.62, 4.84, 0.0), Vector3(1.2, 0.09, 0.09), materials["metal"])
	var lamp := SphereMesh.new()
	lamp.radius = 0.16
	lamp.height = 0.2
	lamp.radial_segments = 8
	lamp.rings = 4
	_mesh(parent, "warm_lamp", lamp, Vector3(-1.14, 4.75, 0.0), materials["lamp"])


static func _add_solar_shelter(
	parent: Node3D,
	size: Vector2,
	materials: Dictionary,
) -> void:
	var half_x := size.x / 2.0
	var half_z := size.y / 2.0
	for x_sign in [-1.0, 1.0]:
		for z_sign in [-1.0, 1.0]:
			_box(
				parent,
				"enamel_column_%s_%s" % [str(x_sign), str(z_sign)],
				Vector3(x_sign * (half_x - 0.45), 1.75, z_sign * (half_z - 0.4)),
				Vector3(0.22, 3.5, 0.22),
				materials["metal"],
			)
	_box(parent, "canopy_beam_west", Vector3(-half_x / 2.0, 3.5, 0.0), Vector3(0.18, 0.18, size.y), materials["metal"])
	_box(parent, "canopy_beam_east", Vector3(half_x / 2.0, 3.5, 0.0), Vector3(0.18, 0.18, size.y), materials["metal"])
	_box(parent, "canopy_solar_roof", Vector3(0.0, 3.68, 0.0), Vector3(size.x, 0.18, size.y), materials["solar"])
	for panel_index in range(4):
		var z := -half_z + 0.9 + float(panel_index) * (size.y - 1.8) / 3.0
		_box(parent, "roof_panel_%02d" % panel_index, Vector3(0.0, 3.79, z), Vector3(size.x - 1.0, 0.035, 0.12), materials["glass"])
	_box(parent, "bench_seat", Vector3(0.9, 0.62, 0.0), Vector3(2.8, 0.16, 0.56), materials["wood"])
	_box(parent, "bench_back", Vector3(0.9, 1.08, -0.22), Vector3(2.8, 0.68, 0.13), materials["wood"])
	_box(parent, "arrival_panel", Vector3(-half_x + 0.75, 1.55, half_z - 0.32), Vector3(0.12, 2.5, 1.2), materials["glass"])


static func _add_city_block(
	parent: Node3D,
	size: Vector2,
	height: float,
	facade_color: Color,
	materials: Dictionary,
) -> void:
	var facade_material := _material(facade_color, 0.9)
	_box(
		parent,
		"building_mass",
		Vector3(0.0, height / 2.0, 0.0),
		Vector3(size.x, height, size.y),
		facade_material,
	)
	_box(
		parent,
		"roof_garden_parapet",
		Vector3(0.0, height + 0.18, 0.0),
		Vector3(size.x + 0.32, 0.36, size.y + 0.32),
		materials["roof"],
	)
	var floor_count := maxi(int(height / 3.0), 2)
	var window_rows := mini(floor_count, 5)
	for row in range(window_rows):
		var y := 2.2 + float(row) * (height - 3.8) / float(maxi(window_rows - 1, 1))
		for column in range(3):
			var z := -size.y * 0.31 + float(column) * size.y * 0.31
			_box(
				parent,
				"west_window_%02d_%02d" % [row, column],
				Vector3(-size.x / 2.0 - 0.065, y, z),
				Vector3(0.13, 1.45, 1.55),
				materials["window"],
			)
	for panel_index in range(3):
		var z := -size.y * 0.3 + float(panel_index) * size.y * 0.3
		_box(
			parent,
			"roof_solar_panel_%02d" % panel_index,
			Vector3(0.0, height + 0.42, z),
			Vector3(size.x * 0.54, 0.08, size.y * 0.18),
			materials["solar"],
		)


static func _box(
	parent: Node3D,
	node_name: String,
	position: Vector3,
	size: Vector3,
	material: StandardMaterial3D,
) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	return _mesh(parent, node_name, mesh, position, material)


static func _mesh(
	parent: Node3D,
	node_name: String,
	mesh: Mesh,
	position: Vector3,
	material: StandardMaterial3D,
) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = node_name
	instance.mesh = mesh
	instance.material_override = material
	instance.position = position
	parent.add_child(instance)
	return instance
